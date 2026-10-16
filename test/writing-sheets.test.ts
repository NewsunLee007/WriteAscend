import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {sqlD1} from './helpers/sql-d1';
import {handleSheets} from '../worker/sheets';
import {HttpError} from '../worker/errors';
import type {Env} from '../worker/index';
import type {TaskSession} from '../worker/tasks';
const taskId='10000000-0000-4000-8000-000000000001',otherTask='10000000-0000-4000-8000-000000000002';
const memberIds=['20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002'];
function token(){return 'WA1:'+Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');}
function sandbox(){
  const db=new DatabaseSync(':memory:');for(const f of fs.readdirSync('migrations').filter(f=>f.endsWith('.sql')).sort())db.exec(fs.readFileSync('migrations/'+f,'utf8'));
  const session:TaskSession={principal:'wordup:teacher',provider:'wordup',subject:'teacher',grant_id:'grant',role:'teacher',classes:[{id:'class',schoolId:'school',academicYear:'2026-1',name:'合成八1',grade:'八年级',version:1,grantVersion:1,scopes:['roster.read','writing.manage','writing.grade']}]};
  for(const id of [taskId,otherTask])db.prepare("INSERT INTO writing_tasks VALUES(?,?,?,'open',2,1,'hash','key','rubric','[]',NULL,2,1,1)").run(id,session.principal,'合成题目');
  for(let i=0;i<2;i++)db.prepare("INSERT INTO task_members VALUES(?,?,1,'wordup',?,?,'class','合成八1','school','2026-1','八年级',1,'active',1)").run(memberIds[i],taskId,'student-'+i,'合成同名');
  const env={DB:sqlD1(db)} as unknown as Env;let revoke=false,identityChanged=false;
  const bridge=async()=>({active:true,provider:'wordup',subject:identityChanged?'other':session.subject,role:'teacher',classes:revoke?[]:session.classes});
  async function request(path:string,body?:any,who=session){try{const response=(await handleSheets(new Request('https://write.test'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env,who,bridge,r=>r.json()))!;return {status:response.status,body:await response.json() as any};}catch(e){if(e instanceof HttpError)return {status:e.status,body:{error:e.message}};throw e;}}
  const input=(pages=2)=>({requestId:crypto.randomUUID(),expectedRevision:2,draftNumber:1,pageCount:pages,schoolLabel:'合成学校',members:memberIds.map(memberId=>({memberId,expectedSetId:'',tokens:Array.from({length:pages},token)}))});
  return {db,session,request,input,flags:(flags:any)=>{revoke=!!flags.revoke;identityChanged=!!flags.identityChanged;},close:()=>db.close()};
}
const path='/api/tasks/'+taskId+'/sheets';
test('personalized sheets preserve distinct same-name task members and store token hashes only; repeat and concurrent issuance is idempotent',async()=>{
  const h=sandbox();try{
    const input=h.input(),responses=await Promise.all([h.request(path,input),h.request(path,input)]);assert(responses.every(r=>[200,201].includes(r.status)),JSON.stringify(responses));
    assert.deepEqual(responses[0].body.sets,responses[1].body.sets);assert.equal(h.db.prepare('SELECT COUNT(*) n FROM writing_sheet_sets').get()!.n,2);assert.equal(h.db.prepare('SELECT COUNT(*) n FROM writing_sheets').get()!.n,4);
    assert.equal(responses[0].body.taskVersion,1);assert.equal(responses[0].body.sets[0].name,responses[0].body.sets[1].name);assert.notEqual(responses[0].body.sets[0].memberId,responses[0].body.sets[1].memberId);
    for(const token of input.members.flatMap(m=>m.tokens)){for(const table of ['writing_sheet_operations','writing_sheet_sets','writing_sheets'])assert(!JSON.stringify(h.db.prepare('SELECT * FROM '+table).all()).includes(token));}
    assert.equal((await h.request(path,{...input,schoolLabel:'changed'})).status,409);
    const resolved=await h.request(path+'/resolve',{code:input.members[0].tokens[1]});assert.equal(resolved.body.sheet.pageNumber,2);assert.equal(resolved.body.sheet.pageCount,2);assert.equal(resolved.body.sheet.subject,'student-0');assert.equal(resolved.body.identityConfirmed,false);
    assert.equal((await h.request(path+'/resolve',{code:responses[0].body.sets[0].sheets[1].checkCode})).body.sheet.sheetId,resolved.body.sheet.sheetId);
  }finally{h.close();}
});
test('reissue requires the exact previous sheet set, revokes old codes atomically, and a separate draft does not invalidate the first draft',async()=>{
  const h=sandbox();try{
    const first=h.input(1),issued=await h.request(path,first),stale=h.input(1);assert.equal((await h.request(path,stale)).status,409);assert.equal((await h.request(path+'/resolve',{code:first.members[0].tokens[0]})).status,200);
    const again=h.input(1);again.members.forEach((m,i)=>m.expectedSetId=issued.body.sets[i].id);
    const concurrent=h.input(1);concurrent.members.forEach((m,i)=>m.expectedSetId=issued.body.sets[i].id);
    const result=await Promise.all([h.request(path,again),h.request(path,concurrent)]);assert.deepEqual(result.map(r=>r.status).sort(),[201,409]);
    assert.equal((await h.request(path+'/resolve',{code:first.members[0].tokens[0]})).status,410);assert.equal((await h.request(path+'/resolve',{code:again.members[0].tokens[0]})).status,200);
    const second=h.input(2);second.draftNumber=2;assert.equal((await h.request(path,second)).status,201);assert.equal((await h.request(path+'/resolve',{code:again.members[0].tokens[0]})).status,200);
    assert.equal(h.db.prepare("SELECT COUNT(*) n FROM writing_sheet_sets WHERE status='active'").get()!.n,4);
  }finally{h.close();}
});
test('forged members, duplicate QR tokens, closed tasks and stale task revisions cannot issue or resolve sheets',async()=>{
  const h=sandbox();try{
    const forged=h.input();forged.members[0].memberId=crypto.randomUUID();assert.equal((await h.request(path,forged)).status,409);
    const duplicate=h.input();duplicate.members[1].tokens[0]=duplicate.members[0].tokens[0];assert.equal((await h.request(path,duplicate)).status,400);
    const stale=h.input();stale.expectedRevision=1;assert.equal((await h.request(path,stale)).status,409);
    const input=h.input();assert.equal((await h.request(path,input)).status,201);
    assert.equal((await h.request('/api/tasks/'+otherTask+'/sheets/resolve',{code:input.members[0].tokens[0]})).status,409);
    h.db.prepare("UPDATE writing_tasks SET status='closed' WHERE id=?").run(taskId);
    assert.equal((await h.request(path,h.input())).status,409);assert.equal((await h.request(path+'/resolve',{code:input.members[0].tokens[0]})).status,409);
    assert.equal(h.db.prepare('SELECT COUNT(*) n FROM writing_sheets').get()!.n,4);
  }finally{h.close();}
});
test('sheet codes and short identifiers confer no access: owner, live class scopes and role are checked before returning identities',async()=>{
  const h=sandbox();try{
    const input=h.input();await h.request(path,input);
    const other={...h.session,principal:'wordup:other',subject:'other'};assert.equal((await h.request(path+'/resolve',{code:input.members[0].tokens[0]},other)).status,404);
    assert.equal((await h.request(path+'/resolve',{code:input.members[0].tokens[0]},{...h.session,role:'student'})).status,403);
    assert.equal((await h.request(path+'/resolve',{code:input.members[0].tokens[0]},{...h.session,classes:[]})).status,403);
    h.flags({revoke:true});assert.equal((await h.request(path+'/resolve',{code:input.members[0].tokens[0]})).status,403);assert.equal((await h.request(path,h.input())).status,403);
    h.flags({identityChanged:true});assert.equal((await h.request(path+'/resolve',{code:input.members[0].tokens[0]})).status,401);
    h.flags({});assert.equal((await h.request(path+'/resolve',{code:'https://evil.test/redirect'})).status,400);
  }finally{h.close();}
});
