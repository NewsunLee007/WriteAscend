type Asset={id:string;sha256:string;mime:string;bytes:number};
const cache=new Map<string,string>();
const uuid=/^[a-f0-9-]{36}$/;
async function error(response:Response){
  let message='原稿未能同步，请检查网络后重试。';try{message=(await response.json()).error?.message||message;}catch{}
  return Object.assign(new Error(message),{status:response.status});
}
export async function uploadCloudAsset(blob:Blob,workspaceId:string,signal?:AbortSignal):Promise<Asset>{
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');
  const key='wa_asset:'+workspaceId+':'+hash;
  let existing=cache.get(key);try{existing ||=localStorage.getItem(key)||undefined;}catch{}
  if(existing&&uuid.test(existing)){
    const response=await fetch('/api/assets/'+existing+'/meta',{signal,cache:'no-store'});
    if(response.ok){const asset=await response.json() as Asset;if(asset.sha256===hash)return asset;}
    else if(response.status!==404)throw await error(response);
  }
  const response=await fetch('/api/assets',{method:'POST',headers:{'Content-Type':blob.type||'application/octet-stream','X-Workspace-Id':workspaceId},body:blob,signal});
  if(!response.ok)throw await error(response);
  const asset=await response.json() as Asset;
  if(!uuid.test(asset.id)||asset.sha256!==hash)throw Error('原稿保存校验未通过，请重试。');
  cache.set(key,asset.id);try{localStorage.setItem(key,asset.id);}catch{}
  return asset;
}
function imageBlob(url:string){
  const match=url.match(/^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,([a-zA-Z0-9+/=\r\n]+)$/);
  if(!match)throw Error('请使用 JPG、PNG、WebP 或 GIF 图片。');
  const binary=atob(match[2]),bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return new Blob([bytes],{type:match[1]});
}
export async function storePayloadImages(payload:any,workspaceId:string,signal:AbortSignal){
  const assetIds:string[]=[],messages=[];
  for(const message of payload.messages){
    if(!Array.isArray(message.content)){messages.push(message);continue;}
    const content=[];
    for(const part of message.content){
      if(part.type==='image_url'&&typeof part.image_url?.url==='string'&&part.image_url.url.startsWith('data:')){
        const asset=await uploadCloudAsset(imageBlob(part.image_url.url),workspaceId,signal);assetIds.push(asset.id);
        content.push({...part,image_url:{url:'wa-asset:'+asset.id}});
      }else{if(part.type==='image_url'&&/^wa-asset:[a-f0-9-]{36}$/.test(part.image_url?.url||''))assetIds.push(part.image_url.url.slice(9));content.push(part);}
    }
    messages.push({...message,content});
  }
  return {payload:{...payload,messages},assetIds:[...new Set(assetIds)]};
}
