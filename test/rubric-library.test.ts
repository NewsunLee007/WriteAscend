import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import worker from '../worker/index';
import {DatabaseSync} from 'node:sqlite';
import {sqlD1} from './helpers/sql-d1';
import {handleRubricLibrary} from '../worker/rubric-library';
import {handleTasks} from '../worker/tasks';
import {HttpError} from '../worker/errors';
import {availableQuickClasses,initialQuickClasses,gradeName,genres,rubricPreset,rubricProblem,cleanRubricDocument,scaleRubricItems,suggestedWordCount,wordCountDiffers} from '../src/teacher/rubric-library';
import {pickRubricLabels} from '../src/report/legacy-core.js';
import type {Env} from '../worker/index';
function sandbox(){
 const db=new DatabaseSync(':memory:');for(const f of fs.readdirSync('migrations').filter(f=>f.endsWith('.sql')).sort())db.exec(fs.readFileSync('migrations/'+f,'utf8'));
 const objects=new Map<string,string>();const env={DB:sqlD1(db),FILES:{put:async(k:string,v:string)=>objects.set(k,v),get:async(k:string)=>objects.has(k)?{json:async()=>JSON.parse(objects.get(k)!)}:null}} as unknown as Env;
 const who={principal:'wordup:teacher-a',role:'teacher',grant_id:'grant-a'};
 async function request(path:string,body?:any,method=body?'POST':'GET',user=who){try{const r=await handleRubricLibrary(new Request('https://write.test'+path,{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env,user,r=>r.json());assert(r);return {status:r.status,body:await r.json() as any};}catch(e){if(e instanceof HttpError)return {status:e.status,body:{error:e.message}};throw e;}}
 const payload=(extra:any={})=>({requestId:crypto.randomUUID(),name:'八年级 · 活动经历',genre:'narrative',document:rubricPreset('narrative','八年级',15),...extra});
 return {db,env,objects,who,request,payload,close:()=>db.close()};
}
test('six genre defaults are editable grade-specific teaching rubrics with exact half-point totals',()=>{
 for(const genre of genres)for(const total of [.5,1,1.5,5,15,20,25,1000]){const d=rubricPreset(genre.id,'8',total);assert.equal(rubricProblem(d.rubric),'');assert.equal(d.rubric.gradeLevel,'八年级');assert.equal(d.rubric.items.reduce((n:number,c:any)=>n+c.score,0),total);assert.equal(d.rubric.wordCountStrict,false);assert.equal(cleanRubricDocument(d).rubric.total,total);}
 assert.notEqual(rubricPreset('practical').rubric.items[0].desc,rubricPreset('narrative').rubric.items[0].desc);
 for(const [input,output] of [['初一','七年级'],['初二','八年级'],['9年级','九年级'],['高二','高二'],['8a','八年级']])assert.equal(gradeName(input),output);
 const items=Array.from({length:7},(_,i)=>({id:String(i),score:1}));assert.equal(scaleRubricItems(items,2).reduce((s,c)=>s+c.score,0),2);
});
test('quick grading chooses only authorized Daily classes and never resurrects legacy, revoked or mixed-grade defaults',()=>{
 const c=(id:string,grade='8',academicYear='2026-1',scopes=['roster.read','writing.manage','writing.grade'])=>({id,grade,academicYear,scopes,name:id,schoolId:'s',version:1,grantVersion:1});
 const classes=[c('813'),c('814'),c('901','9'),c('old','8','2025-2'),c('read-only','8','2026-1',['roster.read']),c('revoked','8','2026-1',[])];
 assert.deepEqual(initialQuickClasses(classes,['701','revoked']),['813']);assert.deepEqual(initialQuickClasses(classes,['813','814','901','old']),['813','814']);assert.equal(availableQuickClasses(classes).length,4);assert.deepEqual(initialQuickClasses([],['701']),[]);
});
test('standards require explicit complete criteria and sanitize data to rubric fields only',()=>{
 const base=rubricPreset('narrative');for(const change of [(r:any)=>r.total=NaN,(r:any)=>r.items[0].score=-1,(r:any)=>r.items[1].id=r.items[0].id,(r:any)=>r.items[0].desc='',(r:any)=>r.items[1].label=r.items[0].label,(r:any)=>r.items[0].score=3]){const r=structuredClone(base.rubric);change(r);assert(rubricProblem(r));}
 const d:any=structuredClone(base);d.assignment={topic:'private topic',students:['student name']};d.apiKey='secret';d.rubric.apiKey='secret';d.rubric.items[0].student='student name';d.languageDifficulty.apiKey='secret';const json=JSON.stringify(cleanRubricDocument(d));assert(!json.includes('secret'));assert(!json.includes('student name'));assert(!json.includes('private topic'));
});
test('personal rubric creation is owner-isolated, student-denied and idempotent under concurrent retries',async()=>{
 const h=sandbox();try{const body=h.payload(),results=await Promise.all([h.request('/api/rubric-templates',body),h.request('/api/rubric-templates',body)]);assert(results.every(r=>r.status===200),JSON.stringify(results));assert.deepEqual(results[0].body,results[1].body);const id=results[0].body.template.id;
 assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM teacher_rubric_templates').get()!.n,1);assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM teacher_rubric_versions').get()!.n,1);
 assert.equal((await h.request('/api/rubric-templates',{...body,name:'changed replay'})).status,409);
 const other={...h.who,principal:'wordup:teacher-b'};assert.equal((await h.request('/api/rubric-templates',undefined,'GET',other)).body.templates.length,0);for(const suffix of ['', '/versions'])assert.equal((await h.request('/api/rubric-templates/'+id+suffix,undefined,'GET',other)).status,404);
 assert.equal((await h.request('/api/rubric-templates',undefined,'GET',{...h.who,role:'student'})).status,403);
 assert.equal((await h.request('/api/rubric-templates/'+id,h.payload({expectedRevision:1}),'PUT',other)).status,404);
 }finally{h.close();}
});
test('updates use compare-and-swap, record versions, retain favorites, and support recoverable archive',async()=>{
 const h=sandbox();try{const created=(await h.request('/api/rubric-templates',h.payload({favorite:true}))).body.template;const a=h.payload({expectedRevision:1,name:'设备A'}),b=h.payload({expectedRevision:1,name:'设备B'});
 const results=await Promise.all([h.request('/api/rubric-templates/'+created.id,a,'PUT'),h.request('/api/rubric-templates/'+created.id,b,'PUT')]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);const current=(await h.request('/api/rubric-templates/'+created.id)).body.template;assert.equal(current.revision,2);assert.equal(current.favorite,true);
 const archive=h.payload({name:current.name,expectedRevision:2,status:'archived'});const archived=(await h.request('/api/rubric-templates/'+created.id,archive,'PUT')).body.template;assert.equal(archived.status,'archived');assert.deepEqual((await h.request('/api/rubric-templates/'+created.id,archive,'PUT')).body.template,archived);
 const restored=(await h.request('/api/rubric-templates/'+created.id,h.payload({expectedRevision:3,status:'active'}),'PUT')).body.template;assert.equal(restored.revision,4);assert.equal(restored.status,'active');const history=(await h.request('/api/rubric-templates/'+created.id+'/versions')).body.versions;assert.equal(history.length,4);assert.equal(history.at(-1).template.name,created.name);assert.equal(history[1].template.status,'archived');
 }finally{h.close();}
});
test('template edits never rewrite a task snapshot, and expired local grants cannot save new templates',async()=>{
 const h=sandbox();try{const original=(await h.request('/api/rubric-templates',h.payload())).body.template;
 const body={requestId:crypto.randomUUID(),title:'独立任务快照',assignment:{topic:'Write about a school trip.'},rubric:original.document.rubric,settings:{languageDifficulty:original.document.languageDifficulty},classIds:[]};const who={...h.who,provider:'wordup',subject:'teacher-a',classes:[]};const req=new Request('https://write.test/api/tasks',{method:'POST',body:JSON.stringify(body)});const response=(await handleTasks(req,h.env,who,async()=>({}),r=>r.json()))!;assert.equal(response.status,201);const task=(await response.json() as any).task;
 const changed=structuredClone(original.document);changed.rubric.items[0].desc='修订后的个人评价要求';assert.equal((await h.request('/api/rubric-templates/'+original.id,h.payload({expectedRevision:1,document:changed}),'PUT')).status,200);
 const read=(await handleTasks(new Request('https://write.test/api/tasks/'+task.id),h.env,who,async()=>({}),r=>r.json()))!;const saved=await read.json() as any;assert.deepEqual(saved.document.rubric,original.document.rubric);assert.notEqual(saved.document.rubric.items[0].desc,changed.rubric.items[0].desc);
 h.db.prepare("INSERT INTO background_grant_revocations VALUES(?,?,'logout')").run(h.who.grant_id,Date.now());assert.equal((await h.request('/api/rubric-templates',h.payload())).status,409);
 }finally{h.close();}
});

