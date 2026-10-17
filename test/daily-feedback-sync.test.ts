import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {createWritingBridge} from '../integrations/daily/src/writing-bridge.mjs';
import {createWritingFeedback} from '../integrations/daily/src/writing-feedback.mjs';
import {dispatchDailyEvent,reconcileDailyFeedback,recoverDailyFeedback} from '../worker/daily-feedback';
import {HttpError} from '../worker/errors';
import {sandbox} from './helpers/bound-sandbox';
const service='synthetic-service-token-for-events-only-testing';
const callback='https://write.test/api/auth/callback';
const id=()=>crypto.randomUUID();
function event(version=1,type='published'){return {actor:{provider:'wordup',subject:'teacher'},callbackUri:callback,event:{schemaVersion:1,eventId:id(),eventType:type,occurredAt:Date.now(),draftId:id(),taskId:id(),submissionId:id(),publicationVersion:version,reportId:id(),reportRevision:1,classId:'class',recipient:{provider:'wordup',subject:'student-0'},summary:{title:'A small act of kindness',teacherName:'合成教师',className:'示例班',academicYear:'2026-1',draftNumber:1,score:15.5,total:20}}};}
async function server(){
 const db=new DatabaseSync(':memory:');let verified=0;
 const identity=(req:any)=>{const role=req.headers.cookie==='student'?'student':req.headers.cookie==='public'?'public':req.headers.cookie==='teacher'?'teacher':null;if(!role)throw Object.assign(Error('请先登录。'),{status:401});return {provider:'wordup',subject:role==='student'?'student-0':role==='public'?'public':'teacher',role:role==='public'?'student':role,name:'合成账号',accountType:role==='public'?'public':'school',expires:Date.now()+3600000};};
 const app=createWritingBridge({db,publicOrigin:'https://daily.test',callbacks:[callback],serviceToken:service,storageKey:'synthetic-storage-key-with-no-real-account',resolveIdentity:identity,verifySource:async()=>{verified++;throw Error('No interactive grant should be checked for already approved events');}});
 const s=http.createServer(async(req,res)=>{if(!await app.handle(req,res,new URL(req.url!,'https://daily.test')))res.writeHead(404).end();});await new Promise<void>(r=>s.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+(s.address() as any).port+'/api/integrations/writeascend/';
 async function request(path:string,body?:any,headers:any={}){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json() as any};}
 return {db,request,verified:()=>verified,close:async()=>{await new Promise<void>(r=>s.close(()=>r()));db.close();}};
}
test('Daily accepts only authenticated service events and projects school students’ own summaries without raw feedback or credentials',async()=>{
 const h=await server();try{
  const value=event();assert.equal((await h.request('report-events',value)).status,401);assert.equal((await h.request('report-events',value,{Authorization:'Bearer wrong'})).status,401);
  const extra={...value,event:{...value.event,original_essay:'private essay must not enter Daily',apiKey:'private-provider-key',summary:{...value.event.summary,link:'https://evil.invalid',rawModelResponse:'private raw model'}}};
  const accepted=await h.request('report-events',extra,{Authorization:'Bearer '+service});assert.equal(accepted.status,200,JSON.stringify(accepted));assert.equal(accepted.body.currentVersion,1);assert.equal(h.verified(),0);
  const own=await h.request('feedback',undefined,{cookie:'student'});assert.equal(own.status,200);assert.equal(own.body.reports.length,1);assert.equal(own.body.reports[0].link,'https://write.test/student?report='+value.event.draftId);assert.equal(own.body.reports[0].score,15.5);
  for(const fragment of ['private essay','private-provider-key','private raw model','evil.invalid','student-0','actor_subject'])assert(!JSON.stringify(own.body).includes(fragment),fragment);
  assert.equal((await h.request('feedback',undefined,{cookie:'public'})).status,403);assert.equal((await h.request('feedback',undefined,{cookie:'teacher'})).status,403);assert.equal((await h.request('feedback')).status,401);
  assert.equal((await h.request('portal',undefined,{cookie:'teacher'})).body.entryUrl,'https://write.test/api/auth/start');assert.equal((await h.request('portal',undefined,{cookie:'student'})).body.entryUrl,'/writing-feedback.html');
  assert.equal((await h.request('report-events/receipt',{eventId:value.event.eventId})).status,401);
 }finally{await h.close();}
});
test('Daily deduplicates receipts, rejects rewriting or rebinding a version, and never resurrects a withdrawn report on old-event delivery',()=>{
 const db=new DatabaseSync(':memory:'),store=createWritingFeedback({db,callbacks:[callback]});try{
  const a=event();assert.equal(store.accept(a).accepted,true);assert.equal(store.accept(a).replayed,true);assert.throws(()=>store.accept({...a,event:{...a.event,summary:{...a.event.summary,score:1}}}),(e:any)=>e.status===409);
  const withdrawn={...a,event:{...a.event,eventId:id(),eventType:'withdrawn',publicationVersion:3}};store.accept(withdrawn);const late={...a,event:{...a.event,eventId:id(),publicationVersion:2}};assert.equal(store.accept(late).accepted,false);assert.equal(store.receipt(a.event.eventId).currentVersion,3);
  assert.equal(store.list({provider:'wordup',subject:'student-0',role:'student',accountType:'school'},null).reports.length,0);
  for(const change of [{recipient:{provider:'wordup',subject:'student-1'}},{taskId:id()},{classId:'other'},{submissionId:id()}])assert.throws(()=>store.accept({...a,event:{...a.event,eventId:id(),publicationVersion:4,...change}}),(e:any)=>e.status===409);
  assert.throws(()=>store.accept({...a,actor:{provider:'wordup',subject:'other'},event:{...a.event,eventId:id(),publicationVersion:4}}),(e:any)=>e.status===409);
  assert.throws(()=>store.accept({...withdrawn,event:{...withdrawn.event,eventId:id()}}),(e:any)=>e.status===409);
  const next={...a,event:{...a.event,eventId:id(),publicationVersion:4}};store.accept(next);assert.equal(store.list({provider:'wordup',subject:'student-1',role:'student',accountType:'school'},null).reports.length,0);assert.equal(store.list({provider:'wordup',subject:'student-0',role:'student',accountType:'school'},null).reports.length,1);
  db.exec('DELETE FROM writing_feedback_heads');assert.equal(store.receipt(next.event.eventId).found,false);assert.equal(store.accept(next).replayed,true);assert.equal(store.receipt(next.event.eventId).currentVersion,4);
 }finally{db.close();}
});
test('Daily validates events, callback whitelist, score range and pagination, and paginates the complete own-only history',()=>{
 const db=new DatabaseSync(':memory:'),store=createWritingFeedback({db,callbacks:[callback]});try{
  const a=event();for(const body of [{...a,callbackUri:'https://evil.invalid/api/auth/callback'},{...a,event:{...a.event,publicationVersion:0}},{...a,event:{...a.event,summary:{...a.event.summary,score:21}}},{...a,event:{...a.event,occurredAt:Date.now()+600000}}])assert.throws(()=>store.accept(body),(e:any)=>e.status===400);
  for(let i=0;i<31;i++)store.accept(event());const student={provider:'wordup',subject:'student-0',role:'student',accountType:'school'};const first=store.list(student,null),last=store.list(student,first.next);assert.equal(first.reports.length,25);assert.equal(last.reports.length,6);assert.equal(new Set([...first.reports,...last.reports].map(r=>r.id)).size,31);assert.equal(last.next,null);assert.throws(()=>store.list(student,'garbage'),(e:any)=>e.status===400);
 }finally{db.close();}
});
async function prepared(){const h=await sandbox();await h.collect();const input=await h.inputFor(),run=await h.create(input);await h.drain();const reportId=run.body.run.id,body={requestId:id(),teacherConfirmed:true,inputHash:input.inputHash,expectedReportRevision:1,expectedPublicationVersion:0};assert.equal((await h.request('/api/writing-reports/'+reportId+'/publication',body)).status,200);const db=new DatabaseSync(':memory:'),store=createWritingFeedback({db,callbacks:[callback]}),sent:any[]=[],queue:any[]=[];(h.env as any).FEEDBACK_EVENTS={send:async(m:any)=>queue.push(m)};
 const bridge=async(_env:any,path:string,body:any)=>{sent.push({path,body});return path==='report-events'?store.accept(body):store.receipt(body.eventId);};const row=()=>h.db.prepare('SELECT * FROM writing_integration_outbox WHERE draft_id=? ORDER BY version DESC LIMIT 1').get(input.draftId) as any;
 return {...h,input,reportId,body,store,sent,queue,row,bridge,close:()=>{h.close();db.close();},dailyDb:db};}
