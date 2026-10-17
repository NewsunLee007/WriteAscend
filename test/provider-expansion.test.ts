import test from 'node:test';
import assert from 'node:assert/strict';
import {modelProviders,curatedModels,providerById} from '../src/teacher/model-providers';
import {prepareProviderRequest} from '../worker/ocr-adapters';
import {anthropicRequest,normalizeChatResponse,providerHeaders} from '../worker/chat-provider-adapters';
import {sandbox,fixture} from './helpers/bound-sandbox';
import {handleModelApi} from '../worker/model-jobs';
const secret='synthetic-expanded-provider-key';
const added=['deepseek','doubao','moonshot','minimax','baidu','hunyuan','anthropic'];
const image='data:image/png;base64,AAAA';
async function setup(){const h=await sandbox();h.env.MODEL_VAULT_KEY=Buffer.alloc(32,7).toString('base64url');
 async function api(path:string,body?:any){try{const r=(await handleModelApi(new Request('https://write.test'+path,{method:body?'POST':'GET'}),h.env,h.session,async()=>body,h.bridge))!;return {status:r.status,body:await r.json() as any};}catch(e:any){return {status:e.status,body:{error:{message:e.message}}};}}
 return {...h,api};}
test('mainstream providers offer image-capable curated models and corresponding HTTPS key/help links, excluding retired, code-only and text-only variants',()=>{
 assert.equal(modelProviders.filter(p=>p.id!=='custom').length,13);
 for(const id of added){const p=providerById(id)!;assert(p);assert(curatedModels(id,'grading').length);for(const field of ['apiUrl','keyUrl','helpUrl','visionUrl','pricingUrl'] as const)assert.equal(new URL(p[field]).protocol,'https:',id+' '+field);}
 assert.deepEqual(curatedModels('deepseek','grading',['deepseek-chat','deepseek-reasoner','deepseek-v4-pro','deepseek-flash']).map(m=>m.id),['deepseek-flash']);
 assert.deepEqual(curatedModels('moonshot','grading',['kimi-k2.5','kimi-k2.7-code','kimi-k3','kimi-k2.6']).map(m=>m.id),['kimi-k3','kimi-k2.6']);
 assert.deepEqual(curatedModels('minimax','grading',['MiniMax-M2.7','MiniMax-M3','MiniMax-M3.1-Flash-Preview']).map(m=>m.id),['MiniMax-M3']);
 assert.equal(curatedModels('mistral','grading').length,0);
});
test('new model request adapters apply provider-specific thinking, sampling and output parameters without changing caller payloads',()=>{
 const original={model:'ignored',messages:[{role:'system',content:'Return JSON.'},{role:'user',content:[{type:'image_url',image_url:{url:image}}]}],temperature:0.25,response_format:{type:'json_object'},max_tokens:10000,stream:false};
 for(const id of added){const provider=providerById(id)!,model=provider.models[0].id,{payload}=prepareProviderRequest(id,model,provider.apiUrl,{...original,model});if(['deepseek','doubao','minimax'].includes(id))assert.deepEqual((payload as any).thinking,{type:'disabled'});if(id==='moonshot'){assert(!('temperature' in payload));assert.equal((payload as any).reasoning_effort,'low');}if(id==='minimax')assert.equal((payload as any).reasoning_split,true);if(['anthropic','doubao','hunyuan','minimax'].includes(id))assert(!('response_format' in payload));}
 assert.equal(original.temperature,0.25);assert(original.response_format);assert(!('thinking' in original));
 const k26=prepareProviderRequest('moonshot','kimi-k2.6','https://api.moonshot.cn/v1/chat/completions',original);assert.deepEqual((k26.payload as any).thinking,{type:'disabled'});
});
test('Claude native messages preserve system instructions and images, separate API key headers, and exclude thinking from report text',()=>{
 const request=anthropicRequest('https://api.anthropic.com/v1/messages',{model:'claude-sonnet-5-5',max_tokens:10000,messages:[{role:'system',content:'Teacher rubric'},{role:'user',content:[{type:'text',text:'Grade this'},{type:'image_url',image_url:{url:image}}]}],response_format:{type:'json_object'},temperature:0.2});
 assert.equal(request.url,'https://api.anthropic.com/v1/messages');assert.equal(request.payload.system,'Teacher rubric');assert.equal(request.payload.messages[0].content[1].source.data,'AAAA');assert.equal(request.payload.messages[0].content[1].source.media_type,'image/png');assert(!('temperature' in request.payload));assert(!('response_format' in request.payload));
 const headers=providerHeaders('anthropic',secret);assert.equal(headers['x-api-key'],secret);assert.equal(headers['anthropic-version'],'2023-06-01');assert(!('Authorization' in headers));assert.equal(providerHeaders('deepseek',secret).Authorization,'Bearer '+secret);
 const output=JSON.parse(normalizeChatResponse('anthropic',JSON.stringify({content:[{type:'thinking',thinking:'private reasoning'},{type:'text',text:'{"score":15}'}],usage:{input_tokens:1,output_tokens:2}})));assert.equal(output.choices[0].message.content,'{"score":15}');assert(!JSON.stringify(output).includes('private reasoning'));assert.throws(()=>normalizeChatResponse('anthropic',JSON.stringify({content:[{type:'text',text:'partial'}],stop_reason:'max_tokens'})));
 assert.throws(()=>anthropicRequest('https://api.anthropic.com/v1/messages',{messages:[{role:'user',content:[{type:'image_url',image_url:{url:'https://other.example.com/private'}}]}]}));
});
test('DeepSeek, Qianfan and Tencent directories respect explicit modalities and online status; Claude discovery uses native authentication',async()=>{
 const h=await setup();try{
  for(const provider of ['deepseek','baidu','hunyuan','anthropic']){const p=providerById(provider)!,model=p.models[0].id;globalThis.fetch=async(url,options)=>{assert.equal(String(url),p.modelsUrl);const headers=new Headers(options?.headers);if(provider==='anthropic'){assert.equal(headers.get('x-api-key'),secret);assert.equal(headers.get('anthropic-version'),'2023-06-01');assert.equal(headers.get('Authorization'),null);}else assert.equal(headers.get('Authorization'),'Bearer '+secret);return Response.json({data:[{id:model,input_modalities:['text','image'],output_modalities:['text'],status:'online'},{id:model,input_modalities:['text'],status:'online'},{id:model,architecture:{input_modalities:['text'],output_modalities:['text']}},{id:model,status:'offline'},{id:'unrelated-text-model'},...(provider==='anthropic'?[{id:'claude-haiku-5-5',capabilities:{image_input:{supported:false}}}]:[])]});};const listed=await h.api('/api/model/discover',{provider,purpose:'grading',apiKey:secret,force:true});assert.equal(listed.status,200,JSON.stringify(listed));assert.deepEqual(listed.body.models.map((m:any)=>m.id),[model]);assert(!JSON.stringify(listed).includes(secret));globalThis.fetch=async()=>Response.json({data:[{id:model,input_modalities:['text'],output_modalities:['text']}]});const incompatible=await h.api('/api/model/discover',{provider,purpose:'grading',apiKey:secret,force:true});assert.deepEqual(incompatible.body.models,[]);}
 }finally{h.close();}
});
test('each newly supported provider traverses private saved configuration, image dispatch, bound report creation and existing results with no real calls',async()=>{
 for(const provider of added){const h=await setup();try{
  const p=providerById(provider)!,model=p.models[0].id;
  if(provider==='deepseek'||provider==='minimax'||provider==='moonshot'){const bad=await h.api('/api/model/personal',{requestId:crypto.randomUUID(),expectedRevision:0,provider,model:provider==='deepseek'?'deepseek-v4-pro':provider==='minimax'?'MiniMax-M2.7':'kimi-k2.5',label:'Unsupported visual model',apiKey:secret,apiUrl:p.apiUrl,supportsImages:true,purposes:['grading']});assert.equal(bad.status,400);assert.equal(h.calls.length,0);}
  const created=await h.api('/api/model/personal',{requestId:crypto.randomUUID(),expectedRevision:0,provider,model,label:'Synthetic '+provider,apiKey:secret,apiUrl:p.apiUrl,supportsImages:true,purposes:['grading','ocr']});assert.equal(created.status,200,provider+JSON.stringify(created));const id=created.body.profileId;
  await h.collect();const run=await h.create({...await h.inputFor(),profileId:id});assert.equal(run.status,202,provider+JSON.stringify(run));
  const previous=globalThis.fetch;globalThis.fetch=async(url,options)=>{assert.equal(String(url),p.apiUrl);const body=JSON.parse(String(options?.body));assert.equal(body.model,model);if(provider==='anthropic'){assert.equal(new Headers(options?.headers).get('x-api-key'),secret);assert(body.system);assert(body.messages.some((m:any)=>Array.isArray(m.content)&&m.content.some((part:any)=>part.type==='image')));h.calls.push(body);return Response.json({content:[{type:'thinking',thinking:'not a report'},{type:'text',text:fixture.response.choices[0].message.content}],usage:{input_tokens:10,output_tokens:20}});}assert.equal(new Headers(options?.headers).get('Authorization'),'Bearer '+secret);assert(JSON.stringify(body.messages).includes('data:image/png;base64,'));if(!p.sendTemperature)assert(!('temperature' in body));if(provider==='minimax'){assert.equal(body.max_completion_tokens,10000);assert(!('max_tokens' in body));}return previous(url,options);};
  await h.drain();assert.equal(h.run(run.body.run.id).state,'ready',provider);assert.equal(h.calls.length,1,provider);const report=await h.request('/api/writing-reports/'+run.body.run.id);assert.equal(report.status,200);assert(!JSON.stringify(report).includes(secret));
 }finally{h.close();}}
});
