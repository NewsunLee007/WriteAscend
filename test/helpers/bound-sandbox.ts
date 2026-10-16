import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {sqlD1} from './sql-d1';
import {handleGrading,advanceGradingRun,advanceRunForModelJob,recoverGradingRuns} from '../../worker/grading';
import {handlePublications} from '../../worker/publications';
import {handleCollection} from '../../worker/collection';
import {handleAssets} from '../../worker/assets';
import {consumeModelJobs,handleModelApi} from '../../worker/model-jobs';
import {digest} from '../../src/report/legacy-import';
import {HttpError} from '../../worker/errors';
import type {Env} from '../../worker/index';
import type {TaskSession} from '../../worker/tasks';
export const fixture=JSON.parse(fs.readFileSync('scripts/qa/fixtures/teacher-workflow.json','utf8'));
export const taskId='10000000-0000-4000-8000-000000000001',memberIds=['20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002'];
export async function sandbox(){
 const db=new DatabaseSync(':memory:');for(const f of fs.readdirSync('migrations').filter(f=>f.endsWith('.sql')).sort())db.exec(fs.readFileSync('migrations/'+f,'utf8'));
 const objects=new Map<string,string|Uint8Array>(),queue:any[]=[],calls:any[]=[];let revoked=false,expired=false,reportStorageFails=false;
 const session:TaskSession&{scopes:string[];display_name:string}={principal:'wordup:teacher',provider:'wordup',subject:'teacher',grant_id:'grant-original',role:'teacher',scopes:['writing.personal'],display_name:'合成教师',classes:[{id:'class',name:'示例班',grade:'七年级',academicYear:'2026-1',schoolId:'school',version:1,grantVersion:1,scopes:['roster.read','writing.manage','writing.grade','writing.publish']}]};
 const env={DB:sqlD1(db),PUBLIC_ORIGIN:'https://write.test',MODEL_API_URL:'https://model.invalid/v1/chat/completions',MODEL_NAME:'server-model',MODEL_API_KEY:'synthetic-key-never-use-real',MODEL_JOBS:{send:async(body:any)=>queue.push(body)},FILES:{put:async(key:string,value:string|Uint8Array)=>{if(reportStorageFails&&key.startsWith('writing-reports/'))throw Error('Synthetic report storage failure');objects.set(key,value);},get:async(key:string)=>{const value=objects.get(key);if(value===undefined)return null;return {body:new Response(value as BodyInit).body,json:async()=>new Response(value as BodyInit).json(),arrayBuffer:async()=>new Response(value as BodyInit).arrayBuffer()};}}} as unknown as Env;
 const bridge=async(_env:any,_path:any,body:any)=>{if(expired&&body.grantId==='grant-original')throw new HttpError(401,'Synthetic grant expired');return {active:true,provider:session.provider,subject:session.subject,role:session.role,scopes:['writing.personal'],classes:revoked?[]:session.classes};};
 const document={assignment:fixture.seed.assignment,rubric:fixture.seed.rubric,settings:{languageDifficulty:{enabled:false}},targets:session.classes.map(({scopes,grantVersion,...c})=>c)},contentHash=await digest({title:'合成后台批阅',document}),rubricHash=await digest(document.rubric);objects.set('task-document',JSON.stringify(document));
 db.prepare("INSERT INTO writing_tasks VALUES(?,?,?,'open',2,1,?,?,?,'[]',NULL,2,1,1)").run(taskId,session.principal,'合成后台批阅',contentHash,'task-document',rubricHash);db.prepare('INSERT INTO rubric_versions VALUES(?,1,?,?,?,1)').run(taskId,contentHash,rubricHash,'task-document');
 memberIds.forEach((id,i)=>db.prepare("INSERT INTO task_members VALUES(?,?,1,'wordup',?,'示例同学','class','示例班','school','2026-1','七年级',1,'active',1)").run(id,taskId,'student-'+i));
 async function request(path:string,body?:any,method=body?'POST':'GET',who=session){const req=new Request('https://write.test'+path,{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});try{const r=(await handlePublications(req,env,who,bridge,r=>r.json())||await handleGrading(req,env,who,bridge,r=>r.json())||await handleCollection(req,env,who,bridge,r=>r.json()))!;return {status:r.status,body:await r.json() as any};}catch(e){if(e instanceof HttpError)return {status:e.status,body:{error:{message:e.message,code:e.code}}};throw e;}}
 async function asset(marker:number){const bytes=Buffer.concat([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6b9sAAAAASUVORK5CYII=','base64'),Buffer.from([marker])]),r=await handleAssets(new Request('https://write.test/api/assets',{method:'POST',body:bytes}),env,session.principal);return (await r!.json() as any).id;}
 async function collect(member=0,page=1,count=1,previous=0,marker=member*10+page){return request('/api/tasks/'+taskId+'/collection',{action:'collect',requestId:crypto.randomUUID(),mode:'manual',memberId:memberIds[member],draftNumber:1,pageNumber:page,pageCount:count,assetId:await asset(marker),identityConfirmed:true,expectedPageRevision:previous,identityNote:'合成测试中已核对纸面学生和页码'});}
 async function inputFor(member=0){const c=await request('/api/tasks/'+taskId+'/collection?memberId='+memberIds[member]);return {requestId:crypto.randomUUID(),memberId:memberIds[member],draftId:c.body.draft.id,inputRevision:c.body.draft.inputRevision,inputHash:c.body.draft.inputHash,profileId:'default'};}
 const create=(body:any)=>request('/api/tasks/'+taskId+'/grading',body);
 const run=(id:string)=>db.prepare('SELECT * FROM grading_runs WHERE id=?').get(id) as any;
 let provider:((body:any)=>Response|Promise<Response>)=()=>Response.json(fixture.response);
 const original=globalThis.fetch;globalThis.fetch=async(_url,options)=>{const body=JSON.parse(options?.body as string);calls.push(body);return provider(body);};
 async function drain(limit=40){for(let count=0;queue.length&&count<limit;count++){const body=queue.shift();if(body.runId){await advanceGradingRun(env,body.runId,bridge);continue;}let retry=false;await consumeModelJobs({messages:[{body,ack(){},retry(){retry=true;}}]} as any,env,bridge);if(retry)queue.push(body);await advanceRunForModelJob(env,body.jobId,bridge);}if(queue.length)throw Error('Synthetic queue did not settle');}
 return {db,env,session,objects,queue,calls,bridge,request,asset,collect,inputFor,create,run,drain,provider:(value:typeof provider)=>{provider=value;},flags:(v:any)=>{revoked=!!v.revoked;expired=!!v.expired;reportStorageFails=!!v.reportStorageFails;},close:()=>{globalThis.fetch=original;db.close();}};
}
