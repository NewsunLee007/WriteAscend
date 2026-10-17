import test from 'node:test';
import assert from 'node:assert/strict';
import {sandbox,fixture} from './helpers/bound-sandbox';
import {handleModelApi,consumeModelJobs} from '../worker/model-jobs';
import {readPersonalModel,personalModelKey,validatePersonalEndpoint} from '../worker/personal-models';
const vault1=Buffer.alloc(32,1).toString('base64url'),vault2=Buffer.alloc(32,2).toString('base64url');
const secretA='synthetic-personal-secret-A',secretB='synthetic-personal-secret-B';
const id=()=>crypto.randomUUID();
async function prepared(){const h=await sandbox();h.env.MODEL_VAULT_KEY=vault1;h.env.MODEL_VAULT_KEY_ID='one';
 async function api(path:string,body?:any,method=body?'POST':'GET',who=h.session){try{const response=(await handleModelApi(new Request('https://write.test'+path,{method}),h.env,who,async()=>body,h.bridge))!;return {status:response.status,body:await response.json() as any};}catch(e:any){return {status:e.status,body:{error:{message:e.message,code:e.code}}};}}
 const draft=(changes:any={})=>({requestId:id(),expectedRevision:0,provider:'custom',apiUrl:'https://vision.vendor.example.com/v1',label:'我的视觉模型',model:'personal-vision',apiKey:secretA,supportsImages:true,purposes:['grading','ocr'],...changes});
 async function create(changes:any={}){const body=draft(changes),result=await api('/api/model/personal',body);assert.equal(result.status,200,JSON.stringify(result));return {input:body,id:result.body.profileId};}
 return {...h,api,draft,createProfile:create};}