test('word-count hints use explicit wording and genre dimensions never become accidental word-count penalties',()=>{
 assert.equal(suggestedWordCount('Unit 3: write about 2 activities in 80–100 words.'),'80–100 words');assert.equal(suggestedWordCount('词数：80到100词。'),'80–100 words');assert.equal(suggestedWordCount('2026年八年级第13班'),'');assert.equal(wordCountDiffers('Write in 80-100 words.','60–80 words'),true);assert.equal(wordCountDiffers('Write in 80-100 words.','80–100 words'),false);assert.doesNotThrow(()=>wordCountDiffers('Write in 80-100 words.',80 as any));assert.equal(wordCountDiffers('Write in 80-100 words.',null as any),true);
 for(const genre of genres){const labels=pickRubricLabels(rubricPreset(genre.id).rubric);assert.equal(labels.wordCount,'');assert.equal(labels.structure,'组织与连贯');assert.equal(labels.handwriting,'书写与规范');}
});

test('rubric routes enforce actual Worker login, same-origin and workspace account guards',async()=>{
 const h=sandbox(),originalFetch=globalThis.fetch;try{const origin='https://write.test',sha=(v:string)=>createHash('sha256').update(v).digest('hex');Object.assign(h.env,{PUBLIC_ORIGIN:origin,DAILY_ORIGIN:'https://daily.test',BRIDGE_SERVICE_TOKEN:'synthetic-test-bridge'});
 h.db.prepare('INSERT INTO app_sessions VALUES(?,?,?,?,?,?,?,?)').run(sha('synthetic-cookie'),h.who.principal,h.who.grant_id,'wordup','teacher-a','teacher','合成教师',Date.now()+60000);
 globalThis.fetch=async()=>Response.json({active:true,provider:'wordup',subject:'teacher-a',role:'teacher',scopes:['writing.personal'],classes:[]});
 const request=(path:string,body?:any,headers:any={})=>worker.fetch(new Request(origin+path,{method:body?'POST':'GET',headers:{Cookie:'wa_session=synthetic-cookie','Content-Type':'application/json',Origin:origin,...headers},...(body?{body:JSON.stringify(body)}:{})}),h.env);
 assert.equal((await request('/api/rubric-templates',undefined,{Cookie:''})).status,401);assert.equal((await request('/api/rubric-templates',h.payload())).status,403);assert.equal((await request('/api/rubric-templates',h.payload(),{'X-Workspace-Id':sha('other-account')})).status,403);assert.equal((await request('/api/rubric-templates',h.payload(),{Origin:'https://foreign.test','X-Workspace-Id':sha(h.who.principal)})).status,403);
 assert.equal((await request('/api/rubric-templates',h.payload(),{'X-Workspace-Id':sha(h.who.principal)})).status,200);assert.equal(h.db.prepare('SELECT COUNT(*) n FROM teacher_rubric_templates').get()!.n,1);
 }finally{globalThis.fetch=originalFetch;h.close();}
});
