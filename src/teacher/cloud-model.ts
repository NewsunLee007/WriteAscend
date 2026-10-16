import {storePayloadImages} from './cloud-assets';
type Options={profileId:string;requestId?:string;workspaceId:string;onUnauthorized:()=>void;onAssets?:(ids:string[])=>void;onJob?:(id:string)=>void;onSettled?:(id:string)=>void};
const sha=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
function pause(ms:number,signal:AbortSignal){return new Promise<void>((resolve,reject)=>{
  signal.throwIfAborted();
  const abort=()=>{clearTimeout(timer);reject(signal.reason);};
  const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);
  signal.addEventListener('abort',abort,{once:true});
});}

// One transport per original callAI invocation. A pending ticket also survives a
// page reload; retrying a network interruption reuses that server-side job.
export function createCloudModelTransport({profileId,workspaceId,onUnauthorized,onAssets,onJob,onSettled,requestId:fixedRequestId}:Options){
  const requests=new Map<string,string>();
  return async(body:string,signal:AbortSignal)=>{
    const original=JSON.parse(body);
    const stored=await storePayloadImages({messages:original.messages,temperature:original.temperature,...(original.response_format?{response_format:original.response_format}:{})},workspaceId,signal);
    const payload=stored.payload;if(stored.assetIds.length)onAssets?.(stored.assetIds);
    const digest=await sha(profileId+'\n'+JSON.stringify(payload)),storageKey='wa_pending_model:'+workspaceId+':'+digest;
    let requestId=fixedRequestId||requests.get(digest);
    if(!requestId){
      try{const saved=sessionStorage.getItem(storageKey);if(saved&&/^[-a-zA-Z0-9_]{16,128}$/.test(saved))requestId=saved;}catch{}
      requestId ||=crypto.randomUUID();requests.set(digest,requestId);
      try{sessionStorage.setItem(storageKey,requestId);}catch{}
    }
    let response:Response|undefined;
    for(let attempt=0;attempt<3;attempt++){
      try{response=await fetch('/api/model/jobs',{method:'POST',headers:{'Content-Type':'application/json','X-Workspace-Id':workspaceId},body:JSON.stringify({profileId,requestId,payload}),signal});break;}
      catch(error){if(signal.aborted||attempt===2)throw error;await pause(1000*(attempt+1),signal);}
    }
    if(response!.status===401)onUnauthorized();
    if(response!.status!==202)return response!;
    const job=await response!.json() as {id:string};
    if(!/^[-a-f0-9]{36}$/.test(job.id))throw Error('云端任务编号不正确。');
    onJob?.(job.id);
    while(true){
      signal.throwIfAborted();
      let result:Response;
      try{result=await fetch('/api/model/jobs/'+job.id+'/result',{signal,cache:'no-store'});}
      catch(error){if(signal.aborted)throw error;await pause(2000,signal);continue;}
      if(result.status===401)onUnauthorized();
      if(result.status!==202){
        if(result.status!==401&&result.status!==503){try{sessionStorage.removeItem(storageKey);}catch{}}
        if(result.status!==401&&result.status!==503)onSettled?.(job.id);
        return result;
      }
      await result.body?.cancel();
      await pause(1500,signal);
    }
  };
}
