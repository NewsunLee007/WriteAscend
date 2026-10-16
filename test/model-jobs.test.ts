import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {sqlD1} from './helpers/sql-d1';
import {handleModelApi,consumeModelJobs,recoverModelOutbox,modelCatalog} from '../worker/model-jobs';
import {HttpError} from '../worker/errors';
import type {Env} from '../worker/index';

const payload={model:'client-chosen-model-is-ignored',messages:[{role:'system',content:'Grade this synthetic essay.'},{role:'user',content:'I helped my friend.'}],temperature:0.25,response_format:{type:'json_object'},apiKey:'client-credential-must-not-be-stored',apiUrl:'https://attacker.invalid'};
const teacher={principal:'wordup:teacher-1',grant_id:'grant-1',role:'teacher'};
const authorized=async()=>({active:true,provider:'wordup',subject:'teacher-1',role:'teacher',scopes:['writing.personal']});
const fixture=JSON.parse(fs.readFileSync(new URL('../scripts/qa/fixtures/teacher-workflow.json',import.meta.url),'utf8'));
function sandbox(){
  const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync(new URL('../migrations/0002_model_jobs.sql',import.meta.url),'utf8'));
  const objects=new Map<string,string>(),sent:any[]=[];
  let brokerDown=false,outputStorageDown=false;
  const env={DB:sqlD1(db),PUBLIC_ORIGIN:'https://writeascend.test',MODEL_API_URL:'https://model.invalid/v1/chat/completions',MODEL_NAME:'server-test-model',MODEL_API_KEY:'synthetic-server-model-key',MODEL_JOBS:{send:async(body:any)=>{if(brokerDown)throw Error('synthetic broker failure');sent.push(body);}},FILES:{put:async(key:string,value:string)=>{if(outputStorageDown&&key.startsWith('model-output/'))throw Error('synthetic R2 failure');objects.set(key,value);},get:async(key:string)=>{const value=objects.get(key);if(value===undefined)return null;return {body:new Response(value).body,json:async()=>JSON.parse(value)};}}} as unknown as Env;
  async function request(path='/api/model/jobs',body:any={profileId:'default',requestId:'synthetic-request-0001',payload},identity=teacher){
    const req=new Request('https://writeascend.test'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
    try{return (await handleModelApi(req,env,identity,req=>req.json()))!;}catch(error){if(error instanceof HttpError)return Response.json({error:{message:error.message}},{status:error.status});throw error;}
  }
  function batch(id:string){const record={acks:0,retries:[] as unknown[]};return {record,message:{body:{jobId:id},ack:()=>{record.acks++;},retry:(options:unknown)=>record.retries.push(options)}};}
  const consume=async(id:string,verify=authorized)=>{const b=batch(id);await consumeModelJobs({messages:[b.message]} as any,env,verify);return b.record;};
  const job=(id:string)=>db.prepare('SELECT * FROM model_jobs WHERE id=?').get(id) as any;
  return {db,env,objects,sent,request,consume,job,broker:(down:boolean)=>{brokerDown=down;},outputStorage:(down:boolean)=>{outputStorageDown=down;},close:()=>db.close()};
}

test('model intake is private, idempotent per teacher, strips client credentials and uses server profile',async()=>{
  const h=sandbox(),originalFetch=globalThis.fetch;let calls=0;
  try{
    const first=await h.request();assert.equal(first.status,202);const id=(await first.json() as any).id;
    assert.equal((await (await h.request()).json() as any).id,id);assert.equal(h.sent.length,1);
    assert.equal((await h.request('/api/model/jobs',{profileId:'default',requestId:'synthetic-request-0001',payload:{...payload,messages:[{role:'user',content:'Different work.'}]}})).status,409);
    const blob=[...h.objects.values()][0];assert(!blob.includes('client-credential'));assert(!blob.includes('attacker.invalid'));
    assert(!JSON.stringify(h.sent).includes('essay'));assert(!JSON.stringify(modelCatalog(h.env)).includes('synthetic-server-model-key'));
    globalThis.fetch=async(_url,options)=>{
      calls++;assert.equal(String(_url),'https://model.invalid/v1/chat/completions');
      assert.equal(new Headers(options?.headers).get('Authorization'),'Bearer synthetic-server-model-key');assert.equal(options?.redirect,'manual');
      const body=JSON.parse(options?.body as string);assert.equal(body.model,'server-test-model');assert.equal(body.max_tokens,10000);assert(!body.apiKey);assert.equal(body.stream,false);
      return Response.json({...fixture.response,providerDebug:'synthetic-server-model-key'});
    };
    await h.consume(id);assert.equal(h.job(id).state,'succeeded');await h.consume(id);assert.equal(calls,1);
    const result=await h.request('/api/model/jobs/'+id+'/result',null);assert.equal(result.status,200);assert.deepEqual(await result.json(),{...fixture.response,providerDebug:'[redacted]'});
    assert.equal((await h.request('/api/model/jobs/'+id+'/result',null,{...teacher,principal:'wordup:other'})).status,404);
    assert.equal((await h.request('/api/model/profiles',null,{...teacher,role:'student'})).status,403);
  }finally{globalThis.fetch=originalFetch;h.close();}
});

