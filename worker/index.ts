import type {D1Database, Fetcher, R2Bucket, MessageBatch, Queue} from '@cloudflare/workers-types';
import {importLegacy, sanitizeLegacy} from '../src/report/legacy-import';
import {HttpError} from './errors';
import {handleModelApi,consumeModelJobs,recoverModelOutbox,type ModelBindings,type ModelJobMessage} from './model-jobs';
import {handleAssets} from './assets';
import {handleSnapshots} from './snapshots';
import {handleTasks} from './tasks';
import {handleSheets} from './sheets';
import {handleCollection} from './collection';
import {dispatchDailyEvent,recoverDailyFeedback} from './daily-feedback';
import {handlePublications} from './publications';
import {handleStudentRevisions} from './student-revisions';
import {handlePeerExports,handlePeerExchange} from './peer-exports';
import {handleGrading,advanceGradingRun,advanceRunForModelJob,recoverGradingRuns} from './grading';

export interface Env extends ModelBindings {
  DB: D1Database; FILES: R2Bucket; ASSETS: Fetcher;
  VERSION?:{id:string;tag?:string;timestamp?:string};
  FEEDBACK_EVENTS?: Queue<{eventId:string}>;
  PUBLIC_ORIGIN: string; DAILY_ORIGIN: string; BRIDGE_SERVICE_TOKEN?: string;
  PEER_ORIGIN?: string; PEER_EXCHANGE_TOKEN?: string; PEER_SERVICE?:Fetcher;
}
type Session = {token_hash:string;principal:string;grant_id:string;provider:string;subject:string;role:string;display_name:string;expires:number};
type ClassGrant = {id:string;schoolId:string;academicYear:string;name:string;grade:string;version:number;grantVersion:number;scopes:string[]};
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
  // Manual mode also prevents forwarding the machine credential to a redirect.
  // The actual workerd runtime rejects redirect:'error'; non-2xx stays a failure.
  try {response=await fetch(new URL('/api/integrations/writeascend/'+path,env.DAILY_ORIGIN),{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+env.BRIDGE_SERVICE_TOKEN},body:JSON.stringify(body),signal:AbortSignal.timeout(10000),redirect:'manual'});}
  catch(error){
    if(env.PUBLIC_ORIGIN.startsWith('http://127.0.0.1:'))console.warn('Daily bridge transport:',error instanceof Error?error.message:'unknown');
    throw new HttpError(503,'Daily 暂时无法连接，请稍后重试。');
  }
  if(!response.ok){
    const status=[400,401,403,404,409,413,429].includes(response.status)?response.status:503;
    let message=status===401?'登录或授权已失效，请重新登录。':status===403?'当前账号没有此项权限。':'Daily 暂时无法处理请求。';
    if([400,404,409,413,429].includes(status))try{const detail=await response.json() as any;if(typeof detail.error?.message==='string'&&detail.error.message.length<=600)message=detail.error.message;}catch{}
    throw new HttpError(status,message);
  }
  return await response.json() as Record<string,any>;
}
async function authenticate(req:Request,env:Env){
  const token=getCookie(req,'wa_session');if(!token)throw new HttpError(401,'请先使用 Daily 登录。');
  const row=await env.DB.prepare('SELECT * FROM app_sessions WHERE token_hash=? AND expires>?').bind(await sha(token),Date.now()).first<Session>();
  if(!row)throw new HttpError(401,'登录已过期，请重新登录。');
  const verified=await bridge(env,'introspect',{grantId:row.grant_id});
  if(verified.provider!==row.provider||verified.subject!==row.subject||verified.role!==row.role||verified.active!==true)throw new HttpError(401,'账号授权已发生变化，请重新登录。');
  if(!Array.isArray(verified.scopes)||verified.scopes.some(s=>typeof s!=='string')||!Array.isArray(verified.classes)||verified.classes.some(c=>!c||typeof c.id!=='string'||!Array.isArray(c.scopes)||c.scopes.some((s:unknown)=>typeof s!=='string')))throw new HttpError(502,'账号权限信息不完整，请稍后重试。');
  return {...row,scopes:verified.scopes as string[],classes:verified.classes as ClassGrant[]};
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
      if(path==='/api/health'&&req.method==='GET')return json({ok:true,service:'writeascend',version:2,cloud:true,loginConfigured:!!env.BRIDGE_SERVICE_TOKEN,release:env.VERSION?{id:env.VERSION.id,tag:env.VERSION.tag||null,timestamp:env.VERSION.timestamp||null}:null});
      const exchange=await handlePeerExchange(req,env,input);if(exchange)return exchange;
      if(path==='/api/auth/start'&&req.method==='GET'){
        if(!env.BRIDGE_SERVICE_TOKEN)throw new HttpError(503,'统一登录正在接入，请稍后重试。');
        const target=nextPath(url.searchParams.get('next'),env.PUBLIC_ORIGIN),id=random(),state=random(),verifier=random(),challenge=b64url(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier)));
        await env.DB.batch([
          env.DB.prepare('DELETE FROM auth_transactions WHERE expires<?').bind(Date.now()),
          env.DB.prepare('INSERT INTO auth_transactions VALUES(?,?,?,?,?)').bind(await sha(id),state,verifier,target,Date.now()+300000),
        ]);
        const location=new URL('/writing-connect.html',env.DAILY_ORIGIN);location.search=new URLSearchParams({client_id:'writeascend',redirect_uri:env.PUBLIC_ORIGIN+'/api/auth/callback',state,code_challenge:challenge,code_challenge_method:'S256',audience:target.startsWith('/student')?'student':'teacher'}).toString();
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
        await env.DB.prepare('INSERT INTO app_sessions(token_hash,principal,grant_id,provider,subject,role,display_name,expires) VALUES(?,?,?,?,?,?,?,?)').bind(await sha(token),grant.provider+':'+grant.subject,grant.grantId,grant.provider,grant.subject,grant.role,String(grant.name||''),expires).run();
        const headers=new Headers({Location:tx.next_path,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
        headers.append('Set-Cookie',cookie('wa_session',token,Math.floor((expires-Date.now())/1000)));headers.append('Set-Cookie',cookie('wa_login','',0));
        return new Response(null,{status:302,headers});
      }
      if(!['GET','POST','PUT','PATCH','DELETE'].includes(req.method))throw new HttpError(405,'请求方式不支持。');
      if(req.method!=='GET')sameOrigin(req,env);
      if(path==='/api/auth/logout'&&req.method==='POST'){
        const token=getCookie(req,'wa_session');
        if(token){
          const tokenHash=await sha(token),row=await env.DB.prepare('SELECT grant_id FROM app_sessions WHERE token_hash=?').bind(tokenHash).first<{grant_id:string}>();
          await env.DB.batch([
            env.DB.prepare("INSERT OR IGNORE INTO background_grant_revocations SELECT grant_id,?,'logout' FROM app_sessions WHERE token_hash=?").bind(Date.now(),tokenHash),
            env.DB.prepare('DELETE FROM app_sessions WHERE token_hash=?').bind(tokenHash),
          ]);
          // Local logout must succeed even when the source service is unavailable.
          if(row){try{await bridge(env,'revoke',{grantId:row.grant_id});}catch{}}
        }
        return json({ok:true},200,{'Set-Cookie':cookie('wa_session','',0)});
      }
      const session=await authenticate(req,env);
      if(req.method!=='GET'&&(/^\/api\/(?:assets|snapshots|tasks|admin|grading|writing-reports|student)(?:\/|$)/.test(path)||path.startsWith('/api/model/'))){
        if(req.headers.get('X-Workspace-Id')!==await sha(session.principal))throw new HttpError(403,'当前登录工作区已变化，请刷新后再操作。');
      }
      if(path==='/api/me'&&req.method==='GET')return json({authenticated:true,workspaceId:await sha(session.principal),name:session.display_name,role:session.role,scopes:session.scopes});
      const directoryAction=path.match(/^\/api\/admin\/writing-directory\/(overview|preview|sync|grant|class-status)$/);
      if(directoryAction){
        if(session.role!=='admin')throw new HttpError(403,'此操作需要学校管理员账号。');
        const action=directoryAction[1],fields:Record<string,string[]>={overview:[],preview:['schoolId','schoolName','academicYear','classKeys'],sync:['schoolId','schoolName','academicYear','classKeys','planHash','requestId'],grant:['classId','subject','expectedVersion','scopes','revoked','requestId'],'class-status':['classId','expectedVersion','status','requestId']};
        if((action==='overview'&&req.method!=='GET')||(action!=='overview'&&req.method!=='POST'))throw new HttpError(405,'目录管理请求方式不支持。');
        const body=action==='overview'?{}:await input(req,16384) as Record<string,unknown>;
        if(!body||typeof body!=='object'||Array.isArray(body))throw new HttpError(400,'目录管理参数不正确。');
        return json(await bridge(env,'directory/'+action,{...Object.fromEntries(fields[action].filter(key=>key in body).map(key=>[key,body[key]])),grantId:session.grant_id}));
      }
      const revisionResponse=await handleStudentRevisions(req,env,session,bridge,input);if(revisionResponse)return revisionResponse;
      const peerExportResponse=await handlePeerExports(req,env,session,bridge,input);if(peerExportResponse)return peerExportResponse;
      const publicationResponse=await handlePublications(req,env,session,bridge,input);if(publicationResponse)return publicationResponse;
      if(path.startsWith('/api/assets')){teacher(session);const response=await handleAssets(req,env,session.principal);if(response)return response;}
      if(path.startsWith('/api/snapshots')){teacher(session);const response=await handleSnapshots(req,env,session.principal,input);if(response)return response;}
      if(/^\/api\/(?:tasks|grading|writing-reports)(?:\/|$)/.test(path)){teacher(session);const response=await handleGrading(req,env,session,bridge,input)||await handleCollection(req,env,session,bridge,input)||await handleSheets(req,env,session,bridge,input)||await handleTasks(req,env,session,bridge,input);if(response)return response;}
      const modelResponse=await handleModelApi(req,env,session,input,bridge);
      if(modelResponse)return modelResponse;
      if(path==='/api/classes'&&req.method==='GET'){
        teacher(session);return json({classes:session.classes});
      }
      const rosterMatch=path.match(/^\/api\/classes\/([a-zA-Z0-9-]+)\/roster$/);
      if(rosterMatch&&req.method==='GET'){
        teacher(session);
        if(!session.classes.some(c=>c.id===rosterMatch[1]&&c.scopes.includes('roster.read')))throw new HttpError(403,'没有此班级的名册权限。');
        const after=url.searchParams.get('after')||'';
        if(after.length>200)throw new HttpError(400,'分页位置无效。');
        return json(await bridge(env,'roster',{grantId:session.grant_id,classId:rosterMatch[1],after}));
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
    }catch(e){
      if(!(e instanceof HttpError)&&env.PUBLIC_ORIGIN.startsWith('http://127.0.0.1:'))console.warn('Local Worker failure:',e instanceof Error?e.message:'unknown');
      return json({error:{message:e instanceof HttpError?e.message:'服务暂时无法处理请求，请稍后重试。',...(e instanceof HttpError&&e.code?{code:e.code}:{})}},e instanceof HttpError?e.status:500);
    }
  },
  async queue(batch:MessageBatch<ModelJobMessage>,env:Env){
    // Run coordination and paid provider jobs share a queue, but have separate receipts.
    for(const message of batch.messages.filter(m=>m.body?.runId)){
      try{await advanceGradingRun(env,message.body.runId!,bridge);message.ack();}catch{message.retry();}
    }
    const jobs=batch.messages.filter(m=>m.body?.jobId);
    if(jobs.length)await consumeModelJobs({...batch,messages:jobs},env,bridge);
    for(const message of jobs)try{await advanceRunForModelJob(env,message.body.jobId!,bridge);}catch{/* Scheduled recovery resumes saved provider responses. */}
    for(const message of batch.messages.filter(m=>m.body?.eventId)){try{await dispatchDailyEvent(env,message.body.eventId!,bridge);message.ack();}catch{message.retry();}}
    for(const message of batch.messages.filter(m=>!m.body?.runId&&!m.body?.jobId&&!m.body?.eventId))message.ack();
  },
  async scheduled(_controller:unknown,env:Env){await recoverModelOutbox(env);await recoverGradingRuns(env,bridge);await recoverDailyFeedback(env);},
};
