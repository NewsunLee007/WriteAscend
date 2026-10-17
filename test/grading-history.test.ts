import test from 'node:test';
import assert from 'node:assert/strict';
import {sandbox,taskId} from './helpers/bound-sandbox';
const id=()=>crypto.randomUUID();
const profiles=[{id:'default',label:'原模型',apiUrl:'https://model.invalid/v1/chat/completions',model:'server-model'},{id:'alternative',label:'另一模型',apiUrl:'https://model.invalid/v1/chat/completions',model:'other-model'}];
test('report history paginates immutable revisions with current student visibility and restores content as a new edit without a model call',async()=>{
 const h=await sandbox();try{
  await h.collect();const input=await h.inputFor(),created=await h.create(input);await h.drain();const reportId=created.body.run.id,path='/api/writing-reports/'+reportId;
  const original=(await h.request(path)).body;
  for(let revision=1;revision<=40;revision++){const saved=await h.request(path,{requestId:id(),expectedRevision:revision,result:{brief_comment:'教师第 '+revision+' 次补充具体建议。'},reason:'核对后补充建议'},'PATCH');assert.equal(saved.status,200,JSON.stringify(saved));}
  assert.equal((await h.request(path+'/publication',{requestId:id(),expectedPublicationVersion:0,expectedReportRevision:41,inputHash:input.inputHash,teacherConfirmed:true})).status,200);
  const all:any[]=[];let before='';do{const page=await h.request(path+'/history'+(before?'?before='+before:''));assert.equal(page.status,200);assert(page.body.revisions.length<=20);all.push(...page.body.revisions);before=page.body.next?String(page.body.next):'';}while(before);
  assert.equal(all.length,41);assert.deepEqual(all.map(r=>r.revision),Array.from({length:41},(_,i)=>41-i));assert.equal(all.filter(r=>r.studentVisible).length,1);assert.equal(all[0].studentVisible,true);assert.equal(all.at(-1).source,'ai');assert(!JSON.stringify(all).includes('object_key'));
  const restore=await h.request(path,{requestId:id(),expectedRevision:41,result:original.document.result,reason:'从第 1 版另存为新修订'},'PATCH');assert.equal(restore.body.report.revision,42);assert.equal(restore.body.document.result.brief_comment,original.document.result.brief_comment);assert.equal(h.calls.length,1);
  const p=(await h.request(path+'/publication')).body.publication;assert.equal(p.reportRevision,41);assert.equal(p.state,'published');assert.equal((await h.request(path+'?revision=1')).body.report.source,'ai');
  assert.equal((await h.request(path,{requestId:id(),expectedRevision:41,result:original.document.result},'PATCH')).status,409);assert.equal((await h.request(path+'/history?before=NaN')).status,400);assert.equal((await h.request(path+'/history',{})).status,405);
 }finally{h.close();}
});
test('explicit regrade preserves old publication, deduplicates concurrent starts and permits a deliberate model change',async()=>{
 const h=await sandbox();try{
  h.env.MODEL_PROFILES=JSON.stringify(profiles);await h.collect();const input=await h.inputFor(),first=await h.create(input);await h.drain();const firstId=first.body.run.id;
  assert.equal((await h.request('/api/writing-reports/'+firstId+'/publication',{requestId:id(),expectedPublicationVersion:0,expectedReportRevision:1,inputHash:input.inputHash,teacherConfirmed:true})).status,200);
  const body={...input,requestId:id(),previousRunId:firstId,reason:'教师核对后重新批阅本稿'};assert.equal((await h.create(body)).status,400);assert.equal(h.calls.length,1);
  const results=await Promise.all([h.create({...body,confirmBillable:true}),h.create({...body,requestId:id(),confirmBillable:true})]);assert(results.some(r=>r.status===202));assert(results.every(r=>[202,409].includes(r.status)));assert.equal(new Set(results.filter(r=>r.status===202).map(r=>r.body.run.id)).size,1);await h.drain();assert.equal(h.calls.length,2);const secondId=results.find(r=>r.status===202)!.body.run.id;
  assert.equal((await h.create({...input,requestId:id()})).body.run.id,secondId);assert.equal((await h.request('/api/writing-reports/'+firstId+'/publication')).body.publication.reportId,firstId);
  assert.equal((await h.create({...body,requestId:id(),confirmBillable:true})).status,409);
  assert.equal((await h.create({...input,requestId:id(),profileId:'alternative'})).status,409);
  const third=await h.create({...body,requestId:id(),previousRunId:secondId,profileId:'alternative',confirmBillable:true,reason:'改用另一已配置模型重新核对'});assert.equal(third.status,202,JSON.stringify(third));await h.drain();assert.equal(h.calls.length,3);assert.equal(h.calls[2].model,'other-model');assert.equal(third.body.run.generation,2);
  assert.equal((await h.create({...input,requestId:id(),profileId:'alternative'})).body.run.id,third.body.run.id);
  const history=(await h.request('/api/grading/'+firstId+'/history')).body.runs;assert.deepEqual(history.map((r:any)=>r.id),[third.body.run.id,secondId,firstId]);assert.equal(history[0].previousRunId,secondId);assert.equal(history[0].reason,'改用另一已配置模型重新核对');assert.equal(history[2].reportRevision,1);
  const student={...h.session,role:'student',principal:'wordup:student-0',subject:'student-0',scopes:['writing.own'],classes:[]};const visible=await h.request('/api/student/reports/'+input.draftId,undefined,'GET',student);assert.equal(visible.status,200);assert.equal(visible.body.publication.reportRevision,1);assert.equal(visible.body.publication.version,1);assert.equal((await h.request('/api/writing-reports/'+firstId+'/publication')).body.publication.reportId,firstId);
 }finally{h.close();}
});
test('run history pagination covers the complete draft and rejects other owners, students, revoked rights and invalid cursors',async()=>{
 const h=await sandbox();try{
  await h.collect();const input=await h.inputFor();let last=await h.create(input);await h.drain();const ids=[last.body.run.id];
  for(let i=0;i<23;i++){last=await h.create({...input,requestId:id(),previousRunId:last.body.run.id,confirmBillable:true,reason:'第 '+(i+2)+' 次合成重批阅核对'});assert.equal(last.status,202,JSON.stringify(last));await h.drain();ids.push(last.body.run.id);}
  const path='/api/grading/'+ids[0]+'/history',first=await h.request(path),second=await h.request(path+'?cursor='+encodeURIComponent(first.body.next));assert.equal(first.body.runs.length,20);assert.equal(second.body.runs.length,4);assert.deepEqual([...first.body.runs,...second.body.runs].map(r=>r.id),[...ids].reverse());assert.equal(second.body.next,null);assert.equal(h.calls.length,24);
  assert.equal((await h.request(path+'?cursor=bad')).status,400);assert.equal((await h.request(path,undefined,'GET',{...h.session,principal:'wordup:other'})).status,404);assert.equal((await h.request(path,undefined,'GET',{...h.session,role:'student'})).status,403);assert.equal((await h.request(path,undefined,'GET',{...h.session,classes:[]})).status,403);
  assert.equal((await h.request('/api/writing-reports/'+ids[0]+'/history',undefined,'GET',{...h.session,principal:'wordup:other'})).status,404);
 }finally{h.close();}
});
test('regrade cannot fork another student, a replaced input or an unfinished run',async()=>{
 const h=await sandbox();try{
  await h.collect();await h.collect(1);const a=await h.inputFor(),b=await h.inputFor(1),first=await h.create(a);await h.drain();const reason='教师核对后重新批阅本稿';
  assert.equal((await h.create({...b,previousRunId:first.body.run.id,confirmBillable:true,reason})).status,409);
  const second=await h.create({...a,requestId:id(),previousRunId:first.body.run.id,confirmBillable:true,reason});assert.equal(second.status,202);
  assert.equal((await h.create({...a,requestId:id(),previousRunId:second.body.run.id,confirmBillable:true,reason})).status,409);await h.drain();await h.collect(0,1,1,1,25);const updated=await h.inputFor();assert.equal((await h.create({...updated,previousRunId:second.body.run.id,confirmBillable:true,reason})).status,409);assert.equal(h.calls.length,2);
 }finally{h.close();}
});
