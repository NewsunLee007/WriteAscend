import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {sqlD1} from './helpers/sql-d1';
import {handleLegacyArchive} from '../worker/legacy-archive';
import {HttpError} from '../worker/errors';
import {importLegacy} from '../src/report/legacy-import';
import {sampleBackup,sampleResult} from '../src/report/fixtures';
import type {Env} from '../worker/index';

function sandbox(){
 const db=new DatabaseSync(':memory:');for(const name of fs.readdirSync('migrations').filter(n=>n.endsWith('.sql')).sort())db.exec(fs.readFileSync('migrations/'+name,'utf8'));
 const objects=new Map<string,string>(),d1=sqlD1(db);let unavailable=false,beforeGet:(()=>Promise<void>)|null=null,largestBatch=0;
 const env={DB:{...d1,batch:async(statements:any[])=>{largestBatch=Math.max(largestBatch,statements.length);assert(statements.length<=40);return d1.batch(statements);}},FILES:{put:async(key:string,body:string)=>{if(unavailable)throw Error('synthetic unavailable');objects.set(key,body);},get:async(key:string)=>{if(beforeGet)await beforeGet();if(unavailable)throw Error('synthetic unavailable');const value=objects.get(key);return value===undefined?null:{body:new Response(value).body,json:async()=>JSON.parse(value)};}}} as unknown as Env;
 async function request(path:string,body?:unknown,method=body===undefined?'GET':'POST',owner='wordup:teacher-1',role='teacher'){
  const req=new Request('https://writing.test'+path,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  try{return (await handleLegacyArchive(req,env,{principal:owner,role},r=>r.json()))!;}catch(e){if(e instanceof HttpError)return Response.json({error:{message:e.message,code:e.code}},{status:e.status});throw e;}
 }
 const body=async(r:Promise<Response>)=>await(await r).json() as any;
 return {db,objects,env,request,body,unavailable:(v:boolean)=>{unavailable=v;},beforeGet:(fn:(()=>Promise<void>)|null)=>{beforeGet=fn;},largestBatch:()=>largestBatch,close:()=>db.close()};
}
const payload=(count:number)=>({...sampleBackup,config:{apiKey:'synthetic-private-key',headers:{Authorization:'synthetic-private-bearer'}},unknown_business_field:{keep:'原业务内容'},files:Array.from({length:count},(_,i)=>({id:'old-'+i,result:{...sampleResult,student_name:'合成学生'+i,student_id:'old-id-'+i,original_image_urls:['https://unrelated.invalid/photo']}}))});

test('more than 100 old reports import in bounded resumable chunks, preserve full content, and paginate without duplicate students',async()=>{
 const h=sandbox();try{
  const source=payload(137),r=await h.request('/api/legacy-imports',{schema:'newsun-legacy-import-request-v1',label:'合成旧备份',payload:source});assert.equal(r.status,202);let value=await r.json() as any,batch=value.batch;
  assert.equal(batch.processedCount,10);assert.equal(batch.reportCount,137);assert.equal(h.db.prepare('SELECT count(*) n FROM private_reports').get()!.n,10);
  assert(![...h.objects.values()][0].includes('synthetic-private'));assert.equal(JSON.parse([...h.objects.values()][0]).unknown_business_field.keep,'原业务内容');
  while(batch.status==='pending')batch=(await h.body(h.request('/api/legacy-imports/'+batch.id+'/continue',{}))).batch;
  assert.equal(batch.processedCount,137);assert(h.largestBatch()<=40);assert.equal(h.db.prepare('SELECT count(*) n FROM private_reports').get()!.n,137);
  const again=await h.body(h.request('/api/legacy-imports',{schema:'newsun-legacy-import-request-v1',label:'重命名文件',payload:source}));assert.equal(again.batch.id,batch.id);assert.equal(again.batch.label,'合成旧备份');assert.equal(h.db.prepare('SELECT count(*) n FROM legacy_import_members').get()!.n,137);
  const seen=new Set<string>();let cursor:string|null=null;
  do{const page=await h.body(h.request('/api/reports'+(cursor?'?cursor='+encodeURIComponent(cursor):'')));for(const report of page.reports){assert(!seen.has(report.cloudId));seen.add(report.cloudId);assert.equal(report.identity.status,'unlinked');assert.equal(report.result.total_score,sampleResult.total_score);assert(!report.result.original_image_urls);assert.equal(report.result.content_logic,sampleResult.content_logic);}cursor=page.nextCursor;}while(cursor);
  assert.equal(seen.size,137);const download=await h.request('/api/legacy-imports/'+batch.id+'/source');assert.equal(download.status,200);assert(download.headers.get('cache-control')!.includes('no-store'));assert.equal((await download.json() as any).files.length,137);
  assert.equal(h.db.prepare('SELECT count(*) n FROM writing_tasks').get()!.n,0);assert.equal((await h.request('/api/legacy-imports/'+batch.id+'/source',undefined,'GET','wordup:teacher-2')).status,404);assert.equal((await h.request('/api/reports',undefined,'GET','wordup:student-1','student')).status,403);
  assert.equal(h.db.prepare('SELECT count(*) n FROM model_jobs').get()!.n,0);
 }finally{h.close();}
});
test('storage failure leaves completed chunks intact and retry does not overwrite teacher edits',async()=>{
 const h=sandbox();try{
  const initial=await h.body(h.request('/api/legacy-imports',payload(23))),id=initial.batch.id,page=await h.body(h.request('/api/reports')),report=page.reports[0];
  const edited={...report.result,brief_comment:'教师保留的修改'};assert.equal((await h.request('/api/reports/'+report.cloudId,{revision:1,result:edited},'PATCH')).status,200);
  h.unavailable(true);assert.equal((await h.request('/api/legacy-imports/'+id+'/continue',{})).status,503);assert.equal(h.db.prepare('SELECT count(*) n FROM private_reports').get()!.n,10);h.unavailable(false);
  await h.request('/api/legacy-imports/'+id+'/continue',{});await h.request('/api/legacy-imports/'+id+'/continue',{});await h.request('/api/legacy-imports',payload(23));
  const current=await h.body(h.request('/api/reports/'+report.cloudId));assert.equal(current.report.revision,2);assert.equal(current.report.result.brief_comment,'教师保留的修改');
  assert.equal((await h.request('/api/reports/'+report.cloudId,{revision:1,result:edited},'PATCH')).status,409);
 }finally{h.close();}
});
test('concurrent continuations use one lease and withdrawal during a read prevents later row writes',async()=>{
 const h=sandbox();try{
  const initial=await h.body(h.request('/api/legacy-imports',payload(35))),id=initial.batch.id;let release!:()=>void,entered!:()=>void;
  const waiting=new Promise<void>(r=>{release=r;}),ready=new Promise<void>(r=>{entered=r;});h.beforeGet(async()=>{entered();await waiting;});
  const first=h.request('/api/legacy-imports/'+id+'/continue',{});await ready;const second=await h.request('/api/legacy-imports/'+id+'/continue',{});assert.equal(second.status,409);release();assert.equal((await first).status,200);h.beforeGet(null);
  const current=(await h.body(h.request('/api/legacy-imports/'+id))).batch;assert.equal(current.processedCount,20);
  h.beforeGet(async()=>{h.beforeGet(null);assert.equal((await h.request('/api/legacy-imports/'+id,{revision:current.revision},'DELETE')).status,200);});
  assert.equal((await h.request('/api/legacy-imports/'+id+'/continue',{})).status,409);assert.equal(h.db.prepare('SELECT count(*) n FROM private_reports').get()!.n,20);assert.equal((await h.body(h.request('/api/reports'))).reports.length,0);
 }finally{h.close();}
});
test('withdrawal preserves shared or edited reports, and replay does not silently restore a withdrawn backup',async()=>{
 const h=sandbox();try{
  const a=(await h.body(h.request('/api/legacy-imports',{...sampleBackup,source:'A'}))).batch,b=(await h.body(h.request('/api/legacy-imports',{...sampleBackup,source:'B'}))).batch;
  assert.equal(h.db.prepare('SELECT count(*) n FROM private_reports').get()!.n,1);
  const row=(await h.body(h.request('/api/reports'))).reports[0];
  await h.request('/api/legacy-imports/'+a.id,{revision:a.revision},'DELETE');assert.equal((await h.body(h.request('/api/reports'))).reports.length,1);
  await h.request('/api/legacy-imports/'+b.id,{revision:b.revision},'DELETE');assert.equal((await h.request('/api/reports/'+row.cloudId)).status,404);
  assert.equal((await h.request('/api/legacy-imports',{...sampleBackup,source:'A'})).status,409);
  const withdrawn=(await h.body(h.request('/api/legacy-imports/'+a.id))).batch,restored=(await h.body(h.request('/api/legacy-imports/'+a.id+'/restore',{revision:withdrawn.revision}))).batch;
  assert.equal((await h.request('/api/legacy-imports/'+a.id,{revision:a.revision},'DELETE')).status,409);
  const current=(await h.body(h.request('/api/reports/'+row.cloudId))).report;await h.request('/api/reports/'+row.cloudId,{revision:current.revision,result:{...current.result,brief_comment:'人工修改保留'}},'PATCH');
  await h.request('/api/legacy-imports/'+a.id,{revision:restored.revision},'DELETE');assert.equal((await h.body(h.request('/api/reports'))).reports[0].result.brief_comment,'人工修改保留');
  assert.equal((await h.request('/api/legacy-imports/'+a.id+'/restore',{revision:restored.revision},'POST','wordup:teacher-2')).status,404);
 }finally{h.close();}
});
test('old six-column imports remain schema-compatible and can gain a resumable index without duplicating reports',async()=>{
 const h=sandbox();try{
  const bundle=await importLegacy(sampleBackup),id=crypto.randomUUID(),key='legacy/original.json',stamp=new Date().toISOString();h.objects.set(key,JSON.stringify(bundle.sanitizedPayload));
  h.db.prepare('INSERT INTO legacy_import_batches VALUES(?,?,?,?,?,?)').run(id,'wordup:teacher-1',bundle.fingerprint,1,key,stamp);
  const report=bundle.reports[0];h.db.prepare('INSERT INTO private_reports VALUES(?,?,?,?,1,?,?)').run(crypto.randomUUID(),'wordup:teacher-1',report.fingerprint,JSON.stringify(report),stamp,stamp);
  const old=(await h.body(h.request('/api/legacy-imports'))).batches[0];assert.equal(old.legacyIndex,true);
  assert.equal((await h.request('/api/legacy-imports/'+id,{revision:1},'DELETE')).status,409);assert.equal((await h.body(h.request('/api/reports'))).reports.length,1);
  const resumed=await h.body(h.request('/api/legacy-imports',sampleBackup));assert.equal(resumed.batch.id,id);assert.equal(resumed.batch.status,'complete');assert.equal(h.db.prepare('SELECT count(*) n FROM private_reports').get()!.n,1);assert.equal((await h.body(h.request('/api/legacy-imports/'+id+'/reports'))).reports.length,1);
 }finally{h.close();}
});
test('configuration-only backups retain all sanitized business fields without inventing a report',async()=>{
 const h=sandbox();try{
  const saved=await h.body(h.request('/api/legacy-imports',{assignment:{title:'只有设置'},config:{apiKey:'synthetic-private-key',temperature:0.3},csvExportHistory:[{csv:'姓名,分数'}]}));assert.equal(saved.batch.status,'complete');assert.equal(saved.batch.reportCount,0);assert.equal(h.db.prepare('SELECT count(*) n FROM private_reports').get()!.n,0);
  const original=await(await h.request('/api/legacy-imports/'+saved.batch.id+'/source')).json() as any;assert.equal(original.config.temperature,0.3);assert(!original.config.apiKey);assert.equal(original.csvExportHistory[0].csv,'姓名,分数');
 }finally{h.close();}
});