test('personal credentials are encrypted, bound to owner/profile/version, absent from metadata and isolated from other teachers and students',async()=>{
 const h=await prepared();try{
  const p=await h.createProfile(),row=(await readPersonalModel(h.env,h.session.principal,p.id))!;assert(row.credential_cipher&&!row.credential_cipher.includes(secretA));assert.equal(await personalModelKey(h.env,row),secretA);await assert.rejects(personalModelKey(h.env,{...row,owner:'wordup:other'}));await assert.rejects(personalModelKey(h.env,{...row,credential_revision:2}));
  const settings=await h.api('/api/model/settings'),catalog=await h.api('/api/model/profiles');assert(settings.body.vaultReady);assert.equal(settings.body.profiles[0].apiUrl,'https://vision.vendor.example.com/v1/chat/completions');assert(!JSON.stringify(settings.body).includes(secretA));assert(!JSON.stringify(catalog.body).includes('apiUrl'));assert(!JSON.stringify(catalog.body).includes('credential'));
  const other={...h.session,principal:'wordup:other',subject:'other'};assert.equal((await h.api('/api/model/settings',undefined,'GET',other)).body.profiles.length,0);assert(!(await h.api('/api/model/profiles',undefined,'GET',other)).body.profiles.some((r:any)=>r.id===p.id));assert.equal((await h.api('/api/model/personal/'+p.id,{...p.input,requestId:id(),expectedRevision:1},'PUT',other)).status,404);assert.equal((await h.api('/api/model/settings',undefined,'GET',{...h.session,role:'student'})).status,403);
  const outsider=await h.api('/api/model/jobs',{profileId:p.id,requestId:id(),payload:{messages:[{role:'user',content:'Private work'}]}},'POST',other);assert.equal(outsider.status,400);assert.equal(h.calls.length,0);
 }finally{h.close();}
});
test('configuration saves are idempotent and versioned; label edits preserve execution while concurrent changes cannot overwrite a newer key',async()=>{
 const h=await prepared();try{
  const p=await h.createProfile();assert.equal((await h.api('/api/model/personal',p.input)).body.profileId,p.id);const first=(await readPersonalModel(h.env,h.session.principal,p.id))!;
  const renamed={...p.input,requestId:id(),expectedRevision:1,label:'便于辨认的新名称',apiKey:''},saved=await h.api('/api/model/personal/'+p.id,renamed,'PUT');assert.equal(saved.status,200);const second=(await readPersonalModel(h.env,h.session.principal,p.id))!;assert.equal(second.execution_revision,first.execution_revision);assert.equal(second.credential_cipher,first.credential_cipher);assert.equal(second.revision,2);
  const results=await Promise.all([h.api('/api/model/personal/'+p.id,{...renamed,requestId:id(),expectedRevision:2,apiKey:secretB},'PUT'),h.api('/api/model/personal/'+p.id,{...renamed,requestId:id(),expectedRevision:2,label:'另一设备修改'},'PUT')]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal((await readPersonalModel(h.env,h.session.principal,p.id))!.revision,3);
  assert.equal((await h.api('/api/model/personal',{...p.input,apiKey:secretB})).status,409);
  for(const table of ['personal_model_operations','personal_model_revisions']){const stored=JSON.stringify(h.db.prepare('SELECT * FROM '+table).all());assert(!stored.includes(secretA)&&!stored.includes(secretB));assert(!stored.includes('credential_cipher'));}assert.equal(h.calls.length,0);
 }finally{h.close();}
});
test('key rotation stops an old bound run and an explicit new run recovers with the selected private model without changing old results',async()=>{
 const h=await prepared();try{
  const p=await h.createProfile();await h.collect();const input=await h.inputFor(),first=await h.create({...input,profileId:p.id});assert.equal(first.status,202,JSON.stringify(first));assert.equal((await h.api('/api/model/personal/'+p.id,{...p.input,requestId:id(),expectedRevision:1,apiKey:secretB},'PUT')).status,200);await h.drain();assert.equal(h.run(first.body.run.id).state,'failed');assert.equal(h.calls.length,0);
  const next=await h.create({...input,requestId:id(),profileId:p.id,previousRunId:first.body.run.id,reason:'配置更新后明确重新调用模型批阅',confirmBillable:true});assert.equal(next.status,202,JSON.stringify(next));const oldFetch=globalThis.fetch;globalThis.fetch=async(url,options)=>{assert.equal(String(url),'https://vision.vendor.example.com/v1/chat/completions');assert.equal(new Headers(options?.headers).get('Authorization'),'Bearer '+secretB);return oldFetch(url,options);};
  const response=structuredClone(fixture.response),answer=JSON.parse(response.choices[0].message.content);answer.brief_comment+=' '+secretB;response.choices[0].message.content=JSON.stringify(answer);h.provider(()=>Response.json(response));await h.drain();assert.equal(h.run(next.body.run.id).state,'ready');assert.equal(h.calls.length,1);const report=await h.request('/api/writing-reports/'+next.body.run.id);assert(!JSON.stringify(report.body).includes(secretB));assert(report.body.document.result.brief_comment.includes('[redacted]'));assert.equal((await h.api('/api/model/personal/'+p.id,{requestId:id(),expectedRevision:2},'DELETE')).status,200);assert.equal((await h.request('/api/writing-reports/'+next.body.run.id)).status,200);
 }finally{h.close();}
});
test('profile removal during dispatch blocks a queued request and clears only the active credential, preserving audit metadata',async()=>{
 const h=await prepared();try{
  const p=await h.createProfile(),created=await h.api('/api/model/jobs',{profileId:p.id,requestId:id(),payload:{messages:[{role:'user',content:'Synthetic private prompt.'}]}});assert.equal(created.status,202);let removed=false;
  const bridge=async(env:any,path:string,body:any)=>{const access=await h.bridge(env,path,body);if(path==='work/introspect'&&!removed){removed=true;assert.equal((await h.api('/api/model/personal/'+p.id,{requestId:id(),expectedRevision:1},'DELETE')).status,200);}return access;};
  await consumeModelJobs({messages:[{body:{jobId:created.body.id},ack(){},retry(){throw Error('Deleted key should terminate');}}]} as any,h.env,bridge);assert.equal(h.calls.length,0);assert.equal(h.db.prepare('SELECT error_status FROM model_jobs WHERE id=?').get(created.body.id)!.error_status,409);const raw=h.db.prepare('SELECT * FROM personal_model_profiles WHERE id=?').get(p.id)!;assert.equal(raw.credential_cipher,null);assert.equal(raw.status,'deleted');assert.equal((await h.api('/api/model/settings')).body.profiles.length,0);
 }finally{h.close();}
});
test('vault key IDs support a rotation window and fail closed when a required old encryption key is unavailable',async()=>{
 const h=await prepared();try{
  const p=await h.createProfile(),old=(await readPersonalModel(h.env,h.session.principal,p.id))!;h.env.MODEL_VAULT_KEY=vault2;h.env.MODEL_VAULT_KEY_ID='two';h.env.MODEL_VAULT_PREVIOUS_KEYS=JSON.stringify({one:vault1});assert.equal(await personalModelKey(h.env,old),secretA);
  assert.equal((await h.api('/api/model/personal/'+p.id,{...p.input,requestId:id(),expectedRevision:1,apiKey:secretB},'PUT')).status,200);const current=(await readPersonalModel(h.env,h.session.principal,p.id))!;assert.equal(current.credential_key_id,'two');delete h.env.MODEL_VAULT_PREVIOUS_KEYS;await assert.rejects(personalModelKey(h.env,old));assert.equal(await personalModelKey(h.env,current),secretB);
  delete h.env.MODEL_VAULT_KEY;assert.equal((await h.api('/api/model/settings')).body.vaultReady,false);assert.equal((await h.api('/api/model/profiles')).body.profiles.find((r:any)=>r.id===p.id).available,false);assert.equal((await h.api('/api/model/personal/'+p.id,{requestId:id(),expectedRevision:2},'DELETE')).status,200);
 }finally{h.close();}
});
test('provider protocol options reach the wire and private model quota, endpoint and logout guards are enforced',async()=>{
 const h=await prepared();try{
  const p=await h.createProfile({provider:'openai'}),job=await h.api('/api/model/jobs',{profileId:p.id,requestId:id(),payload:{messages:[{role:'user',content:'Synthetic prompt.'}],temperature:0.25}});assert.equal(job.status,202);const fetchModel=globalThis.fetch;globalThis.fetch=async(url,options)=>{const payload=JSON.parse(options?.body as string);assert.equal(payload.max_completion_tokens,10000);assert(!('max_tokens' in payload));assert(!('temperature' in payload));return fetchModel(url,options);};await consumeModelJobs({messages:[{body:{jobId:job.body.id},ack(){},retry(){throw Error('Unexpected retry');}}]} as any,h.env,h.bridge);assert.equal(h.calls.length,1);
  for(const value of ['http://api.example.com/v1','https://127.0.0.1/v1','https://[::1]/v1','https://169.254.169.254/v1','https://user:password@api.example.com/v1','https://api.example.com:8443/v1','https://api.example.com/v1?key=x','https://write.test/v1','https://internal/v1','https://api.internal/v1'])assert.throws(()=>validatePersonalEndpoint(value,h.env),value);
  for(let i=1;i<8;i++)await h.createProfile({label:'配置 '+i});assert.equal((await h.api('/api/model/personal',h.draft())).status,409);assert.equal(h.db.prepare("SELECT COUNT(*) n FROM personal_model_profiles WHERE status='active'").get()!.n,8);
  h.db.prepare("INSERT INTO background_grant_revocations VALUES(?,?,'logout')").run(h.session.grant_id,Date.now());assert.equal((await h.api('/api/model/personal/'+p.id,{requestId:id(),expectedRevision:1},'DELETE')).status,409);
 }finally{h.close();}
});
test('regrading an uncertain paid request with another model still requires explicit uncertainty confirmation',async()=>{
 const h=await prepared();try{
  await h.collect();h.provider(()=>{throw Error('Synthetic response unknown');});const input=await h.inputFor(),first=await h.create(input);await h.drain();assert.equal(h.run(first.body.run.id).state,'uncertain');const p=await h.createProfile();
  const body={...input,requestId:id(),profileId:p.id,previousRunId:first.body.run.id,reason:'已核对原请求后改用个人模型批阅',confirmBillable:true};assert.equal((await h.create(body)).body.error.code,'grading_uncertain_confirmation');const accepted=await h.create({...body,requestId:id(),confirmUncertain:true});assert.equal(accepted.status,202,JSON.stringify(accepted));h.provider(()=>Response.json(fixture.response));await h.drain();assert.equal(h.calls.length,2);assert.equal(h.run(accepted.body.run.id).state,'ready');
 }finally{h.close();}
});

test('a stale selected execution version cannot enqueue a new private request after a credential change',async()=>{
 const h=await prepared();try{const p=await h.createProfile(),before=(await readPersonalModel(h.env,h.session.principal,p.id))!.execution_revision;assert.equal((await h.api('/api/model/personal/'+p.id,{...p.input,requestId:id(),expectedRevision:1,apiKey:secretB},'PUT')).status,200);const rejected=await h.api('/api/model/jobs',{profileId:p.id,configurationVersion:before,requestId:id(),payload:{messages:[{role:'user',content:'Old browser configuration'}]}});assert.equal(rejected.status,409);assert.equal(rejected.body.error.code,'model_profile_changed');assert.equal(h.db.prepare('SELECT COUNT(*) n FROM model_jobs').get()!.n,0);assert.equal(h.calls.length,0);await h.collect();const input=await h.inputFor();assert.equal((await h.create({...input,profileId:p.id,configurationVersion:before})).body.error.code,'model_profile_changed');}finally{h.close();}
});