test('network ambiguity or output storage failure never automatically repeats a billable model call',async()=>{
  for(const storageFailure of [false,true]){
    const h=sandbox(),originalFetch=globalThis.fetch;let calls=0;
    try{
      const id=(await(await h.request()).json() as any).id;h.outputStorage(storageFailure);
      globalThis.fetch=async()=>{calls++;if(!storageFailure)throw Error('connection lost after submission');return Response.json(fixture.response);};
      await h.consume(id);assert.equal(h.job(id).state,'uncertain');await h.consume(id);assert.equal(calls,1);
      const response=await h.request('/api/model/jobs/'+id+'/result',null);assert.equal(response.status,409);assert.equal((await response.json() as any).error.code,'uncertain');
    }finally{globalThis.fetch=originalFetch;h.close();}
  }
});

test('known provider busy responses have bounded retries; redirects and bad output do not expose provider credentials',async()=>{
  const h=sandbox(),originalFetch=globalThis.fetch;let calls=0;
  try{
    const id=(await(await h.request()).json() as any).id;
    globalThis.fetch=async()=>{calls++;return Response.json({error:'synthetic-server-model-key'},{status:429});};
    assert.equal((await h.consume(id)).retries.length,1);assert.equal((await h.consume(id)).retries.length,1);assert.equal((await h.consume(id)).acks,1);
    assert.equal(calls,3);assert.equal(h.job(id).state,'failed');
    const response=await h.request('/api/model/jobs/'+id+'/result',null);assert.equal(response.status,429);assert(!(await response.text()).includes('synthetic-server-model-key'));
    const redirectId=(await(await h.request('/api/model/jobs',{profileId:'default',requestId:'synthetic-redirect-0001',payload})).json() as any).id;
    globalThis.fetch=async()=>new Response(null,{status:302,headers:{Location:'https://attacker.invalid'}});
    await h.consume(redirectId);assert.equal(h.job(redirectId).state,'failed');
    const malformed=(await(await h.request('/api/model/jobs',{profileId:'default',requestId:'synthetic-bad-json-0001',payload})).json() as any).id;
    globalThis.fetch=async()=>new Response('<html>not JSON</html>');await h.consume(malformed);assert.equal(h.job(malformed).error_status,422);
    const raw=(await(await h.request('/api/model/jobs',{profileId:'default',requestId:'synthetic-raw-fallback-0001',payload})).json() as any).id;
    globalThis.fetch=async()=>new Response('```json\n'+fixture.response.choices[0].message.content+'\n```');
    await h.consume(raw);assert.equal(h.job(raw).state,'succeeded');
    const compatible=await(await h.request('/api/model/jobs/'+raw+'/result',null)).json() as any;
    assert(compatible.choices[0].message.content.startsWith('```json'));
  }finally{globalThis.fetch=originalFetch;h.close();}
});

test('queued work verifies source authority again and freezes the selected model configuration',async()=>{
  const h=sandbox(),originalFetch=globalThis.fetch;let calls=0;
  try{
    globalThis.fetch=async()=>{calls++;return Response.json(fixture.response);};
    const id=(await(await h.request()).json() as any).id;
    await h.consume(id,async()=>({...await authorized(),role:'student'}));assert.equal(h.job(id).error_status,403);assert.equal(calls,0);
    const changed=(await(await h.request('/api/model/jobs',{profileId:'default',requestId:'synthetic-config-change-0001',payload})).json() as any).id;
    h.env.MODEL_NAME='changed-server-model';await h.consume(changed);assert.equal(h.job(changed).error_status,409);assert.equal(calls,0);
  }finally{globalThis.fetch=originalFetch;h.close();}
});

test('outbox recovers a broker failure and leases distinguish safe pre-dispatch retries from uncertain dispatches',async()=>{
  const h=sandbox();try{
    h.broker(true);const id=(await(await h.request()).json() as any).id;assert.equal(h.sent.length,0);assert.equal(h.job(id).state,'queued');
    h.broker(false);await recoverModelOutbox(h.env);assert.equal(h.sent.length,1);await recoverModelOutbox(h.env);assert.equal(h.sent.length,1);
    h.db.prepare("UPDATE model_jobs SET state='preparing',lease_until=0 WHERE id=?").run(id);
    await recoverModelOutbox(h.env);assert.equal(h.job(id).state,'queued');
    h.db.prepare("UPDATE model_jobs SET state='sending',lease_until=0 WHERE id=?").run(id);
    await recoverModelOutbox(h.env);assert.equal(h.job(id).state,'uncertain');
    const sent=h.sent.length;await h.consume(id);assert.equal(h.sent.length,sent);
  }finally{h.close();}
});

