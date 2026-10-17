import type {Env} from './index';
import {HttpError} from './errors';
type Bridge=(env:Env,path:string,body:Record<string,unknown>)=>Promise<Record<string,any>>;
type Event={id:string;draft_id:string;version:number;owner:string;payload_json:string;state:string;attempts:number;lease_until:number};
const callback=(env:Env)=>env.PUBLIC_ORIGIN+'/api/auth/callback';
function actor(owner:string){const pos=owner.indexOf(':');if(pos<1)throw new HttpError(409,'同步事件的来源身份不完整。');return {provider:owner.slice(0,pos),subject:owner.slice(pos+1)};}
export async function notifyDailyEvent(env:Env,id:string){try{await env.FEEDBACK_EVENTS?.send({eventId:id});}catch{/* Durable outbox is recovered by the scheduled sweep. */}}
export async function notifyDailyDraft(env:Env,draftId:string){const rows=await env.DB.prepare("SELECT id FROM writing_integration_outbox WHERE draft_id=? AND state='pending' AND next_attempt_at<=? ORDER BY version DESC LIMIT 1").bind(draftId,Date.now()).all<{id:string}>();for(const r of rows.results)await notifyDailyEvent(env,r.id);}
async function quarantine(env:Env,row:Event,remoteVersion:number,message:string,lease:string){
 const now=Date.now();await env.DB.batch([
  env.DB.prepare('INSERT INTO writing_integration_quarantine SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM writing_publications WHERE draft_id=? AND version=?) ON CONFLICT(draft_id) DO UPDATE SET remote_version=MAX(remote_version,excluded.remote_version),reason=excluded.reason,updated=excluded.updated').bind(row.draft_id,remoteVersion,message,now,now,row.draft_id,row.version),
  env.DB.prepare("UPDATE writing_integration_outbox SET state='blocked',error_code='integration_conflict',last_error=?,lease_token=NULL,lease_until=0,updated=? WHERE id=? AND lease_token=?").bind(message,now,row.id,lease),
 ]);
}
export async function dispatchDailyEvent(env:Env,id:string,bridge:Bridge){
 const row=await env.DB.prepare('SELECT * FROM writing_integration_outbox WHERE id=?').bind(id).first<Event>();if(!row||['sent','superseded','blocked'].includes(row.state))return;
 const now=Date.now(),lease=crypto.randomUUID();
 const claimed=await env.DB.prepare("UPDATE writing_integration_outbox SET state='sending',attempts=attempts+1,lease_token=?,lease_until=?,updated=? WHERE id=? AND ((state='pending' AND next_attempt_at<=?) OR (state='sending' AND lease_until<=?))").bind(lease,now+60000,now,id,now,now).run();if(!claimed.meta.changes)return;
 try{
  const current=await env.DB.prepare('SELECT version FROM writing_publications WHERE draft_id=? AND owner=?').bind(row.draft_id,row.owner).first<{version:number}>();
  if(!current)throw new HttpError(409,'同步事件的发布记录不存在，请对账。');
  if(current.version>row.version){await env.DB.prepare("UPDATE writing_integration_outbox SET state='superseded',lease_token=NULL,lease_until=0,last_error=NULL,error_code=NULL,updated=? WHERE id=? AND lease_token=?").bind(Date.now(),id,lease).run();return;}
  if(current.version!==row.version)throw new HttpError(409,'同步事件与本地发布版本不一致，请对账。');
  const receipt=await bridge(env,'report-events',{actor:actor(row.owner),callbackUri:callback(env),event:JSON.parse(row.payload_json)});
  if(receipt.ok!==true||receipt.eventId!==row.id||receipt.publicationVersion!==row.version||!Number.isSafeInteger(receipt.currentVersion)||receipt.currentVersion<row.version)throw new HttpError(502,'Daily 回执暂未确认，请稍后核对。');
  const latest=await env.DB.prepare('SELECT version,state,report_id,report_revision FROM writing_publications WHERE draft_id=? AND owner=?').bind(row.draft_id,row.owner).first<{version:number;state:string;report_id:string;report_revision:number}>();
  if(!latest)throw new HttpError(409,'本地发布记录不存在，请管理员对账。');
  if(receipt.currentVersion>latest.version){await quarantine(env,row,receipt.currentVersion,'Daily 已有更新的发布版本，请管理员核对两端记录。',lease);return;}
  if(receipt.currentVersion===latest?.version&&(receipt.state!==latest.state||receipt.reportId!==latest.report_id||receipt.reportRevision!==latest.report_revision)){await quarantine(env,row,receipt.currentVersion,'Daily 回执与当前发布内容不一致，请管理员核对。',lease);return;}
  await env.DB.batch([
   env.DB.prepare("UPDATE writing_integration_outbox SET state=?,lease_token=NULL,lease_until=0,last_error=NULL,error_code=NULL,updated=? WHERE id=? AND lease_token=?").bind(receipt.currentVersion===row.version&&latest?.version===row.version?'sent':'superseded',Date.now(),id,lease),
   env.DB.prepare('DELETE FROM writing_integration_quarantine WHERE draft_id=? AND remote_version<=? AND EXISTS(SELECT 1 FROM writing_publications WHERE draft_id=? AND version=?)').bind(row.draft_id,row.version,row.draft_id,row.version),
  ]);
 }catch(e){
  const status=e instanceof HttpError?e.status:503,blocked=[400,401,403,404,409,413].includes(status),message=[401,403].includes(status)?'Daily 服务连接未通过认证，请管理员检查同步配置。':status===404?'Daily 作文接收接口尚未配置，请管理员检查集成版本。':e instanceof HttpError?e.message:'Daily 暂时无法连接，事件会保留并重试。';
  if(status===409){await quarantine(env,row,row.version,message,lease);return;}
  const delay=Math.min(3600000,15000*2**Math.min(row.attempts,8));
  await env.DB.prepare("UPDATE writing_integration_outbox SET state=?,error_code=?,last_error=?,next_attempt_at=?,lease_token=NULL,lease_until=0,updated=? WHERE id=? AND lease_token=?").bind(blocked?'blocked':'pending',blocked?'integration_configuration':'integration_transport',message,Date.now()+delay,Date.now(),id,lease).run();
 }
}
export async function recoverDailyFeedback(env:Env){
 // Re-deliver current, previously acknowledged events daily to repair a Daily
 // database restore. The stable event ID makes this an idempotent audit.
 await env.DB.prepare("UPDATE writing_integration_outbox SET state='pending',next_attempt_at=0,updated=? WHERE id IN(SELECT e.id FROM writing_integration_outbox e JOIN writing_publications p ON p.draft_id=e.draft_id WHERE e.version=p.version AND e.state='sent' AND e.updated<? ORDER BY e.updated LIMIT 25)").bind(Date.now(),Date.now()-86400000).run();
 const rows=await env.DB.prepare("SELECT e.id FROM writing_integration_outbox e JOIN writing_publications p ON p.draft_id=e.draft_id WHERE e.version=p.version AND ((e.state='pending' AND e.next_attempt_at<=?) OR (e.state='sending' AND e.lease_until<=?)) ORDER BY e.updated LIMIT 25").bind(Date.now(),Date.now()).all<{id:string}>();
 for(const row of rows.results)await notifyDailyEvent(env,row.id);
 await env.DB.prepare("UPDATE writing_integration_outbox SET state='superseded',lease_token=NULL,lease_until=0,updated=? WHERE state IN ('pending','blocked') AND version<(SELECT version FROM writing_publications p WHERE p.draft_id=writing_integration_outbox.draft_id)").bind(Date.now()).run();
}
export async function reconcileDailyFeedback(env:Env,draftId:string,owner:string,expectedVersion:number,bridge:Bridge){
 const head=await env.DB.prepare('SELECT * FROM writing_publications WHERE draft_id=? AND owner=?').bind(draftId,owner).first<any>();
 if(!head||head.version!==expectedVersion)throw new HttpError(409,'发布版本已变化，请刷新后核对。');
 const event=await env.DB.prepare('SELECT * FROM writing_integration_outbox WHERE draft_id=? AND version=? AND owner=?').bind(draftId,expectedVersion,owner).first<Event>();if(!event)throw new HttpError(409,'发布事件记录不完整，请管理员核对。');
 let receipt:Record<string,any>;
 try{receipt=await bridge(env,'report-events/receipt',{eventId:event.id});}
 catch(e){if(e instanceof HttpError&&[401,403,404].includes(e.status))throw new HttpError(503,'Daily 同步服务尚未通过连接检查，请管理员核对接口与服务凭据。');throw e;}
 const latest=await env.DB.prepare('SELECT version FROM writing_publications WHERE draft_id=? AND owner=?').bind(draftId,owner).first<{version:number}>();if(latest?.version!==head.version)throw new HttpError(409,'核对期间发布版本已变化，请刷新后重试。');
 if(typeof receipt.found!=='boolean')throw new HttpError(502,'Daily 回执格式不完整，请稍后核对。');
 const found=receipt.found===true;
 if(found&&(!Number.isSafeInteger(receipt.currentVersion)||receipt.currentVersion<1||receipt.eventId!==event.id))throw new HttpError(502,'Daily 回执格式不完整，请稍后核对。');
 if(found&&(receipt.currentVersion>head.version||receipt.currentVersion===head.version&&(receipt.state!==head.state||receipt.reportId!==head.report_id||receipt.reportRevision!==head.report_revision))){
  const lease=crypto.randomUUID();await env.DB.prepare('UPDATE writing_integration_outbox SET lease_token=? WHERE id=?').bind(lease,event.id).run();await quarantine(env,event,receipt.currentVersion,'两端发布记录不一致，已暂停学生访问，请管理员对账。',lease);throw new HttpError(409,'两端发布记录不一致，已暂停学生访问，请管理员对账。');
 }
 // A complete source restore can be confirmed against the current remote head.
 if(found&&receipt.currentVersion===head.version){
  await env.DB.batch([
   env.DB.prepare('DELETE FROM writing_integration_quarantine WHERE draft_id=? AND remote_version<=?').bind(draftId,head.version),
   env.DB.prepare("UPDATE writing_integration_outbox SET state='sent',error_code=NULL,last_error=NULL,lease_token=NULL,lease_until=0,updated=? WHERE id=?").bind(Date.now(),event.id),
  ]);
  return {synced:true,version:head.version};
 }
 const q=await env.DB.prepare('SELECT remote_version FROM writing_integration_quarantine WHERE draft_id=?').bind(draftId).first<{remote_version:number}>();if(q&&head.version<q.remote_version)throw new HttpError(409,'此稿的同步冲突尚未解决，请管理员先恢复一致的发布记录。');
 await env.DB.prepare("UPDATE writing_integration_outbox SET state='pending',next_attempt_at=0,error_code=NULL,last_error=NULL,lease_token=NULL,lease_until=0,updated=? WHERE id=? AND (state<>'sending' OR lease_until<=?)").bind(Date.now(),event.id,Date.now()).run();await notifyDailyEvent(env,event.id);return {synced:false,version:head.version,queued:true};
}
