import type {D1Database, Fetcher, R2Bucket} from '@cloudflare/workers-types';
import {importLegacy, sanitizeLegacy} from '../src/report/legacy-import';

export interface Env {
  DB: D1Database; FILES: R2Bucket; ASSETS: Fetcher;
  PUBLIC_ORIGIN: string; DAILY_ORIGIN: string; BRIDGE_SERVICE_TOKEN?: string;
}
type Session = {token_hash:string;principal:string;grant_id:string;provider:string;subject:string;role:string;display_name:string;expires:number};
class HttpError extends Error {constructor(public status:number,message:string){super(message);}}
const json=(value:unknown,status=200,headers:Record<string,string>={})=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
const random=()=>[...crypto.getRandomValues(new Uint8Array(32))].map(v=>v.toString(16).padStart(2,'0')).join('');
const sha=async(text:string)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(v=>v.toString(16).padStart(2,'0')).join('');
const b64url=(buf:ArrayBuffer)=>btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
const cookie=(name:string,value:string,age:number)=>`${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
function getCookie(req:Request,name:string){return (req.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1)||'';}
function nextPath(value:string|null,origin:string){try{const u=new URL(value||'/',origin);return u.origin===origin&&!value?.includes('\\')&&!u.pathname.startsWith('/api/')?u.pathname+u.search+u.hash:'/';}catch{return '/';}}
function sameOrigin(req:Request,env:Env){if(req.headers.get('origin')!==env.PUBLIC_ORIGIN||req.headers.get('sec-fetch-site')==='cross-site')throw new HttpError(403,'请从本站页面进行操作。');}
async function input(req:Request,max=8*1024*1024):Promise<unknown>{
  if(!req.headers.get('content-type')?.startsWith('application/json'))throw new HttpError(415,'请提交 JSON。');
  if(Number(req.headers.get('content-length'))>max)throw new HttpError(413,'文件过大，请分批导入。');
  if(!req.body)throw new HttpError(400,'缺少提交内容。');
  const reader=req.body.getReader(),chunks:Uint8Array[]=[];let bytes=0;
  while(true){const r=await reader.read();if(r.done)break;bytes+=r.value.length;if(bytes>max){await reader.cancel();throw new HttpError(413,'文件过大，请分批导入。');}chunks.push(r.value);}
  const buffer=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.length;}
  try{return JSON.parse(new TextDecoder().decode(buffer));}catch{throw new HttpError(400,'JSON 格式不正确。');}
}
async function bridge(env:Env,path:string,body:unknown){
  if(!env.BRIDGE_SERVICE_TOKEN)throw new HttpError(503,'统一登录正在接入，请稍后重试。');
  let response:Response;
  try {response=await fetch(new URL('/api/integrations/writeascend/'+path,env.DAILY_ORIGIN),{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+env.BRIDGE_SERVICE_TOKEN},body:JSON.stringify(body),signal:AbortSignal.timeout(10000),redirect:'error'});}
  catch{throw new HttpError(503,'Daily 暂时无法连接，请稍后重试。');}
  if(!response.ok)throw new HttpError(response.status===401||response.status===403?401:503,response.status===401||response.status===403?'登录或授权已失效，请重新登录。':'Daily 暂时无法处理请求。');
  return await response.json() as Record<string,any>;
}
async function authenticate(req:Request,env:Env){
  const token=getCookie(req,'wa_session');if(!token)throw new HttpError(401,'请先使用 Daily 登录。');
  const row=await env.DB.prepare('SELECT * FROM app_sessions WHERE token_hash=? AND expires>?').bind(await sha(token),Date.now()).first<Session>();
  if(!row)throw new HttpError(401,'登录已过期，请重新登录。');
  const verified=await bridge(env,'introspect',{grantId:row.grant_id});
  if(verified.provider!==row.provider||verified.subject!==row.subject||verified.role!==row.role||verified.active!==true)throw new HttpError(401,'账号授权已发生变化，请重新登录。');
  return {...row,scopes:verified.scopes as string[],classes:verified.classes as unknown[]};
}
function teacher(s:Session){if(!['teacher','admin'].includes(s.role))throw new HttpError(403,'此操作需要教师账号。');}

export default {
  async fetch(req:Request,env:Env):Promise<Response>{
    const url=new URL(req.url),path=url.pathname;
    try {
      if(!path.startsWith('/api/')){
        const response=await env.ASSETS.fetch(req as any);const headers=new Headers(response.headers as any);
        headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','same-origin');
        headers.set('Permissions-Policy','camera=(self), microphone=(), geolocation=()');
        headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
        return new Response(response.body as any,{status:response.status,headers});
      }
      if(path==='/api/health'&&req.method==='GET')return json({ok:true,service:'writeascend',version:2});
      if(path==='/api/auth/start'&&req.method==='GET'){
        if(!env.BRIDGE_SERVICE_TOKEN)throw new HttpError(503,'统一登录正在接入，请稍后重试。');
        const id=random(),state=random(),verifier=random(),challenge=b64url(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier)));
        await env.DB.batch([
          env.DB.prepare('DELETE FROM auth_transactions WHERE expires<?').bind(Date.now()),
          env.DB.prepare('INSERT INTO auth_transactions VALUES(?,?,?,?,?)').bind(await sha(id),state,verifier,nextPath(url.searchParams.get('next'),env.PUBLIC_ORIGIN),Date.now()+300000),
        ]);
        const location=new URL('/writing-connect.html',env.DAILY_ORIGIN);location.search=new URLSearchParams({client_id:'writeascend',redirect_uri:env.PUBLIC_ORIGIN+'/api/auth/callback',state,code_challenge:challenge,code_challenge_method:'S256'}).toString();
        return new Response(null,{status:302,headers:{Location:location.href,'Set-Cookie':cookie('wa_login',id,300),'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
      }
      if(path==='/api/auth/callback'&&req.method==='GET'){
        const id=getCookie(req,'wa_login');if(!id)throw new HttpError(400,'登录请求已失效，请重新登录。');
        const tx=await env.DB.prepare('DELETE FROM auth_transactions WHERE id_hash=? AND expires>? RETURNING *').bind(await sha(id),Date.now()).first<{state:string;verifier:string;next_path:string}>();
        if(!tx||tx.state!==url.searchParams.get('state')||!url.searchParams.get('code'))throw new HttpError(400,'登录请求校验失败，请重新登录。');
        const grant=await bridge(env,'token',{clientId:'writeascend',redirectUri:env.PUBLIC_ORIGIN+'/api/auth/callback',code:url.searchParams.get('code'),verifier:tx.verifier});
        if(!['student','teacher','admin'].includes(grant.role)||!['wordup','daily_legacy_admin'].includes(grant.provider)||typeof grant.subject!=='string'||typeof grant.grantId!=='string')throw new HttpError(502,'登录身份信息不完整。');
        const token=random(),expires=Math.min(Date.now()+15*60000,Number(grant.expires));
        if(!Number.isFinite(expires)||expires<=Date.now())throw new HttpError(401,'授权已过期，请重新登录。');
        await env.DB.prepare('INSERT INTO app_sessions VALUES(?,?,?,?,?,?,?,?,?)').bind(await sha(token),grant.provider+':'+grant.subject,grant.grantId,grant.provider,grant.subject,grant.role,String(grant.name||''),expires).run();
        const headers=new Headers({Location:tx.next_path,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
        headers.append('Set-Cookie',cookie('wa_session',token,Math.floor((expires-Date.now())/1000)));headers.append('Set-Cookie',cookie('wa_login','',0));
        return new Response(null,{status:302,headers});
      }
      if(!['GET','POST','PATCH','DELETE'].includes(req.method))throw new HttpError(405,'请求方式不支持。');
      if(req.method!=='GET')sameOrigin(req,env);
      const session=await authenticate(req,env);
      if(path==='/api/me'&&req.method==='GET')return json({authenticated:true,name:session.display_name,role:session.role,scopes:session.scopes});
      if(path==='/api/auth/logout'&&req.method==='POST'){
        await env.DB.prepare('DELETE FROM app_sessions WHERE token_hash=?').bind(session.token_hash).run();
        await bridge(env,'revoke',{grantId:session.grant_id});
        return json({ok:true},200,{'Set-Cookie':cookie('wa_session','',0)});
      }
      if(path==='/api/reports'&&req.method==='GET'){
        teacher(session);const limit=25,offset=Math.max(0,Math.min(100000,Number(url.searchParams.get('offset'))||0));
        const rows=await env.DB.prepare('SELECT id,payload,revision,updated FROM private_reports WHERE owner=? ORDER BY updated DESC,id LIMIT ? OFFSET ?').bind(session.principal,limit+1,offset).all<{id:string;payload:string;revision:number;updated:string}>();
        return json({reports:rows.results.slice(0,limit).map(r=>({...JSON.parse(r.payload),cloudId:r.id,revision:r.revision})),nextOffset:rows.results.length>limit?offset+limit:null});
      }
      if(path==='/api/legacy-imports'&&req.method==='POST'){
        teacher(session);const payload=await input(req);let bundle;
        try{bundle=await importLegacy(payload);}catch(e){throw new HttpError(400,e instanceof Error?e.message:'备份格式不正确。');}
        if(bundle.reports.length>100)throw new HttpError(413,'每批最多导入 100 份结果，请分批处理。');
        const now=new Date().toISOString(),id=crypto.randomUUID();
        // Keep reports private and unlinked; source-local student IDs never become authority IDs.
        const archiveKey='legacy/'+await sha(session.principal)+'/'+bundle.fingerprint+'.json';
        await env.FILES.put(archiveKey,JSON.stringify(bundle.sanitizedPayload),{httpMetadata:{contentType:'application/json'}});
        const queries=bundle.reports.flatMap(r=>[
          env.DB.prepare('INSERT OR IGNORE INTO private_reports(id,owner,fingerprint,payload,revision,created,updated) VALUES(?,?,?,?,1,?,?)').bind(crypto.randomUUID(),session.principal,r.fingerprint,JSON.stringify(r),now,now),
          env.DB.prepare('INSERT OR IGNORE INTO private_report_revisions SELECT id,owner,revision,payload,updated FROM private_reports WHERE owner=? AND fingerprint=?').bind(session.principal,r.fingerprint),
        ]);
        queries.push(env.DB.prepare('INSERT OR IGNORE INTO legacy_import_batches VALUES(?,?,?,?,?,?)').bind(id,session.principal,bundle.fingerprint,bundle.reports.length,archiveKey,now));
        await env.DB.batch(queries);
        return json({ok:true,reportCount:bundle.reports.length,removedCredentialFields:bundle.removedCredentialFields},201);
      }
      const match=path.match(/^\/api\/reports\/([a-zA-Z0-9-]+)$/);
      if(match&&req.method==='PATCH'){
        teacher(session);const body=await input(req,1024*1024) as any;
        if(!body||!Number.isInteger(body.revision)||!body.result||typeof body.result!=='object'||Array.isArray(body.result))throw new HttpError(400,'请提供结果及原版本号。');
        const row=await env.DB.prepare('SELECT payload,revision FROM private_reports WHERE id=? AND owner=?').bind(match[1],session.principal).first<{payload:string;revision:number}>();
        if(!row)throw new HttpError(404,'报告不存在。');if(row.revision!==body.revision)throw new HttpError(409,'报告已在其他设备修改，请重新读取。');
        const previous=JSON.parse(row.payload);
        const safe=sanitizeLegacy(body.result).value as Record<string,unknown>;
        for(const key of ['student_id','class_id','original_essay'])if(safe[key]!==previous.result[key])throw new HttpError(400,'此接口不能更改原稿或学生归属。');
        const editable=['student_name','class_name','student_no','brief_comment','total_score','breakdown','highlights','errors','content_logic','optimized_essay','identity_name_mismatch_verified'];
        const edited={...previous.result};for(const key of editable)if(key in safe)edited[key]=safe[key];
        const scoreChanged=JSON.stringify(edited.breakdown)!==JSON.stringify(previous.result.breakdown)||edited.total_score!==previous.result.total_score;
        if(scoreChanged){
          const rubric=previous.rubric;
          if(!rubric||!Number.isFinite(edited.total_score)||edited.total_score<0||edited.total_score>rubric.total)throw new HttpError(400,'分数不在评分标准范围内。');
          let sum=0;for(const criterion of rubric.items){const value=edited.breakdown?.[criterion.label];if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>criterion.score||value*2!==Math.round(value*2))throw new HttpError(400,'分项分数须符合满分和半分要求。');sum+=value;}
          if(Math.abs(sum-edited.total_score)>0.001)throw new HttpError(400,'总分须与分项分数相符。');
        }
        const next={...previous,result:edited,modified:true};const now=new Date().toISOString();
        const updates=await env.DB.batch([
          env.DB.prepare('UPDATE private_reports SET payload=?,revision=revision+1,updated=? WHERE id=? AND owner=? AND revision=?').bind(JSON.stringify(next),now,match[1],session.principal,body.revision),
          env.DB.prepare('INSERT OR IGNORE INTO private_report_revisions SELECT id,owner,revision,payload,updated FROM private_reports WHERE id=? AND owner=?').bind(match[1],session.principal),
        ]);
        if(!updates[0].meta.changes)throw new HttpError(409,'报告已在其他设备修改，请重新读取。');
        return json({ok:true,revision:body.revision+1});
      }
      throw new HttpError(404,'接口不存在。');
    }catch(e){return json({error:{message:e instanceof HttpError?e.message:'服务暂时无法处理请求，请稍后重试。'}},e instanceof HttpError?e.status:500);}
  },
};