test('concurrent queue deliveries cannot dispatch the same model job twice',async()=>{
  const h=sandbox(),originalFetch=globalThis.fetch;let calls=0,release!:()=>void,started!:()=>void;
  const gate=new Promise<void>(resolve=>release=resolve),first=new Promise<void>(resolve=>started=resolve);
  try{
    const id=(await(await h.request()).json() as any).id;
    globalThis.fetch=async()=>{calls++;started();await gate;return Response.json(fixture.response);};
    const running=h.consume(id);await first;
    const duplicate=await h.consume(id);assert.equal(duplicate.retries.length,1);assert.equal(calls,1);
    release();await running;assert.equal(h.job(id).state,'succeeded');assert.equal(calls,1);
  }finally{release();globalThis.fetch=originalFetch;h.close();}
});

test('remote image URLs are rejected and concurrent intake respects the pending-work cap',async()=>{
  const h=sandbox();try{
    assert.equal((await h.request('/api/model/jobs',{profileId:'default',requestId:'synthetic-remote-image-0001',payload:{messages:[{role:'user',content:[{type:'image_url',image_url:{url:'http://127.0.0.1/private'}}]}]}})).status,400);
    const requests=Array.from({length:21},(_,i)=>h.request('/api/model/jobs',{profileId:'default',requestId:'synthetic-concurrent-request-'+i,payload}));
    const results=await Promise.all(requests);assert.equal(results.filter(r=>r.status===202).length,20);assert.equal(results.filter(r=>r.status===429).length,1);assert.equal(h.sent.length,20);
  }finally{h.close();}
});

test('multiple configured providers remain selectable while unconfigured keys and server URLs stay private',async()=>{
  const h=sandbox(),originalFetch=globalThis.fetch;
  try{
    h.env.MODEL_PROFILES=JSON.stringify([
      {id:'first',label:'合成模型一',apiUrl:'https://model.invalid/v1/chat/completions',model:'first-model'},
      {id:'second',label:'合成模型二',apiUrl:'https://second-model.invalid/v1/chat/completions',model:'second-model',keyBinding:'MODEL_KEY_SECOND'},
    ]);
    assert.deepEqual(modelCatalog(h.env).map(p=>p.id),['first']);
    h.env.MODEL_KEY_SECOND='synthetic-second-server-key';
    assert.deepEqual(modelCatalog(h.env).map(p=>p.id),['first','second']);
    const listing=await(await h.request('/api/model/profiles',null)).text();assert(!listing.includes('apiUrl'));assert(!listing.includes('server-key'));
    const id=(await(await h.request('/api/model/jobs',{profileId:'second',requestId:'synthetic-second-provider-0001',payload})).json() as any).id;
    globalThis.fetch=async(url,options)=>{assert.equal(String(url),'https://second-model.invalid/v1/chat/completions');assert.equal(new Headers(options?.headers).get('Authorization'),'Bearer synthetic-second-server-key');assert.equal(JSON.parse(options?.body as string).model,'second-model');return Response.json(fixture.response);};
    await h.consume(id);assert.equal(h.job(id).state,'succeeded');
  }finally{globalThis.fetch=originalFetch;h.close();}
});

test('model capabilities and help links are public metadata, while text-only profiles reject images before queue intake',async()=>{
  const h=sandbox();try{
    h.env.MODEL_PROFILES=JSON.stringify([{id:'text',label:'仅文字',apiUrl:'https://model.invalid/v1/chat/completions',model:'text-model',supportsImages:false,purposes:['grading'],helpUrl:'https://docs.example.test/models'}]);
    const catalog=modelCatalog(h.env);assert.equal(catalog[0].supportsImages,false);assert.deepEqual(catalog[0].purposes,['grading']);assert.equal(catalog[0].helpUrl,'https://docs.example.test/models');
    const response=await h.request('/api/model/jobs',{profileId:'text',requestId:'synthetic-text-image-0001',payload:{messages:[{role:'user',content:[{type:'image_url',image_url:{url:'wa-asset:10000000-0000-4000-8000-000000000001'}}]}]}});
    assert.equal(response.status,400);assert.match((await response.json() as any).error.message,/仅支持文字/);assert.equal(h.sent.length,0);assert.equal(h.db.prepare('SELECT COUNT(*) n FROM model_jobs').get()!.n,0);
    assert.equal((await h.request('/api/model/jobs',{profileId:'text',requestId:'synthetic-text-only-0001',payload})).status,202);
    for(const changes of [{supportsImages:'yes'},{purposes:['ocr','ocr']},{purposes:['unknown']},{helpUrl:'javascript:alert(1)'},{helpUrl:'https://key:secret@docs.example.test'}]){
      h.env.MODEL_PROFILES=JSON.stringify([{id:'bad',label:'Invalid',apiUrl:'https://model.invalid/v1/chat/completions',model:'bad-model',...changes}]);assert.equal((await h.request('/api/model/profiles',null)).status,503);
    }
  }finally{h.close();}
});
