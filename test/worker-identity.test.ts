import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/index';
import type {Env} from '../worker/index';
import {createWritingBridge} from '../integrations/daily/src/writing-bridge.mjs';
import {sqlD1} from './helpers/sql-d1';

async function sandbox(role='teacher') {
  const dailyDb=new DatabaseSync(':memory:'),cloudDb=new DatabaseSync(':memory:');
  cloudDb.exec(fs.readFileSync(new URL('../migrations/0001_report_workspace.sql',import.meta.url),'utf8'));
  const machine='synthetic-worker-daily-machine-secret';
  let enabled=true;
  const source=async()=>{
    if(!enabled)throw Object.assign(new Error('合成账号已停用'),{status:401});
    return {provider:'wordup',subject:'teacher-1',role,name:'合成教师',expires:Date.now()+3600000,source:{cookie:'wordup_session=synthetic-source'}};
  };
  let dailyOrigin='';
  let bridge:ReturnType<typeof createWritingBridge>;
  const server=http.createServer(async(req,res)=>{
    if(await bridge.handle(req,res,new URL(req.url!,dailyOrigin)))return;
    res.writeHead(404);res.end();
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  dailyOrigin='http://127.0.0.1:'+(server.address() as any).port;
  bridge=createWritingBridge({db:dailyDb,publicOrigin:dailyOrigin,serviceToken:machine,storageKey:'synthetic-Daily-only-storage-encryption-secret',callbacks:['https://writeascend.test/api/auth/callback'],resolveIdentity:source,verifySource:source,readRoster:()=>({students:[{subject:'student-1',name:'合成同学',grade:'八年级',pin_hash:'must-not-leave-Daily'}],next:null}),directory:{handle:async(action:string,body:any,identity:any)=>({action,body,actorRole:identity.role})} as any});
  const env={DB:sqlD1(cloudDb),PUBLIC_ORIGIN:'https://writeascend.test',DAILY_ORIGIN:dailyOrigin,BRIDGE_SERVICE_TOKEN:machine,FILES:{},ASSETS:{fetch:async()=>new Response('test asset')}} as unknown as Env;
  const request=(pathname:string,cookie='',method='GET',origin='https://writeascend.test')=>worker.fetch(new Request('https://writeascend.test'+pathname,{method,headers:{...(cookie?{cookie}:{}),...(method==='GET'?{}:{Origin:origin})}}),env);
  async function start(next='/') {
    const response=await request('/api/auth/start?'+new URLSearchParams({next}));
    assert.equal(response.status,302);
    const location=new URL(response.headers.get('location')!);
    const authorized=await fetch(dailyOrigin+'/api/integrations/writeascend/authorize',{method:'POST',headers:{Origin:dailyOrigin,'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(location.searchParams))});
    assert.equal(authorized.status,200);
    return {callback:new URL((await authorized.json() as any).redirect),cookie:response.headers.get('set-cookie')!.split(';')[0]};
  }
  async function login(next='/') {
    const transaction=await start(next);
    const response=await request(transaction.callback.pathname+transaction.callback.search,transaction.cookie);
    assert.equal(response.status,302);
    const cookie=response.headers.getSetCookie().find(c=>c.startsWith('wa_session='))!;
    assert(cookie.includes('HttpOnly'));assert(cookie.includes('Secure'));assert(cookie.includes('SameSite=Lax'));assert(!cookie.includes('Domain='));
    return {cookie:cookie.split(';')[0],response,transaction};
  }
  return {dailyDb,cloudDb,env,request,start,login,disable:()=>{enabled=false;},close:async()=>{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));dailyDb.close();cloudDb.close();}};
}

test('Worker and Daily exchange actual authorization code over HTTP and create only a separate cloud session',async()=>{
  const h=await sandbox();try{
    assert.equal((await h.request('/api/me')).status,401);
    const logged=await h.login('/?task=synthetic');
    assert.equal(logged.response.headers.get('location'),'/?task=synthetic');
    assert.equal((await h.request(logged.transaction.callback.pathname+logged.transaction.callback.search,logged.transaction.cookie)).status,400);
    const me=await h.request('/api/me',logged.cookie);assert.equal(me.status,200);
    const identity=await me.json() as any;assert.equal(identity.name,'合成教师');assert.deepEqual(identity.scopes,['writing.personal']);
    assert(!JSON.stringify(identity).includes('wordup_session'));
    const cloudSession=h.cloudDb.prepare('SELECT * FROM app_sessions').get() as any;
    assert.equal(cloudSession.principal,'wordup:teacher-1');assert(!JSON.stringify(cloudSession).includes('synthetic-source'));
    assert(!JSON.stringify(cloudSession).includes(logged.cookie.split('=')[1]));
    assert.deepEqual(await (await h.request('/api/classes',logged.cookie)).json(),{classes:[]});
    assert.equal((await h.request('/api/assets',logged.cookie,'POST')).status,403);
    assert.equal((await h.request('/api/snapshots',logged.cookie,'POST')).status,403);
    assert.equal((await h.request('/api/tasks',logged.cookie,'POST')).status,403);
    assert.equal((await h.request('/api/tasks/synthetic',logged.cookie,'PUT')).status,403);
    assert.equal((await h.request('/api/admin/writing-directory/overview',logged.cookie)).status,403);
    assert.equal((await h.request('/api/auth/logout',logged.cookie,'POST','https://foreign.test')).status,403);
    assert.equal((await h.request('/api/me',logged.cookie)).status,200);
    assert.equal((await h.request('/api/auth/logout',logged.cookie,'POST')).status,200);
    assert.equal((await h.request('/api/me',logged.cookie)).status,401);
  }finally{await h.close();}
});

test('admin directory proxy binds the current grant, strips spoofed actors and keeps mutations workspace protected',async()=>{
  const h=await sandbox('admin');try{
    const login=await h.login(),me=await(await h.request('/api/me',login.cookie)).json() as any;
    const overview=await h.request('/api/admin/writing-directory/overview',login.cookie);assert.equal(overview.status,200);assert.equal((await overview.json() as any).actorRole,'admin');
    const body={schoolName:'合成学校',academicYear:'confirmed-year',classKeys:['synthetic-key'],grantId:'foreign-grant',actor:'spoofed-admin'};
    const request=(workspaceId:string,origin='https://writeascend.test')=>worker.fetch(new Request('https://writeascend.test/api/admin/writing-directory/preview',{method:'POST',headers:{Cookie:login.cookie,Origin:origin,'Content-Type':'application/json','X-Workspace-Id':workspaceId},body:JSON.stringify(body)}),h.env);
    assert.equal((await request('previous-account')).status,403);assert.equal((await request(me.workspaceId,'https://foreign.test')).status,403);
    const response=await request(me.workspaceId);assert.equal(response.status,200);const value=await response.json() as any;
    assert.equal(value.body.schoolName,'合成学校');assert.notEqual(value.body.grantId,'foreign-grant');assert(!('actor' in value.body));assert.equal(value.actorRole,'admin');
  }finally{await h.close();}
});

test('Worker rejects missing or wrong state and external return paths; failed transactions cannot be replayed',async()=>{
  const h=await sandbox();try{
    const missing=await h.start();
    assert.equal((await h.request(missing.callback.pathname+missing.callback.search)).status,400);
    const wrong=await h.start();wrong.callback.searchParams.set('state','attacker');
    assert.equal((await h.request(wrong.callback.pathname+wrong.callback.search,wrong.cookie)).status,400);
    assert.equal(h.cloudDb.prepare('SELECT COUNT(*) AS n FROM app_sessions').get()!.n,0);
    assert.equal((await h.login('https://evil.test/steal')).response.headers.get('location'),'/');
  }finally{await h.close();}
});

test('Worker roster follows current Daily class permissions and logout still succeeds after source account disablement',async()=>{
  const h=await sandbox();try{
    const logged=await h.login();
    h.dailyDb.exec(`INSERT INTO writing_schools VALUES('school','合成学校','active');
      INSERT INTO writing_classes VALUES('class-1','school','2026-2027','八年级1班','八（1）班','八年级','active',1);
      INSERT INTO writing_teacher_class_grants VALUES('wordup','teacher-1','class-1','["roster.read","writing.grade"]',1,0);`);
    const classes=await (await h.request('/api/classes',logged.cookie)).json() as any;
    assert.equal(classes.classes[0].id,'class-1');
    const roster=await h.request('/api/classes/class-1/roster',logged.cookie);assert.equal(roster.status,200);
    const students=await roster.json() as any;assert.equal(students.students[0].subject,'student-1');assert(!JSON.stringify(students).includes('pin_hash'));
    assert.equal((await h.request('/api/classes/other-class/roster',logged.cookie)).status,403);
    h.dailyDb.exec('UPDATE writing_teacher_class_grants SET revoked=1,version=version+1');
    assert.equal((await h.request('/api/classes/class-1/roster',logged.cookie)).status,403);
    h.disable();assert.equal((await h.request('/api/me',logged.cookie)).status,401);
    assert.equal((await h.request('/api/auth/logout',logged.cookie,'POST')).status,200);
    assert.equal(h.cloudDb.prepare('SELECT COUNT(*) AS n FROM app_sessions').get()!.n,0);
  }finally{await h.close();}
});
