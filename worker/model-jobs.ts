import {providerById,modelProtocol} from '../src/teacher/model-providers';
import {prepareProviderRequest,normalizeOcrResponse} from './ocr-adapters';
import {discoverModels} from './model-discovery';
import {handlePersonalModels,personalCatalog,readPersonalModel,personalAvailable,personalModelKey,type PersonalModel} from './personal-models';
import type {MessageBatch,Queue} from '@cloudflare/workers-types';
import {issueWork,inspectWork,assertWorkNotRevoked,runWorkScope,stableWorkId,type WorkBridge} from './work-permits';
import type {GradingRun} from './grading-types';
import type {Env} from './index';
import {HttpError} from './errors';
import {hydrateAssetImages} from './assets';
import type {GradingBinding} from './grading-types';

export type ModelJobMessage={jobId:string;runId?:never;eventId?:never}|{runId:string;jobId?:never;eventId?:never}|{eventId:string;jobId?:never;runId?:never};
export interface ModelBindings {
  MODEL_JOBS?:Queue<ModelJobMessage>;
  MODEL_PROFILES?:string;
  MODEL_VAULT_KEY?:string;
  MODEL_VAULT_KEY_ID?:string;
  MODEL_VAULT_PREVIOUS_KEYS?:string;
  MODEL_API_URL?:string;
  MODEL_NAME?:string;
  MODEL_API_KEY?:string;
  MODEL_DAILY_LIMIT?:string;
  MODEL_PENDING_LIMIT?:string;
  [key:`MODEL_KEY_${string}`]:string|undefined;
}
type Profile={id:string;label:string;apiUrl:string;model:string;keyBinding:string;maxTokens:number;timeoutMs:number;supportsImages:boolean;purposes:('grading'|'ocr')[];helpUrl?:string;tokenParameter:'max_tokens'|'max_completion_tokens';sendTemperature:boolean;provider?:string;personal?:PersonalModel};
type Principal={principal:string;grant_id:string;role:string;classes?:Array<{id:string;scopes:string[]}>};
type Job={id:string;work_permit_id:string|null;work_expires:number|null;owner:string;grant_id:string;profile_id:string;request_hash:string;state:string;request_key:string;result_key:string|null;attempts:number;lease_token:string|null;lease_until:number;error_status:number|null;error_message:string|null;created:number;updated:number};
type VerifyGrant=(env:Env,path:string,body:unknown)=>Promise<Record<string,any>>;
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const sha=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
function fail(status:number,message:string,code?:string):never{throw new HttpError(status,message,code);}

