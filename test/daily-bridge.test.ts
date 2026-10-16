import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createWritingBridge} from '../integrations/daily/src/writing-bridge.mjs';
import {createDailyWritingIdentity,createWritingRoster} from '../integrations/daily/src/writing-authority.mjs';

const callback='https://writeascend.test/api/auth/callback';
const service='synthetic-machine-secret-for-isolated-tests';
const verifier='v'.repeat(43);
const parameters={client_id:'writeascend',redirect_uri:callback,state:'s'.repeat(64),code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'};
const denied=()=>{throw Object.assign(new Error('登录已失效。'),{status:401});};

async function harness(options:Record<string,unknown>={}) {
  const db=new DatabaseSync(':memory:');
  let clock=Date.now();
  const identities=new Map<string,any>([
    ['wordup_session=teacher',{provider:'wordup',subject:'teacher-1',role:'teacher',name:'合成教师',expires:clock+3600000}],
    ['wordup_session=public',{provider:'wordup',subject:'public-1',role:'student',name:'合成自主学生',accountType:'public',expires:clock+3600000}],
    ['wordup_session=guest',{provider:'wordup',subject:'guest-1',role:'student',name:'合成游客',accountType:'guest',isGuest:true,expires:clock+3600000}],
  ]);
  const resolveIdentity=async(req:any)=>{
    const identity=identities.get(req.headers.cookie);if(!identity)denied();
    return {...identity,source:{cookie:req.headers.cookie}};
  };
  const bridge=createWritingBridge({db,publicOrigin:'https://daily.test',serviceToken:service,storageKey:'synthetic-local-only-storage-encryption-key',callbacks:[callback],resolveIdentity,verifySource:(source:any)=>resolveIdentity({headers:{cookie:source.cookie}}),now:()=>clock,...options});
  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url!,'https://daily.test');
    bridge.observeAuthChange(req,res,url);
    if(await bridge.handle(req,res,url))return;
    res.writeHead(200,{'Content-Type':'application/json'});res.end('{}');
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+(server.address() as any).port;
  async function request(endpoint:string,body?:any,headers:Record<string,string>={}) {
    const response=await fetch(origin+'/api/integrations/writeascend/'+endpoint,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json','Origin':'https://daily.test'}:{}),...headers},body:body?JSON.stringify(body):undefined});
    return {status:response.status,body:await response.json() as any};
  }
  async function authorize(cookie='wordup_session=teacher',overrides={}) {
    const response=await request('authorize',{...parameters,...overrides},{cookie});
    assert.equal(response.status,200,JSON.stringify(response.body));
    return new URL(response.body.redirect).searchParams.get('code');
  }
  const machine={Authorization:'Bearer '+service};
  const exchange=(code:string|null,overrides={})=>request('token',{clientId:'writeascend',redirectUri:callback,code,verifier,...overrides},machine);
  return {db,bridge,identities,request,authorize,exchange,machine,origin,tick:(ms:number)=>{clock+=ms;},close:async()=>{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));db.close();}};
}

test('bridge code is bound to callback and PKCE, consumed once, and never returns the source cookie',async()=>{
  const h=await harness();try{
    const code=await h.authorize();
    const stored=h.db.prepare('SELECT source_sealed FROM writing_bridge_grants').get() as any;
    assert(!stored.source_sealed.includes('teacher'));
    assert.equal((await h.request('token',{clientId:'writeascend',redirectUri:callback,code,verifier})).status,401);
    const results=await Promise.all([h.exchange(code),h.exchange(code)]);
    assert.deepEqual(results.map(r=>r.status).sort(),[200,401]);
    const identity=results.find(r=>r.status===200)!.body;
    assert.equal(identity.subject,'teacher-1');assert.equal(identity.role,'teacher');
    assert.deepEqual(identity.scopes,['writing.personal']);assert.deepEqual(identity.classes,[]);
    assert(!JSON.stringify(identity).includes('wordup_session'));
    assert.equal((await h.request('introspect',{grantId:identity.grantId},h.machine)).status,200);
    const another=await h.authorize();
    assert.equal((await h.exchange(another,{verifier:'x'.repeat(43)})).status,401);
    assert.equal((await h.exchange(another)).status,401);
  }finally{await h.close();}
});

