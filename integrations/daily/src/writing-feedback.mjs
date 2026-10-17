import crypto from 'node:crypto';
const uuid=/^[a-f0-9-]{36}$/;
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const string=(value,max=240)=>typeof value==='string'&&value.length>0&&value.length<=max;
// This receiver trusts the authenticated WriteAscend service as the issuer of
// previously approved immutable publication events. Delivery is not a new
// publication and does not require a still-live interactive login grant.
export function createWritingFeedback({db,callbacks,now=Date.now}){
 let initialized=false;
 const allowed=new Set(callbacks);
 function initialize(){if(initialized)return;db.exec(`
  CREATE TABLE IF NOT EXISTS writing_feedback_events(event_id TEXT PRIMARY KEY,payload_hash TEXT NOT NULL,draft_id TEXT NOT NULL,version INTEGER NOT NULL,accepted INTEGER NOT NULL,received INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS writing_feedback_heads(draft_id TEXT PRIMARY KEY,version INTEGER NOT NULL,state TEXT NOT NULL CHECK(state IN ('published','withdrawn')),event_id TEXT NOT NULL,actor_provider TEXT NOT NULL,actor_subject TEXT NOT NULL,student_provider TEXT NOT NULL,student_subject TEXT NOT NULL,class_id TEXT NOT NULL,task_id TEXT NOT NULL,submission_id TEXT NOT NULL,report_id TEXT NOT NULL,report_revision INTEGER NOT NULL,summary_json TEXT NOT NULL,link TEXT NOT NULL,occurred INTEGER NOT NULL,received INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS writing_feedback_student ON writing_feedback_heads(student_provider,student_subject,state,occurred,draft_id);
 `);initialized=true;}
 function source(callbackUri){if(!allowed.has(callbackUri))fail(400,'作文回调地址不在白名单中。');return new URL(callbackUri).origin;}
 function validate(body){
  if(!body||typeof body!=='object'||!body.event||!body.actor)fail(400,'缺少作文发布事件。');
  const e=body.event,actor=body.actor,r=e.recipient,s=e.summary;
  if(e.schemaVersion!==1||!uuid.test(e.eventId)||!['published','withdrawn'].includes(e.eventType)||!['draftId','taskId','submissionId','reportId'].every(k=>typeof e[k]==='string'&&uuid.test(e[k]))||!Number.isSafeInteger(e.publicationVersion)||e.publicationVersion<1||!Number.isSafeInteger(e.reportRevision)||e.reportRevision<1||!Number.isSafeInteger(e.occurredAt)||e.occurredAt<1||e.occurredAt>now()+300000||!string(e.classId,128)||!r||r.provider!=='wordup'||!string(r.subject,200)||!['wordup','daily_legacy_admin'].includes(actor.provider)||!string(actor.subject,200))fail(400,'作文事件版本或身份格式不正确。');
  if(!s||!string(s.title)||!string(s.teacherName,200)||!string(s.className,200)||!string(s.academicYear,100)||!Number.isSafeInteger(s.draftNumber)||s.draftNumber<1||s.draftNumber>20||typeof s.total!=='number'||!Number.isFinite(s.total)||s.total<=0||s.total>1000||typeof s.score!=='number'||!Number.isFinite(s.score)||s.score<0||s.score>s.total)fail(400,'作文摘要格式不正确。');
  const summary={title:s.title,teacherName:s.teacherName,className:s.className,academicYear:s.academicYear,draftNumber:s.draftNumber,score:s.score,total:s.total};
  const event={schemaVersion:1,eventId:e.eventId,eventType:e.eventType,occurredAt:e.occurredAt,draftId:e.draftId,taskId:e.taskId,submissionId:e.submissionId,publicationVersion:e.publicationVersion,reportId:e.reportId,reportRevision:e.reportRevision,classId:e.classId,recipient:{provider:'wordup',subject:r.subject},summary};
  const link=new URL('/student',source(body.callbackUri));link.searchParams.set('report',event.draftId);
  return {event,actor:{provider:actor.provider,subject:actor.subject},link:link.href};
 }
 function accept(body){
  const value=validate(body),{event:e,actor,link}=value,hash=digest(value);initialize();db.exec('BEGIN IMMEDIATE');
  try{
   const replay=db.prepare('SELECT * FROM writing_feedback_events WHERE event_id=?').get(e.eventId);
   if(replay&&replay.payload_hash!==hash)fail(409,'同一作文事件编号不能改变内容。');
   const previous=db.prepare('SELECT * FROM writing_feedback_heads WHERE draft_id=?').get(e.draftId);
   if(previous){
    const bindings=[['actor_provider',actor.provider],['actor_subject',actor.subject],['student_provider',e.recipient.provider],['student_subject',e.recipient.subject],['class_id',e.classId],['task_id',e.taskId],['submission_id',e.submissionId]];
    if(bindings.some(([field,value])=>previous[field]!==value))fail(409,'同一学生稿次不能改绑接收者、教师或任务。');
    if(previous.version===e.publicationVersion&&previous.event_id!==e.eventId)fail(409,'同一发布版本已有不同事件，请对账。');
   }
   const accepted=!previous||e.publicationVersion>previous.version,received=now();
   if(!replay)db.prepare('INSERT INTO writing_feedback_events VALUES(?,?,?,?,?,?)').run(e.eventId,hash,e.draftId,e.publicationVersion,accepted?1:0,received);
   else if(accepted)db.prepare('UPDATE writing_feedback_events SET accepted=1 WHERE event_id=?').run(e.eventId);
   if(accepted)db.prepare(`INSERT INTO writing_feedback_heads VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(draft_id) DO UPDATE SET version=excluded.version,state=excluded.state,event_id=excluded.event_id,report_id=excluded.report_id,report_revision=excluded.report_revision,summary_json=excluded.summary_json,link=excluded.link,occurred=excluded.occurred,received=excluded.received`).run(e.draftId,e.publicationVersion,e.eventType==='published'?'published':'withdrawn',e.eventId,actor.provider,actor.subject,e.recipient.provider,e.recipient.subject,e.classId,e.taskId,e.submissionId,e.reportId,e.reportRevision,JSON.stringify(e.summary),link,e.occurredAt,received);
   const current=db.prepare('SELECT * FROM writing_feedback_heads WHERE draft_id=?').get(e.draftId);
   db.exec('COMMIT');return {ok:true,eventId:e.eventId,publicationVersion:e.publicationVersion,currentVersion:current.version,state:current.state,reportId:current.report_id,reportRevision:current.report_revision,accepted:accepted||!!replay?.accepted,replayed:!!replay};
  }catch(error){db.exec('ROLLBACK');throw error;}
 }
 function list(identity,cursor){
  if(identity.role!=='student'||identity.provider!=='wordup'||identity.accountType!=='school'||identity.isGuest)fail(403,'请使用学校学生账号查看自己的作文反馈。');initialize();
  let before=Number.MAX_SAFE_INTEGER,after='~';if(cursor){try{const value=JSON.parse(Buffer.from(cursor,'base64url').toString());if(!Array.isArray(value)||!Number.isSafeInteger(value[0])||!uuid.test(value[1]))throw Error();[before,after]=value;}catch{fail(400,'作文记录分页位置不正确。');}}
  const rows=db.prepare("SELECT * FROM writing_feedback_heads WHERE student_provider=? AND student_subject=? AND state='published' AND (occurred<? OR (occurred=? AND draft_id<?)) ORDER BY occurred DESC,draft_id DESC LIMIT 26").all(identity.provider,identity.subject,before,before,after),items=rows.slice(0,25),last=items.at(-1);
  return {name:identity.name||'',reports:items.map(r=>({id:r.draft_id,version:r.version,publishedAt:r.occurred,link:r.link,...JSON.parse(r.summary_json)})),next:rows.length>25?Buffer.from(JSON.stringify([last.occurred,last.draft_id])).toString('base64url'):null};
 }
 function portal(identity){const origin=source(callbacks[0]);return {authenticated:true,name:identity.name||'',role:identity.role,entryUrl:identity.role==='student'?'/writing-feedback.html':origin+'/api/auth/start'};}
 function receipt(eventId){initialize();const r=db.prepare('SELECT e.event_id,e.version,e.accepted,h.version AS current_version,h.state,h.report_id,h.report_revision FROM writing_feedback_events e JOIN writing_feedback_heads h ON h.draft_id=e.draft_id WHERE e.event_id=?').get(eventId);if(!r)return {found:false};return {found:true,eventId:r.event_id,publicationVersion:r.version,currentVersion:r.current_version,state:r.state,reportId:r.report_id,reportRevision:r.report_revision,accepted:!!r.accepted};}
 return {accept,list,portal,receipt};
}
