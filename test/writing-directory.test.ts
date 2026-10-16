import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {createWritingBridge} from '../integrations/daily/src/writing-bridge.mjs';
import {createWritingDirectory,readWritingAuthority} from '../integrations/daily/src/writing-directory.mjs';
import {createWritingRoster} from '../integrations/daily/src/writing-authority.mjs';
const admin={provider:'wordup',subject:'admin',role:'admin',name:'合成管理员',expires:Date.now()+3600000};
async function harness(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'writing-directory-')),sourceFile=path.join(dir,'source.sqlite'),source=new DatabaseSync(sourceFile),db=new DatabaseSync(':memory:');
  source.exec(`CREATE TABLE students(id TEXT PRIMARY KEY,name TEXT,grade TEXT,class_name TEXT,status TEXT,is_guest INTEGER,source_key TEXT,pin_hash TEXT);
    CREATE TABLE teacher_accounts(id TEXT PRIMARY KEY,name TEXT,status TEXT,password_hash TEXT,username_key TEXT);
    INSERT INTO students VALUES('s1','合成同名','7a','701','active',0,'school:1','never-copy-secret');
    INSERT INTO students VALUES('s2','合成同名','7a','701','active',0,'school:2','never-copy-secret');
    INSERT INTO students VALUES('s3','合成转班','7a','702','active',0,'school:3','never-copy-secret');
    INSERT INTO students VALUES('disabled','合成停用','7a','701','disabled',0,'school:4','never-copy-secret');
    INSERT INTO students VALUES('public','合成自主','7a','701','active',0,'public:5','never-copy-secret');
    INSERT INTO students VALUES('guest','合成游客','7a','701','active',1,'school:6','never-copy-secret');
    INSERT INTO teacher_accounts VALUES('teacher-1','合成教师','active','never-copy-secret','private-login-name');
    INSERT INTO teacher_accounts VALUES('teacher-2','合成停用教师','disabled','never-copy-secret','private-login-name-2');`);
  let sourceReads=0,sourceUnavailable=false;
  const directory=createWritingDirectory({db,readAuthority:()=>{sourceReads++;if(sourceUnavailable)throw Object.assign(new Error('synthetic source unavailable'),{status:503});return readWritingAuthority(sourceFile);}});
  const identities=new Map<string,any>([['admin',admin],['teacher',{provider:'wordup',subject:'teacher-1',role:'teacher',name:'合成教师',expires:admin.expires}],['student',{provider:'wordup',subject:'s1',role:'student',accountType:'school',name:'合成同名',expires:admin.expires}]]);
  const resolveIdentity=async(req:any)=>{const key=String(req.headers.cookie||'').replace('session=',''),identity=identities.get(key);if(!identity)throw Object.assign(new Error('合成账号失效'),{status:401});return {...identity,source:{cookie:'session='+key}};};
  const token='synthetic-directory-service-token-32chars',origin='https://daily.test',callback='https://writeascend.test/api/auth/callback';
  const bridge=createWritingBridge({db,publicOrigin:origin,serviceToken:token,storageKey:'synthetic-directory-encryption-storage-key',callbacks:[callback],resolveIdentity,verifySource:(source:any)=>resolveIdentity({headers:{cookie:source.cookie}}),directory,readRoster:createWritingRoster({db,sourceFile})});
  const server=http.createServer(async(req,res)=>{await bridge.handle(req,res,new URL(req.url!,origin));});await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+(server.address() as any).port;
  async function request(action:string,body:any={},cookie=''){
    const r=await fetch(url+'/api/integrations/writeascend/'+action,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,Authorization:'Bearer '+token,...(cookie?{cookie}:{}),},body:JSON.stringify(body)});return {status:r.status,body:await r.json() as any};
  }
  async function login(who='admin'){
    const verifier='x'.repeat(43),r=await request('authorize',{client_id:'writeascend',redirect_uri:callback,state:'s'.repeat(64),code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'},'session='+who);assert.equal(r.status,200);
    const code=new URL(r.body.redirect).searchParams.get('code'),result=await request('token',{clientId:'writeascend',redirectUri:callback,verifier,code});assert.equal(result.status,200);return result.body;
  }
  async function overview(grantId:string){const r=await request('directory/overview',{grantId});assert.equal(r.status,200);return r.body;}
  const params=(data:any,schoolId:string|null=null)=>({schoolId,schoolName:'合成测试学校',academicYear:'2098-1',classKeys:data.source.classes.map((c:any)=>c.key)});
  async function sync(grantId:string,p:any){const preview=await request('directory/preview',{...p,grantId});assert.equal(preview.status,200,JSON.stringify(preview));const body={...p,grantId,planHash:preview.body.planHash,requestId:crypto.randomUUID()},r=await request('directory/sync',body);assert.equal(r.status,200,JSON.stringify(r));return {result:r.body,body,preview:preview.body};}
  return {db,source,sourceFile,directory,identities,request,login,overview,params,sync,reads:()=>sourceReads,sourceUnavailable:(value:boolean)=>{sourceUnavailable=value;},close:async()=>{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));source.close();db.close();fs.rmSync(dir,{recursive:true,force:true});}};
}
test('directory administration is source-verified admin only and preflight never copies authentication fields or writes source accounts',async()=>{
  const h=await harness();try{
    for(const who of ['teacher','student']){const login=await h.login(who);assert.equal((await h.request('directory/overview',{grantId:login.grantId,role:'admin'})).status,403);}assert.equal(h.reads(),0);
    const login=await h.login(),data=await h.overview(login.grantId);assert.equal(data.source.total,3);assert.equal(data.source.classes.length,2);assert.equal(data.teachers.length,2);assert.deepEqual(data.defaults,{schoolName:'瑞安市新纪元实验学校',academicYear:'2026-1'});
    assert(!JSON.stringify(data).includes('never-copy-secret'));assert(!JSON.stringify(data).includes('private-login-name'));assert(!JSON.stringify(data).includes('password_hash'));assert(!JSON.stringify(data).includes('source_key'));
    const p=h.params(data);assert.equal((await h.request('directory/preview',{...p,academicYear:'2026-2027',grantId:login.grantId})).status,400);assert.equal((await h.request('directory/preview',{...p,academicYear:'',grantId:login.grantId})).status,400);assert.equal((await h.request('directory/preview',{...p,schoolName:'',grantId:login.grantId})).status,400);
    const preview=await h.request('directory/preview',{...p,grantId:login.grantId});assert.equal(preview.status,200);assert.equal(preview.body.total,3);assert.equal(preview.body.classes.find((c:any)=>c.sourceName==='701').duplicateNames,1);
    assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM writing_schools').get()!.n,0);assert.equal(h.source.prepare('SELECT COUNT(*) AS n FROM students').get()!.n,6);assert.equal(h.source.prepare('SELECT pin_hash FROM students WHERE id=?').get('s1')!.pin_hash,'never-copy-secret');
    h.identities.delete('admin');assert.equal((await h.request('directory/preview',{...p,grantId:login.grantId})).status,401);
  }finally{await h.close();}
});
test('confirmed directory sync is atomic and idempotent, keeps same-name subjects separate and preserves stable class IDs',async()=>{
  const h=await harness();try{
    const login=await h.login(),data=await h.overview(login.grantId),p=h.params(data),preview=await h.request('directory/preview',{...p,grantId:login.grantId});
    const body={...p,planHash:preview.body.planHash,requestId:crypto.randomUUID()},both=await Promise.all([h.directory.handle('sync',body,admin),h.directory.handle('sync',body,admin)]);assert.equal(both[0].schoolId,both[1].schoolId);assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM writing_schools').get()!.n,1);assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM writing_classes').get()!.n,2);assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM writing_memberships').get()!.n,3);
    const repeated=await h.request('directory/sync',{...body,grantId:login.grantId});assert.equal(repeated.status,200);assert.equal(repeated.body.replayed,true);assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM writing_directory_audit').get()!.n,1);
    const again=await h.sync(login.grantId,h.params(data,both[0].schoolId));assert.deepEqual(again.result.classIds.sort(),both[0].classIds.sort());assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM writing_membership_periods').get()!.n,3);
    const actor=h.db.prepare('SELECT provider,subject FROM writing_directory_audit').get();assert.equal(actor!.subject,'admin');assert(!JSON.stringify(h.db.prepare('SELECT * FROM writing_directory_audit').all()).includes('never-copy-secret'));
  }finally{await h.close();}
});
test('stale source previews or directory state cannot overwrite another administrator changes',async()=>{
  const h=await harness();try{
    const login=await h.login(),data=await h.overview(login.grantId),p=h.params(data),preview=await h.request('directory/preview',{...p,grantId:login.grantId});
    h.source.prepare('UPDATE students SET name=? WHERE id=?').run('合成改名','s1');assert.equal((await h.request('directory/sync',{...p,grantId:login.grantId,requestId:crypto.randomUUID(),planHash:preview.body.planHash})).status,409);assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM writing_schools').get()!.n,0);
    const fresh=await h.sync(login.grantId,p),existing=h.params(data,fresh.result.schoolId),next=await h.request('directory/preview',{...existing,grantId:login.grantId});
    h.db.prepare('UPDATE writing_classes SET version=version+1 WHERE id=?').run(fresh.result.classIds[0]);assert.equal((await h.request('directory/sync',{...existing,grantId:login.grantId,requestId:crypto.randomUUID(),planHash:next.body.planHash})).status,409);
    assert.equal((await h.request('directory/preview',{...p,grantId:login.grantId})).status,409);
  }finally{await h.close();}
});
test('rename, transfer, leaving and returning create dated membership periods while preserving historical identities',async()=>{
  const h=await harness();try{
    const login=await h.login(),data=await h.overview(login.grantId),initial=await h.sync(login.grantId,h.params(data)),p=h.params(data,initial.result.schoolId);
    const first=h.db.prepare("SELECT id FROM writing_classes WHERE source_name='701'").get()!.id,second=h.db.prepare("SELECT id FROM writing_classes WHERE source_name='702'").get()!.id;
    h.source.prepare('UPDATE students SET name=?,class_name=? WHERE id=?').run('合成改名','702','s1');const changed=await h.sync(login.grantId,p);assert.equal(changed.preview.transferCount,1);
    assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM writing_memberships WHERE subject='s1' AND status='active' AND ended IS NULL").get()!.n,1);assert.equal(h.db.prepare("SELECT class_id FROM writing_memberships WHERE subject='s1' AND status='active'").get()!.class_id,second);
    const old=h.db.prepare("SELECT * FROM writing_membership_periods WHERE subject='s1' AND class_id=?").get(first);assert.equal(old!.name_snapshot,'合成同名');assert(old!.ended);
    assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM writing_membership_periods WHERE subject='s1'").get()!.n,2);
    h.source.prepare('UPDATE students SET class_name=? WHERE id=?').run('701','s1');await h.sync(login.grantId,p);assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM writing_membership_periods WHERE subject='s1'").get()!.n,3);
    h.source.prepare('UPDATE students SET name=? WHERE id=?').run('合成再次改名','s1');await h.sync(login.grantId,p);assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM writing_membership_periods WHERE subject='s1'").get()!.n,4);assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM writing_membership_periods WHERE subject='s1' AND ended IS NULL").get()!.n,1);
  }finally{await h.close();}
});
test('teacher grants only use active authority teachers, honor revisions, revoke live and cannot be broadened by a student ID',async()=>{
  const h=await harness();try{
    const login=await h.login(),data=await h.overview(login.grantId),synced=await h.sync(login.grantId,h.params(data)),classId=synced.result.classIds[0];
    const params={grantId:login.grantId,classId,subject:'teacher-1',expectedVersion:0,scopes:['roster.read','writing.manage','writing.grade'],revoked:false,requestId:crypto.randomUUID()};
    for(const subject of ['s1','teacher-2'])assert.equal((await h.request('directory/grant',{...params,subject,requestId:crypto.randomUUID()})).status,403);
    assert.equal((await h.request('directory/grant',{...params,scopes:['admin']})).status,400);
    assert.equal((await h.request('directory/grant',params)).status,200);assert.equal((await h.request('directory/grant',params)).body.replayed,true);
    const teacher=await h.login('teacher');assert.equal(teacher.classes[0].id,classId);assert.equal((await h.request('roster',{grantId:teacher.grantId,classId})).status,200);
    assert.equal((await h.request('directory/grant',{...params,requestId:crypto.randomUUID()})).status,409);
    h.source.prepare("UPDATE teacher_accounts SET status='disabled' WHERE id='teacher-1'").run();h.sourceUnavailable(true);assert.equal((await h.request('directory/grant',{...params,expectedVersion:1,revoked:true,requestId:crypto.randomUUID()})).status,200);assert.equal((await h.request('roster',{grantId:teacher.grantId,classId})).status,403);
  }finally{await h.close();}
});
test('class deactivation ends members and revokes teacher scopes; resync preserves IDs but does not restore old teacher grants',async()=>{
  const h=await harness();try{
    const login=await h.login(),data=await h.overview(login.grantId),synced=await h.sync(login.grantId,h.params(data)),classId=synced.result.classIds[0];
    await h.request('directory/grant',{grantId:login.grantId,classId,subject:'teacher-1',expectedVersion:0,scopes:['roster.read'],revoked:false,requestId:crypto.randomUUID()});
    const originalMembers=Number(h.db.prepare("SELECT COUNT(*) AS n FROM writing_memberships WHERE class_id=? AND status='active'").get(classId)!.n);
    const disabled=await h.request('directory/class-status',{grantId:login.grantId,classId,expectedVersion:1,status:'inactive',requestId:crypto.randomUUID()});assert.equal(disabled.status,200);assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM writing_memberships WHERE class_id=? AND status='active'").get(classId)!.n,0);assert.equal(h.db.prepare('SELECT revoked FROM writing_teacher_class_grants WHERE class_id=?').get(classId)!.revoked,1);
    const result=await h.sync(login.grantId,h.params(data,synced.result.schoolId));assert(result.result.classIds.includes(classId));assert.equal(h.db.prepare('SELECT status FROM writing_classes WHERE id=?').get(classId)!.status,'active');assert.equal(h.db.prepare('SELECT revoked FROM writing_teacher_class_grants WHERE class_id=?').get(classId)!.revoked,1);
    const periods=h.db.prepare('SELECT COUNT(*) AS n FROM writing_membership_periods WHERE class_id=?').get(classId)!.n;assert.equal(periods,originalMembers*2);
  }finally{await h.close();}
});
test('the confirmed YYYY-1 and YYYY-2 term format creates distinct class identities without copying prior-term teacher grants',async()=>{
  const h=await harness();try{
    const login=await h.login(),data=await h.overview(login.grantId),first=await h.sync(login.grantId,{...h.params(data),academicYear:'2026-1'}),oldClass=first.result.classIds[0];
    await h.request('directory/grant',{grantId:login.grantId,classId:oldClass,subject:'teacher-1',expectedVersion:0,scopes:['roster.read'],revoked:false,requestId:crypto.randomUUID()});
    const second=await h.sync(login.grantId,{...h.params(data,first.result.schoolId),academicYear:'2026-2'});
    assert(second.result.classIds.every((id:string)=>!first.result.classIds.includes(id)));assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM writing_classes').get()!.n,4);
    const teacher=await h.login('teacher');assert.deepEqual(teacher.classes.map((c:any)=>c.id),[oldClass]);assert.equal(teacher.classes[0].academicYear,'2026-1');
    assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM writing_teacher_class_grants').get()!.n,1);
  }finally{await h.close();}
});