function profiles(env:Env):Profile[]{
  let raw:unknown=[];
  if(env.MODEL_PROFILES){try{raw=JSON.parse(env.MODEL_PROFILES);}catch{fail(503,'云端模型配置格式不正确，请联系管理员。');}}
  else if(env.MODEL_API_URL&&env.MODEL_NAME)raw=[{id:'default',label:env.MODEL_NAME,apiUrl:env.MODEL_API_URL,model:env.MODEL_NAME,keyBinding:'MODEL_API_KEY'}];
  if(!Array.isArray(raw)||raw.length>12)fail(503,'云端模型配置不正确，请联系管理员。');
  const seen=new Set<string>();
  return raw.map((p:any)=>{
    if(!p||typeof p.id!=='string'||!/^[-a-zA-Z0-9_]{1,64}$/.test(p.id)||seen.has(p.id)||/^personal_[a-f0-9]{32}$/.test(p.id)||typeof p.label!=='string'||p.label.length>80||typeof p.model!=='string'||!p.model||p.model.length>120||typeof p.apiUrl!=='string')fail(503,'云端模型配置不正确，请联系管理员。');
    seen.add(p.id);
    let url:URL;try{url=new URL(p.apiUrl);}catch{fail(503,'云端模型地址不正确，请联系管理员。');}
    const local=env.PUBLIC_ORIGIN.startsWith('http://127.0.0.1:')&&url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname);
    if((url.protocol!=='https:'&&!local)||url.username||url.password||url.hash||url.search)fail(503,'云端模型地址不正确，请联系管理员。');
    const keyBinding=p.keyBinding||'MODEL_API_KEY';
    if(keyBinding!=='MODEL_API_KEY'&&!/^MODEL_KEY_[A-Z0-9_]+$/.test(keyBinding))fail(503,'云端模型密钥配置不正确，请联系管理员。');
    const maxTokens=Number(p.maxTokens??10000),timeoutMs=Number(p.timeoutMs??180000);
    if(!Number.isInteger(maxTokens)||maxTokens<512||maxTokens>24000||!Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>300000)fail(503,'云端模型参数不正确，请联系管理员。');
    if(p.supportsImages!==undefined&&typeof p.supportsImages!=='boolean')fail(503,'模型图片能力配置不正确，请联系管理员。');
    const purposes=p.purposes??['grading','ocr'];
    if(!Array.isArray(purposes)||!purposes.length||purposes.length>2||new Set(purposes).size!==purposes.length||purposes.some((v:unknown)=>!['grading','ocr'].includes(v as string)))fail(503,'模型用途配置不正确，请联系管理员。');
    let helpUrl:string|undefined;
    if(p.helpUrl!==undefined){try{const help=new URL(p.helpUrl);if(help.protocol!=='https:'||help.username||help.password||help.search||help.hash)throw Error();helpUrl=help.href;}catch{fail(503,'模型帮助链接配置不正确，请联系管理员。');}}
    const provider=p.provider?providerById(p.provider):undefined;if(p.provider&&!provider)fail(503,'云端模型服务商配置不正确，请联系管理员。');if(provider&&modelProtocol(provider.id,p.model)!=='chat'&&(purposes.includes('grading')||p.supportsImages===false))fail(503,'专用 OCR 模型不能配置为作文批阅。');
    const tokenParameter=p.tokenParameter||provider?.tokenParameter||'max_tokens',sendTemperature=p.sendTemperature??provider?.sendTemperature??true;if(!['max_tokens','max_completion_tokens'].includes(tokenParameter)||typeof sendTemperature!=='boolean')fail(503,'云端模型协议参数不正确，请联系管理员。');
    return {id:p.id,label:p.label,apiUrl:url.href,model:p.model,keyBinding,maxTokens,timeoutMs,supportsImages:p.supportsImages!==false,purposes,helpUrl,tokenParameter,sendTemperature,...(provider?{provider:provider.id}:{})};
  });
}
function keyFor(env:Env,p:Profile){return p.keyBinding==='MODEL_API_KEY'?env.MODEL_API_KEY:env[p.keyBinding as `MODEL_KEY_${string}`];}
export function modelCatalog(env:Env){return profiles(env).filter(p=>!!keyFor(env,p)).map(p=>({id:p.id,label:p.label,model:p.model,supportsImages:p.supportsImages,purposes:p.purposes,sendTemperature:p.sendTemperature,ocrSpecialist:modelProtocol(p.provider||'custom',p.model)!=='chat',...(p.helpUrl?{helpUrl:p.helpUrl}:{})}));}
const revision=(p:Profile)=>p.personal?Promise.resolve(p.personal.execution_revision):sha(JSON.stringify({apiUrl:p.apiUrl,model:p.model,...(p.provider?{provider:p.provider}:{}),keyBinding:p.keyBinding,maxTokens:p.maxTokens,timeoutMs:p.timeoutMs,...(p.tokenParameter!=='max_tokens'||!p.sendTemperature?{tokenParameter:p.tokenParameter,sendTemperature:p.sendTemperature}:{})}));
async function resolveProfile(env:Env,owner:string,id:string):Promise<Profile|undefined>{
 if(/^personal_[a-f0-9]{32}$/.test(id)){const row=await readPersonalModel(env,owner,id);return row?{id:row.id,label:row.label,apiUrl:row.api_url,model:row.model,keyBinding:'personal',maxTokens:row.max_tokens,timeoutMs:row.timeout_ms,supportsImages:!!row.supports_images,purposes:JSON.parse(row.purposes_json),tokenParameter:row.token_parameter,sendTemperature:!!row.send_temperature,personal:row}:undefined;}
 return profiles(env).find(p=>p.id===id);
}
const available=(env:Env,p:Profile)=>p.personal?personalAvailable(env,p.personal):!!keyFor(env,p);
async function catalogFor(env:Env,owner:string){const own=await personalCatalog(env,owner),managed=modelCatalog(env).map(p=>({...p,source:'system',available:true}));return [...own,...managed];}

