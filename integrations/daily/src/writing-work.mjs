import crypto from 'node:crypto';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const uuid=/^[a-f0-9-]{36}$/,hex=/^[a-f0-9]{64}$/,ref=/^[A-Za-z0-9_-]{43}$/;
const ordered=value=>value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,ordered(value[k])])):value;
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(ordered(value))).digest('hex');
export function workScope(input){
 const s=input;if(!s||!['grading-run','model-job'].includes(s.type)||typeof s.profileId!=='string'||!/^[-a-zA-Z0-9_]{1,64}$/.test(s.profileId)||!hex.test(s.profileRevision))fail(400,'后台批阅范围不完整。');
 if(s.type==='model-job'){if(!uuid.test(s.jobId)||!hex.test(s.requestHash))fail(400,'后台模型任务范围不完整。');return {type:s.type,jobId:s.jobId,requestHash:s.requestHash,profileId:s.profileId,profileRevision:s.profileRevision};}
 if(!['runId','taskId','memberId','draftId'].every(k=>typeof s[k]==='string'&&uuid.test(s[k]))||!hex.test(s.inputHash)||!hex.test(s.modelInputHash)||typeof s.classId!=='string'||!s.classId||s.classId.length>128||typeof s.pipelineVersion!=='string'||!s.pipelineVersion||s.pipelineVersion.length>120)fail(400,'后台班级批阅范围不完整。');
 return {type:s.type,runId:s.runId,taskId:s.taskId,memberId:s.memberId,draftId:s.draftId,classId:s.classId,inputHash:s.inputHash,modelInputHash:s.modelInputHash,profileId:s.profileId,profileRevision:s.profileRevision,pipelineVersion:s.pipelineVersion};
}
// Durable work references are machine-only, bound to an immutable operation and
// source session. They never authorize browsing, publishing or a new operation.
export function createWritingWork({db,callbacks,inspect,verifySource,validateIdentity,projection,unseal,audit,now=Date.now}){
 let initialized=false;const allowed=new Set(callbacks);
 function initialize(){if(initialized)return;db.exec(`CREATE TABLE IF NOT EXISTS writing_work_permits(id TEXT PRIMARY KEY,grant_id TEXT NOT NULL,request_id TEXT NOT NULL,callback_uri TEXT NOT NULL,provider TEXT NOT NULL,subject TEXT NOT NULL,role TEXT NOT NULL,source_hash TEXT NOT NULL,source_sealed TEXT NOT NULL,scope_json TEXT NOT NULL,scope_hash TEXT NOT NULL,rights_json TEXT NOT NULL,expires INTEGER NOT NULL,revoked INTEGER NOT NULL DEFAULT 0,created INTEGER NOT NULL,updated INTEGER NOT NULL,UNIQUE(grant_id,request_id));CREATE INDEX IF NOT EXISTS writing_work_source ON writing_work_permits(source_hash,revoked);CREATE INDEX IF NOT EXISTS writing_work_owner_created ON writing_work_permits(provider,subject,created);`);initialized=true;}
 function scope(body){if(!allowed.has(body.callbackUri))fail(400,'后台批阅回调不在白名单中。');const value=workScope(body.scope);return {value,hash:digest({callbackUri:body.callbackUri,scope:value})};}
 function permitAccess(row,identity,s){
  if(!['teacher','admin'].includes(identity.role)||row.provider!==identity.provider||row.subject!==identity.subject||row.role!==identity.role)fail(401,'后台批阅来源账号已变化，请重新登录并继续。');
  const full=projection({id:row.grant_id,expires:row.expires},identity);
  if(!full.scopes.includes('writing.personal'))fail(403,'当前账号没有教师批阅权限。');
  const classes=s.type==='grading-run'?full.classes.filter(c=>c.id===s.classId&&['roster.read','writing.grade'].every(v=>c.scopes.includes(v))).map(c=>({...c,scopes:['roster.read','writing.grade']})):[];
  if(s.type==='grading-run'&&classes.length&&row.rights_json){const rights=JSON.parse(row.rights_json);if(rights.classVersion!==classes[0].version||rights.grantVersion!==classes[0].grantVersion)fail(403,'班级授权版本已改变，请核对后重新授权本次批阅。');}
  if(s.type==='grading-run'&&!classes.length)fail(403,'此班级的后台批阅权限已撤销，请核对后继续。');
  return {active:true,provider:identity.provider,subject:identity.subject,role:identity.role,permitId:row.id,expires:Math.min(row.expires,identity.expires),scope:s,scopes:['writing.personal',...(s.type==='grading-run'?['roster.read','writing.grade']:[])],classes};
 }
 async function authorize(body){
  const s=scope(body);if(typeof body.requestId!=='string'||!/^[-a-zA-Z0-9_]{16,128}$/.test(body.requestId))fail(400,'后台授权操作编号不正确。');
  const {row:grant,identity}=await inspect(body.grantId);initialize();
  const previous=db.prepare('SELECT * FROM writing_work_permits WHERE grant_id=? AND request_id=?').get(grant.id,body.requestId);
  if(previous){if(previous.scope_hash!==s.hash)fail(409,'同一后台授权编号不能改变批阅范围。');if(previous.revoked||previous.expires<=now())fail(401,'这次后台授权已过期或撤销，请重新登录并继续。');return permitAccess(previous,identity,s.value);}
  const created=now(),row={id:crypto.randomBytes(32).toString('base64url'),grant_id:grant.id,request_id:body.requestId,callback_uri:body.callbackUri,provider:grant.provider,subject:grant.subject,role:grant.role,source_hash:grant.source_hash,source_sealed:grant.source_sealed,scope_json:JSON.stringify(s.value),scope_hash:s.hash,rights_json:'',expires:Math.min(created+24*3600000,identity.expires),revoked:0,created,updated:created};
  const access=permitAccess(row,identity,s.value);row.rights_json=JSON.stringify(s.value.type==='grading-run'?{classVersion:access.classes[0].version,grantVersion:access.classes[0].grantVersion}:{});
  // A source logout may complete while the existing verifier is in flight.
  if(!db.prepare('SELECT 1 FROM writing_bridge_grants WHERE id=? AND revoked=0 AND expires>?').get(grant.id,created))fail(401,'登录授权已变化，请重新登录后继续。');
  if(db.prepare('SELECT COUNT(*) n FROM writing_work_permits WHERE provider=? AND subject=? AND created>?').get(row.provider,row.subject,created-86400000).n>=10000)fail(429,'后台授权数量较多，请管理员核对任务使用情况。');
  db.prepare('INSERT INTO writing_work_permits VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(...Object.values(row));audit(identity,'work.authorize',row.id);return access;
 }
 async function introspect(body){
  const s=scope(body);initialize();if(!ref.test(body.permitId))fail(401,'后台批阅授权无效，请重新登录并继续。');
  const row=db.prepare('SELECT * FROM writing_work_permits WHERE id=? AND revoked=0 AND expires>?').get(body.permitId,now());if(!row)fail(401,'后台批阅授权已到期或撤销，请重新登录并继续。');if(row.scope_hash!==s.hash)fail(403,'后台授权不适用于这份稿件、模型或任务。');
  let access;
  try{const identity=validateIdentity(await verifySource(unseal(row.source_sealed)));access=permitAccess(row,identity,s.value);}
  catch(error){if(error.status===401){db.prepare('UPDATE writing_work_permits SET revoked=1,updated=? WHERE source_hash=?').run(now(),row.source_hash);db.prepare('UPDATE writing_bridge_grants SET revoked=1 WHERE source_hash=?').run(row.source_hash);}else if(error.status===403)db.prepare('UPDATE writing_work_permits SET revoked=1,updated=? WHERE id=?').run(now(),row.id);throw error;}
  // A single paused/revoked operation must not revoke unrelated source work.
  if(!db.prepare('SELECT 1 FROM writing_work_permits WHERE id=? AND revoked=0 AND expires>?').get(row.id,now()))fail(401,'后台批阅授权已到期或撤销。');return access;
 }
 function revoke(body){const s=scope(body);if(!ref.test(body.permitId))fail(400,'后台授权编号不正确。');initialize();const row=db.prepare('SELECT * FROM writing_work_permits WHERE id=?').get(body.permitId);if(row){if(row.scope_hash!==s.hash)fail(403,'后台授权范围不一致。');db.prepare('UPDATE writing_work_permits SET revoked=1,updated=? WHERE id=?').run(now(),row.id);audit(row,'work.revoke',row.id);}return {ok:true};}
 function revokeGrant(grantId){initialize();db.prepare('UPDATE writing_work_permits SET revoked=1,updated=? WHERE grant_id=?').run(now(),grantId);}
 function revokeSource(sourceHash){initialize();db.prepare('UPDATE writing_work_permits SET revoked=1,updated=? WHERE source_hash=?').run(now(),sourceHash);}
 return {authorize,introspect,revoke,revokeGrant,revokeSource};
}
