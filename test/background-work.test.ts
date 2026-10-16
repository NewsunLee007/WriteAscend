import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {sandbox,fixture} from './helpers/bound-sandbox';
import {workAuthority} from './helpers/work-authority';
import {sqlD1} from './helpers/sql-d1';
import {consumeModelJobs,handleModelApi} from '../worker/model-jobs';
import type {Env} from '../worker/index';
import worker from '../worker/index';
import {stableWorkId} from '../worker/work-permits';
const id=()=>crypto.randomUUID();
test('the bound multi-stage pipeline finishes under the original scoped work permit after primary expiry and cleanup',async()=>{
 const h=await sandbox(),daily=await workAuthority();try{
  h.setBridge(daily.bridge);h.session.grant_id=daily.login1.grantId;await h.collect();const first=await h.create(await h.inputFor());assert.equal(first.status,202,JSON.stringify(first));const run=h.run(first.body.run.id),permit=run.work_permit_id;assert(permit);assert(!JSON.stringify(first.body).includes(permit));
  let calls=0;h.provider(async()=>{if(calls++===0){daily.tick(16*60000);await daily.login();assert.equal(daily.db.prepare('SELECT COUNT(*) n FROM writing_bridge_grants WHERE id=?').get(run.grant_id)!.n,0);const response=structuredClone(fixture.response),grade=JSON.parse(response.choices[0].message.content);grade.optimized_essay=fixture.seed.assignment.modelEssay;response.choices[0].message.content=JSON.stringify(grade);return Response.json(response);}return Response.json(fixture.response);});
  await h.drain();assert.equal(h.run(run.id).state,'ready',JSON.stringify(h.run(run.id)));assert.equal(h.calls.length,2);assert.equal(h.run(run.id).work_permit_id,permit);assert.equal(daily.db.prepare('SELECT COUNT(*) n FROM writing_work_permits').get()!.n,1);assert.equal((await h.request('/api/writing-reports/'+run.id)).status,200);
 }finally{h.close();daily.close();}
});
test('pausing revokes the old permit and a fresh interactive resume authorizes only the saved run',async()=>{
 const h=await sandbox(),daily=await workAuthority();try{
  h.setBridge(daily.bridge);h.session.grant_id=daily.login1.grantId;await h.collect();const first=await h.create(await h.inputFor()),run=h.run(first.body.run.id),before=run.work_permit_id;const paused=await h.request('/api/grading/'+run.id+'/pause',{requestId:id(),expectedUpdated:run.updated});assert.equal(paused.status,202);assert.equal(daily.db.prepare('SELECT revoked FROM writing_work_permits WHERE id=?').get(before)!.revoked,1);await h.drain();assert.equal(h.calls.length,0);
  daily.tick(16*60000);h.session.grant_id=(await daily.login()).grantId;const resumed=await h.request('/api/grading/'+run.id+'/resume',{requestId:id(),expectedUpdated:h.run(run.id).updated});assert.equal(resumed.status,202,JSON.stringify(resumed));assert.notEqual(h.run(run.id).work_permit_id,before);await h.drain();assert.equal(h.run(run.id).state,'ready');assert.equal(h.calls.length,1);
 }finally{h.close();daily.close();}
});
test('class revocation or local logout between pipeline stages prevents another billable call while preserving the first response',async()=>{
 for(const mode of ['class','local']){const h=await sandbox(),daily=await workAuthority();try{
  h.setBridge(daily.bridge);h.session.grant_id=daily.login1.grantId;await h.collect();const first=await h.create(await h.inputFor());
  h.provider(()=>{if(mode==='class')daily.db.exec("UPDATE writing_teacher_class_grants SET revoked=1,version=2");else h.db.prepare("INSERT INTO background_grant_revocations VALUES(?,?,'logout')").run(h.session.grant_id,Date.now());return Response.json(fixture.response);});
  await h.drain();assert.equal(h.calls.length,1);assert.equal(h.run(first.body.run.id).state,'failed');assert.equal(h.db.prepare("SELECT COUNT(*) n FROM model_jobs WHERE state='succeeded'").get()!.n,1);
 }finally{h.close();daily.close();}}
});
async function personal(){const daily=await workAuthority(),db=new DatabaseSync(':memory:');for(const f of fs.readdirSync('migrations').filter(f=>f.endsWith('.sql')).sort())db.exec(fs.readFileSync('migrations/'+f,'utf8'));const objects=new Map<string,string>(),queue:any[]=[],env={DB:sqlD1(db),PUBLIC_ORIGIN:'https://write.test',MODEL_API_URL:'https://model.invalid/v1/chat/completions',MODEL_NAME:'server-model',MODEL_API_KEY:'synthetic-key',MODEL_JOBS:{send:async(v:any)=>queue.push(v)},FILES:{put:async(k:string,v:string)=>objects.set(k,v),get:async(k:string)=>objects.has(k)?{json:async()=>JSON.parse(objects.get(k)!),body:new Response(objects.get(k)).body}:null}} as unknown as Env;const session={principal:'wordup:teacher',provider:'wordup',subject:'teacher',role:'teacher',grant_id:daily.login1.grantId};const input={profileId:'default',requestId:id(),payload:{messages:[{role:'user',content:'Synthetic essay.'}]}};
 async function create(value=input){try{const r=(await handleModelApi(new Request('https://write.test/api/model/jobs',{method:'POST'}),env,session,async()=>value,daily.bridge))!;return {status:r.status,body:await r.json() as any};}catch(e:any){return {status:e.status,body:{message:e.message}};}}
 async function consume(){while(queue.length)await consumeModelJobs({messages:[{body:queue.shift(),ack(){},retry(){throw Error('Unexpected retry');}}]} as any,env,daily.bridge);}
 return {daily,db,objects,env,session,input,create,consume,close:()=>{db.close();daily.close();}};}