test('foreign origins, wrong clients/callbacks/challenges, guests and public accounts cannot authorize',async()=>{
  const h=await harness();try{
    assert.equal((await h.request('authorize',parameters,{cookie:'wordup_session=teacher',Origin:'https://other.test'})).status,403);
    for(const override of [{client_id:'other'},{redirect_uri:'https://evil.test/api/auth/callback'},{code_challenge_method:'plain'},{state:'short'},{code_challenge:'short'}])assert.equal((await h.request('authorize',{...parameters,...override},{cookie:'wordup_session=teacher'})).status,400);
    for(const cookie of ['wordup_session=guest','wordup_session=public'])assert.equal((await h.request('authorize',parameters,{cookie})).status,403);
    assert.equal((await h.request('authorize',parameters)).status,401);
    assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM writing_bridge_grants').get()!.n,0);
  }finally{await h.close();}
});

test('code/grant expiration, source disablement, role changes and explicit revocation take effect',async()=>{
  const h=await harness();try{
    const expired=await h.authorize();h.tick(60001);assert.equal((await h.exchange(expired)).status,401);
    const identity=(await h.exchange(await h.authorize())).body;
    h.identities.delete('wordup_session=teacher');
    assert.equal((await h.request('introspect',{grantId:identity.grantId},h.machine)).status,401);
    h.identities.set('wordup_session=teacher',{provider:'wordup',subject:'teacher-1',role:'student',accountType:'school',expires:Date.now()+3600000});
    assert.equal((await h.request('introspect',{grantId:identity.grantId},h.machine)).status,401);
    const student=(await h.exchange(await h.authorize())).body;
    assert.equal((await h.request('revoke',{grantId:student.grantId},h.machine)).status,200);
    assert.equal((await h.request('introspect',{grantId:student.grantId},h.machine)).status,401);
    const timed=(await h.exchange(await h.authorize())).body;h.tick(15*60000+1);
    assert.equal((await h.request('introspect',{grantId:timed.grantId},h.machine)).status,401);
  }finally{await h.close();}
});

test('successful Daily logout revokes all grants for that source; foreign logout does not',async()=>{
  const h=await harness();try{
    const a=(await h.exchange(await h.authorize())).body,b=(await h.exchange(await h.authorize())).body;
    const logout=(origin:string)=>fetch(h.origin+'/api/v1/auth/logout',{method:'POST',headers:{Origin:origin,cookie:'wordup_session=teacher'}});
    await logout('https://foreign.test');
    assert.equal((await h.request('introspect',{grantId:a.grantId},h.machine)).status,200);
    await logout('https://daily.test');
    for(const identity of [a,b])assert.equal((await h.request('introspect',{grantId:identity.grantId},h.machine)).status,401);
  }finally{await h.close();}
});

