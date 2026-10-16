import type {Env} from './index';
import {HttpError} from './errors';
const fail=(status:number,message:string):never=>{throw new HttpError(status,message);};
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const sha=async(value:ArrayBuffer|string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',typeof value==='string'?new TextEncoder().encode(value):value)),b=>b.toString(16).padStart(2,'0')).join('');
const maxBytes=12*1024*1024;
type Asset={id:string;owner:string;object_key:string;sha256:string;mime:string;bytes:number};
function contentType(bytes:Uint8Array){
  if(bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return 'image/jpeg';
  if([137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b))return 'image/png';
  const head=new TextDecoder().decode(bytes.subarray(0,12));
  if(head.startsWith('GIF87a')||head.startsWith('GIF89a'))return 'image/gif';
  if(head.startsWith('RIFF')&&head.slice(8)==='WEBP')return 'image/webp';
  return null;
}
async function readBytes(req:Request){
  if(!req.body)fail(400,'请选择原稿图片。');
  if(Number(req.headers.get('content-length'))>maxBytes)fail(413,'单张原稿请控制在 12 MiB 以内。');
  const reader=req.body!.getReader(),chunks:Uint8Array[]=[];let length=0;
  while(true){const r=await reader.read();if(r.done)break;length+=r.value.byteLength;if(length>maxBytes){await reader.cancel();fail(413,'单张原稿请控制在 12 MiB 以内。');}chunks.push(r.value);}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return bytes;
}
export async function readPrivateAsset(env:Env,owner:string,id:string){
  const row=await env.DB.prepare('SELECT * FROM private_assets WHERE id=? AND owner=? AND ready=1').bind(id,owner).first<Asset>();
  if(!row)throw new HttpError(404,'原稿图片不存在。');
  const object=await env.FILES.get(row.object_key);
  if(!object)throw new HttpError(503,'原稿图片暂时无法读取，请稍后重试。');
  return {row,object};
}
export async function handleAssets(req:Request,env:Env,owner:string):Promise<Response|null>{
  const path=new URL(req.url).pathname;
  if(path==='/api/assets'&&req.method==='POST'){
    const bytes=await readBytes(req),mime=contentType(bytes);if(!mime)throw new HttpError(415,'请上传 JPG、PNG、WebP 或 GIF 原稿。');
    const digest=await sha(bytes.buffer),existing=await env.DB.prepare('SELECT * FROM private_assets WHERE owner=? AND sha256=? AND ready=1').bind(owner,digest).first<Asset>();
    if(existing)return json({id:existing.id,sha256:digest,mime:existing.mime,bytes:existing.bytes});
    const id=crypto.randomUUID(),key='private-assets/'+await sha(owner)+'/'+digest;
    await env.FILES.put(key,bytes as any,{httpMetadata:{contentType:mime}});
    await env.DB.prepare('INSERT OR IGNORE INTO private_assets(id,owner,object_key,sha256,mime,bytes,ready,created) VALUES(?,?,?,?,?,?,1,?)').bind(id,owner,key,digest,mime,bytes.byteLength,Date.now()).run();
    const row=await env.DB.prepare('SELECT id FROM private_assets WHERE owner=? AND sha256=? AND ready=1').bind(owner,digest).first<{id:string}>();
    return json({id:row!.id,sha256:digest,mime,bytes:bytes.byteLength},201);
  }
  const match=path.match(/^\/api\/assets\/([a-f0-9-]{36})(\/meta)?$/);
  if(match&&req.method==='GET'){
    if(match[2]){
      const row=await env.DB.prepare('SELECT id,sha256,mime,bytes FROM private_assets WHERE id=? AND owner=? AND ready=1').bind(match[1],owner).first();
      if(!row)throw new HttpError(404,'原稿图片不存在。');return json(row);
    }
    const {row,object}=await readPrivateAsset(env,owner,match[1]);
    return new Response(object.body as any,{headers:{'Content-Type':row.mime,'Content-Length':String(row.bytes),'Content-Disposition':'inline; filename="original.'+row.mime.split('/')[1]+'"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  }
  return null;
}
export async function hydrateAssetImages(env:Env,owner:string,payload:any){
  let total=0;
  const messages=[];
  for(const message of payload.messages){
    if(!Array.isArray(message.content)){messages.push(message);continue;}
    const content=[];
    for(const part of message.content){
      const url=part.type==='image_url'?part.image_url?.url:'';
      if(typeof url==='string'&&url.startsWith('wa-asset:')){
        const {row,object}=await readPrivateAsset(env,owner,url.slice(9));
        total+=row.bytes;if(total>maxBytes)throw new HttpError(413,'本次图片内容过大，请拆分处理。');
        const bytes=new Uint8Array(await object.arrayBuffer());let binary='';
        for(let offset=0;offset<bytes.length;offset+=8192)binary+=String.fromCharCode(...bytes.subarray(offset,offset+8192));
        content.push({...part,image_url:{url:'data:'+row.mime+';base64,'+btoa(binary)}});
      }else{
        if(typeof url==='string'&&url.startsWith('data:')){total+=Math.ceil(url.length*3/4);if(total>maxBytes)throw new HttpError(413,'本次图片内容过大，请拆分处理。');}
        content.push(part);
      }
    }
    messages.push({...message,content});
  }
  return {...payload,messages};
}