export function validateModelPayload(value:unknown){
  const body=value as any;
  if(!body||!Array.isArray(body.messages)||body.messages.length<1||body.messages.length>20)fail(400,'模型请求缺少有效的作文内容。');
  let imageCount=0;
  const messages=body.messages.map((message:any)=>{
    if(!message||!['system','user','assistant'].includes(message.role))fail(400,'模型消息角色不正确。');
    let content;
    if(typeof message.content==='string'){
      if(message.content.length>250000)fail(413,'作文或评分要求过长。');
      content=message.content;
    }else if(Array.isArray(message.content)&&message.content.length>0&&message.content.length<=16){
      content=message.content.map((part:any)=>{
        if(part?.type==='text'&&typeof part.text==='string'&&part.text.length<=250000)return {type:'text',text:part.text};
        if(part?.type==='image_url'&&typeof part.image_url?.url==='string'&&/^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[a-zA-Z0-9+/=\r\n]+$/.test(part.image_url.url)){
          if(++imageCount>6)fail(413,'一次模型请求最多包含 6 张图片。');
          return {type:'image_url',image_url:{url:part.image_url.url}};
        }
        if(part?.type==='image_url'&&typeof part.image_url?.url==='string'&&/^wa-asset:[a-f0-9-]{36}$/.test(part.image_url.url)){
          if(++imageCount>6)fail(413,'一次模型请求最多包含 6 张图片。');
          return {type:'image_url',image_url:{url:part.image_url.url}};
        }
        fail(400,'请使用上传的 JPG、PNG、WebP 或 GIF 图片。');
      });
    }else fail(400,'模型消息内容不正确。');
    return {role:message.role,content};
  });
  const temperature=body.temperature??0.25;
  if(typeof temperature!=='number'||!Number.isFinite(temperature)||temperature<0||temperature>1)fail(400,'模型温度参数不正确。');
  if(body.response_format!==undefined&&body.response_format?.type!=='json_object')fail(400,'仅支持原系统的 JSON 输出格式。');
  return {messages,temperature,...(body.response_format?{response_format:{type:'json_object'}}:{})};
}

function validateImageCapability(profile:Profile,payload:ReturnType<typeof validateModelPayload>){
  if(!profile.supportsImages&&payload.messages.some((m:any)=>Array.isArray(m.content)&&m.content.some((p:any)=>p.type==='image_url')))fail(400,'所选模型仅支持文字，不能识别题目或作文图片。请选择支持图片输入的模型。');
}
async function getJob(env:Env,id:string){return env.DB.prepare('SELECT * FROM model_jobs WHERE id=?').bind(id).first<Job>();}
function safeJob(row:Job){return {id:row.id,profileId:row.profile_id,state:row.state,created:row.created,updated:row.updated,error:row.error_message?{status:row.error_status,message:row.error_message}:null};}
async function deliver(env:Env,id:string){
  if(!env.MODEL_JOBS)fail(503,'云端批改队列尚未配置。');
  await env.MODEL_JOBS.send({jobId:id});
  await env.DB.prepare("UPDATE model_jobs SET dispatched_at=? WHERE id=? AND state='queued'").bind(Date.now(),id).run();
}

