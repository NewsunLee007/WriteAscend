import type {D1Database} from '@cloudflare/workers-types';
export interface AuthEnv{DB:D1Database;PUBLIC_ORIGIN:string;DAILY_ORIGIN:string;PEER_BRIDGE_SERVICE_TOKEN?:string;}
export type ClassAccess={id:string;schoolId:string;academicYear:string;name:string;grade:string;version:number;grantVersion:number;scopes:('peer.manage'|'peer.own')[]};
export type PeerIdentity={clientId:'writing-peer';principal:string;provider:'wordup'|'daily_legacy_admin';subject:string;role:'teacher'|'admin'|'student';name:string;grantId:string;expires:number;scopes:('peer.manage'|'peer.own')[];classes:ClassAccess[];sessionHash:string};
type StoredSession={token_hash:string;login_hash:string;principal:string;grant_id:string;provider:string;subject:string;role:string;expires:number};
export class AuthError extends Error{constructor(public status:number,message:string){super(message);}}
function fail(status:number,message:string):never{throw new AuthError(status,message);}
export const sha=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
const b64=(value:ArrayBuffer)=>btoa(String.fromCharCode(...new Uint8Array(value))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
const sessionCookie='__Host-peer_session',loginCookie='__Host-peer_login';
const cookie=(name:string,value:string,age:number)=>`${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
function readCookie(req:Request,name:string){return (req.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1)||'';}
export function sameOrigin(req:Request,env:AuthEnv){if(req.headers.get('origin')!==env.PUBLIC_ORIGIN||req.headers.get('sec-fetch-site')==='cross-site')fail(403,'请从作文互批页面进行操作。');}
function validOrigin(value:string){try{const u=new URL(value);return u.origin===value&&!u.username&&!u.password&&(u.protocol==='https:'||u.protocol==='http:'&&['127.0.0.1','localhost'].includes(u.hostname));}catch{return false;}}
export function configured(env:AuthEnv){return validOrigin(env.PUBLIC_ORIGIN)&&validOrigin(env.DAILY_ORIGIN)&&!!env.PEER_BRIDGE_SERVICE_TOKEN&&env.PEER_BRIDGE_SERVICE_TOKEN.length>=32&&(!env.PUBLIC_ORIGIN.startsWith('https:')||env.DAILY_ORIGIN.startsWith('https:'));}
function nextPath(value:string|null,env:AuthEnv){try{const u=new URL(value||'/',env.PUBLIC_ORIGIN);if(u.origin!==env.PUBLIC_ORIGIN||value?.includes('\\')||!/^\/(?:$|student\/?$|teacher\/?$|rounds\/[a-f0-9-]{36}$|imports\/[a-f0-9-]{36}$)/.test(u.pathname))return '/';return u.pathname+u.search+u.hash;}catch{return '/';}}
async function bridge(env:AuthEnv,path:'token'|'introspect'|'revoke',body:unknown){
 if(!configured(env))fail(503,'作文互批登录正在接入，请稍后重试。');let response:Response;
 try{response=await fetch(new URL('/api/integrations/writing-peer/'+path,env.DAILY_ORIGIN),{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+env.PEER_BRIDGE_SERVICE_TOKEN},body:JSON.stringify(body),redirect:'manual',signal:AbortSignal.timeout(10000)});}catch{fail(503,'Daily 暂时无法连接，请稍后重试。');}
 if(!response!.ok)fail([401,403,429].includes(response!.status)?response!.status:503,response!.status===401?'学校登录已过期，请重新登录。':response!.status===403?'当前学校账号暂不可用。':response!.status===429?'登录较频繁，请稍后重试。':'Daily 暂时无法完成核验，请稍后重试。');
 try{return await response!.json() as any;}catch{fail(503,'Daily 登录回执暂时无法读取，请重新进入。');}
}
function identity(value:any):Omit<PeerIdentity,'sessionHash'>{
 if(!value||value.active!==true||value.clientId!=='writing-peer'||!['wordup','daily_legacy_admin'].includes(value.provider)||typeof value.subject!=='string'||!value.subject||value.subject.length>200||!['teacher','admin','student'].includes(value.role)||typeof value.grantId!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(value.grantId)||!Number.isFinite(value.expires)||value.expires<=Date.now()||typeof value.name!=='string'||value.name.length>200||!Array.isArray(value.scopes)||value.scopes.some((s:unknown)=>!['peer.own','peer.manage'].includes(String(s)))||!Array.isArray(value.classes)||value.classes.length>500)fail(502,'学校互评身份回执不完整，请重新进入。');
 const scope=value.role==='student'?'peer.own':'peer.manage';if(value.role==='student'&&(value.provider!=='wordup'||!value.scopes.includes(scope))||value.scopes.some((s:string)=>s!==scope))fail(403,'学校账号的互评权限不正确。');
 const classes:ClassAccess[]=value.classes.map((c:any)=>{if(!c||['id','schoolId','academicYear','name','grade'].some(k=>typeof c[k]!=='string'||!c[k]||c[k].length>200)||!Number.isSafeInteger(c.version)||c.version<1||!Number.isSafeInteger(c.grantVersion)||c.grantVersion<1||!Array.isArray(c.scopes)||c.scopes.length!==1||c.scopes[0]!==scope)fail(502,'学校班级权限回执不完整。');return {id:c.id,schoolId:c.schoolId,academicYear:c.academicYear,name:c.name,grade:c.grade,version:c.version,grantVersion:c.grantVersion,scopes:[scope]};});
 if(new Set(classes.map(c=>c.id)).size!==classes.length)fail(502,'学校班级权限回执重复。');return {clientId:'writing-peer',principal:value.provider+':'+value.subject,provider:value.provider,subject:value.subject,role:value.role,name:value.name,grantId:value.grantId,expires:Math.min(value.expires,Date.now()+900000),scopes:value.scopes,classes};
}
export async function authenticate(req:Request,env:AuthEnv):Promise<PeerIdentity>{
 const token=readCookie(req,sessionCookie);if(!/^[a-f0-9]{64}$/.test(token))fail(401,'请先登录学校账号。');const key=await sha(token),row=await env.DB.prepare('SELECT * FROM peer_app_sessions WHERE token_hash=? AND expires>?').bind(key,Date.now()).first<StoredSession>();if(!row)fail(401,'互评登录已过期，请重新登录。');
 const verified=identity(await bridge(env,'introspect',{grantId:row!.grant_id}));if(verified.principal!==row!.principal||verified.provider!==row!.provider||verified.subject!==row!.subject||verified.role!==row!.role||verified.grantId!==row!.grant_id)fail(401,'账号身份已变化，请重新登录。');
 if(!await env.DB.prepare('SELECT 1 FROM peer_app_sessions WHERE token_hash=? AND expires>?').bind(key,Date.now()).first())fail(401,'此互评登录已退出，请重新进入。');return {...verified,expires:Math.min(verified.expires,row!.expires),sessionHash:key};
}
export async function requireWorkspace(req:Request,env:AuthEnv,who:PeerIdentity){sameOrigin(req,env);if(req.headers.get('X-Peer-Workspace')!==await sha('writing-peer|'+who.principal))fail(403,'当前互评账号已变化，请刷新后再操作。');}
export async function handleAuth(req:Request,env:AuthEnv):Promise<Response|null>{
 const u=new URL(req.url),path=u.pathname;if(!path.startsWith('/api/auth/'))return null;
 if(path==='/api/auth/start'&&req.method==='GET'){
  if(!configured(env))fail(503,'作文互批登录正在接入，请稍后重试。');const token=random(),state=random(),verifier=random(),now=Date.now(),previous=readCookie(req,loginCookie);const statements=[env.DB.prepare('DELETE FROM peer_auth_transactions WHERE expires<=?').bind(now),env.DB.prepare('DELETE FROM peer_app_sessions WHERE expires<=?').bind(now)];if(previous)statements.push(env.DB.prepare('DELETE FROM peer_auth_transactions WHERE token_hash=?').bind(await sha(previous)));
  statements.push(env.DB.prepare('INSERT INTO peer_auth_transactions VALUES(?,?,?,?,0,?,?)').bind(await sha(token),await sha(state),verifier,nextPath(u.searchParams.get('next'),env),now+300000,now));await env.DB.batch(statements);
  const target=new URL('/writing-peer-connect.html',env.DAILY_ORIGIN);target.search=new URLSearchParams({client_id:'writing-peer',redirect_uri:env.PUBLIC_ORIGIN+'/api/auth/callback',state,code_challenge:b64(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))),code_challenge_method:'S256',audience:u.searchParams.get('audience')==='teacher'?'teacher':'student'}).toString();return new Response(null,{status:302,headers:{Location:target.href,'Set-Cookie':cookie(loginCookie,token,300),'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
 }
 if(path==='/api/auth/callback'&&req.method==='GET'){
  const token=readCookie(req,loginCookie),state=u.searchParams.get('state')||'',code=u.searchParams.get('code')||'';if(!/^[a-f0-9]{64}$/.test(token)||!/^[a-f0-9]{64}$/.test(state)||!/^[A-Za-z0-9_-]{43}$/.test(code))fail(401,'互评登录回执不完整，请重新进入。');const loginHash=await sha(token),row=await env.DB.prepare('UPDATE peer_auth_transactions SET used=1 WHERE token_hash=? AND state_hash=? AND used=0 AND expires>? RETURNING *').bind(loginHash,await sha(state),Date.now()).first<{verifier:string;next_path:string;expires:number}>();if(!row)fail(401,'互评登录回执已过期或已使用，请重新进入。');
  const verified=identity(await bridge(env,'token',{clientId:'writing-peer',redirectUri:env.PUBLIC_ORIGIN+'/api/auth/callback',code,verifier:row!.verifier})),session=random(),sessionHash=await sha(session),old=readCookie(req,sessionCookie),oldHash=old?await sha(old):'',previous=old?await env.DB.prepare('SELECT grant_id FROM peer_app_sessions WHERE token_hash=?').bind(oldHash).first<{grant_id:string}>():null;
  await env.DB.batch([
   env.DB.prepare('INSERT INTO peer_app_sessions SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM peer_auth_transactions WHERE token_hash=? AND used=1 AND expires>?)').bind(sessionHash,loginHash,verified.principal,verified.grantId,verified.provider,verified.subject,verified.role,verified.expires,Date.now(),loginHash,Date.now()),
   env.DB.prepare('DELETE FROM peer_app_sessions WHERE token_hash=? AND EXISTS(SELECT 1 FROM peer_app_sessions WHERE token_hash=?)').bind(oldHash,sessionHash),env.DB.prepare('DELETE FROM peer_auth_transactions WHERE token_hash=?').bind(loginHash)
  ]);
  if(!await env.DB.prepare('SELECT 1 FROM peer_app_sessions WHERE token_hash=?').bind(sessionHash).first()){try{await bridge(env,'revoke',{grantId:verified.grantId});}catch{}fail(401,'互评登录已取消，请重新进入。');}
  if(previous&&previous.grant_id!==verified.grantId)try{await bridge(env,'revoke',{grantId:previous.grant_id});}catch{}
  const headers=new Headers({Location:row!.next_path,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});headers.append('Set-Cookie',cookie(sessionCookie,session,Math.max(0,Math.floor((verified.expires-Date.now())/1000))));headers.append('Set-Cookie',cookie(loginCookie,'',0));return new Response(null,{status:302,headers});
 }
 if(path==='/api/auth/logout'&&req.method==='POST'){
  sameOrigin(req,env);const token=readCookie(req,sessionCookie),login=readCookie(req,loginCookie),tokenHash=await sha(token),loginHash=await sha(login),rows=await env.DB.prepare('SELECT grant_id FROM peer_app_sessions WHERE token_hash=? OR login_hash=?').bind(tokenHash,loginHash).all<{grant_id:string}>();
  await env.DB.batch([env.DB.prepare('DELETE FROM peer_auth_transactions WHERE token_hash=?').bind(loginHash),env.DB.prepare('DELETE FROM peer_app_sessions WHERE token_hash=? OR login_hash=?').bind(tokenHash,loginHash)]);for(const row of rows.results)try{await bridge(env,'revoke',{grantId:row.grant_id});}catch{}
  const headers=new Headers({'Content-Type':'application/json','Cache-Control':'no-store'});headers.append('Set-Cookie',cookie(sessionCookie,'',0));headers.append('Set-Cookie',cookie(loginCookie,'',0));return new Response(JSON.stringify({ok:true}),{headers});
 }
 fail(404,'互评登录接口不存在。');
}