test('outbox delivers the immutable approval after the interactive grant expires; duplicate queue delivery does not duplicate Daily records or invoke a model',async()=>{
 const h=await prepared();try{
  h.flags({expired:true});const e=h.row();await Promise.all([dispatchDailyEvent(h.env,e.id,h.bridge),dispatchDailyEvent(h.env,e.id,h.bridge)]);assert.equal(h.row().state,'sent');assert.equal(h.dailyDb.prepare('SELECT COUNT(*) n FROM writing_feedback_events').get()!.n,1);assert.equal(h.calls.length,1);assert.equal(h.sent.length,1);assert(!JSON.stringify(h.sent).includes('grant-original'));
 }finally{h.close();}
});
test('a lost acknowledgment retries the same event, supersedes older pending versions and preserves a later withdrawal',async()=>{
 const h=await prepared();try{
  const first=h.row();let interrupted=true;const lost=async(env:any,path:string,body:any)=>{const receipt=await h.bridge(env,path,body);if(interrupted){interrupted=false;throw new HttpError(503,'Synthetic response lost after commit');}return receipt;};
  await dispatchDailyEvent(h.env,first.id,lost);assert.equal(h.row().state,'pending');assert.equal(h.dailyDb.prepare('SELECT COUNT(*) n FROM writing_feedback_events').get()!.n,1);h.db.prepare('UPDATE writing_integration_outbox SET next_attempt_at=0').run();await dispatchDailyEvent(h.env,first.id,lost);assert.equal(h.row().state,'sent');assert.equal(h.dailyDb.prepare('SELECT COUNT(*) n FROM writing_feedback_events').get()!.n,1);
  const withdrawn=await h.request('/api/writing-reports/'+h.reportId+'/publication/withdraw',{requestId:id(),expectedPublicationVersion:1,reason:'核对内容后撤回这份已发布的反馈'});assert.equal(withdrawn.status,200);const current=h.row();await dispatchDailyEvent(h.env,current.id,h.bridge);h.db.prepare("UPDATE writing_integration_outbox SET state='pending' WHERE id=?").run(first.id);await dispatchDailyEvent(h.env,first.id,h.bridge);assert.equal(h.db.prepare('SELECT state FROM writing_integration_outbox WHERE id=?').get(first.id)!.state,'superseded');assert.equal(h.store.list({provider:'wordup',subject:'student-0',role:'student',accountType:'school'},null).reports.length,0);
 }finally{h.close();}
});
test('configuration failure is visible and retryable without reopening an approval; periodic audit repairs a Daily database restore',async()=>{
 const h=await prepared();try{
  const e=h.row();await dispatchDailyEvent(h.env,e.id,async()=>{throw new HttpError(401,'machine rejected');});assert.equal(h.row().state,'blocked');await assert.rejects(reconcileDailyFeedback(h.env,h.input.draftId,h.session.principal,1,async()=>{throw new HttpError(401,'machine rejected');}),(e:any)=>e.status===503);assert.equal(h.db.prepare('SELECT COUNT(*) n FROM writing_integration_quarantine').get()!.n,0);
  await reconcileDailyFeedback(h.env,h.input.draftId,h.session.principal,1,h.bridge);await dispatchDailyEvent(h.env,e.id,h.bridge);assert.equal(h.row().state,'sent');h.dailyDb.exec('DELETE FROM writing_feedback_events; DELETE FROM writing_feedback_heads');
  await reconcileDailyFeedback(h.env,h.input.draftId,h.session.principal,1,h.bridge);assert.equal(h.row().state,'pending');await dispatchDailyEvent(h.env,e.id,h.bridge);assert.equal(h.row().state,'sent');h.db.prepare('UPDATE writing_integration_outbox SET updated=0 WHERE id=?').run(e.id);await recoverDailyFeedback(h.env);assert.equal(h.row().state,'pending');assert(h.queue.some(m=>m.eventId===e.id));await dispatchDailyEvent(h.env,e.id,h.bridge);assert.equal(h.dailyDb.prepare('SELECT COUNT(*) n FROM writing_feedback_events').get()!.n,1);assert.equal(h.calls.length,1);
 }finally{h.close();}
});
test('a source restore behind Daily quarantines feedback instead of resurrecting an old release, and a complete source restore can reconcile it',async()=>{
 const h=await prepared();try{
  const first=h.row(),head1=h.db.prepare('SELECT * FROM writing_publications WHERE draft_id=?').get(h.input.draftId) as any;
  await h.request('/api/writing-reports/'+h.reportId+'/publication/withdraw',{requestId:id(),expectedPublicationVersion:1,reason:'先撤回，再次核对后发布新版本'});await h.request('/api/writing-reports/'+h.reportId+'/publication',{...h.body,requestId:id(),expectedPublicationVersion:2});const third=h.row(),head3=h.db.prepare('SELECT * FROM writing_publications WHERE draft_id=?').get(h.input.draftId) as any;await dispatchDailyEvent(h.env,third.id,h.bridge);
  function restore(value:any){const fields=Object.keys(value);h.db.prepare('UPDATE writing_publications SET '+fields.map(k=>k+'=?').join(',')+' WHERE draft_id=?').run(...fields.map(k=>value[k]),h.input.draftId);}
  restore(head1);await dispatchDailyEvent(h.env,first.id,h.bridge);assert.equal(h.db.prepare('SELECT state FROM writing_integration_outbox WHERE id=?').get(first.id)!.state,'blocked');assert.equal(h.db.prepare('SELECT remote_version FROM writing_integration_quarantine').get()!.remote_version,3);
  const student={...h.session,role:'student',subject:'student-0',principal:'wordup:student-0',scopes:['writing.own'],classes:[]};assert.equal((await h.request('/api/student/reports/'+h.input.draftId,undefined,'GET',student)).status,404);
  assert.equal((await h.request('/api/writing-reports/'+h.reportId+'/publication',{...h.body,requestId:id(),expectedPublicationVersion:1})).status,409);
  restore(head3);await reconcileDailyFeedback(h.env,h.input.draftId,h.session.principal,3,h.bridge);assert.equal(h.db.prepare('SELECT COUNT(*) n FROM writing_integration_quarantine').get()!.n,0);assert.equal((await h.request('/api/student/reports/'+h.input.draftId,undefined,'GET',student)).body.publication.version,3);
 }finally{h.close();}
});
