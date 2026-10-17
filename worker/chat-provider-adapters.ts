import {HttpError} from './errors';
// Convert only the validated subset accepted by WriteAscend. No remote URLs,
// tools, arbitrary headers or model-generated instructions are executed.
export function anthropicRequest(apiUrl:string,payload:{messages:any[];[key:string]:any}){
 const system=payload.messages.filter(m=>m.role==='system').map(m=>typeof m.content==='string'?m.content:m.content.filter((p:any)=>p.type==='text').map((p:any)=>p.text).join('\n')).join('\n\n');
 const messages=payload.messages.filter(m=>m.role!=='system').map(m=>({role:m.role,content:typeof m.content==='string'?m.content:m.content.map((part:any)=>{
  if(part.type==='text')return {type:'text',text:part.text};
  const match=part.image_url?.url?.match(/^data:(image\/(?:png|jpe?g|gif|webp));base64,([a-zA-Z0-9+/=\r\n]+)$/);if(!match)throw new HttpError(400,'Claude 图片请求须使用已上传的有效图片。');
  return {type:'image',source:{type:'base64',media_type:match[1]==='image/jpg'?'image/jpeg':match[1],data:match[2]}};
 })}));
 if(!messages.length)throw new HttpError(400,'请提供需要处理的作文或题目。');
 const url=new URL(apiUrl);url.pathname=url.pathname.replace(/\/(?:chat\/completions|messages)\/?$/,'')+'/messages';
 return {url:url.href,payload:{model:payload.model,max_tokens:payload.max_tokens||payload.max_completion_tokens||10000,...(system?{system}:{}),messages,stream:false}};
}
export function providerHeaders(provider:string,key:string):Record<string,string>{return provider==='anthropic'?{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'}:{'Content-Type':'application/json',Authorization:'Bearer '+key};}
export function normalizeChatResponse(provider:string,raw:string){
 if(provider!=='anthropic')return raw;
 let body:any;try{body=JSON.parse(raw);}catch{throw new HttpError(422,'Claude 返回格式无法读取，请检查接口地址。');}
 if(body.type==='error'||!Array.isArray(body.content))throw new HttpError(422,'Claude 未返回有效的批阅内容。');
 if(body.stop_reason==='max_tokens')throw new HttpError(422,'Claude 输出达到上限，请提高配置中的最大输出量后明确重新批阅。');
 const content=body.content.filter((p:any)=>p.type==='text'&&typeof p.text==='string').map((p:any)=>p.text).join('\n');if(!content.trim())throw new HttpError(422,'Claude 没有返回文字结果，请检查模型和输出量。');
 return JSON.stringify({choices:[{message:{role:'assistant',content}}],usage:{prompt_tokens:body.usage?.input_tokens||0,completion_tokens:body.usage?.output_tokens||0},model:body.model});
}
