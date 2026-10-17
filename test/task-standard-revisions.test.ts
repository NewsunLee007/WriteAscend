import test from 'node:test';
import assert from 'node:assert/strict';
import {sandbox,taskId,memberIds} from './helpers/bound-sandbox';
const route='/api/tasks/'+taskId+'/standard';
async function body(h:Awaited<ReturnType<typeof sandbox>>){const d=(await h.request('/api/tasks/'+taskId)).body.document;return {requestId:crypto.randomUUID(),expectedRevision:2,teacherConfirmed:true,reason:'按本篇题目核对后调整字数',rubric:{...d.rubric,wordCount:'50–70 words'},settings:d.settings};}
test('an unpublished task can revise standards without reuploading photos or overwriting an earlier report',async()=>{
 const h=await sandbox();try{
  await h.collect();const input=await h.inputFor(),run=(await h.create(input)).body.run;await h.drain();const old=(await h.request('/api/writing-reports/'+run.id)).body,oldDraft=h.db.prepare('SELECT * FROM writing_drafts').get()!,claims=h.db.prepare('SELECT * FROM writing_page_claims').all();
  h.db.prepare('INSERT INTO writing_sheet_sets VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),h.session.principal,taskId,memberIds[0],1,1,1,'synthetic','{}','active',1);
  const request=await body(h),r=await h.request(route,request);assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.body.task.version,2);
  assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM rubric_versions').get()!.n,2);assert.equal((await h.request('/api/tasks/'+taskId+'?version=1')).body.document.rubric.wordCount,'60-80 words');
  const current=h.db.prepare('SELECT * FROM writing_drafts').get()!;assert.equal(current.revision,2);assert.equal(current.state,'received');assert.notEqual(current.input_hash,oldDraft.input_hash);assert.deepEqual(h.db.prepare('SELECT * FROM writing_page_claims').all(),claims);assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM submission_page_versions').get()!.n,1);assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM writing_sheet_sets WHERE status='active'").get()!.n,0);
  const archived=(await h.request('/api/writing-reports/'+run.id)).body;assert.equal(archived.report.outdated,true);assert.deepEqual(archived.document,old.document);
  assert.equal((await h.request('/api/writing-reports/'+run.id+'/publication',{requestId:crypto.randomUUID(),expectedPublicationVersion:0,expectedReportRevision:1,inputHash:input.inputHash,teacherConfirmed:true})).status,409);
  const beforeCalls=h.calls.length;assert.equal((await h.request(route,request)).body.replayed,true);assert.equal(h.calls.length,beforeCalls);assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM writing_draft_inputs').get()!.n,2);
  const next=(await h.create(await h.inputFor())).body.run;await h.drain();const report=(await h.request('/api/writing-reports/'+next.id)).body;assert.equal(report.document.rubric.wordCount,'50–70 words');assert.equal(report.document.provenance.taskVersion,2);assert.equal(report.document.source.manifest.pages[0].assetId,old.document.source.manifest.pages[0].assetId);
  assert.equal((await h.request('/api/writing-reports/'+next.id+'/publication',{requestId:crypto.randomUUID(),expectedPublicationVersion:0,expectedReportRevision:1,inputHash:report.document.provenance.inputHash,teacherConfirmed:true})).status,200);
  assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM workspace_audit WHERE action=?').get('writing-standard-revision')!.n,1);
 }finally{h.close();}
});
test('concurrent amendments and repeated requests cannot reset newer collected pages',async()=>{
 const h=await sandbox();try{
  await h.collect();const request=await body(h),same=await Promise.all([h.request(route,request),h.request(route,request)]);assert(same.every(x=>x.status===200),JSON.stringify(same));assert.equal(h.db.prepare('SELECT revision FROM writing_drafts').get()!.revision,2);assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM workspace_audit WHERE action=?').get('writing-standard-revision')!.n,1);
  assert.equal((await h.collect(0,1,1,1,99)).status,201);const latest=h.db.prepare('SELECT * FROM writing_drafts').get()!;assert.equal((await h.request(route,request)).status,200);assert.deepEqual(h.db.prepare('SELECT * FROM writing_drafts').get(),latest);
  const second={...await body(h),expectedRevision:3,rubric:{...request.rubric,wordCount:'55–75 words'}},different={...second,requestId:crypto.randomUUID(),reason:'另一设备调整同一份标准'};
  const results=await Promise.all([h.request(route,second),h.request(route,different)]);assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);assert.equal(h.db.prepare('SELECT current_version FROM writing_tasks').get()!.current_version,3);
 }finally{h.close();}
});
test('standards cannot change during grading or after feedback has been published',async()=>{
 const h=await sandbox();try{
  await h.collect();const input=await h.inputFor(),run=(await h.create(input)).body.run,request=await body(h);assert.equal((await h.request(route,request)).status,409);await h.drain();
  assert.equal((await h.request('/api/writing-reports/'+run.id+'/publication',{requestId:crypto.randomUUID(),expectedPublicationVersion:0,expectedReportRevision:1,inputHash:input.inputHash,teacherConfirmed:true})).status,200);
  const r=await h.request(route,request);assert.equal(r.status,409);assert.match(r.body.error.message,/发布记录/);assert.equal(h.db.prepare('SELECT current_version FROM writing_tasks').get()!.current_version,1);
 }finally{h.close();}
});
test('authorization, confirmation, storage and concurrent collection failures leave the original standard intact',async()=>{
 const h=await sandbox();try{
  await h.collect();const request=await body(h);assert.equal((await h.request(route,{...request,teacherConfirmed:false})).status,400);assert.equal((await h.request(route,request,'POST',{...h.session,principal:'wordup:other'})).status,404);
  h.flags({revoked:true});assert.equal((await h.request(route,request)).status,403);h.flags({});
  const put=h.env.FILES.put.bind(h.env.FILES);(h.env.FILES as any).put=async()=>{throw Error('Synthetic write failure');};await assert.rejects(h.request(route,request),/Synthetic write failure/);assert.equal(h.db.prepare('SELECT current_version FROM writing_tasks').get()!.current_version,1);
  let changed=false;(h.env.FILES as any).put=async(...args:any[])=>{await (put as any)(...args);if(!changed){changed=true;await h.collect(0,1,1,1,98);}};
  const r=await h.request(route,request);assert.equal(r.status,409);assert.equal(h.db.prepare('SELECT current_version FROM writing_tasks').get()!.current_version,1);assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM rubric_versions').get()!.n,1);assert.equal(h.db.prepare('SELECT revision FROM writing_drafts').get()!.revision,2);
 }finally{h.close();}
});
