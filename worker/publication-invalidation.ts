import type {Env} from './index';
// Appended inside the same collection transaction before the operation is marked
// committed. This also catches a publication created after collection preflight.
export function invalidatePublication(env:Env,draftId:string,owner:string,grantId:string,newInputHash:string,claimed:string,binds:unknown[]){
 const eventId=crypto.randomUUID(),now=Date.now();
 const gate=`p.draft_id=? AND p.owner=? AND p.state='published' AND p.input_hash<>? AND ${claimed}`;
 return [
  env.DB.prepare(`INSERT INTO writing_publication_versions(draft_id,version,state,report_id,report_revision,input_hash,object_key,content_hash,actor,reason,event_id,created) SELECT p.draft_id,p.version+1,'withdrawn',p.report_id,p.report_revision,p.input_hash,p.object_key,p.content_hash,?,'原稿更新，自动暂停原反馈',?,? FROM writing_publications p WHERE ${gate}`).bind(owner,eventId,now,draftId,owner,newInputHash,...binds),
  env.DB.prepare("UPDATE writing_publications SET version=version+1,state='withdrawn',updated=? WHERE draft_id=? AND owner=? AND EXISTS(SELECT 1 FROM writing_publication_versions v WHERE v.draft_id=writing_publications.draft_id AND v.version=writing_publications.version+1 AND v.event_id=?)").bind(now,draftId,owner,eventId),
  env.DB.prepare(`INSERT INTO writing_integration_outbox(id,draft_id,version,owner,grant_id,payload_json,state,created,updated) SELECT ?,p.draft_id,p.version,p.owner,?,json_object('schemaVersion',1,'eventId',?,'eventType','withdrawn','occurredAt',?,'draftId',p.draft_id,'taskId',p.task_id,'submissionId',(SELECT submission_id FROM writing_drafts WHERE id=p.draft_id),'publicationVersion',p.version,'reportId',p.report_id,'reportRevision',p.report_revision,'classId',p.class_id,'recipient',json_object('provider',p.student_provider,'subject',p.student_subject),'summary',json(p.summary_json)),'pending',?,? FROM writing_publications p JOIN writing_publication_versions v ON v.draft_id=p.draft_id AND v.version=p.version WHERE v.event_id=?`).bind(eventId,grantId,eventId,now,now,now,eventId),
 ];
}
