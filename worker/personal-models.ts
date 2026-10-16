import type {Env} from './index';
import {HttpError} from './errors';
import {digest} from '../src/report/legacy-import';
import {modelProviders} from '../src/teacher/model-providers';
export type PersonalModel={id:string;owner:string;label:string;provider:string;api_url:string;model:string;supports_images:number;purposes_json:string;max_tokens:number;timeout_ms:number;token_parameter:'max_tokens'|'max_completion_tokens';send_temperature:number;credential_cipher:string|null;credential_key_id:string|null;credential_revision:number;execution_revision:string;revision:number;status:string;created:number;updated:number};
type Who={principal:string;role:string;grant_id:string};
type ReadInput=(req:Request,max?:number)=>Promise<unknown>;
function fail(status:number,message:string):never{throw new HttpError(status,message);}
const privateId=/^personal_[a-f0-9]{32}$/,requestId=/^[-a-zA-Z0-9_]{16,128}$/;
const encode=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
function decode(value:string){try{return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));}catch{fail(503,'个人模型密钥托管配置无法读取，请联系管理员。');}}
function vault(env:Env){
 const current=env.MODEL_VAULT_KEY_ID||'primary',keys=new Map<string,Uint8Array>();
 if(env.MODEL_VAULT_PREVIOUS_KEYS){let previous:any;try{previous=JSON.parse(env.MODEL_VAULT_PREVIOUS_KEYS);}catch{fail(503,'个人模型密钥托管尚未就绪，请联系管理员。');}if(!previous||typeof previous!=='object'||Array.isArray(previous)||Object.keys(previous).length>4)fail(503,'个人模型密钥托管尚未就绪，请联系管理员。');for(const [id,key] of Object.entries(previous)){if(!/^[-a-zA-Z0-9_]{1,40}$/.test(id)||typeof key!=='string'||decode(key).length!==32)fail(503,'个人模型密钥托管尚未就绪，请联系管理员。');keys.set(id,decode(key));}}
 if(env.MODEL_VAULT_KEY){if(!/^[-a-zA-Z0-9_]{1,40}$/.test(current)||decode(env.MODEL_VAULT_KEY).length!==32)fail(503,'个人模型密钥托管尚未就绪，请联系管理员。');keys.set(current,decode(env.MODEL_VAULT_KEY));}return {current,keys,ready:!!env.MODEL_VAULT_KEY};
}
export function personalVaultReady(env:Env){try{return vault(env).ready;}catch{return false;}}
function canReadCredential(env:Env,row:PersonalModel){try{return !!row.credential_key_id&&vault(env).keys.has(row.credential_key_id);}catch{return false;}}
const aad=(row:Pick<PersonalModel,'id'|'owner'|'credential_revision'|'credential_key_id'>)=>new TextEncoder().encode(JSON.stringify(['writeascend-model-key-v1',row.owner,row.id,row.credential_revision,row.credential_key_id]));
async function encrypt(env:Env,row:Pick<PersonalModel,'id'|'owner'|'credential_revision'|'credential_key_id'>,secret:string){const keys=vault(env),raw=keys.keys.get(row.credential_key_id!);if(!keys.ready||!raw)fail(503,'个人模型密钥托管尚未启用，请联系管理员。');const key=await crypto.subtle.importKey('raw',raw as BufferSource,'AES-GCM',false,['encrypt']),iv=crypto.getRandomValues(new Uint8Array(12)),encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(row)},key,new TextEncoder().encode(secret)));const out=new Uint8Array(12+encrypted.length);out.set(iv);out.set(encrypted,12);return encode(out);}
export async function personalModelKey(env:Env,row:PersonalModel){
 try{const raw=vault(env).keys.get(row.credential_key_id!);if(!raw||!row.credential_cipher)throw Error();const bytes=decode(row.credential_cipher),key=await crypto.subtle.importKey('raw',raw as BufferSource,'AES-GCM',false,['decrypt']);return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(0,12),additionalData:aad(row)},key,bytes.slice(12)));}catch{fail(503,'个人模型密钥无法读取，请更新密钥或联系管理员。');}
}
export function validatePersonalEndpoint(value:string,env:Env){
 let url:URL;try{url=new URL(value.trim());}catch{fail(400,'请填写完整的兼容接口地址。');}
 const local=env.PUBLIC_ORIGIN.startsWith('http://127.0.0.1:')&&url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname);
 if(url.username||url.password||url.search||url.hash||url.port&&!local||url.protocol!=='https:'&&!local)fail(400,'接口须使用不带密钥、查询参数或跳转片段的 HTTPS 地址。');
 if(!local){const host=url.hostname.toLowerCase();if(!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)||/(?:^|\.)(?:localhost|local|internal|lan|home|invalid|test|example|onion)$/.test(host)||[env.PUBLIC_ORIGIN,env.DAILY_ORIGIN].some(v=>{try{return new URL(v).hostname===host;}catch{return false;}}))fail(400,'请使用模型服务商的公网域名。');}
 url.pathname=url.pathname.replace(/\/+$/,'');if(!url.pathname.endsWith('/chat/completions'))url.pathname+='/chat/completions';if(url.href.length>500||/\/(?:sk-[^/]+|AIza[^/]+)/.test(url.pathname))fail(400,'接口地址过长或包含密钥，请把密钥填在独立输入框。');return url.href;
}
export async function readPersonalModel(env:Env,owner:string,id:string){if(!privateId.test(id))return null;return env.DB.prepare("SELECT * FROM personal_model_profiles WHERE id=? AND owner=? AND status='active'").bind(id,owner).first<PersonalModel>();}
export function personalAvailable(env:Env,row:PersonalModel){return row.status==='active'&&!!row.credential_cipher&&canReadCredential(env,row);}
function metadata(env:Env,row:PersonalModel){return {id:row.id,revision:row.revision,label:row.label,provider:row.provider,apiUrl:row.api_url,model:row.model,supportsImages:!!row.supports_images,purposes:JSON.parse(row.purposes_json),maxTokens:row.max_tokens,timeoutMs:row.timeout_ms,tokenParameter:row.token_parameter,sendTemperature:!!row.send_temperature,hasKey:!!row.credential_cipher,available:personalAvailable(env,row),updated:row.updated};}
export async function personalCatalog(env:Env,owner:string){const rows=await env.DB.prepare("SELECT * FROM personal_model_profiles WHERE owner=? AND status='active' ORDER BY created,id LIMIT 8").bind(owner).all<PersonalModel>();return rows.results.map(row=>({id:row.id,label:row.label,model:row.model,supportsImages:!!row.supports_images,purposes:JSON.parse(row.purposes_json),source:'personal',available:personalAvailable(env,row),configurationVersion:row.execution_revision,sendTemperature:!!row.send_temperature,helpUrl:modelProviders.find(p=>p.id===row.provider)?.helpUrl}));}
function text(value:any,name:string,max=120){if(typeof value!=='string'||!value.trim()||value.trim().length>max||/[\x00-\x1f]/.test(value))fail(400,'请填写有效的'+name+'。');return value.trim();}
async function operationHash(env:Env,id:string|null,payload:any){if(!id)return digest(payload);const raw=vault(env).keys.get(id);if(!raw)fail(503,'旧配置操作的校验密钥不可用，请刷新配置后重新保存。');const key=await crypto.subtle.importKey('raw',raw as BufferSource,{name:'HMAC',hash:'SHA-256'},false,['sign']);return encode(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(JSON.stringify(payload)))));}
async function mutate(env:Env,who:Who,id:string|undefined,body:any,remove:boolean){
 if(!body||!requestId.test(body.requestId)||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)fail(400,'请提供配置版本与操作编号。');
 const deleting=remove,profileId=id||'personal_'+(await digest({owner:who.principal,requestId:body.requestId,kind:'personal-model'})).slice(0,32),action=deleting?'delete':id?'update':'create';
 const prior=await env.DB.prepare('SELECT * FROM personal_model_operations WHERE owner=? AND request_id=?').bind(who.principal,body.requestId).first<{request_hash:string;hash_key_id:string|null;result_json:string}>();
 const hashPayload={action,profileId,body:deleting?{requestId:body.requestId,expectedRevision:body.expectedRevision}:body};if(prior){if(await operationHash(env,prior.hash_key_id,hashPayload)!==prior.request_hash)fail(409,'同一配置操作编号不能保存不同内容。');return JSON.parse(prior.result_json);}
 const old=await readPersonalModel(env,who.principal,profileId);if(id&&!old)fail(404,'个人模型配置不存在。');if(!id&&body.expectedRevision!==0||old&&old.revision!==body.expectedRevision)fail(409,'配置已在其他页面修改，请刷新后重试。');
 let row:PersonalModel;const now=Date.now(),revision=body.expectedRevision+1;
 if(deleting){row={...old!,credential_cipher:null,credential_key_id:null,status:'deleted',revision,execution_revision:await digest({profileId,deleted:revision}),updated:now};}
 else{
  const keys=vault(env);if(!keys.ready)fail(503,'个人模型密钥托管尚未启用，请联系管理员。');
  const provider=modelProviders.find(p=>p.id===body.provider);if(!provider)fail(400,'请选择模型服务商。');
  const label=text(body.label,'配置名称',80),model=text(body.model,'模型型号'),apiUrl=validatePersonalEndpoint(body.apiUrl||provider.apiUrl,env),supportsImages=body.supportsImages??true,purposes=body.purposes||['grading','ocr'],maxTokens=body.maxTokens??10000,timeoutMs=body.timeoutMs??180000,tokenParameter=body.tokenParameter||provider.tokenParameter,sendTemperature=body.sendTemperature??provider.sendTemperature;
  if(typeof supportsImages!=='boolean'||!Array.isArray(purposes)||!purposes.length||purposes.length>2||new Set(purposes).size!==purposes.length||purposes.some(v=>!['grading','ocr'].includes(v))||!Number.isInteger(maxTokens)||maxTokens<512||maxTokens>24000||!Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>300000||!['max_tokens','max_completion_tokens'].includes(tokenParameter)||typeof sendTemperature!=='boolean')fail(400,'模型图片能力、用途或高级参数不正确。');
  const secret=typeof body.apiKey==='string'?body.apiKey.trim():'';if(secret&&(secret.length<8||secret.length>4096||/[^\x21-\x7e]/.test(secret)||[label,model,apiUrl].some(v=>v.includes(secret))))fail(400,'请核对密钥，只将其填写在独立密钥输入框。');if(!old&&!secret)fail(400,'新模型需要填写 API 密钥。');
  const credentialRevision=(old?.credential_revision||0)+(secret?1:0),credentialKeyId=secret?keys.current:old!.credential_key_id;
  row={id:profileId,owner:who.principal,label,provider:provider.id,api_url:apiUrl,model,supports_images:supportsImages?1:0,purposes_json:JSON.stringify([...purposes].sort()),max_tokens:maxTokens,timeout_ms:timeoutMs,token_parameter:tokenParameter,send_temperature:sendTemperature?1:0,credential_cipher:old?.credential_cipher||null,credential_key_id:credentialKeyId,credential_revision:credentialRevision,execution_revision:'',revision,status:'active',created:old?.created||now,updated:now};
  if(secret)row.credential_cipher=await encrypt(env,row,secret);
  row.execution_revision=await digest({apiUrl,model,supportsImages,purposes:[...purposes].sort(),maxTokens,timeoutMs,tokenParameter,sendTemperature,credentialRevision});
 }
 const hashKeyId=deleting?null:vault(env).current,hash=await operationHash(env,hashKeyId,hashPayload),result={profileId,revision,deleted:deleting},guard='EXISTS(SELECT 1 FROM personal_model_operations WHERE owner=? AND request_id=? AND request_hash=?)',binds=[who.principal,body.requestId,hash];
 const claim=env.DB.prepare("INSERT OR IGNORE INTO personal_model_operations SELECT ?,?,?,?,?,?,? WHERE COALESCE((SELECT revision FROM personal_model_profiles WHERE id=? AND owner=?),0)=? AND NOT EXISTS(SELECT 1 FROM background_grant_revocations WHERE grant_id=?) AND (SELECT COUNT(*) FROM personal_model_operations WHERE owner=? AND created>?)<60 AND (?=0 OR (SELECT COUNT(*) FROM personal_model_profiles WHERE owner=? AND status='active')<8)").bind(who.principal,body.requestId,hash,hashKeyId,profileId,JSON.stringify(result),now,profileId,who.principal,body.expectedRevision,who.grant_id,who.principal,now-3600000,id?0:1,who.principal);
 const columns=Object.keys(row),values=Object.values(row),write=old?env.DB.prepare(`UPDATE personal_model_profiles SET ${columns.map(c=>c+'=?').join(',')} WHERE id=? AND owner=? AND revision=? AND ${guard}`).bind(...values,profileId,who.principal,body.expectedRevision,...binds):env.DB.prepare(`INSERT OR IGNORE INTO personal_model_profiles(${columns.join(',')}) SELECT ${columns.map(()=>'?').join(',')} WHERE ${guard}`).bind(...values,...binds);
 await env.DB.batch([claim,write,env.DB.prepare(`INSERT OR IGNORE INTO personal_model_revisions SELECT ?,?,?,?,? WHERE ${guard}`).bind(profileId,revision,JSON.stringify(metadata(env,row)),action,now,...binds)]);
 const accepted=await env.DB.prepare('SELECT request_hash,result_json FROM personal_model_operations WHERE owner=? AND request_id=?').bind(who.principal,body.requestId).first<{request_hash:string;result_json:string}>();if(!accepted)fail(409,'配置版本、数量或登录状态已变化，请刷新后核对。');if(accepted.request_hash!==hash)fail(409,'同一配置操作编号不能提交不同内容。');return JSON.parse(accepted.result_json);
}
export async function handlePersonalModels(req:Request,env:Env,who:Who,input:ReadInput):Promise<Response|null>{
 const path=new URL(req.url).pathname,match=path.match(/^\/api\/model\/personal(?:\/(personal_[a-f0-9]{32}))?$/);if(!match&&path!=='/api/model/settings')return null;
 if(!['teacher','admin'].includes(who.role))fail(403,'此操作需要教师账号。');
 if(path==='/api/model/settings'){if(req.method!=='GET')fail(405,'设置请求方式不支持。');const rows=await env.DB.prepare("SELECT * FROM personal_model_profiles WHERE owner=? AND status='active' ORDER BY created,id LIMIT 8").bind(who.principal).all<PersonalModel>();return Response.json({vaultReady:personalVaultReady(env),profiles:rows.results.map(r=>metadata(env,r)),providers:modelProviders},{headers:{'Cache-Control':'no-store'}});}
 if(req.method==='POST'&&!match![1]||['PUT','DELETE'].includes(req.method)&&match![1])return Response.json(await mutate(env,who,match![1],await input(req,16384),req.method==='DELETE'),{headers:{'Cache-Control':'no-store'}});fail(405,'个人模型请求方式不支持。');
}