export async function handleModelApi(req:Request,env:Env,session:Principal,readInput:(req:Request,max?:number)=>Promise<unknown>,verify?:WorkBridge):Promise<Response|null>{
  const path=new URL(req.url).pathname;
  if(!path.startsWith('/api/model/'))return null;
  if(!['teacher','admin'].includes(session.role))fail(403,'此操作需要教师账号。');
  const discovery=await discoverModels(req,env,session,readInput);if(discovery)return discovery;
  const settings=await handlePersonalModels(req,env,session,readInput);if(settings)return settings;
  if(path==='/api/model/profiles'&&req.method==='GET')return json({profiles:await catalogFor(env,session.principal)});
  if(path==='/api/model/jobs'&&req.method==='POST'){
    const modelInput=await readInput(req,20*1024*1024);
    return enqueueModelJob(env,session,modelInput,undefined,verify);
  }
  const match=path.match(/^\/api\/model\/jobs\/([a-f0-9-]{36})(\/result)?$/);
  if(match&&req.method==='GET'){
    const row=await env.DB.prepare('SELECT * FROM model_jobs WHERE id=? AND owner=?').bind(match[1],session.principal).first<Job>();
    if(!row)fail(404,'批改任务不存在。');
    await requireJobClass(env,row.id,session.classes||[]);
    if(!match[2])return json(safeJob(row));
    if(row.state==='succeeded'&&row.result_key){
      const result=await env.FILES.get(row.result_key);
      if(!result)fail(503,'批改结果暂时无法读取，请稍后重试。');
      return new Response(result.body as any,{headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    }
    if(row.state==='failed'||row.state==='uncertain')return json({error:{message:row.error_message||'批改未完成，请重新核对。',code:row.state}},row.error_status||409);
    return json(safeJob(row),202);
  }
  fail(404,'模型接口不存在。');
}

async function finish(env:Env,id:string,token:string,state:string,status:number,message:string){
  await env.DB.prepare("UPDATE model_jobs SET state=?,error_status=?,error_message=?,updated=? WHERE id=? AND lease_token=? AND state IN ('preparing','sending')").bind(state,status,message,Date.now(),id,token).run();
}
async function boundedText(response:Response,max:number){
  if(!response.body)fail(502,'模型没有返回内容。');
  const reader=response.body.getReader(),decoder=new TextDecoder();let text='',size=0;
  while(true){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>max){await reader.cancel();fail(422,'模型返回内容过长，请调整输出设置。');}text+=decoder.decode(r.value,{stream:true});}
  return text+decoder.decode();
}

export async function consumeModelJobs(batch:MessageBatch<ModelJobMessage>,env:Env,verify:VerifyGrant){
  for(const message of batch.messages){
    const id=message.body?.jobId;
    if(typeof id!=='string'||!/^[-a-f0-9]{36}$/.test(id)){message.ack();continue;}
    let row=await getJob(env,id);
    if(!row||['succeeded','failed','uncertain'].includes(row.state)){message.ack();continue;}
    const current=Date.now();
    if(row.state==='sending'&&row.lease_until<=current){
      await env.DB.prepare("UPDATE model_jobs SET state='uncertain',error_status=409,error_message='模型处理结果暂未确认。请先核对任务结果，再决定是否重新批改。',updated=? WHERE id=? AND state='sending' AND lease_until<=?").bind(current,id,current).run();
      message.ack();continue;
    }
    if(row.state==='staging'||(row.state!=='queued'&&row.lease_until>current)){message.retry({delaySeconds:15});continue;}
    const token=crypto.randomUUID();
    const claimed=await env.DB.prepare("UPDATE model_jobs SET state='preparing',lease_token=?,lease_until=?,attempts=attempts+1,updated=? WHERE id=? AND (state='queued' OR (state='preparing' AND lease_until<=?))").bind(token,current+360000,current,id,current).run();
    if(!claimed.meta.changes){message.retry({delaySeconds:15});continue;}
    row=(await getJob(env,id))!;
    try{
      const profile=await resolveProfile(env,row.owner,row.profile_id);
      if(!profile||!available(env,profile))fail(503,'所选云端模型暂不可用。');
      const stored=await env.FILES.get(row.request_key);
      if(!stored)fail(503,'已保存的作文请求暂不可用。');
      const envelope=await stored.json() as any;
      if(envelope.profileRevision!==await revision(profile))fail(409,'模型设置已更新，请核对后重新提交。');
      const validated=validateModelPayload(envelope.payload);validateImageCapability(profile,validated);
      if(await sha(JSON.stringify({payload:validated,profileRevision:envelope.profileRevision}))!==row.request_hash)fail(409,'已保存的模型请求内容校验未通过，请联系管理员核对存档。');
      const hydrated=await hydrateAssetImages(env,row.owner,validated),{temperature,...messages}=hydrated;
      const payload={...messages,...(profile.sendTemperature?{temperature}:{}),model:profile.model,[profile.tokenParameter]:profile.maxTokens,stream:false};
      const request=prepareProviderRequest(profile.personal?.provider||profile.provider||'custom',profile.model,profile.apiUrl,payload);
      const linked=await env.DB.prepare('SELECT g.* FROM model_job_bindings b JOIN grading_runs g ON g.id=b.run_id WHERE b.job_id=? AND b.owner=?').bind(id,row.owner).first<GradingRun>();
      const authority=linked?.work_permit_id?await inspectWork(env,row.owner,linked.work_permit_id,runWorkScope(linked),verify):row.work_permit_id?await inspectWork(env,row.owner,row.work_permit_id,{type:'model-job',jobId:row.id,requestHash:row.request_hash,profileId:row.profile_id,profileRevision:envelope.profileRevision},verify):await verify(env,'introspect',{grantId:row.grant_id});
      if(authority.active!==true||authority.provider+':'+authority.subject!==row.owner||!['teacher','admin'].includes(authority.role)||!authority.scopes?.includes('writing.personal'))fail(403,'账号授权已变化，已停止这次批改。');
      await requireJobClass(env,id,authority.classes||[],true);
      await assertWorkNotRevoked(env,linked?.grant_id||row.grant_id);
      const currentProfile=await resolveProfile(env,row.owner,row.profile_id);if(!currentProfile||!available(env,currentProfile)||await revision(currentProfile)!==envelope.profileRevision)fail(409,'模型配置已更改或移除，请核对后重新批阅。');
      const providerKey=currentProfile.personal?await personalModelKey(env,currentProfile.personal):keyFor(env,currentProfile)!;
      const profileGuard=profile.personal?" AND EXISTS(SELECT 1 FROM personal_model_profiles WHERE id=? AND owner=? AND status='active' AND execution_revision=?)":'',profileBinds=profile.personal?[profile.id,row.owner,envelope.profileRevision]:[];
      const sending=await env.DB.prepare("UPDATE model_jobs SET state='sending',lease_until=?,updated=? WHERE id=? AND state='preparing' AND lease_token=? AND lease_until>?"+profileGuard).bind(Date.now()+profile.timeoutMs+60000,Date.now(),id,token,Date.now(),...profileBinds).run();
      if(!sending.meta.changes){if(profile.personal){const value=await readPersonalModel(env,row.owner,profile.id);if(!value||value.execution_revision!==envelope.profileRevision)fail(409,'模型配置已更改或移除，请核对后重新批阅。');}message.retry({delaySeconds:15});continue;}
      let response:Response;
      try{
        response=await fetch(request.url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+providerKey},body:JSON.stringify(request.payload),redirect:'manual',signal:AbortSignal.timeout(profile.timeoutMs)});
      }catch{
        await finish(env,id,token,'uncertain',409,'模型处理结果暂未确认。请先核对任务结果，再决定是否重新批改。');message.ack();continue;
      }
      if(!response.ok){
        await response.body?.cancel();
        const retryable=response.status===429||response.status>=500;
        if(retryable&&row.attempts<3){
          await env.DB.prepare("UPDATE model_jobs SET state='queued',error_status=NULL,error_message=NULL,updated=? WHERE id=? AND lease_token=? AND state='sending'").bind(Date.now(),id,token).run();
          message.retry({delaySeconds:Math.min(60,5*row.attempts)});continue;
        }
        const status=response.status===429?429:response.status===400?400:502;
        await finish(env,id,token,'failed',status,response.status===401||response.status===403?(profile.personal?'个人模型鉴权未通过，请在我的模型中核对密钥与服务地址。':'云端模型鉴权未通过，请联系管理员检查配置。'):response.status===429?'模型当前繁忙，请稍后重试。':'云端模型未能处理这份作文，请核对图片及模型设置。');
        message.ack();continue;
      }
      let text:string;
      try{
        text=await boundedText(response,2*1024*1024);
        if(request.task)text=normalizeOcrResponse(text,request.task);
        const secret=providerKey;
        if(text.includes(secret))text=text.split(secret).join('[redacted]');
        try{JSON.parse(text);}catch{
          if(/^\s*</.test(text))fail(422,'模型返回了网页内容，请核对兼容接口地址。');
          // Retain the legacy parser's raw-text/Markdown fallback while always
          // returning a JSON media type from the private result endpoint.
          text=JSON.stringify({choices:[{message:{role:'assistant',content:text}}]});
        }
      }
      catch(error){await finish(env,id,token,'failed',422,error instanceof HttpError?error.message:'模型返回格式无法读取，请核对模型的兼容格式。');message.ack();continue;}
      const resultKey='model-output/'+await sha(row.owner)+'/'+id+'/'+token+'.json';
      await env.FILES.put(resultKey,text,{httpMetadata:{contentType:'application/json'}});
      await env.DB.prepare("UPDATE model_jobs SET state='succeeded',result_key=?,error_status=NULL,error_message=NULL,updated=? WHERE id=? AND lease_token=? AND state IN ('sending','uncertain')").bind(resultKey,Date.now(),id,token).run();
      message.ack();
    }catch(error){
      const status=error instanceof HttpError?error.status:503;
      const latest=await getJob(env,id);
      if(latest?.state==='sending'){
        // Storage/runtime failure after dispatch must not cause another billable call.
        await finish(env,id,token,'uncertain',409,'模型已接收请求，但结果保存尚未确认。请先核对任务，再决定是否重新批改。');message.ack();continue;
      }
      if(status===503&&row.attempts<3){
        await env.DB.prepare("UPDATE model_jobs SET state='queued',updated=? WHERE id=? AND lease_token=? AND state='preparing'").bind(Date.now(),id,token).run();message.retry({delaySeconds:15});continue;
      }
      await finish(env,id,token,'failed',status,error instanceof HttpError?error.message:'批改任务暂时无法处理，请稍后重试。');message.ack();
    }
  }
}

