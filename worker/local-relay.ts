import type {Env} from './index';
import {HttpError} from './errors';
import {readPersonalModel,personalModelKey,type PersonalModel} from './personal-models';
import {consumeModelJobs,authorizeModelJob,type Job} from './model-jobs';
import type {WorkBridge} from './work-permits';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function fail(status:number,message:string,code?:string):never{throw new HttpError(status,message,code);}
const hash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('');
async function authenticate(req:Request,env:Env){
 const value=req.headers.get('Authorization')?.match(/^Bearer (personal_[a-f0-9]{32})\.([A-Za-z0-9_-]{43})$/);if(!value)fail(401,'本地连接凭据无效，请重新建立连接。','local_relay_credential_invalid');
 const row=await env.DB.prepare("SELECT * FROM personal_model_profiles WHERE id=? AND provider='local-relay' AND status='active'").bind(value![1]).first<PersonalModel>();
 if(!row||await hash(value![2])!==await hash(await personalModelKey(env,row)))fail(401,'本地连接已移除或凭据失效。','local_relay_credential_invalid');return row!;
}
async function authorize(env:Env,row:Job,verify:WorkBridge){
 const stored=await env.FILES.get(row.request_key);if(!stored)fail(503,'原请求暂时无法读取。');const envelope=await stored!.json() as any;
 await authorizeModelJob(env,row,envelope.profileRevision,verify,row.state!=='succeeded');
 const profile=await readPersonalModel(env,row.owner,row.profile_id);if(!profile||profile.execution_revision!==envelope.profileRevision)fail(409,'本地模型配置已变化，请核对后重新批阅。');
}
export async function handleLocalRelay(req:Request,env:Env,input:(r:Request,max?:number)=>Promise<unknown>,verify:WorkBridge){
 const path=new URL(req.url).pathname;if(!path.startsWith('/api/local-relay/'))return null;
 if(req.method!=='POST')fail(405,'本地连接请求方式不支持。');
 // Machine credentials are scoped to one teacher-owned model; cookies are never accepted.
 const profile=await authenticate(req,env),body=await input(req,3*1024*1024) as any;
 if(path==='/api/local-relay/poll'){
  const models=Array.isArray(body?.models)?body.models.slice(0,64).filter((m:any)=>m&&typeof m.id==='string'&&m.id.length>0&&m.id.length<=120&&!/[\x00-\x1f]/.test(m.id)&&typeof m.vision==='boolean').map((m:any)=>({id:m.id,vision:m.vision})):[];
  await env.DB.prepare("INSERT INTO local_model_relays(profile_id,owner,last_seen,models_json,status) VALUES(?,?,?,?,?) ON CONFLICT(profile_id) DO UPDATE SET last_seen=excluded.last_seen,models_json=excluded.models_json,status=excluded.status").bind(profile.id,profile.owner,Date.now(),JSON.stringify(models),body?.ready===true?'ready':'model_unavailable').run();
  if(body?.ready!==true)return json({job:null});
  const active=await env.DB.prepare("SELECT id FROM model_jobs WHERE owner=? AND profile_id=? AND state IN ('preparing','sending') AND lease_until>?").bind(profile.owner,profile.id,Date.now()).first();if(active)return json({job:null});
  const pending=await env.DB.prepare("SELECT id FROM model_jobs WHERE owner=? AND profile_id=? AND state='queued' ORDER BY created,id LIMIT 1").bind(profile.owner,profile.id).first<{id:string}>();if(!pending)return json({job:null});
  let job:unknown=null;
  await consumeModelJobs({messages:[{body:{jobId:pending.id},ack(){},retry(){}}]} as any,env,verify,{profileId:profile.id,dispatch:value=>{job=value;}});
  return json({job});
 }
 if(path==='/api/local-relay/result'){
  if(!body||typeof body.jobId!=='string'||typeof body.lease!=='string'||body.lease.length!==36)fail(400,'结果编号不正确。');
  const row=await env.DB.prepare('SELECT * FROM model_jobs WHERE id=? AND owner=? AND profile_id=?').bind(body.jobId,profile.owner,profile.id).first<Job>();
  if(!row||row.lease_token!==body.lease)fail(404,'本地批阅请求不存在。');
  await authorize(env,row,verify);
  if(row.state==='succeeded')return json({ok:true});
  if(!['sending','uncertain'].includes(row.state))fail(409,'此请求已停止接收结果。');
  if(body.error===true){await env.DB.prepare("UPDATE model_jobs SET state='uncertain',error_status=409,error_message='本地模型处理未确认完成，请检查连接程序后核对原任务。',updated=? WHERE id=? AND lease_token=? AND state='sending'").bind(Date.now(),row.id,body.lease).run();}
  else{
   if(!body.response||typeof body.response!=='object'||!Array.isArray(body.response.choices)||typeof body.response.choices[0]?.message?.content!=='string'||!body.response.choices[0].message.content.trim())fail(422,'本地模型没有返回有效的文本结果。');
   let text=JSON.stringify(body.response);if(new TextEncoder().encode(text).length>2*1024*1024)fail(413,'本地结果过长。');const secret=await personalModelKey(env,profile);text=text.split(secret).join('[redacted]');
   const key='model-output/'+await hash(row.owner)+'/'+row.id+'/'+body.lease+'.json';await env.FILES.put(key,text,{httpMetadata:{contentType:'application/json'}});
   const guard="EXISTS(SELECT 1 FROM personal_model_profiles WHERE id=? AND owner=? AND status='active' AND execution_revision=?) AND NOT EXISTS(SELECT 1 FROM background_grant_revocations WHERE grant_id=?)";
   const updated=await env.DB.prepare("UPDATE model_jobs SET state='succeeded',result_key=?,error_status=NULL,error_message=NULL,updated=? WHERE id=? AND lease_token=? AND state IN ('sending','uncertain') AND "+guard).bind(key,Date.now(),row.id,body.lease,profile.id,row.owner,profile.execution_revision,row.grant_id).run();if(!updated.meta.changes)fail(409,'配置或授权已变化，结果未接收。');
  }
  const binding=await env.DB.prepare('SELECT run_id FROM model_job_bindings WHERE job_id=?').bind(row.id).first<{run_id:string}>();if(binding)try{await env.MODEL_JOBS!.send({runId:binding.run_id});}catch{}
  return json({ok:true});
 }
 fail(404,'本地连接接口不存在。');
}
export async function handleLocalStatus(req:Request,env:Env,who:{principal:string;role:string}){
 if(new URL(req.url).pathname!=='/api/model/local-status')return null;if(req.method!=='GET')fail(405,'请求方式不支持。');if(!['teacher','admin'].includes(who.role))fail(403,'此操作需要教师账号。');
 const rows=await env.DB.prepare("SELECT r.*,EXISTS(SELECT 1 FROM model_jobs j WHERE j.profile_id=r.profile_id AND j.owner=r.owner AND j.state='sending' AND j.lease_until>?) AS processing FROM local_model_relays r JOIN personal_model_profiles p ON p.id=r.profile_id WHERE r.owner=? AND p.owner=? AND p.status='active' AND p.provider='local-relay'").bind(Date.now(),who.principal,who.principal).all<any>();
 return json({connections:rows.results.map(r=>({profileId:r.profile_id,lastSeen:r.last_seen,online:!!r.processing||r.last_seen>Date.now()-60000,status:r.processing?'processing':r.status,models:JSON.parse(r.models_json)}))});
}
