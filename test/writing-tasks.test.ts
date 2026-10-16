import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {sqlD1} from './helpers/sql-d1';
import {handleTasks,type TaskSession} from '../worker/tasks';
import {digest} from '../src/report/legacy-import';
import {HttpError} from '../worker/errors';
import type {Env} from '../worker/index';
import {taskClasses,uniqueStudent} from '../src/teacher/task-roster';
const fixture=JSON.parse(fs.readFileSync(new URL('../scripts/qa/fixtures/teacher-workflow.json',import.meta.url),'utf8'));
function sandbox(){
  const db=new DatabaseSync(':memory:');for(const name of fs.readdirSync(new URL('../migrations',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())db.exec(fs.readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
  const objects=new Map<string,string>();let storageFailure=false,pagesChanged=false,loseGrant=false,identityChanged=false;
  const classroom={id:'authority-class-1',schoolId:'school',academicYear:'confirmed-year',name:'八年级1班',grade:'八年级',version:3,grantVersion:2,scopes:['roster.read','writing.manage','writing.grade']};
  const session:TaskSession={principal:'wordup:teacher-1',grant_id:'grant',provider:'wordup',subject:'teacher-1',role:'teacher',classes:[classroom]};
  const rows=Array.from({length:130},(_,i)=>({provider:'wordup',subject:'student-'+String(i).padStart(3,'0'),name:i<2?'合成同名':'合成同学'+i,classId:classroom.id,grade:classroom.grade,status:'active',pin_hash:'must-not-enter-task'}));
  const env={DB:sqlD1(db),FILES:{put:async(k:string,v:string)=>{if(storageFailure)throw Error('synthetic R2 unavailable');objects.set(k,v);},get:async(k:string)=>objects.has(k)?{json:async()=>JSON.parse(objects.get(k)!)}:null}} as unknown as Env;
  const bridge=async(_env:Env,path:string,body:Record<string,unknown>)=>{
    if(path==='introspect')return {active:true,provider:'wordup',subject:identityChanged?'other':'teacher-1',role:'teacher',classes:loseGrant?[]:session.classes};
    assert.equal(path,'roster');const remaining=rows.filter(r=>r.subject>String(body.after||'')),page=remaining.slice(0,100);
    return {classId:classroom.id,version:classroom.version,snapshotHash:await digest(pagesChanged&&body.after?{rows,changed:true}:rows),students:page,next:remaining.length>100?page.at(-1)!.subject:null};
  };
  async function request(path:string,body?:any,method=body?'POST':'GET',who=session){
    const req=new Request('https://writeascend.test'+path,{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    try{const response=(await handleTasks(req,env,who,bridge,r=>r.json()))!;return {status:response.status,body:await response.json() as any};}
    catch(e){if(e instanceof HttpError)return {status:e.status,body:{error:{message:e.message,code:e.code}}};throw e;}
  }
  const payload=(extra:any={})=>({requestId:crypto.randomUUID(),title:'合成写作任务',assignment:structuredClone(fixture.seed.assignment),rubric:structuredClone(fixture.seed.rubric),settings:{languageDifficulty:{enabled:false}},classIds:[classroom.id],...extra});
  const create=async(body=payload())=>{const r=await request('/api/tasks',body);assert.equal(r.status,201,JSON.stringify(r));return r.body.task;};
  return {db,objects,env,session,classroom,rows,request,payload,create,flags:(flags:any)=>{if('storage' in flags)storageFailure=flags.storage;if('pagesChanged' in flags)pagesChanged=flags.pagesChanged;if('loseGrant' in flags)loseGrant=flags.loseGrant;if('identityChanged' in flags)identityChanged=flags.identityChanged;},close:()=>db.close()};
}
test('teacher tasks preserve the complete original rubric and topic; only explicitly granted classes may be selected',async()=>{
  const h=sandbox();try{
    assert.equal((await h.request('/api/tasks',h.payload({classIds:['local-legacy-class']}))).status,403);
    const limited={...h.session,classes:[{...h.classroom,scopes:['roster.read','writing.grade']}]};
    assert.equal((await h.request('/api/tasks',h.payload(),'POST',limited)).status,403);
    const bad=h.payload();bad.rubric.items[0].score=3;assert.equal((await h.request('/api/tasks',bad)).status,400);
    const repeated=h.payload();repeated.rubric.items[1].id=repeated.rubric.items[0].id;assert.equal((await h.request('/api/tasks',repeated)).status,400);
    const input=h.payload();input.assignment.apiKey='must-not-survive';input.settings.apiKey='must-not-survive';input.rubric.extension={keep:'teacher rubric extension'};
    const task=await h.create(input),read=await h.request('/api/tasks/'+task.id);
    assert.equal(read.body.document.rubric.extension.keep,'teacher rubric extension');assert.deepEqual(read.body.document.rubric.items,fixture.seed.rubric.items);assert.equal(read.body.document.assignment.modelEssay,fixture.seed.assignment.modelEssay);
    assert(!JSON.stringify(read).includes('must-not-survive'));assert.equal(task.memberCount,0);assert.equal(task.status,'draft');assert.equal(task.targets[0].academicYear,'confirmed-year');
    assert.equal((await h.request('/api/tasks/'+task.id,undefined,'GET',{...h.session,principal:'wordup:teacher-2',subject:'teacher-2'})).status,404);
  }finally{h.close();}
});
test('a repeated or concurrently retried task creation creates exactly one task and one rubric version',async()=>{
  const h=sandbox();try{
    const input=h.payload(),results=await Promise.all([h.request('/api/tasks',input),h.request('/api/tasks',input)]);
    assert(results.every(r=>[200,201].includes(r.status)),JSON.stringify(results));assert.equal(results[0].body.task.id,results[1].body.task.id);
    assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM writing_tasks').get()!.n,1);assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM rubric_versions').get()!.n,1);
    assert.equal((await h.request('/api/tasks',{...input,title:'different content'})).status,409);
    h.flags({storage:true});await assert.rejects(h.create(),/synthetic R2 unavailable/);assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM writing_tasks').get()!.n,1);
  }finally{h.close();}
});
test('draft changes use immutable rubric versions and concurrent device updates do not overwrite a newer version',async()=>{
  const h=sandbox();try{
    const task=await h.create(),a=h.payload({expectedRevision:1,title:'设备 A'}),b=h.payload({expectedRevision:1,title:'设备 B'});a.rubric.gradeLevel='九年级';b.rubric.gradeLevel='八年级';
    const updates=await Promise.all([h.request('/api/tasks/'+task.id,a,'PUT'),h.request('/api/tasks/'+task.id,b,'PUT')]);assert.deepEqual(updates.map(r=>r.status).sort(),[200,409]);
    const read=await h.request('/api/tasks/'+task.id),old=await h.request('/api/tasks/'+task.id+'?version=1');assert.equal(read.body.task.version,2);assert.equal(read.body.document.rubric.gradeLevel,updates[0].status===200?a.rubric.gradeLevel:b.rubric.gradeLevel);assert.equal(old.body.document.rubric.gradeLevel,'七年级');assert.notEqual(old.body.task.rubricHash,read.body.task.rubricHash);
    assert.equal((await h.request('/api/tasks/'+task.id+'/versions')).body.versions.length,2);
  }finally{h.close();}
});
test('authoritative paginated roster retains same-name students by subject and activation is atomic and idempotent',async()=>{
  const h=sandbox();try{
    const task=await h.create(),preview=await h.request('/api/tasks/'+task.id+'/preview');assert.equal(preview.status,200);assert.equal(preview.body.members.length,130);assert.equal(preview.body.members[0].name,preview.body.members[1].name);assert.notEqual(preview.body.members[0].subject,preview.body.members[1].subject);assert(!JSON.stringify(preview).includes('must-not-enter-task'));
    const input={requestId:crypto.randomUUID(),expectedRevision:1,rosterHash:preview.body.rosterHash};
    const results=await Promise.all([h.request('/api/tasks/'+task.id+'/activate',input),h.request('/api/tasks/'+task.id+'/activate',input)]);assert(results.every(r=>r.status===200),JSON.stringify(results));
    assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM task_members').get()!.n,130);
    const first=await h.request('/api/tasks/'+task.id+'/members'),second=await h.request('/api/tasks/'+task.id+'/members?after='+first.body.next);assert.equal(first.body.members.length,100);assert.equal(second.body.members.length,30);assert.equal(second.body.next,null);assert.equal(first.body.members[0].taskVersion,1);
    assert.equal((await h.request('/api/tasks/'+task.id,h.payload({expectedRevision:2}),'PUT')).status,409);
    const limited={...h.session,classes:[]};assert.equal((await h.request('/api/tasks/'+task.id+'/members',undefined,'GET',limited)).status,403);
    const closed=await h.request('/api/tasks/'+task.id+'/status',{requestId:crypto.randomUUID(),expectedRevision:2,status:'closed'});assert.equal(closed.body.task.status,'closed');assert.equal(closed.body.task.version,1);
    assert.equal((await h.request('/api/tasks/'+task.id+'/status',{requestId:crypto.randomUUID(),expectedRevision:2,status:'open'})).status,409);
  }finally{h.close();}
});
test('roster changes, page inconsistency and revocation cannot silently bind the wrong students',async()=>{
  const h=sandbox();try{
    const task=await h.create(),preview=await h.request('/api/tasks/'+task.id+'/preview');h.rows[0].name='合成改名';
    assert.equal((await h.request('/api/tasks/'+task.id+'/activate',{requestId:crypto.randomUUID(),expectedRevision:1,rosterHash:preview.body.rosterHash})).status,409);
    h.flags({pagesChanged:true});assert.equal((await h.request('/api/tasks/'+task.id+'/preview')).status,409);
    h.flags({pagesChanged:false,loseGrant:true});assert.equal((await h.request('/api/tasks/'+task.id+'/preview')).status,403);
    h.flags({loseGrant:false,identityChanged:true});assert.equal((await h.request('/api/tasks/'+task.id+'/preview')).status,401);
    h.flags({identityChanged:false});h.rows[1].subject=h.rows[0].subject;assert.equal((await h.request('/api/tasks/'+task.id+'/preview')).status,409);
    assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM task_members').get()!.n,0);assert.equal(h.db.prepare('SELECT status FROM writing_tasks').get()!.status,'draft');
  }finally{h.close();}
});
test('private drafts cannot become school tasks without a confirmed directory and explicit roster review',async()=>{
  const h=sandbox();try{
    const task=await h.create(h.payload({classIds:[]}));assert.equal((await h.request('/api/tasks/'+task.id+'/preview')).status,409);
    assert.equal((await h.request('/api/tasks/'+task.id+'/activate',{requestId:crypto.randomUUID(),expectedRevision:1})).status,400);
    const student={...h.session,role:'student'};assert.equal((await h.request('/api/tasks',undefined,'GET',student)).status,403);
    const noYear={...h.session,classes:[{...h.classroom,academicYear:''}]};assert.equal((await h.request('/api/tasks',h.payload(),'POST',noYear)).status,503);
  }finally{h.close();}
});
test('task roster projection preserves original local annotations and never guesses a school number for same-name students',()=>{
  const envelope:any={task:{id:'task',version:1,targets:[{id:'class',schoolId:'school',academicYear:'confirmed',name:'合成班',grade:'8a',version:1}]}};
  const members:any=[{id:'member-1',classId:'class',provider:'wordup',subject:'student-1',name:'同名'},{id:'member-2',classId:'class',provider:'wordup',subject:'student-2',name:'同名'}];
  const projected=taskClasses(envelope,members,[{id:'daily:class',students:[{id:'wordup:student-1',no:'17',aliases:['教师别名']}]}]);
  assert.equal(projected[0].gradeLevel,'八年级');assert.equal(projected[0].students[0].no,'17');assert.deepEqual(projected[0].students[0].aliases,['教师别名']);assert.equal(projected[0].students[1].no,'');
  assert.equal(uniqueStudent<any>(projected[0].students,s=>s.name==='同名'),null);assert.equal(uniqueStudent<any>(projected[0].students,s=>s.no==='17')!.id,'wordup:student-1');
});
