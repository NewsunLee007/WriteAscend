import test from 'node:test';
import assert from 'node:assert/strict';
import {sandbox,fixture} from './helpers/bound-sandbox';
import {handleModelApi} from '../worker/model-jobs';
import {handleLocalRelay,handleLocalStatus} from '../worker/local-relay';
import {readPersonalModel,validatePersonalEndpoint} from '../worker/personal-models';
import {localModelOptions} from '../src/teacher/local-models';
import {localBase as browserBase} from '../src/teacher/local-model-url';
import {discoverLocal,executeLocal,localBase} from '../src/teacher/local-relay-runner.mjs';
const token=Buffer.alloc(32,3).toString('base64url');
async function setup(){const h=await sandbox();h.env.MODEL_VAULT_KEY=Buffer.alloc(32,1).toString('base64url');
 async function api(path:string,body?:any,method=body?'POST':'GET',who=h.session){try{const response=(await handleModelApi(new Request('https://write.test'+path,{method}),h.env,who,async()=>body,h.bridge))!;return {status:response.status,body:await response.json() as any};}catch(e:any){return {status:e.status,body:{error:{message:e.message}}};}}
 const draft={requestId:crypto.randomUUID(),expectedRevision:0,provider:'local-relay',model:'qwen3-vl:8b',label:'办公室电脑',apiKey:token,supportsImages:true,purposes:['grading','ocr'],timeoutMs:300000};const created=await api('/api/model/personal',draft);assert.equal(created.status,200,JSON.stringify(created));const id=created.body.profileId;
 async function relay(action:string,body:any,credential=id+'.'+token){try{const response=(await handleLocalRelay(new Request('https://write.test/api/local-relay/'+action,{method:'POST',headers:{Authorization:'Bearer '+credential}}),h.env,async()=>body,h.bridge))!;return {status:response.status,body:await response.json() as any};}catch(e:any){return {status:e.status,body:{error:{message:e.message}}};}}
 const poll=()=>relay('poll',{ready:true,models:[{id:'qwen3-vl:8b',vision:true},{id:'text-model',vision:false}]});
 return {...h,api,relay,poll,id,draft};}
