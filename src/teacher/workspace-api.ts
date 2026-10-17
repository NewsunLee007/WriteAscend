export async function workspaceApi(path:string,workspace:string,body?:unknown,method=body?'POST':'GET',signal?:AbortSignal){
 const response=await fetch(path,{method,cache:'no-store',signal,headers:{'Content-Type':'application/json','X-Workspace-Id':workspace},...(body?{body:JSON.stringify(body)}:{})});
 let value:any;try{value=await response.json();}catch{throw Error('暂时无法读取页面数据，请检查连接后重试。');}
 if(!response.ok)throw Object.assign(Error(value.error?.message||'操作暂未完成，请稍后重试。'),{status:response.status});return value;
}
export async function workspaceMutation(path:string,workspace:string,body:any,method='POST',signal?:AbortSignal){
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({path,method,body}))),hash=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join(''),key='wa_pending_task:'+workspace+':'+hash;
 let requestId='';try{requestId=sessionStorage.getItem(key)||'';}catch{}requestId ||=crypto.randomUUID();try{sessionStorage.setItem(key,requestId);}catch{}
 const value=await workspaceApi(path,workspace,{...body,requestId},method,signal);try{sessionStorage.removeItem(key);}catch{}return value;
}
