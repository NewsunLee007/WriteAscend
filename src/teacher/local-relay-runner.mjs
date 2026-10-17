// NewsunEnglish local connector. Node.js 20+; no dependencies, no inbound server.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
export function localBase(value){
 const url=new URL(value);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw Error('请使用不含密钥或查询参数的本地服务地址。');
 const h=url.hostname;if(url.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(h)&&!/^10\./.test(h)&&!/^192\.168\./.test(h)&&!/^172\.(?:1[6-9]|2\d|3[01])\./.test(h))throw Error('HTTP 仅支持本机或局域网；远程服务请使用 HTTPS。');
 url.pathname=url.pathname.replace(/\/(?:chat\/completions|models)\/?$/,'').replace(/\/+$/,'');return url.href.replace(/\/$/,'');
}
const visionName=id=>/(?:qwen[^/]*(?:vl|vision)|llava|llama[^/]*vision|gemma[34]|pixtral|internvl|molmo|minicpm[^/]*v|glm[^/]*v)/i.test(id)&&!/(?:embed|rerank|audio|tts)/i.test(id);
async function limitedJson(response,max=2*1024*1024){
 if(!response.ok){await response.body?.cancel();throw Error('请求未成功（'+response.status+'），请核对本地服务或网站连接。');}
 const reader=response.body.getReader();let size=0;const chunks=[];while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>max){await reader.cancel();throw Error('响应过长。');}chunks.push(r.value);}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export async function discoverLocal(config,request=fetch){
 const base=localBase(config.baseUrl),headers=config.apiKey?{Authorization:'Bearer '+config.apiKey}:{},get=async(url,options={})=>limitedJson(await request(url,{headers,redirect:'error',signal:AbortSignal.timeout(10000),...options}));
 const listing=await get(base+'/models'),entries=Array.isArray(listing.data)?listing.data.slice(0,64):[];
 let models=entries.filter(m=>typeof m.id==='string'&&m.id.length<=120).map(m=>({id:m.id,vision:typeof m.capabilities?.vision==='boolean'?m.capabilities.vision:visionName(m.id)}));
 if(config.runtime==='ollama'){
  const origin=new URL(base).origin;
  for(let i=0;i<models.length;i+=4)await Promise.all(models.slice(i,i+4).map(async model=>{try{const data=await get(origin+'/api/show',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({model:model.id})});if(Array.isArray(data.capabilities))model.vision=data.capabilities.includes('vision');}catch{/* Retain the conservative name-based fallback. */}}));
 }else if(config.runtime==='lmstudio'){
  try{const native=await get(new URL(base).origin+'/api/v1/models');for(const model of models){const meta=(native.models||[]).find(m=>m.key===model.id);if(meta&&meta.type&&meta.type!=='llm')model.vision=false;else if(typeof meta?.capabilities?.vision==='boolean')model.vision=meta.capabilities.vision;}}catch{/* Older servers expose only the compatible directory. */}
 }
 return models;
}
export async function executeLocal(config,job,request=fetch){
 const headers={'Content-Type':'application/json',...(config.apiKey?{Authorization:'Bearer '+config.apiKey}:{})};
 const response=await limitedJson(await request(localBase(config.baseUrl)+'/chat/completions',{method:'POST',headers,body:JSON.stringify(job.payload),redirect:'error',signal:AbortSignal.timeout(Math.min(300000,Math.max(1000,job.timeoutMs||180000)))}));
 if(typeof response.choices?.[0]?.message?.content!=='string'||!response.choices[0].message.content.trim())throw Error('本地模型未返回文本，请核对型号与图片能力。');
 // Only the compatible response is uploaded; local credentials never leave this computer.
 const value={choices:[{message:{role:'assistant',content:response.choices[0].message.content}}],...(response.usage?{usage:response.usage}:{})};return config.apiKey?JSON.parse(JSON.stringify(value).split(config.apiKey).join('[redacted]')):value;
}
export async function runRelay(config){
 if(Number(process.versions.node.split('.')[0])<20)throw Error('请先安装 Node.js 20 或更新版本。');
 const origin=new URL(config.origin);if(origin.protocol!=='https:'&&!(origin.protocol==='http:'&&['127.0.0.1','localhost'].includes(origin.hostname)))throw Error('网站连接必须使用 HTTPS。');
 localBase(config.baseUrl);
 const directory=path.join(os.homedir(),'.writeascend','local-results');await fs.mkdir(directory,{recursive:true,mode:0o700});const pendingPath=path.join(directory,config.profileId+'.json');
 let pending=null;try{pending=JSON.parse(await fs.readFile(pendingPath,'utf8'));}catch(error){if(error.code!=='ENOENT')throw Error('本机待回传结果无法读取，请先保留文件后检查。');}
 const cloud=async(action,body)=>{const response=await fetch(new URL('/api/local-relay/'+action,origin),{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+config.profileId+'.'+config.token},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(45000)});if(action==='result'&&[401,403,404,409].includes(response.status)){const detail=await response.clone().json().catch(()=>({}));if(detail.error?.code!=='local_relay_credential_invalid')return {discard:true};}if([401,403].includes(response.status))throw Object.assign(Error('本地连接凭据或批阅授权已失效，请回设置重新连接。'),{fatal:true});if([404,409].includes(response.status)&&action==='result')return {discard:true};return limitedJson(response,24*1024*1024);};
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));let models=[],lastDiscovery=0,ready=false,lastMessage='';
 const log=message=>{if(message!==lastMessage){console.log(message);lastMessage=message;}};
 console.log('NewsunEnglish 本地模型连接已启动。保持此窗口和模型服务运行；按 Ctrl+C 停止。');
 while(true){try{
  if(pending){const saved=await cloud('result',pending);if(saved.discard){await fs.writeFile(path.join(directory,pending.jobId+'.retained.json'),JSON.stringify(pending),{mode:0o600});log('原任务或配置已变化，结果已保留在本机 .writeascend/local-results 文件夹，请在网页核对。');}else log('结果已保存，可在网页核对、发布。');await fs.unlink(pendingPath).catch(error=>{if(error.code!=='ENOENT')throw error;});pending=null;}
  if(Date.now()-lastDiscovery>30000){try{models=await discoverLocal(config);ready=true;log(models.some(m=>m.vision)?'已连接本地服务，等待网页批阅任务。':'已连接；请安装视觉模型，或在网页手动确认图片能力。');}catch{ready=false;models=[];log('无法读取本地服务，请检查模型服务是否启动、地址及密钥是否正确。');}lastDiscovery=Date.now();}
  const {job}=await cloud('poll',{ready,models});if(!job){await pause(4000);continue;}
  log('正在使用本地模型处理作文…');let result;try{result={jobId:job.id,lease:job.lease,response:await executeLocal(config,job)};}catch{result={jobId:job.id,lease:job.lease,error:true};log('本地处理未确认完成，请在网页核对任务；不会自动重复推理。');}
  pending=result;await fs.writeFile(pendingPath+'.tmp',JSON.stringify(pending),{mode:0o600});await fs.chmod(pendingPath+'.tmp',0o600);await fs.rename(pendingPath+'.tmp',pendingPath);
 }catch(error){if(error.fatal)throw error;log('连接暂时中断，正在重试。已完成的待回传结果保存在本机，不会重复推理。');await pause(5000);}}
}
