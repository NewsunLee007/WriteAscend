import test from 'node:test';
import assert from 'node:assert/strict';
import {sandbox,taskId,memberIds} from './helpers/bound-sandbox';
import {handleStudentRevisions} from '../worker/student-revisions';
import {HttpError} from '../worker/errors';
const id=()=>crypto.randomUUID();
async function prepared(){
 const h=await sandbox(),baseBridge=h.bridge;
 const student={...h.session,principal:'wordup:student-0',provider:'wordup',subject:'student-0',role:'student',grant_id:'student-grant',scopes:['writing.own'],classes:[]};
 let studentActive=true;
 h.setBridge(async(env,path,b)=>b.grantId==='student-grant'?{active:studentActive,provider:'wordup',subject:'student-0',role:'student',scopes:['writing.own'],classes:[]}:baseBridge(env,path,b));
 const request=(path:string,body?:any,who=student)=>h.request(path,body,body?'POST':'GET',who);
 await h.collect();const first=await h.create(await h.inputFor());await h.drain();let report=await h.request('/api/writing-reports/'+first.body.run.id);
 if(report.body.document.result.identity_name_mismatch){report=await h.request('/api/writing-reports/'+first.body.run.id,{requestId:id(),expectedRevision:1,result:{...report.body.document.result,identity_name_mismatch_verified:true}},'PATCH');}
 const pub=await h.request('/api/writing-reports/'+first.body.run.id+'/publication',{requestId:id(),expectedPublicationVersion:0,expectedReportRevision:report.body.report.revision,inputHash:report.body.document.provenance.inputHash,teacherConfirmed:true});assert.equal(pub.status,200,JSON.stringify(pub));
 const parentId=first.body.run.draftId;
 const createBody={parentDraftId:parentId,parentPublicationVersion:1,requestId:id()},created=await request('/api/student/revisions',createBody);assert.equal(created.status,201,JSON.stringify(created));const wid=created.body.id;
 const api=(action:string,body:any,who=student)=>request('/api/student/revisions/'+wid+'/'+action,{requestId:id(),...body},who);
 async function upload(marker=100,requestId=id()){
  const bytes=Buffer.concat([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6b9sAAAAASUVORK5CYII=','base64'),Buffer.from([marker])]);
  try{const r=await handleStudentRevisions(new Request('https://write.test/api/student/revisions/'+wid+'/assets',{method:'POST',body:bytes,headers:{'X-Upload-Id':requestId}}),h.env,student,h.bridge,r=>r.json());return {status:r!.status,body:await r!.json() as any};}catch(e){if(e instanceof HttpError)return {status:e.status,body:{error:{message:e.message,code:e.code}}};throw e;}
 }
 const criterion=report.body.document.rubric.items[0].id;
 const content=(assets:any[])=>({changes:[{criterionId:criterion,response:'revised',evidence:'补充了具体的活动和原因，第二段增加了例子。'}],reflection:'我先核对了内容要点，又逐句检查了时态和拼写。',pages:assets.map(a=>({assetId:a.body.id,fileName:'我的自主二稿.png'}))});
 return {...h,student,studentRequest:request,api,wid,parentId,first,report,upload,content,createBody,setStudentActive:(v:boolean)=>studentActive=v};
}
test('student own revision saves and submits against the teacher rubric; teacher accepts immutable photos into the normal next-draft grading pipeline',async()=>{
 const h=await prepared();try{
  const a=await h.upload(),b=await h.upload(101);assert.equal(a.status,201);const content=h.content([a,b]);
  const saved=await h.api('save',{expectedRevision:1,content});assert.equal(saved.status,200,JSON.stringify(saved));assert.equal(saved.body.revision,2);
  const submitted=await h.api('submit',{expectedRevision:2,content,ownWorkConfirmed:true});assert.equal(submitted.status,200,JSON.stringify(submitted));assert.equal(h.calls.length,1);
  const list=await h.request('/api/tasks/'+taskId+'/student-revisions',undefined,'GET',h.session);assert.equal(list.status,200);assert.equal(list.body.revisions[0].state,'submitted');
  const before=h.db.prepare('SELECT COUNT(*) n FROM writing_drafts').get()!.n;
  const body={requestId:id(),expectedRevision:3,teacherConfirmed:true},path='/api/tasks/'+taskId+'/student-revisions/'+h.wid+'/accept';const accepted=await h.request(path,body,'POST');assert.equal(accepted.status,200,JSON.stringify(accepted));assert.equal(accepted.body.draftNumber,2);assert.equal((await h.request(path,body,'POST')).body.draftId,accepted.body.draftId);assert.equal(h.db.prepare('SELECT COUNT(*) n FROM writing_drafts').get()!.n,Number(before)+1);assert.equal(h.calls.length,1);
  const collected=await h.request('/api/tasks/'+taskId+'/collection?memberId='+memberIds[0]+'&draftNumber=2');assert(collected.body.draft.complete);assert.equal(collected.body.draft.manifest.studentRevision.author,'student');assert.equal(collected.body.draft.manifest.pages.length,2);assert.equal(collected.body.draft.manifest.studentRevision.changes[0].criterionId,content.changes[0].criterionId);
  for(const page of collected.body.draft.manifest.pages){assert.equal(h.db.prepare('SELECT owner FROM private_assets WHERE id=?').get(page.assetId)!.owner,h.session.principal);assert.equal(page.confirmedBy,h.session.principal);}
  const run=await h.create({requestId:id(),memberId:memberIds[0],draftId:accepted.body.draftId,inputRevision:1,inputHash:accepted.body.inputHash,profileId:'default'});assert.equal(run.status,202);await h.drain();assert.equal(h.run(run.body.run.id).state,'ready');assert.equal(h.calls.length,2);
  const own=await h.request('/api/student/reports/'+h.parentId,undefined,'GET',h.student);assert.equal(own.status,200);assert.equal(own.body.publication.version,1);assert.equal(h.db.prepare("SELECT COUNT(*) n FROM writing_publications WHERE draft_id=?").get(accepted.body.draftId)!.n,0);
  assert.equal((await h.api('save',{expectedRevision:4,content})).status,409);assert.equal(h.db.prepare('SELECT COUNT(*) n FROM student_revision_versions WHERE workspace_id=?').get(h.wid)!.n,4);
  const replaced=await h.request('/api/tasks/'+taskId+'/collection',{requestId:id(),action:'collect',mode:'manual',memberId:memberIds[0],draftNumber:2,pageNumber:1,pageCount:2,assetId:await h.asset(102),identityConfirmed:true,expectedPageRevision:1,identityNote:'教师重新拍摄学生自主二稿，原学生修改说明继续保留'});assert.equal(replaced.status,201);const changed=await h.request('/api/tasks/'+taskId+'/collection?memberId='+memberIds[0]+'&draftNumber=2');assert.equal(changed.body.draft.manifest.studentRevision.author,'student');assert.equal(changed.body.draft.manifest.studentRevision.reflection,content.reflection);
 }finally{h.close();}
});
test('same-name students and teachers cannot read or alter another student revision or photos; source revocation and class permissions are enforced',async()=>{
 const h=await prepared();try{
  const a=await h.upload();await h.api('save',{expectedRevision:1,content:h.content([a])});
  const other={...h.student,principal:'wordup:student-1',subject:'student-1'};assert.equal((await h.request('/api/student/revisions/'+h.wid,undefined,'GET',other)).status,404);assert.equal((await h.request('/api/student/revisions/'+h.wid+'/assets/'+a.body.id,undefined,'GET',other)).status,404);assert.equal((await h.request('/api/student/revisions/'+h.wid,undefined,'GET',h.session)).status,403);
  assert.equal((await h.request('/api/tasks/'+taskId+'/student-revisions/'+h.wid,undefined,'GET',h.session)).status,404);const outsider={...h.session,principal:'wordup:other'};assert.equal((await h.request('/api/tasks/'+taskId+'/student-revisions',undefined,'GET',outsider)).status,404);
  h.setStudentActive(false);assert.equal((await h.api('save',{expectedRevision:2,content:h.content([a])})).status,401);h.setStudentActive(true);await h.api('submit',{expectedRevision:2,content:h.content([a]),ownWorkConfirmed:true});h.flags({revoked:true});assert.equal((await h.request('/api/tasks/'+taskId+'/student-revisions/'+h.wid+'/accept',{requestId:id(),expectedRevision:3,teacherConfirmed:true},'POST')).status,403);
 }finally{h.close();}
});
test('student saves are versioned and idempotent; concurrent devices cannot overwrite, and return/withdraw preserves the complete revision history',async()=>{
 const h=await prepared();try{
  const a=await h.upload(),content=h.content([a]),body={requestId:id(),expectedRevision:1,content};const path='/api/student/revisions/'+h.wid+'/save';const saved=await h.request(path,body,'POST',h.student);assert.equal(saved.status,200);assert.equal((await h.request(path,body,'POST',h.student)).body.revision,2);assert.equal((await h.request(path,{...body,content:{...content,reflection:'不同内容'}},'POST',h.student)).status,409);
  const both=await Promise.all([h.api('save',{expectedRevision:2,content}),h.api('save',{expectedRevision:2,content:{...content,reflection:'另一个设备修改的反思内容，请老师核对。'}})]);assert.deepEqual(both.map(r=>r.status).sort(),[200,409]);
  const detail=await h.request('/api/student/revisions/'+h.wid,undefined,'GET',h.student);assert.equal(detail.body.revision,3);
  assert.equal((await h.api('submit',{expectedRevision:3,content,ownWorkConfirmed:true})).body.state,'submitted');
  assert.equal((await h.api('withdraw',{expectedRevision:4})).body.state,'draft');
  assert.equal((await h.api('submit',{expectedRevision:5,content,ownWorkConfirmed:true})).body.state,'submitted');
  const ret=await h.request('/api/tasks/'+taskId+'/student-revisions/'+h.wid+'/return',{requestId:id(),expectedRevision:6,reason:'第二页不够清楚，请重新拍摄并说明修改处。'},'POST');assert.equal(ret.body.state,'returned');assert.equal(ret.body.revision,7);assert.equal((await h.api('save',{expectedRevision:7,content})).body.revision,8);assert.equal((await h.request('/api/tasks/'+taskId+'/student-revisions/'+h.wid,undefined,'GET')).status,404);
  assert.equal(h.db.prepare('SELECT COUNT(*) n FROM student_revision_versions WHERE workspace_id=?').get(h.wid)!.n,8);assert.equal(h.calls.length,1);
 }finally{h.close();}
});
test('updated or withdrawn parent feedback blocks submission until the student explicitly rebases; old feedback never leaks through the revision workspace',async()=>{
 const h=await prepared();try{
  const a=await h.upload(),content=h.content([a]);h.db.prepare('UPDATE writing_publications SET version=2 WHERE draft_id=?').run(h.parentId);
  const first=await h.api('submit',{expectedRevision:1,content,ownWorkConfirmed:true});assert.equal(first.status,409);assert.equal(first.body.error.code,'student_revision_parent_changed');
  const view=await h.request('/api/student/revisions/'+h.wid,undefined,'GET',h.student);assert(view.body.parentChanged);assert(!JSON.stringify(view.body).includes('brief_comment'));assert.equal(view.body.currentParentVersion,2);
  assert.equal((await h.api('rebase',{expectedRevision:1,parentPublicationVersion:2})).status,200);assert.equal((await h.api('submit',{expectedRevision:2,content,ownWorkConfirmed:true})).status,200);
  await h.api('withdraw',{expectedRevision:3});h.db.prepare("UPDATE writing_publications SET state='withdrawn' WHERE draft_id=?").run(h.parentId);assert.equal((await h.api('submit',{expectedRevision:4,content,ownWorkConfirmed:true})).status,409);const own=await h.request('/api/student/revisions/'+h.wid,undefined,'GET',h.student);assert.equal(own.status,200);assert.equal(own.body.parentAvailable,false);assert.equal(own.body.content.pages.length,1);assert.equal((await h.request('/api/student/reports/'+h.parentId,undefined,'GET',h.student)).status,404);
 }finally{h.close();}
});
test('teacher acceptance cannot replace an existing next draft, repeat an older photo or bypass explicit identity confirmation',async()=>{
 const h=await prepared();try{
  const a=await h.upload(),content=h.content([a]);await h.api('submit',{expectedRevision:1,content,ownWorkConfirmed:true});const path='/api/tasks/'+taskId+'/student-revisions/'+h.wid+'/accept';assert.equal((await h.request(path,{requestId:id(),expectedRevision:2},'POST')).status,409);
  const photo=await h.asset(111),collected=await h.request('/api/tasks/'+taskId+'/collection',{requestId:id(),action:'collect',mode:'manual',memberId:memberIds[0],draftNumber:2,pageNumber:1,pageCount:1,assetId:photo,identityConfirmed:true,expectedPageRevision:0,identityNote:'老师先从纸面收取的学生二稿'});assert.equal(collected.status,201);assert.equal((await h.request(path,{requestId:id(),expectedRevision:2,teacherConfirmed:true},'POST')).status,409);
  const latest=await h.request('/api/tasks/'+taskId+'/collection?memberId='+memberIds[0]+'&draftNumber=2');assert.equal(latest.body.draft.manifest.pages[0].assetId,photo);assert.equal((await h.request('/api/student/revisions/'+h.wid,undefined,'GET',h.student)).body.state,'submitted');assert.equal(h.calls.length,1);
 }finally{h.close();}
});
test('revision content accepts only current-rubric evidence and owned uploaded photos, validates submission, and limits daily upload operations',async()=>{
 const h=await prepared();try{
  const a=await h.upload(),content=h.content([a]);assert.equal((await h.api('submit',{expectedRevision:1,content:{...content,reflection:''},ownWorkConfirmed:true})).status,400);assert.equal((await h.api('save',{expectedRevision:1,content:{...content,changes:[{criterionId:'made-up',response:'revised',evidence:'假的维度'}]}})).status,400);assert.equal((await h.api('save',{expectedRevision:1,content:{...content,pages:[{assetId:await h.asset(99)}]}})).status,404);
  const uploadId=id(),b=await h.upload(110,uploadId),same=await h.upload(110,uploadId);assert.equal(same.body.id,b.body.id);assert.equal((await h.upload(111,uploadId)).status,409);
  const now=Date.now();for(let i=0;i<38;i++)h.db.prepare('INSERT INTO student_revision_uploads VALUES(?,?,?,?,NULL,?)').run(h.student.principal,id(),h.wid,'synthetic-hash-'+i,now);assert.equal((await h.upload(112)).status,429);assert.equal(h.calls.length,1);
 }finally{h.close();}
});

test('a lost create receipt remains replayable after feedback withdrawal without exposing the old feedback',async()=>{
 const h=await prepared();try{h.db.prepare("UPDATE writing_publications SET state='withdrawn' WHERE draft_id=?").run(h.parentId);const replayed=await h.request('/api/student/revisions',h.createBody,'POST',h.student);assert.equal(replayed.status,201);assert.equal(replayed.body.id,h.wid);assert.equal(h.db.prepare('SELECT COUNT(*) n FROM student_revision_workspaces').get()!.n,1);assert.equal((await h.request('/api/student/reports/'+h.parentId,undefined,'GET',h.student)).status,404);}finally{h.close();}
});
test('feedback withdrawal and manuscript replacement during asynchronous preparation cannot commit stale submissions or a partial accepted draft',async()=>{
 const h=await prepared();try{
  const a=await h.upload(),content=h.content([a]),batch=h.env.DB.batch.bind(h.env.DB);let changed=false;
  h.env.DB.batch=async(statements:any)=>{if(!changed){changed=true;h.db.prepare("UPDATE writing_publications SET state='withdrawn' WHERE draft_id=?").run(h.parentId);}return batch(statements);};const stopped=await h.api('submit',{expectedRevision:1,content,ownWorkConfirmed:true});assert.equal(stopped.status,409);assert.equal(h.db.prepare('SELECT revision FROM student_revision_workspaces WHERE id=?').get(h.wid)!.revision,1);h.env.DB.batch=batch;
  h.db.prepare("UPDATE writing_publications SET state='published' WHERE draft_id=?").run(h.parentId);assert.equal((await h.api('submit',{expectedRevision:1,content,ownWorkConfirmed:true})).status,200);
  const get=h.env.FILES.get.bind(h.env.FILES);changed=false;h.env.FILES.get=async(key:any,...rest:any[])=>{const object=await get(key,...rest as []);if(!changed&&String(key).startsWith('private-assets/')){changed=true;h.db.prepare('UPDATE writing_drafts SET input_hash=? WHERE id=?').run('updated-during-source-read',h.parentId);}return object;};
  const accepted=await h.request('/api/tasks/'+taskId+'/student-revisions/'+h.wid+'/accept',{requestId:id(),expectedRevision:2,teacherConfirmed:true},'POST');assert.equal(accepted.status,409);assert.equal(h.db.prepare('SELECT COUNT(*) n FROM writing_drafts WHERE draft_number=2').get()!.n,0);assert.equal(h.db.prepare('SELECT state FROM student_revision_workspaces WHERE id=?').get(h.wid)!.state,'submitted');assert.equal(h.calls.length,1);
 }finally{h.close();}
});