test('teacher class grants are explicit and revocation is checked live for roster requests',async()=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'writing-roster-')),sourceFile=path.join(folder,'authority.sqlite');
  const source=new DatabaseSync(sourceFile);
  source.exec(`CREATE TABLE students(id TEXT,name TEXT,class_name TEXT,grade TEXT,status TEXT,is_guest INTEGER,source_key TEXT,pin_hash TEXT);
    INSERT INTO students VALUES('s1','合成同名','八（1）班','八年级','active',0,'school:1','never-export');
    INSERT INTO students VALUES('s2','合成同名','八（1）班','八年级','active',0,'school:2','never-export');
    INSERT INTO students VALUES('s3','合成停用','八（1）班','八年级','disabled',0,'school:3','never-export');
    INSERT INTO students VALUES('s4','合成转班','八（2）班','八年级','active',0,'school:4','never-export');
    INSERT INTO students VALUES('s5','合成自主','八（1）班','八年级','active',0,'public:5','never-export');`);
  source.close();
  const h=await harness();try{
    const identity=(await h.exchange(await h.authorize())).body;
    h.db.exec(`INSERT INTO writing_schools VALUES('school','合成学校','active');
      INSERT INTO writing_classes VALUES('c1','school','2026-2027','八年级1班','八（1）班','八年级','active',1);
      INSERT INTO writing_classes VALUES('c2','school','2026-2027','八年级2班','八（2）班','八年级','active',1);
      INSERT INTO writing_teacher_class_grants VALUES('wordup','teacher-1','c1','["roster.read","writing.grade"]',1,0);`);
    for(const id of ['s1','s2','s3','s4','s5'])h.db.prepare('INSERT INTO writing_memberships(class_id,provider,subject,started) VALUES(?,?,?,?)').run('c1','wordup',id,'2026-09-01');
    const access=(await h.request('introspect',{grantId:identity.grantId},h.machine)).body;
    assert.equal(access.classes.length,1);assert.equal(access.classes[0].id,'c1');assert(!access.scopes.includes('writing.publish'));
    // The production roster adapter is exercised against a temporary authority DB.
    const readRoster=createWritingRoster({db:h.db,sourceFile});
    const first=readRoster({classId:'c1',limit:1});
    assert.equal(first.students.length,1);assert.equal(first.next,'s1');
    const second=readRoster({classId:'c1',after:first.next!,limit:1});
    assert.equal(second.students[0].subject,'s2');assert.equal(second.next,null);
    assert.match(first.snapshotHash,/^[a-f0-9]{64}$/);assert.equal(first.snapshotHash,second.snapshotHash);
    const changed=new DatabaseSync(sourceFile);changed.prepare('UPDATE students SET name=? WHERE id=?').run('合成改名','s2');changed.close();
    assert.notEqual(readRoster({classId:'c1',limit:1}).snapshotHash,first.snapshotHash);
    assert(!JSON.stringify(first).includes('pin_hash'));assert(!JSON.stringify(first).includes('never-export'));
    assert.equal((await h.request('roster',{grantId:identity.grantId,classId:'c2'},h.machine)).status,403);
    h.db.exec("UPDATE writing_teacher_class_grants SET revoked=1,version=version+1 WHERE class_id='c1'");
    const revoked=(await h.request('introspect',{grantId:identity.grantId},h.machine)).body;
    assert.deepEqual(revoked.classes,[]);
    assert.equal((await h.request('roster',{grantId:identity.grantId,classId:'c1'},h.machine)).status,403);
  }finally{await h.close();fs.rmSync(folder,{recursive:true,force:true});}
});

test('Daily identity adapter verifies the source before decoding, separates legacy admin and caps original expiry',async()=>{
  const db=new DatabaseSync(':memory:');let verified=0;const clock=Date.now();
  db.exec('CREATE TABLE administrator_sessions(hash TEXT PRIMARY KEY,expires INTEGER)');
  const digest=(value:string)=>crypto.createHash('sha256').update(value).digest('hex');
  db.prepare('INSERT INTO administrator_sessions VALUES(?,?)').run(digest('legacy-token'),clock+60000);
  const cookie='wordup_session='+Buffer.from(JSON.stringify({sub:'immutable-id',role:'teacher',exp:Math.floor(clock/1000)+30})).toString('base64url')+'.synthetic';
  const identity=createDailyWritingIdentity({db,now:()=>clock,authenticateLegacy:(token:string)=>{if(token!=='legacy-token')denied();},verifyWordup:async(req:any)=>{verified++;if(req.headers.cookie!==cookie)denied();return {subject:'immutable-id',role:'teacher',teacher:{name:'合成教师'}};},cookieForWordup:(req:any)=>req.headers.cookie});
  try{
    const legacy=await identity.resolveIdentity({headers:{cookie:'daily_admin=legacy-token'}});assert.equal(legacy.provider,'daily_legacy_admin');assert.equal(verified,0);
    const wordup=await identity.resolveIdentity({headers:{cookie}});assert.equal(wordup.subject,'immutable-id');assert(wordup.expires<=clock+30000);assert.equal(verified,1);
    await assert.rejects(identity.resolveIdentity({headers:{cookie:cookie.replace('synthetic','forged')}}),{status:401});assert.equal(verified,2);
    db.exec('DELETE FROM administrator_sessions');
    await assert.rejects(identity.verifySource(legacy.source),{status:401});
  }finally{db.close();}
});

