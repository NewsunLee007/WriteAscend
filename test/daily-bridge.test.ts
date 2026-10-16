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