test('standalone quick-grading and OCR-compatible jobs also have payload-bound work permits independent of primary expiry',async()=>{
 const h=await personal(),original=globalThis.fetch;let calls=0;try{
  const first=await h.create();assert.equal(first.status,202,JSON.stringify(first));const row=h.db.prepare('SELECT * FROM model_jobs').get() as any;assert(row.work_permit_id);assert(!JSON.stringify(first.body).includes(row.work_permit_id));h.daily.tick(16*60000);await h.daily.login();globalThis.fetch=async()=>{calls++;return Response.json(fixture.response);};await h.consume();assert.equal(calls,1);assert.equal(h.db.prepare('SELECT state FROM model_jobs').get()!.state,'succeeded');
  const stored=JSON.parse([...h.objects.values()][0]);assert(!JSON.stringify(stored).includes('wordup_session'));assert.equal(h.daily.db.prepare('SELECT COUNT(*) n FROM writing_work_permits').get()!.n,1);
 }finally{globalThis.fetch=original;h.close();}
});
test('local logout succeeds while Daily is unreachable and durably blocks already queued personal jobs',async()=>{
 const h=await personal(),original=globalThis.fetch;let calls=0;try{
  assert.equal((await h.create()).status,202);const token='synthetic-work-browser-cookie',hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),b=>b.toString(16).padStart(2,'0')).join('');h.db.prepare('INSERT INTO app_sessions VALUES(?,?,?,?,?,?,?,?)').run(hash,h.session.principal,h.session.grant_id,'wordup','teacher','teacher','合成教师',Date.now()+3600000);
  globalThis.fetch=async()=>{throw Error('Synthetic Daily offline');};const response=await worker.fetch(new Request('https://write.test/api/auth/logout',{method:'POST',headers:{Origin:'https://write.test',Cookie:'wa_session='+token}}),{...h.env,BRIDGE_SERVICE_TOKEN:'synthetic-machine',DAILY_ORIGIN:'https://daily.invalid'});assert.equal(response.status,200);assert.equal(h.db.prepare('SELECT COUNT(*) n FROM app_sessions').get()!.n,0);assert.equal(h.db.prepare('SELECT COUNT(*) n FROM background_grant_revocations').get()!.n,1);
  globalThis.fetch=async()=>{calls++;return Response.json(fixture.response);};await h.consume();assert.equal(calls,0);assert.equal(h.db.prepare('SELECT state FROM model_jobs').get()!.state,'failed');
 }finally{globalThis.fetch=original;h.close();}
});
test('stable operation IDs survive an authorization receipt loss and reject concurrent same-ID content changes before a second model call',async()=>{
 const h=await personal();try{
  const authorize=h.daily.bridge;let lost=true;const bridge=async(env:any,path:string,body:any)=>{const value=await authorize(env,path,body);if(path==='work/authorize'&&lost){lost=false;throw Object.assign(Error('Synthetic receipt lost'),{status:503});}return value;};const req=new Request('https://write.test/api/model/jobs',{method:'POST'});
  await assert.rejects(handleModelApi(req,h.env,h.session,async()=>h.input,bridge));const retried=await h.create();assert.equal(retried.status,202,JSON.stringify(retried));assert.equal(retried.body.id,await stableWorkId(h.session.principal,h.input.requestId,'model-job'));assert.equal(h.daily.db.prepare('SELECT COUNT(*) n FROM writing_work_permits').get()!.n,1);
  assert.equal((await h.create({...h.input,payload:{messages:[{role:'user',content:'Different synthetic essay.'}]}})).status,409);assert.equal(h.db.prepare('SELECT COUNT(*) n FROM model_jobs').get()!.n,1);
 }finally{h.close();}
});

test('stored payload corruption cannot change a work permit’s approved request or cause a model call',async()=>{
 const h=await personal(),original=globalThis.fetch;let calls=0;try{
  assert.equal((await h.create()).status,202);const row=h.db.prepare('SELECT * FROM model_jobs').get() as any,envelope=JSON.parse(h.objects.get(row.request_key)!);envelope.payload.messages[0].content='Different unapproved stored prompt.';h.objects.set(row.request_key,JSON.stringify(envelope));globalThis.fetch=async()=>{calls++;return Response.json(fixture.response);};await h.consume();assert.equal(calls,0);assert.equal(h.db.prepare('SELECT error_status FROM model_jobs').get()!.error_status,409);
 }finally{globalThis.fetch=original;h.close();}
});