test('disabled bridge makes no schema changes and does not interfere with existing routes',async()=>{
  const h=await harness({serviceToken:''});try{
    assert.equal(h.bridge.enabled,false);
    assert.equal((await h.request('authorize',parameters,{cookie:'wordup_session=teacher'})).status,503);
    assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name LIKE 'writing_%'").get()!.n,0);
    assert.equal((await fetch(h.origin+'/api/learning/session')).status,200);
  }finally{await h.close();}
});

const runScope=()=>({type:'grading-run',runId:crypto.randomUUID(),taskId:crypto.randomUUID(),memberId:crypto.randomUUID(),draftId:crypto.randomUUID(),classId:'class-work',inputHash:'a'.repeat(64),modelInputHash:'b'.repeat(64),profileId:'default',profileRevision:'c'.repeat(64),pipelineVersion:'test-pipeline'});
async function preparedWork(){const h=await harness();const login=(await h.exchange(await h.authorize())).body;h.db.exec("INSERT INTO writing_schools VALUES('school-work','合成学校','active');INSERT INTO writing_classes VALUES('class-work','school-work','2026-1','示例班','示例班','七年级','active',1);INSERT INTO writing_teacher_class_grants VALUES('wordup','teacher-1','class-work','[\"roster.read\",\"writing.grade\"]',1,0);");const body={grantId:login.grantId,requestId:crypto.randomUUID(),callbackUri:callback,scope:runScope()};return {...h,login,body,issue:(value=body)=>h.request('work/authorize',value,h.machine),check:(permitId:string,value=body)=>h.request('work/introspect',{permitId,scope:value.scope,callbackUri:value.callbackUri},h.machine)};}
test('work permits are machine-only and immutable; they survive interactive expiry and grant cleanup without giving browsing or publishing rights',async()=>{
 const h=await preparedWork();try{
  assert.equal((await h.request('work/authorize',h.body)).status,401);const issued=await h.issue();assert.equal(issued.status,200,JSON.stringify(issued));const permit=issued.body;
  assert.equal((await h.issue()).body.permitId,permit.permitId);assert.equal(h.db.prepare('SELECT COUNT(*) n FROM writing_work_permits').get()!.n,1);assert.deepEqual(permit.classes[0].scopes,['roster.read','writing.grade']);assert(!permit.scopes.includes('writing.publish'));assert(!JSON.stringify(permit).includes('wordup_session'));
  const sourceExpiry=h.identities.get('wordup_session=teacher').expires;assert(permit.expires<=sourceExpiry);
  assert.equal((await h.issue({...h.body,scope:{...h.body.scope,inputHash:'d'.repeat(64)}})).status,409);
  assert.equal((await h.check(permit.permitId,{...h.body,scope:{...h.body.scope,taskId:crypto.randomUUID()}})).status,403);assert.equal((await h.check(permit.permitId)).status,200);
  h.tick(16*60000);assert.equal((await h.request('introspect',{grantId:h.login.grantId},h.machine)).status,401);await h.exchange(await h.authorize());assert.equal(h.db.prepare('SELECT COUNT(*) n FROM writing_bridge_grants WHERE id=?').get(h.login.grantId)!.n,0);assert.equal((await h.check(permit.permitId)).status,200);
  assert.equal((await h.request('introspect',{grantId:permit.permitId},h.machine)).status,401);assert.equal((await h.request('roster',{grantId:permit.permitId,classId:'class-work'},h.machine)).status,401);
 }finally{await h.close();}
});
test('class permission versions prevent revoked and later restored grants from silently resurrecting old background work',async()=>{
 const h=await preparedWork();try{
  const first=(await h.issue()).body;h.db.exec("UPDATE writing_teacher_class_grants SET revoked=1,version=2 WHERE class_id='class-work';UPDATE writing_teacher_class_grants SET revoked=0,version=3 WHERE class_id='class-work'");assert.equal((await h.check(first.permitId)).status,403);assert.equal((await h.check(first.permitId)).status,401);
  const next={...h.body,requestId:crypto.randomUUID()},second=(await h.issue(next)).body;assert.equal((await h.check(second.permitId,next)).status,200);h.db.exec("UPDATE writing_classes SET version=2 WHERE id='class-work'");assert.equal((await h.check(second.permitId,next)).status,403);
 }finally{await h.close();}
});
test('background work stops on source logout even after the parent grant was cleaned up; explicit primary revocation remains session-specific',async()=>{
 const h=await preparedWork();try{
  const first=(await h.issue()).body,login2=(await h.exchange(await h.authorize())).body,other={...h.body,grantId:login2.grantId,requestId:crypto.randomUUID()},second=(await h.issue(other)).body;
  await h.request('revoke',{grantId:h.login.grantId},h.machine);assert.equal((await h.check(first.permitId)).status,401);assert.equal((await h.check(second.permitId,other)).status,200);
  h.tick(16*60000);await h.exchange(await h.authorize());assert.equal(h.db.prepare('SELECT COUNT(*) n FROM writing_bridge_grants WHERE id=?').get(login2.grantId)!.n,0);
  await fetch(h.origin+'/api/v1/auth/logout',{method:'POST',headers:{Origin:'https://daily.test',Cookie:'wordup_session=teacher'}});assert.equal((await h.check(second.permitId,other)).status,401);
 }finally{await h.close();}
});
test('work lifetime is capped at 24 hours and source disablement or role changes invalidate it without expanding scopes',async()=>{
 const h=await preparedWork();try{
  h.identities.get('wordup_session=teacher').expires=Date.now()+48*3600000;const first=(await h.issue()).body;assert(first.expires<=Date.now()+24*3600000);
  const account=h.identities.get('wordup_session=teacher');h.identities.delete('wordup_session=teacher');assert.equal((await h.request('introspect',{grantId:h.login.grantId},h.machine)).status,401);h.identities.set('wordup_session=teacher',account);assert.equal((await h.check(first.permitId)).status,401);h.body.grantId=(await h.exchange(await h.authorize())).body.grantId;
  const body={...h.body,requestId:crypto.randomUUID()},second=(await h.issue(body)).body;h.identities.set('wordup_session=teacher',{...account,role:'admin'});assert.equal((await h.check(second.permitId,body)).status,401);h.identities.set('wordup_session=teacher',account);h.body.grantId=(await h.exchange(await h.authorize())).body.grantId;
  const thirdBody={...h.body,requestId:crypto.randomUUID()},third=(await h.issue(thirdBody)).body;h.tick(24*3600000+1);assert.equal((await h.check(third.permitId,thirdBody)).status,401);
 }finally{await h.close();}
});
test('work revocation during the upstream identity check wins the race, and personal jobs cannot be rebound to a grading run',async()=>{
 let release:(value:any)=>void=()=>{},pending=false,entered:(value?:unknown)=>void=()=>{};const reached=new Promise(r=>entered=r),h=await harness({verifySource:async()=>{if(pending){entered();await new Promise(r=>release=r);}return {provider:'wordup',subject:'teacher-1',role:'teacher',expires:Date.now()+3600000};}});try{
  const login=(await h.exchange(await h.authorize())).body,body={grantId:login.grantId,requestId:crypto.randomUUID(),callbackUri:callback,scope:{type:'model-job',jobId:crypto.randomUUID(),requestHash:'a'.repeat(64),profileId:'default',profileRevision:'b'.repeat(64)}},issued=await h.request('work/authorize',body,h.machine);assert.equal(issued.status,200);pending=true;
  const waiting=h.request('work/introspect',{permitId:issued.body.permitId,scope:body.scope,callbackUri:callback},h.machine);await reached;await h.request('work/revoke',{permitId:issued.body.permitId,scope:body.scope,callbackUri:callback},h.machine);release(undefined);assert.equal((await waiting).status,401);
  pending=false;const second=await h.request('work/authorize',{...body,requestId:crypto.randomUUID()},h.machine);assert.equal(second.status,200,'Revoking one work item must preserve the source login');assert.equal((await h.request('work/introspect',{permitId:second.body.permitId,scope:runScope(),callbackUri:callback},h.machine)).status,403);
 }finally{release(undefined);await h.close();}
});