export async function recoverModelOutbox(env:Env){
  const now=Date.now();
  await env.DB.batch([
    env.DB.prepare("UPDATE model_jobs SET state='failed',error_status=503,error_message='作文请求保存未完成，请重新提交。',updated=? WHERE state='staging' AND created<?").bind(now,now-300000),
    env.DB.prepare("UPDATE model_jobs SET state='queued',updated=? WHERE state='preparing' AND lease_until<?").bind(now,now),
    env.DB.prepare("UPDATE model_jobs SET state='uncertain',error_status=409,error_message='模型处理结果暂未确认，请先核对任务结果。',updated=? WHERE state='sending' AND lease_until<?").bind(now,now),
  ]);
  const pending=await env.DB.prepare("SELECT id FROM model_jobs WHERE state='queued' AND dispatched_at<? ORDER BY created LIMIT 50").bind(now-60000).all<{id:string}>();
  for(const job of pending.results){try{await deliver(env,job.id);}catch{break;}}
}

export async function configuredGradingModel(env:Env,id:string,owner:string){const p=await resolveProfile(env,owner,id);if(!p||!p.supportsImages||!p.purposes.includes('grading')||!available(env,p))fail(400,'请选择已配置且支持作文图片的批改模型。');return {id:p!.id,model:p!.model,revision:await revision(p!)};}
export async function enqueueModelJob(env:Env,session:Principal,value:unknown,binding?:GradingBinding,verify?:WorkBridge):Promise<Response>{
  if(!['teacher','admin'].includes(session.role))fail(403,'此操作需要教师账号。');
  const input=value as any;
  if(binding){
    if(!session.classes?.some(c=>c.id===binding.classId&&['roster.read','writing.grade'].every(scope=>c.scopes.includes(scope))))fail(403,'当前没有此班级的批改权限。');
    const linked=await env.DB.prepare("SELECT g.id FROM grading_runs g JOIN grading_steps s ON s.run_id=g.id WHERE g.id=? AND g.owner=? AND g.class_id=? AND g.current_step_id=s.id AND s.id=? AND g.state='running' AND s.state='queued'").bind(binding.runId,session.principal,binding.classId,binding.stepId).first();
    if(!linked)fail(409,'班级批阅运行或步骤已改变。');
  }
    if(!env.MODEL_JOBS)fail(503,'云端批改队列尚未配置。');
    if(!input||typeof input.profileId!=='string'||typeof input.requestId!=='string'||!/^[-a-zA-Z0-9_]{16,128}$/.test(input.requestId))fail(400,'请提供有效的模型和请求编号。');
    const profile=await resolveProfile(env,session.principal,input.profileId);
    if(!profile||!available(env,profile))fail(400,'此云端模型尚未配置，请重新选择。');
    if(input.requestId.startsWith('wa-grade-')&&!binding)fail(400,'此请求编号由班级批阅服务保留。');
    const payload=validateModelPayload(input.payload);
    validateImageCapability(profile,payload);
    const dailyLimit=Number(env.MODEL_DAILY_LIMIT??1200),pendingLimit=Number(env.MODEL_PENDING_LIMIT??20);
    if(!Number.isInteger(dailyLimit)||dailyLimit<0||dailyLimit>1000000||!Number.isInteger(pendingLimit)||pendingLimit<1||pendingLimit>200)fail(503,'云端任务额度配置不正确，请联系管理员。');
    const profileRevision=await revision(profile);if(input.configurationVersion!==undefined&&input.configurationVersion!==profileRevision)fail(409,'模型配置已变化，请刷新模型后再提交。','model_profile_changed');const requestHash=await sha(JSON.stringify({payload,profileRevision}));
    const existing=await env.DB.prepare('SELECT * FROM model_jobs WHERE owner=? AND request_id=?').bind(session.principal,input.requestId).first<Job>();
    if(existing){
      if(existing.request_hash!==requestHash)fail(409,'同一个请求编号不能提交不同的作文或模型设置。');
      return json(safeJob(existing),202);
    }
    if(!binding&&!verify)fail(503,'后台模型授权尚未连接，请联系管理员。');
    const intake=await env.DB.prepare("SELECT SUM(CASE WHEN created>? THEN 1 ELSE 0 END) AS recent,SUM(CASE WHEN state IN ('staging','queued','preparing','sending') THEN 1 ELSE 0 END) AS pending FROM model_jobs WHERE owner=?").bind(Date.now()-86400000,session.principal).first<{recent:number;pending:number}>();
    if((intake?.pending||0)>=pendingLimit)fail(429,'当前批改任务较多，请等待已提交的任务完成后再试。','model_pending_limit');
    if(dailyLimit&&(intake?.recent||0)>=dailyLimit)fail(429,'今日云端使用次数已达限额，请联系管理员调整额度或稍后再试。','model_daily_limit');
    const id=await stableWorkId(session.principal,input.requestId,'model-job'),created=Date.now(),requestKey='model-input/'+await sha(session.principal)+'/'+id+'.json';
    const permit=binding?null:await issueWork(env,session.principal,session.grant_id,input.requestId,{type:'model-job',jobId:id,requestHash,profileId:profile.id,profileRevision},verify!);
    // Atomic per-owner intake limit; clients cannot bypass it with concurrent POSTs.
    const insert=env.DB.prepare("INSERT OR IGNORE INTO model_jobs(id,owner,grant_id,profile_id,request_id,request_hash,work_permit_id,work_expires,state,request_key,created,updated) SELECT ?,?,?,?,?,?,?,?,'staging',?,?,? WHERE (?=0 OR (SELECT COUNT(*) FROM model_jobs WHERE owner=? AND created>?)<?) AND (SELECT COUNT(*) FROM model_jobs WHERE owner=? AND state IN ('staging','queued','preparing','sending'))<?")
      .bind(id,session.principal,session.grant_id,profile.id,input.requestId,requestHash,permit?.permitId||null,permit?.expires||null,requestKey,created,created,dailyLimit,session.principal,created-86400000,dailyLimit,session.principal,pendingLimit);
    const statements=[insert];
    if(binding)statements.push(env.DB.prepare('INSERT OR IGNORE INTO model_job_bindings(job_id,run_id,step_id,owner,class_id) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM model_jobs WHERE id=? AND owner=?)').bind(id,binding.runId,binding.stepId,session.principal,binding.classId,id,session.principal));
    const inserted=(await env.DB.batch(statements))[0];
    if(!inserted.meta.changes){
      const raced=await env.DB.prepare('SELECT * FROM model_jobs WHERE owner=? AND request_id=?').bind(session.principal,input.requestId).first<Job>();
      if(raced){if(raced.request_hash!==requestHash)fail(409,'同一个请求编号不能提交不同的内容。');return json(safeJob(raced),202);}
      const active=await env.DB.prepare("SELECT COUNT(*) AS count FROM model_jobs WHERE owner=? AND state IN ('staging','queued','preparing','sending')").bind(session.principal).first<{count:number}>();
      const pending=(active?.count||0)>=pendingLimit;fail(429,pending?'当前批改任务较多，请等待已提交的任务完成后再试。':'今日云端使用次数已达限额，请联系管理员调整额度或稍后再试。',pending?'model_pending_limit':'model_daily_limit');
    }
    try{
      await env.FILES.put(requestKey,JSON.stringify({payload,profileRevision}),{httpMetadata:{contentType:'application/json'}});
      await env.DB.prepare("UPDATE model_jobs SET state='queued',updated=? WHERE id=? AND state='staging'").bind(Date.now(),id).run();
    }catch{
      await env.DB.prepare("UPDATE model_jobs SET state='failed',error_status=503,error_message='作文请求未能保存，请重新提交。',updated=? WHERE id=? AND state='staging'").bind(Date.now(),id).run();
      fail(503,'作文请求未能保存，请重新提交。');
    }
    // The outbox sweep will deliver a persisted job if the broker is temporarily unavailable.
    try{await deliver(env,id);}catch{}
    return json(safeJob((await getJob(env,id))!),202);
}

async function requireJobClass(env:Env,id:string,classes:Array<{id:string;scopes:string[]}>,dispatch=false){
 const binding=await env.DB.prepare('SELECT b.class_id,b.step_id,g.current_step_id,g.state FROM model_job_bindings b JOIN grading_runs g ON g.id=b.run_id WHERE b.job_id=?').bind(id).first<{class_id:string;step_id:string;current_step_id:string;state:string}>();
 if(binding&&!classes.some(c=>c.id===binding.class_id&&['roster.read','writing.grade'].every(scope=>c.scopes.includes(scope))))fail(403,'此班级的作文批改权限已变化。');
 if(binding&&dispatch&&(!['queued','running'].includes(binding.state)||binding.current_step_id!==binding.step_id))fail(409,'班级批阅运行已暂停或步骤已改变。');
}
