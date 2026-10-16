import test from 'node:test';
import assert from 'node:assert/strict';
import {sandbox,fixture,taskId} from './helpers/bound-sandbox';
import {handlePublications} from '../worker/publications';
function pupil(h:any,index=0){return {...h.session,principal:'wordup:student-'+index,subject:'student-'+index,role:'student',scopes:['writing.own'],classes:[],display_name:'示例学生'};}
async function graded(h:any,index=0){await h.collect(index);const input=await h.inputFor(index),created=await h.create(input);await h.drain();assert.equal(h.run(created.body.run.id).state,'ready');return {input,id:created.body.run.id};}
const path=(id:string)=>'/api/writing-reports/'+id+'/publication';
const body=(input:any,version=0,revision=1)=>({requestId:crypto.randomUUID(),expectedPublicationVersion:version,expectedReportRevision:revision,inputHash:input.inputHash,teacherConfirmed:true});
const own=(id:string)=>'/api/student/reports/'+id;
test('unpublished feedback is invisible; a teacher releases a safe immutable student projection and the matching original only',async()=>{
 const h=await sandbox();try{
  const response=structuredClone(fixture.response),answer=JSON.parse(response.choices[0].message.content);answer.provider_trace='private-provider-trace';response.choices[0].message.content=JSON.stringify(answer);h.provider(()=>Response.json(response));
  const {id,input}=await graded(h),student=pupil(h);assert.equal((await h.request('/api/student/reports',undefined,'GET',student)).body.reports.length,0);assert.equal((await h.request(own(input.draftId),undefined,'GET',student)).status,404);
  const published=await h.request(path(id),body(input));assert.equal(published.status,200,JSON.stringify(published));assert.equal(published.body.publication.version,1);assert.equal(published.body.publication.sync.state,'pending');
  const view=await h.request(own(input.draftId),undefined,'GET',student);assert.equal(view.status,200,JSON.stringify(view));assert.equal(view.body.publication.reportRevision,1);assert.equal(view.body.result.total_score,15.5);assert.equal(view.body.publication.teacherName,'合成教师');assert.equal(view.body.pages.length,1);
  const serialized=JSON.stringify(view.body);for(const hidden of ['private-provider-trace','detected_student_name','bound_identity','profileId','inputHash','"subject"','"provider"','strictness'])assert(!serialized.includes(hidden),hidden);
  assert.equal((await h.request('/api/student/reports',undefined,'GET',student)).body.reports.length,1);
  const picture=await handlePublications(new Request('https://write.test'+view.body.pages[0].url),h.env,student,h.bridge,r=>r.json());assert.equal(picture!.status,200);assert.equal(picture!.headers.get('Content-Type'),'image/png');assert((await picture!.arrayBuffer()).byteLength>20);assert.equal(picture!.headers.get('Cache-Control'),'private, no-store');
  assert.equal(h.calls.length,1);assert.equal(h.db.prepare('SELECT COUNT(*) n FROM writing_integration_outbox').get()!.n,1);
 }finally{h.close();}
});
test('edits do not change the released snapshot until an explicit versioned republish; read receipts are tied to that release',async()=>{
 const h=await sandbox();try{
  const {id,input}=await graded(h),student=pupil(h),first=body(input);await h.request(path(id),first);assert.equal((await h.request(path(id),first)).body.publication.version,1);await h.request(path(id),body(input,1));assert.equal(h.db.prepare('SELECT COUNT(*) n FROM writing_integration_outbox').get()!.n,1);
  assert.equal((await h.request(own(input.draftId)+'/read',{version:1},'POST',student)).status,200);const read=await h.request(path(id));assert(read.body.publication.viewed.first_read);const original=await h.request(own(input.draftId),undefined,'GET',student);
  const edit=await h.request('/api/writing-reports/'+id,{requestId:crypto.randomUUID(),expectedRevision:1,result:{brief_comment:'教师二次核对后的新评语。'}},'PATCH');assert.equal(edit.status,200,JSON.stringify(edit));assert.equal((await h.request(own(input.draftId),undefined,'GET',student)).body.result.brief_comment,original.body.result.brief_comment);
  assert.equal((await h.request(path(id),body(input,1,1))).body.error.code,'publication_report_changed');const republished=await h.request(path(id),body(input,1,2));assert.equal(republished.status,200,JSON.stringify(republished));assert.equal(republished.body.publication.version,2);assert.equal(republished.body.publication.viewed,null);assert.equal((await h.request(own(input.draftId),undefined,'GET',student)).body.result.brief_comment,'教师二次核对后的新评语。');
  assert.equal((await h.request(own(input.draftId)+'?version=1',undefined,'GET',student)).status,404);assert.equal((await h.request(own(input.draftId)+'/read',{version:1},'POST',student)).status,404);assert.equal(h.calls.length,1);
 }finally{h.close();}
});
test('same-name students and teachers cannot read or publish each other’s results, and students need own-report scope',async()=>{
 const h=await sandbox();try{
  const a=await graded(h),b=await graded(h,1);await h.request(path(a.id),body(a.input));await h.request(path(b.id),body(b.input));
  const student=pupil(h),other=pupil(h,1);assert.equal((await h.request('/api/student/reports',undefined,'GET',student)).body.reports.length,1);assert.equal((await h.request(own(a.input.draftId),undefined,'GET',other)).status,404);
  const mine=await h.request(own(a.input.draftId),undefined,'GET',student);const foreignImage=mine.body.pages[0].url;
  await assert.rejects(handlePublications(new Request('https://write.test'+foreignImage),h.env,other,h.bridge,r=>r.json()),(e:any)=>e.status===404);
  assert.equal((await h.request(own(a.input.draftId),undefined,'GET',{...student,scopes:[]})).status,403);assert.equal((await h.request('/api/student/reports',undefined,'GET',h.session)).status,403);
  assert.equal((await h.request(path(a.id),body(a.input,1),'POST',{...h.session,principal:'wordup:other',subject:'other'})).status,404);
  assert.equal((await h.request(path(a.id),body(a.input,1),'POST',{...h.session,classes:h.session.classes.map(c=>({...c,scopes:['roster.read','writing.grade']}))})).status,403);
  const asset=await h.asset(44);await assert.rejects(handlePublications(new Request('https://write.test'+own(a.input.draftId)+'/assets/'+asset+'?version=1'),h.env,student,h.bridge,r=>r.json()),(e:any)=>e.status===404);
 }finally{h.close();}
});
test('teacher withdrawal removes report, original image and read access, retains history and emits one durable withdrawal event',async()=>{
 const h=await sandbox();try{
  const {id,input}=await graded(h),student=pupil(h);await h.request(path(id),body(input));const view=await h.request(own(input.draftId),undefined,'GET',student),withdraw={requestId:crypto.randomUUID(),expectedPublicationVersion:1,reason:'需要重新核对原稿和教师评语后再发布'};
  assert.equal((await h.request(path(id)+'/withdraw',withdraw)).body.publication.version,2);assert.equal((await h.request(path(id)+'/withdraw',withdraw)).body.publication.version,2);assert.equal((await h.request(own(input.draftId),undefined,'GET',student)).status,404);assert.equal((await h.request('/api/student/reports',undefined,'GET',student)).body.reports.length,0);
  await assert.rejects(handlePublications(new Request('https://write.test'+view.body.pages[0].url),h.env,student,h.bridge,r=>r.json()),(e:any)=>e.status===404);
  assert.equal(h.db.prepare('SELECT COUNT(*) n FROM writing_publication_versions').get()!.n,2);const events=h.db.prepare('SELECT payload_json FROM writing_integration_outbox ORDER BY version').all().map((e:any)=>JSON.parse(e.payload_json));assert.deepEqual(events.map(e=>e.eventType),['published','withdrawn']);assert.deepEqual(events.map(e=>e.publicationVersion),[1,2]);assert(events.every(e=>e.submissionId));
  assert.equal((await h.request(path(id),body(input,0))).body.error.code,'publication_conflict');assert.equal((await h.request(path(id),body(input,2))).body.publication.version,3);
 }finally{h.close();}
});
test('replacing the collected manuscript atomically withdraws its old release and prevents republishing the outdated report',async()=>{
 const h=await sandbox();try{
  const {id,input}=await graded(h),student=pupil(h);await h.request(path(id),body(input));const duplicate=await h.collect(0,1,1,1,1);assert.equal(duplicate.body.duplicate,true);assert.equal((await h.request(path(id))).body.publication.version,1);
  const replacement=await h.collect(0,1,1,1,9);assert.equal(replacement.status,201,JSON.stringify(replacement));const changed=await h.request(path(id));assert.equal(changed.body.publication.state,'withdrawn');assert.equal(changed.body.publication.version,2);assert.equal((await h.request(own(input.draftId),undefined,'GET',student)).status,404);assert.equal((await h.request(path(id),body(input,2))).body.error.code,'publication_input_changed');
  assert.equal(h.db.prepare('SELECT COUNT(*) n FROM writing_integration_outbox').get()!.n,2);assert.equal(h.db.prepare('SELECT COUNT(*) n FROM writing_publication_versions').get()!.n,2);assert.equal(h.calls.length,1);
 }finally{h.close();}
});
test('publishing requires current teacher confirmation, resolved name mismatch and live publish rights',async()=>{
 const h=await sandbox();try{
  const response=structuredClone(fixture.response),result=JSON.parse(response.choices[0].message.content);result.student_name='其他学生';response.choices[0].message.content=JSON.stringify(result);h.provider(()=>Response.json(response));const {id,input}=await graded(h);
  assert.equal((await h.request(path(id),{...body(input),teacherConfirmed:false})).status,400);assert.equal((await h.request(path(id),body(input))).body.error.code,'publication_identity_unconfirmed');await h.request('/api/writing-reports/'+id,{requestId:crypto.randomUUID(),expectedRevision:1,result:{identity_name_mismatch_verified:true}},'PATCH');h.flags({revoked:true});assert.equal((await h.request(path(id),body(input,0,2))).status,403);h.flags({});assert.equal((await h.request(path(id),body(input,0,2))).status,200);
 }finally{h.close();}
});
test('concurrent publication conflicts do not create partial heads or duplicate events, and storage failure publishes nothing',async()=>{
 const h=await sandbox();try{
  const {id,input}=await graded(h),put=h.env.FILES.put;h.env.FILES.put=async()=>{throw Error('Synthetic R2 failure');};await assert.rejects(h.request(path(id),body(input)));assert.equal(h.db.prepare('SELECT COUNT(*) n FROM writing_publications').get()!.n,0);assert.equal(h.db.prepare('SELECT COUNT(*) n FROM writing_integration_outbox').get()!.n,0);h.env.FILES.put=put;
  const a=body(input),b=body(input),responses=await Promise.all([h.request(path(id),a),h.request(path(id),b)]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);assert.equal(h.db.prepare('SELECT COUNT(*) n FROM writing_integration_outbox').get()!.n,1);assert.equal(h.db.prepare('SELECT COUNT(*) n FROM writing_publication_versions').get()!.n,1);
 }finally{h.close();}
});
test('withdrawal during report or image storage reads cannot return the withdrawn content',async()=>{
 const h=await sandbox();try{
  const {id,input}=await graded(h),student=pupil(h);await h.request(path(id),body(input));const get=h.env.FILES.get.bind(h.env.FILES);let triggered=false;
  h.env.FILES.get=async(key:any,...rest:any[])=>{const object=await get(key,...rest as []);if(!triggered&&String(key).startsWith('published-reports/')){triggered=true;await h.request(path(id)+'/withdraw',{requestId:crypto.randomUUID(),expectedPublicationVersion:1,reason:'读取期间教师撤回反馈，检查访问是否立即停止'});}return object;};
  assert.equal((await h.request(own(input.draftId),undefined,'GET',student)).status,404);h.env.FILES.get=get;
  await h.request(path(id),body(input,2));const view=await h.request(own(input.draftId),undefined,'GET',student);triggered=false;
  h.env.FILES.get=async(key:any,...rest:any[])=>{const object=await get(key,...rest as []);if(!triggered&&String(key).startsWith('private-assets/')){triggered=true;await h.request(path(id)+'/withdraw',{requestId:crypto.randomUUID(),expectedPublicationVersion:3,reason:'读取原图期间教师撤回反馈，检查图片访问是否立即停止'});}return object;};
  assert.equal((await h.request(view.body.pages[0].url,undefined,'GET',student)).status,404);
 }finally{h.close();}
});
test('a publish grant revoked while the release snapshot is saved cannot commit a student-visible publication',async()=>{
 const h=await sandbox();try{
  const {id,input}=await graded(h),store=h.env.FILES as any,put=store.put.bind(store);
  store.put=async(key:any,value:any,...rest:any[])=>{const result=await put(key,value,...rest as []);if(String(key).startsWith('published-reports/'))h.flags({revoked:true});return result;};
  assert.equal((await h.request(path(id),body(input))).status,403);assert.equal(h.db.prepare('SELECT COUNT(*) n FROM writing_publications').get()!.n,0);assert.equal(h.db.prepare('SELECT COUNT(*) n FROM writing_integration_outbox').get()!.n,0);
 }finally{h.close();}
});
