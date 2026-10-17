import type {Env} from './index';
import {HttpError} from './errors';
import {readPersonalModel,personalModelKey,validatePersonalEndpoint} from './personal-models';
import {providerById,curatedModels,modelRecommendation,modelCatalogCheckedAt,type ModelPurpose} from '../src/teacher/model-providers';
const cached=new Map<string,{expires:number;result:any}>();
async function readBounded(response:Response){if(!response.body)throw new HttpError(502,'供应商没有返回模型目录。');const reader=response.body.getReader();let text='',size=0;const decoder=new TextDecoder();while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>1024*1024){await reader.cancel();throw new HttpError(502,'供应商模型目录过大，请使用内置精选型号。');}text+=decoder.decode(chunk.value,{stream:true});}try{return JSON.parse(text+decoder.decode());}catch{throw new HttpError(502,'供应商目录格式暂不支持，请使用内置精选型号。');}}
export async function discoverModels(req:Request,env:Env,who:{principal:string;role:string},input:(req:Request,max?:number)=>Promise<unknown>):Promise<Response|null>{
 if(new URL(req.url).pathname!=='/api/model/discover')return null;
 if(!['teacher','admin'].includes(who.role))throw new HttpError(403,'此操作需要教师账号。');
 if(req.method!=='POST')throw new HttpError(405,'请使用模型目录刷新入口。');
 const body=await input(req,16384) as any,provider=providerById(body?.provider),purpose=body?.purpose as ModelPurpose;
 if(!provider||!['grading','ocr'].includes(purpose))throw new HttpError(400,'请选择供应商和模型用途。');
 if(['apiUrl','apiKey','credentialProfileId'].some(key=>body[key]!==undefined&&typeof body[key]!=='string')||body.force!==undefined&&typeof body.force!=='boolean')throw new HttpError(400,'模型目录参数不正确，请重新选择服务商。');
 const json=(value:any)=>Response.json(value,{headers:{'Cache-Control':'no-store'}});
 const fallback={source:'builtin',checkedAt:modelCatalogCheckedAt,models:curatedModels(provider.id,purpose),total:provider.models.length};
 if(provider.id==='custom')return json({...fallback,message:'自定义接口的模型能力需人工核对，请填写确切的视觉型号。'});
 let secret=typeof body.apiKey==='string'?body.apiKey.trim():'';
 const endpoint=body.apiUrl?validatePersonalEndpoint(body.apiUrl,env,provider.wireFormat==='anthropic'?'anthropic':provider.id==='mistral'?'mistral-ocr':'chat'):provider.apiUrl;
 if(!secret&&body.credentialProfileId){const saved=await readPersonalModel(env,who.principal,body.credentialProfileId);if(!saved||saved.provider!==provider.id||new URL(saved.api_url).origin!==new URL(endpoint).origin)throw new HttpError(400,'密钥与供应商不匹配，请重新选择或输入密钥。');secret=await personalModelKey(env,saved);}
 if(!provider.modelsUrl)return json({...fallback,message:'该服务商尚无已核实的账户目录接口，已刷新官方精选。其他已开通的视觉型号可手动填写。'});
 if(!secret)return json({...fallback,message:'已载入内置精选。填写或选择密钥后自动查询账户目录。'});
 if(secret.length<8||secret.length>4096||/[^\x21-\x7e]/.test(secret))throw new HttpError(400,'请核对 API 密钥格式。');
 // A saved key is never sent to a different draft host. Known-provider list
 // requests stay on the selected endpoint origin; redirects are never followed.
 const url=new URL(endpoint),official=new URL(provider.apiUrl);
 let listUrl=provider.modelsUrl;
 if(url.origin!==official.origin||provider.id==='qwen'&&url.hostname!==official.hostname){listUrl=provider.id==='qwen'&&url.hostname.endsWith('.aliyuncs.com')?url.origin+'/api/v1/models':url.origin+url.pathname.replace(/\/(?:chat\/completions|ocr|messages)$/,'')+'/models';}
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode([who.principal,provider.id,purpose,listUrl,secret].join('\n')))),b=>b.toString(16).padStart(2,'0')).join('');
 const hit=cached.get(hash);if(hit&&hit.expires>Date.now()&&!body.force)return json(hit.result);
 const ids:string[]=[];let total=0;
 try{
  for(let page=1;page<=2;page++){
   const target=new URL(listUrl);if(provider.id==='qwen'){target.searchParams.set('page_no',String(page));target.searchParams.set('page_size','100');target.searchParams.set('name','qwen');}
   const response=await fetch(target,{headers:provider.wireFormat==='anthropic'?{'x-api-key':secret,'anthropic-version':'2023-06-01',Accept:'application/json'}:{Authorization:'Bearer '+secret,Accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(12000)});
   if(!response.ok){await response.body?.cancel();if([401,403].includes(response.status))throw new HttpError(400,'目录鉴权未通过，请核对密钥、地域和账户权限。');if(response.status===429)throw new HttpError(429,'供应商目录刷新过于频繁，请稍后重试。');throw new HttpError(502,'供应商暂未提供可读取的目录，内置精选仍可选择。');}
   const value=await readBounded(response),rows=Array.isArray(value)?value:Array.isArray(value.data)?value.data:Array.isArray(value.output?.models)?value.output.models:Array.isArray(value.models)?value.models:Array.isArray(value.data?.models)?value.data.models:null;
   if(!rows)throw new HttpError(502,'供应商目录格式暂不支持，内置精选仍可选择。');
   total+=rows.length;for(const row of rows){const id=typeof row==='string'?row:row?.id||row?.model||row?.name;const input=row?.input_modalities||row?.architecture?.input_modalities||row?.inference_metadata?.request_modality,output=row?.output_modalities||row?.architecture?.output_modalities||row?.inference_metadata?.response_modality;const noImage=(Array.isArray(input)&&!input.some((v:unknown)=>String(v).toLowerCase()==='image'))||row?.capabilities?.image_input?.supported===false,noText=Array.isArray(output)&&!output.some((v:unknown)=>String(v).toLowerCase()==='text');if(typeof id==='string'&&id.length<=120&&!id.includes(secret)&&!noImage&&!noText&&(provider.id==='hunyuan'?(!row?.status||row.status==='online'):!['offline','retired','deleted','disabled'].includes(String(row?.status).toLowerCase()))&&(row?.capabilities?.vision!==false||row?.capabilities?.ocr===true||typeof id==='string'&&!!modelRecommendation(provider.id,id)?.specialist))ids.push(id.replace(/^models\//,''));}
   if(provider.id!=='qwen'||rows.length<100)break;
  }
 }catch(error){if(error instanceof HttpError)throw error;throw new HttpError(502,'供应商目录连接超时或中断，可重试或继续使用内置精选。');}
 const result={source:'account',checkedAt:new Date().toISOString(),models:curatedModels(provider.id,purpose,ids),total,message:'目录可见不代表已开通调用，请检查连接和图片识别。'};
 for(const [key,value] of cached)if(value.expires<Date.now())cached.delete(key);if(cached.size>=100)cached.delete(cached.keys().next().value!);cached.set(hash,{expires:Date.now()+60000,result});return json(result);
}