test('outbound local connector grades a bound manuscript and publishes through the existing student-account workflow without any provider call',async()=>{
 const h=await setup();try{
  await h.collect();const input=await h.inputFor(),created=await h.create({...input,profileId:h.id});assert.equal(created.status,202,JSON.stringify(created));await h.drain();assert.equal(h.calls.length,0);assert.equal(h.run(created.body.run.id).state,'running');
  const received=await h.poll();assert.equal(received.status,200,JSON.stringify(received));const job=received.body.job;assert(job);assert.equal(job.payload.model,'qwen3-vl:8b');assert(JSON.stringify(job.payload).includes('data:image/png;base64,'));assert(!JSON.stringify(job).includes(token));
  assert.equal((await h.poll()).body.job,null);const answer={jobId:job.id,lease:job.lease,response:fixture.response};assert.equal((await h.relay('result',answer)).status,200);assert.equal((await h.relay('result',answer)).status,200);await h.drain();assert.equal(h.run(created.body.run.id).state,'ready');assert.equal(h.calls.length,0);
  const released=await h.request('/api/writing-reports/'+created.body.run.id+'/publication',{requestId:crypto.randomUUID(),expectedPublicationVersion:0,expectedReportRevision:1,inputHash:input.inputHash,teacherConfirmed:true});assert.equal(released.status,200,JSON.stringify(released));
  const pupil={...h.session,principal:'wordup:student-0',subject:'student-0',role:'student',scopes:['writing.own'],classes:[]};const report=await h.request('/api/student/reports/'+input.draftId,undefined,'GET',pupil);assert.equal(report.status,200);assert.equal(report.body.result.total_score,15.5);assert.equal((await h.relay('result',answer)).status,200);assert.equal(h.calls.length,0);
 }finally{h.close();}
});
test('local credentials isolate devices and teachers; private addresses remain forbidden to the cloud provider transport',async()=>{
 const h=await setup();try{
  assert.equal((await h.relay('poll',{},h.id+'.'+Buffer.alloc(32,4).toString('base64url'))).status,401);assert.equal((await h.relay('poll',{},'')).status,401);
  const other={...h.session,principal:'wordup:other',subject:'other'};assert(!(await h.api('/api/model/profiles',undefined,'GET',other)).body.profiles.some((p:any)=>p.id===h.id));
  const profiles=await h.api('/api/model/profiles');assert.equal(profiles.body.profiles.find((p:any)=>p.id===h.id).transport,'local-relay');assert(!JSON.stringify(profiles).includes(token));assert(!JSON.stringify(await h.api('/api/model/settings')).includes(token));
  await h.poll();const status=await handleLocalStatus(new Request('https://write.test/api/model/local-status'),h.env,other);assert.deepEqual((await status!.json() as any).connections,[]);await assert.rejects(handleLocalStatus(new Request('https://write.test/api/model/local-status'),h.env,{...h.session,role:'student'}),(e:any)=>e.status===403);
  for(const url of ['http://127.0.0.1:11434/v1','http://192.168.1.5:1234/v1','https://local-model.invalid/v1'])assert.throws(()=>validatePersonalEndpoint(url,h.env));
  assert.equal((await h.api('/api/model/personal',{...h.draft,requestId:crypto.randomUUID(),apiKey:'too-short-local-token'})).status,400);
 }finally{h.close();}
});
test('result recovery is idempotent after an uncertain dispatch, with no automatic local or cloud reinference',async()=>{
 const h=await setup();try{
  const created=await h.api('/api/model/jobs',{requestId:crypto.randomUUID(),profileId:h.id,payload:{messages:[{role:'user',content:'Synthetic prompt.'}]}});await h.drain();const job=(await h.poll()).body.job;assert(job);assert.equal((await h.relay('result',{jobId:job.id,lease:job.lease,error:true})).status,200);assert.equal(h.db.prepare('SELECT state FROM model_jobs WHERE id=?').get(job.id)!.state,'uncertain');assert.equal((await h.poll()).body.job,null);
  assert.equal((await h.relay('result',{jobId:job.id,lease:crypto.randomUUID(),response:fixture.response})).status,404);assert.equal((await h.relay('result',{jobId:job.id,lease:job.lease,response:fixture.response})).status,200);assert.equal((await h.api('/api/model/jobs/'+created.body.id+'/result')).status,200);assert.equal(h.calls.length,0);
 }finally{h.close();}
});
test('revocation, changed configuration, paused grading and revoked class permissions reject late local results',async()=>{
 for(const variant of ['remove','config','logout','class','pause']){const h=await setup();try{
  await h.collect();const created=await h.create({...await h.inputFor(),profileId:h.id});await h.drain();const job=(await h.poll()).body.job;assert(job);
  if(variant==='remove')await h.api('/api/model/personal/'+h.id,{requestId:crypto.randomUUID(),expectedRevision:1},'DELETE');
  if(variant==='config')await h.api('/api/model/personal/'+h.id,{...h.draft,requestId:crypto.randomUUID(),expectedRevision:1,model:'qwen3-vl:4b',apiKey:''},'PUT');
  if(variant==='logout')h.db.prepare("INSERT INTO background_grant_revocations VALUES(?,?,'logout')").run(h.session.grant_id,Date.now());
  if(variant==='class')h.flags({revoked:true});if(variant==='pause')h.db.prepare("UPDATE grading_runs SET state='cancelled' WHERE id=?").run(created.body.run.id);
  const returned=await h.relay('result',{jobId:job.id,lease:job.lease,response:fixture.response});assert([401,403,409].includes(returned.status),variant+JSON.stringify(returned));assert.notEqual(h.db.prepare('SELECT state FROM model_jobs WHERE id=?').get(job.id)!.state,'succeeded');assert.equal(h.calls.length,0);
 }finally{h.close();}}
});
test('model discovery prioritizes server vision capability over names; local execution never receives website credentials',async()=>{
 const requests:any[]=[];const config={runtime:'ollama',baseUrl:'http://127.0.0.1:11434/v1',apiKey:'private-local-key'};
 const mock=async(url:any,options:any={})=>{requests.push({url:String(url),options});if(String(url).endsWith('/models'))return Response.json({data:[{id:'custom-camera'},{id:'qwen3-vl:8b'},{id:'text-embedding'}]});const id=JSON.parse(options.body).model;return Response.json({capabilities:id==='custom-camera'?['completion','vision']:['completion']});};
 const discovered=await discoverLocal(config,mock as any);assert.deepEqual(localModelOptions(discovered).map(m=>m.id),['custom-camera']);assert(requests.every(r=>r.options.headers.Authorization==='Bearer private-local-key'));
 const response=await executeLocal(config,{payload:{model:'custom-camera',messages:[]},timeoutMs:1000},async(url:any,options:any)=>{assert.equal(String(url),'http://127.0.0.1:11434/v1/chat/completions');assert.equal(options.headers.Authorization,'Bearer private-local-key');assert(!JSON.stringify(options).includes(token));return Response.json({choices:[{message:{content:'private-local-key answer'}}]});});assert.equal(response.choices[0].message.content,'[redacted] answer');
 const lm=await discoverLocal({...config,runtime:'lmstudio'},async(url:any)=>Response.json(String(url).includes('/api/v1/')?{models:[{key:'custom-camera',capabilities:{vision:true}},{key:'qwen3-vl:8b',capabilities:{vision:false}}]}:{data:[{id:'custom-camera'},{id:'qwen3-vl:8b'}]}));assert.deepEqual(localModelOptions(lm).map(m=>m.id),['custom-camera']);
 for(const url of ['http://localhost:11434/v1/','http://192.168.1.10:1234/v1','https://models.school.edu/v1/chat/completions'])assert.equal(localBase(url),browserBase(url));for(const url of ['file:///etc/passwd','http://public.example.com/v1','http://localhost/v1?key=x','http://user:pass@localhost/v1']){assert.throws(()=>localBase(url));assert.throws(()=>browserBase(url));}
});

