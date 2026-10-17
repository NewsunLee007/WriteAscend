import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceGradingRun,recoverGradingRuns} from '../worker/grading';
import {handleModelApi} from '../worker/model-jobs';
import {HttpError} from '../worker/errors';
import {sandbox,fixture,taskId} from './helpers/bound-sandbox';
test('complete immutable input becomes one class-bound model run and original report; refresh/repeated queue messages do not regrade',async()=>{
 const h=await sandbox();try{
  assert.equal((await h.collect()).status,201);const input=await h.inputFor(),first=await h.create({...input,messages:[{role:'user',content:'Forged client grading prompt'}]});assert.equal(first.status,202,JSON.stringify(first));
  const id=first.body.run.id;assert.equal((await h.create({...input,messages:[{role:'user',content:'Forged client grading prompt'}]})).body.run.id,id);
  assert.equal((await h.create({...input,requestId:crypto.randomUUID()})).body.run.id,id);await h.drain();assert.equal(h.run(id).state,'ready',JSON.stringify(h.run(id)));assert.equal(h.calls.length,1);assert(!JSON.stringify(h.calls).includes('Forged client'));assert(h.calls[0].messages[0].content.includes(fixture.seed.assignment.topic));
  await advanceGradingRun(h.env,id,h.bridge);await h.drain();assert.equal(h.calls.length,1);
  const report=await h.request('/api/writing-reports/'+id);assert.equal(report.status,200,JSON.stringify(report));assert.equal(report.body.document.result.student_id,'wordup:student-0');assert.equal(report.body.document.result.class_id,'daily:class');assert.equal(report.body.document.provenance.inputHash,input.inputHash);assert.equal(report.body.document.result.total_score,15.5);assert.equal(report.body.document.rubric.total,20);assert.equal(report.body.document.result.standard_reference,fixture.seed.assignment.modelEssay);
  for(const field of ['brief_comment','highlights','errors','content_logic','original_essay','optimized_essay'])assert(report.body.document.result[field]);
  assert.equal((await h.request('/api/grading/'+id)).body.steps.length,1);
 }finally{h.close();}
});
test('page replacement after intake leaves the run on its original input and marks its report outdated; new input gets its own run',async()=>{
 const h=await sandbox();try{
  await h.collect();const old=await h.inputFor(),first=await h.create(old);assert.equal(first.status,202,JSON.stringify(first));await h.collect(0,1,1,1,9);await h.drain();const oldReport=await h.request('/api/writing-reports/'+first.body.run.id);assert.equal(oldReport.body.report.outdated,true);assert.equal(oldReport.body.document.provenance.inputHash,old.inputHash);assert.equal(oldReport.body.document.source.manifest.pages[0].revision,1);
  assert.equal((await h.create({...old,requestId:crypto.randomUUID()})).body.error.code,'grading_input_changed');const current=await h.inputFor(),next=await h.create(current);assert.notEqual(next.body.run.id,first.body.run.id);await h.drain();assert.equal((await h.request('/api/writing-reports/'+next.body.run.id)).body.report.outdated,false);assert.equal(h.calls.length,2);
 }finally{h.close();}
});
test('same-name members remain separate and incomplete pages, wrong owner or revoked class cannot start or read a bound model job',async()=>{
 const h=await sandbox();try{
  await h.collect(0,1,2);const incomplete=await h.inputFor();assert.equal((await h.create(incomplete)).body.error.code,'grading_pages_missing');await h.collect(0,2,2);await h.collect(1);
  const a=await h.create(await h.inputFor()),b=await h.create(await h.inputFor(1));assert.notEqual(a.body.run.id,b.body.run.id);await h.drain();assert.equal((await h.request('/api/writing-reports/'+a.body.run.id)).body.document.identity.subject,'student-0');assert.equal((await h.request('/api/writing-reports/'+b.body.run.id)).body.document.identity.subject,'student-1');assert.equal(h.calls[0].messages[1].content.filter((p:any)=>p.type==='image_url').length,2);
  assert.equal((await h.request('/api/grading/'+a.body.run.id,undefined,'GET',{...h.session,principal:'wordup:other'})).status,404);
  assert.equal((await h.request('/api/writing-reports/'+a.body.run.id,undefined,'GET',{...h.session,classes:[]})).status,403);
  const jobId=h.db.prepare('SELECT job_id FROM grading_steps WHERE run_id=?').get(a.body.run.id)!.job_id;
  await assert.rejects(handleModelApi(new Request('https://write.test/api/model/jobs/'+jobId+'/result'),h.env,{...h.session,classes:[]},r=>r.json()),e=>e instanceof HttpError&&e.status===403);
  h.flags({revoked:true});assert.equal((await h.create({...await h.inputFor(),requestId:crypto.randomUUID()})).status,403);
 }finally{h.close();}
});
test('class rights are checked again before model dispatch, and reserved stage request IDs cannot be created through the public model API',async()=>{
 const h=await sandbox();try{
  await h.collect();const created=await h.create(await h.inputFor());await advanceGradingRun(h.env,created.body.run.id,h.bridge);h.flags({revoked:true});await h.drain();assert.equal(h.calls.length,0);assert.equal(h.run(created.body.run.id).state,'failed');
  await assert.rejects(handleModelApi(new Request('https://write.test/api/model/jobs',{method:'POST'}),h.env,h.session,async()=>({requestId:'wa-grade-forged-0001',profileId:'default',payload:{messages:[{role:'user',content:'Fake'}]}})),e=>e instanceof HttpError&&e.status===400);
 }finally{h.close();}
});
test('teacher report edits use immutable revisions, reject relinking and conflicting edits, preserve AI version and do not invoke a model',async()=>{
 const h=await sandbox();try{
  await h.collect();const first=await h.create(await h.inputFor());await h.drain();const id=first.body.run.id,report=await h.request('/api/writing-reports/'+id),body={requestId:crypto.randomUUID(),expectedRevision:1,result:{...report.body.document.result,brief_comment:'教师修改：请补充帮助同学的细节。'}};
  const edited=await h.request('/api/writing-reports/'+id,body,'PATCH');assert.equal(edited.status,200,JSON.stringify(edited));assert.equal(edited.body.report.revision,2);assert.equal((await h.request('/api/writing-reports/'+id,body,'PATCH')).body.report.revision,2);assert.equal(h.calls.length,1);
  const original=await h.request('/api/writing-reports/'+id+'?revision=1');assert.equal(original.body.document.result.brief_comment,report.body.document.result.brief_comment);assert.equal(original.body.report.source,'ai');assert.equal(edited.body.report.source,'teacher');
  assert.equal((await h.request('/api/writing-reports/'+id,{...body,requestId:crypto.randomUUID()},'PATCH')).status,409);
  assert.equal((await h.request('/api/writing-reports/'+id,{requestId:crypto.randomUUID(),expectedRevision:2,result:{student_id:'wordup:student-1'}},'PATCH')).status,400);
  assert.equal((await h.request('/api/writing-reports/'+id,{requestId:crypto.randomUUID(),expectedRevision:2,result:{total_score:1}},'PATCH')).status,400);
  assert.equal((await h.request('/api/writing-reports/'+id,{requestId:crypto.randomUUID(),expectedRevision:2,result:{brief_comment:{forged:'object'}}},'PATCH')).status,400);
  assert.equal((await h.request('/api/writing-reports/'+id,{requestId:crypto.randomUUID(),expectedRevision:2,result:{errors:[{orig:{forged:'object'}}]}},'PATCH')).status,400);
  const a={requestId:crypto.randomUUID(),expectedRevision:2,result:{brief_comment:'设备甲核对后补充建议。'}},b={requestId:crypto.randomUUID(),expectedRevision:2,result:{brief_comment:'设备乙核对后补充建议。'}},r=await Promise.all([h.request('/api/writing-reports/'+id,a,'PATCH'),h.request('/api/writing-reports/'+id,b,'PATCH')]);assert.deepEqual(r.map(v=>v.status).sort(),[200,409]);
 }finally{h.close();}
});
test('report storage failure resumes the already completed model result without another billable call',async()=>{
 const h=await sandbox();try{
  await h.collect();const created=await h.create(await h.inputFor());h.flags({reportStorageFails:true});await h.drain();const run=h.run(created.body.run.id);assert.equal(run.state,'failed');assert.equal(run.error_status,503);assert.equal(h.calls.length,1);h.flags({});const resume=await h.request('/api/grading/'+run.id+'/resume',{requestId:crypto.randomUUID(),expectedUpdated:run.updated});assert.equal(resume.status,202,JSON.stringify(resume));await h.drain();assert.equal(h.run(run.id).state,'ready');assert.equal(h.calls.length,1);
 }finally{h.close();}
});
test('unknown model processing is never automatically resent; explicit confirmation retries only the failed stage',async()=>{
 const h=await sandbox();try{
  h.provider(()=>{throw Error('Synthetic connection lost after dispatch');});await h.collect();const created=await h.create(await h.inputFor());await h.drain();const run=h.run(created.body.run.id);assert.equal(run.state,'uncertain');assert.equal(h.calls.length,1);await recoverGradingRuns(h.env,h.bridge);await h.drain();assert.equal(h.calls.length,1);
  assert.equal((await h.request('/api/grading/'+run.id+'/resume',{requestId:crypto.randomUUID(),expectedUpdated:run.updated})).body.error.code,'grading_uncertain_confirmation');h.provider(()=>Response.json(fixture.response));const resumed=await h.request('/api/grading/'+run.id+'/resume',{requestId:crypto.randomUUID(),expectedUpdated:run.updated,confirmUncertain:true,reason:'已核对供应商记录，明确重新提交这一批改步骤'});assert.equal(resumed.status,202,JSON.stringify(resumed));await h.drain();assert.equal(h.run(run.id).state,'ready');assert.equal(h.calls.length,2);assert.equal(h.db.prepare('SELECT COUNT(*) n FROM grading_steps WHERE run_id=?').get(run.id)!.n,2);
 }finally{h.close();}
});
test('a failed optional rewrite retains the first grade and may be explicitly accepted without another provider call',async()=>{
 const h=await sandbox();try{
  const response=structuredClone(fixture.response),result=JSON.parse(response.choices[0].message.content);result.optimized_essay=fixture.seed.assignment.modelEssay;response.choices[0].message.content=JSON.stringify(result);
  let attempt=0;h.provider(()=>{if(attempt++===0)return Response.json(response);throw Error('Synthetic optional rewrite connection lost');});await h.collect();const created=await h.create(await h.inputFor());await h.drain();const run=h.run(created.body.run.id);assert.equal(run.state,'uncertain');assert(run.result_key);assert.equal(h.calls.length,2);
  const body={requestId:crypto.randomUUID(),expectedUpdated:run.updated,reason:'已核对正文批阅内容，保留当前结果并稍后人工修改润色'};
  const accepted=await h.request('/api/grading/'+run.id+'/accept',body);assert.equal(accepted.status,202,JSON.stringify(accepted));assert.equal(accepted.body.run.state,'ready');assert.equal((await h.request('/api/grading/'+run.id+'/accept',body)).body.run.state,'ready');await h.drain();assert.equal(h.calls.length,2);
  const report=await h.request('/api/writing-reports/'+run.id);assert.equal(report.body.document.result.total_score,15.5);assert.equal(report.body.document.result.original_essay,result.original_essay);assert.equal(report.body.document.provenance.pipelineComplete,false);assert.equal(report.body.document.warnings[0].code,'teacher_accepted_saved_result');
 }finally{h.close();}
});
test('one malformed response uses one saved JSON repair step, and repair cannot change canonical task identity or source score',async()=>{
 const h=await sandbox();try{
  let attempt=0;h.provider(()=>Response.json(attempt++===0?{choices:[{message:{content:'Synthetic malformed JSON'}}]}:fixture.response));await h.collect();const created=await h.create(await h.inputFor());await h.drain();const run=h.run(created.body.run.id);assert.equal(run.state,'ready',JSON.stringify(run));assert.equal(h.calls.length,2);assert.equal(h.db.prepare("SELECT COUNT(*) n FROM grading_steps WHERE run_id=? AND stage='grade:json'").get(run.id)!.n,1);
  assert(h.calls[1].messages[1].content.includes('Synthetic malformed JSON'));assert.equal((await h.request('/api/writing-reports/'+run.id)).body.document.identity.subject,'student-0');
 }finally{h.close();}
});
test('a class batch waits for model intake capacity and later advances without failing students or creating duplicate requests',async()=>{
 const h=await sandbox();try{
  (h.env as any).MODEL_PENDING_LIMIT='1';await h.collect();await h.collect(1);const a=await h.create(await h.inputFor()),b=await h.create(await h.inputFor(1));await h.drain();assert.equal(h.run(a.body.run.id).state,'ready');assert.equal(h.run(b.body.run.id).state,'queued');assert.equal(h.calls.length,1);await recoverGradingRuns(h.env,h.bridge);await h.drain();assert.equal(h.run(b.body.run.id).state,'ready');assert.equal(h.calls.length,2);assert.equal(h.db.prepare('SELECT COUNT(*) n FROM model_jobs').get()!.n,2);
 }finally{h.close();}
});