test('downloadable connector survives a lost result acknowledgement and restarts by uploading the saved result without a second inference',async()=>{
 const fs=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path'),{spawn}=await import('node:child_process');
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'writeascend-local-recovery-')),profile='personal_'+ 'f'.repeat(32),cache=path.join(folder,'.writeascend/local-results',profile+'.json');
 const runnerUrl=new URL('../src/teacher/local-relay-runner.mjs',import.meta.url).href;
 const config={origin:'https://write.test',profileId:profile,token,baseUrl:'http://127.0.0.1:11434/v1',runtime:'compatible',apiKey:'only-on-local-computer'};
 const script=(phase:number)=>`import fs from 'node:fs/promises';import {runRelay} from ${JSON.stringify(runnerUrl)};
 globalThis.fetch=async(url,options={})=>{const u=String(url);
 if(u.endsWith('/v1/models'))return Response.json({data:[{id:'camera-model',capabilities:{vision:true}}]});
 if(u.endsWith('/v1/chat/completions')){if(${phase}!==1)throw Error('Repeated inference');await fs.appendFile(${JSON.stringify(path.join(folder,'calls'))},'1');return Response.json({choices:[{message:{content:'saved-local-answer'}}]});}
 if(u.endsWith('/poll')){if(${phase}===2)throw Object.assign(Error('RECOVERED'),{fatal:true});return Response.json({job:{id:'synthetic-job',lease:'synthetic-lease',payload:{model:'camera-model',messages:[]},timeoutMs:1000}});}
 if(u.endsWith('/result')){if(${phase}===1)throw Error('Synthetic network loss after inference');const body=JSON.parse(options.body);if(body.response.choices[0].message.content!=='saved-local-answer')throw Error('Wrong resumed result');return Response.json({ok:true});}throw Error('Unexpected request');};
 try{await runRelay(${JSON.stringify(config)});}catch(e){if(${phase}===2&&e.message==='RECOVERED')process.exit(0);throw e;}`;
 async function child(phase:number){return new Promise<{code:number|null;output:string}>((resolve,reject)=>{const proc=spawn(process.execPath,['--input-type=module','-e',script(phase)],{env:{...process.env,HOME:folder},stdio:['ignore','pipe','pipe']});let output='';const timer=setTimeout(()=>{proc.kill('SIGKILL');reject(Error('Local connector recovery test timed out'));},10000);proc.on('error',reject);proc.stdout.on('data',chunk=>{output+=chunk.toString();if(phase===1&&output.includes('连接暂时中断'))proc.kill('SIGTERM');});proc.stderr.on('data',chunk=>{output+=chunk.toString();});proc.on('close',code=>{clearTimeout(timer);resolve({code,output});});});}
 try{await child(1);const saved=JSON.parse(await fs.readFile(cache,'utf8'));assert.equal(saved.response.choices[0].message.content,'saved-local-answer');assert.equal((await fs.stat(cache)).mode&0o777,0o600);const resumed=await child(2);assert.equal(resumed.code,0,resumed.output);assert(resumed.output.includes('结果已保存'));await assert.rejects(fs.stat(cache),(e:any)=>e.code==='ENOENT');assert.equal(await fs.readFile(path.join(folder,'calls'),'utf8'),'1');}finally{await fs.rm(folder,{recursive:true,force:true});}
});
