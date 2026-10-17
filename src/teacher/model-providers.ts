export type ModelPurpose='grading'|'ocr';
export type ModelPreset={id:string;label:string;purposes:ModelPurpose[];description:string;specialist?:boolean;preview?:boolean};
export type ModelProvider={id:string;label:string;region:string;apiUrl:string;modelsUrl:string;helpUrl:string;visionUrl:string;keyUrl:string;pricingUrl:string;keySteps:string;tokenParameter:'max_tokens'|'max_completion_tokens';sendTemperature:boolean;models:ModelPreset[]};
export const modelCatalogCheckedAt='2026-10-17';
const vision:ModelPurpose[]=['grading','ocr'];
// Recommendations are reviewed against official docs; account discovery never
// turns an unreviewed audio/image-generation/text-only model into a vision model.
export const modelProviders:ModelProvider[]=[
 {id:'qwen',label:'阿里云百炼 · 千问',region:'国内 · 默认北京地域',apiUrl:'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',modelsUrl:'https://dashscope.aliyuncs.com/api/v1/models',helpUrl:'https://help.aliyun.com/zh/model-studio/base-url',visionUrl:'https://help.aliyun.com/zh/model-studio/vision-model',keyUrl:'https://help.aliyun.com/zh/model-studio/get-api-key',pricingUrl:'https://help.aliyun.com/zh/model-studio/model-pricing',keySteps:'进入百炼，开通模型服务，在北京地域创建 API Key。地域或业务空间地址与密钥需对应。',tokenParameter:'max_tokens',sendTemperature:true,models:[
  {id:'qwen3.8-flash',label:'Qwen3.8 Flash',purposes:vision,description:'批量作文优先尝试，兼顾处理速度与视觉理解。'},
  {id:'qwen3.8-max',label:'Qwen3.8 Max',purposes:vision,description:'用于较复杂的写作要求和精细反馈，先用小批作文核对。'},
  {id:'qwen3.5-ocr',label:'千问 OCR · Qwen3.5',purposes:['ocr'],description:'专用文字识别，适合题目、纸面姓名与班级。',specialist:true},
  {id:'qwen-vl-ocr-latest',label:'千问 VL OCR',purposes:['ocr'],description:'专用文字识别的兼容选择。',specialist:true}]},
 {id:'glm',label:'智谱开放平台 · GLM',region:'国内',apiUrl:'https://open.bigmodel.cn/api/paas/v4/chat/completions',modelsUrl:'',helpUrl:'https://docs.bigmodel.cn/cn/guide/models/vlm/glm-4.6v',visionUrl:'https://docs.bigmodel.cn/cn/guide/models/vlm/glm-4.6v',keyUrl:'https://bigmodel.cn/usercenter/proj-mgmt/apikeys',pricingUrl:'https://bigmodel.cn/pricing',keySteps:'注册智谱开放平台，在 API Keys 页面创建密钥，并确认账户已开通所选视觉模型。',tokenParameter:'max_tokens',sendTemperature:true,models:[
  {id:'glm-4.6v',label:'GLM-4.6V',purposes:vision,description:'视觉理解与长文本反馈；不同于纯文字 GLM 型号。'},
  {id:'glm-4.6v-flash',label:'GLM-4.6V Flash',purposes:vision,description:'轻量视觉方案，适合先测试图片读取与响应速度。'}]},
 {id:'siliconflow',label:'硅基流动 · SiliconFlow',region:'国内',apiUrl:'https://api.siliconflow.cn/v1/chat/completions',modelsUrl:'https://api.siliconflow.cn/v1/models',helpUrl:'https://docs.siliconflow.cn/docs/userguide/quickstart',visionUrl:'https://docs.siliconflow.cn/docs/api/chat-completions-post',keyUrl:'https://cloud.siliconflow.cn/account/ak',pricingUrl:'https://cloud.siliconflow.cn/models',keySteps:'登录硅基流动，在 API 密钥页面新建密钥。只筛选视觉语言型号，保留模型完整组织名前缀。',tokenParameter:'max_tokens',sendTemperature:true,models:[
  {id:'Qwen/Qwen3-VL-30B-A3B-Instruct',label:'Qwen3 VL · 30B Instruct',purposes:vision,description:'视觉语言模型，适合图片作文；输出格式由系统适配。'}]},
 {id:'gemini',label:'Google Gemini',region:'国际',apiUrl:'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',modelsUrl:'https://generativelanguage.googleapis.com/v1beta/openai/models',helpUrl:'https://ai.google.dev/gemini-api/docs/openai',visionUrl:'https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash',keyUrl:'https://aistudio.google.com/apikey',pricingUrl:'https://ai.google.dev/gemini-api/docs/pricing',keySteps:'进入 Google AI Studio，为项目创建 API Key；根据项目状态启用相应计费与模型访问。',tokenParameter:'max_tokens',sendTemperature:true,models:[
  {id:'gemini-3.8-flash',label:'Gemini 3.8 Flash',purposes:vision,description:'当前稳定视觉模型，适合整篇作文理解与反馈。'},
  {id:'gemini-3.5-flash-lite',label:'Gemini 3.5 Flash-Lite',purposes:vision,description:'轻量批量方案，先核对手写识别和评分质量。'}]},
 {id:'openai',label:'OpenAI',region:'国际',apiUrl:'https://api.openai.com/v1/chat/completions',modelsUrl:'https://api.openai.com/v1/models',helpUrl:'https://developers.openai.com/api/docs/models/gpt-6.1-sol',visionUrl:'https://developers.openai.com/api/docs/guides/images-vision',keyUrl:'https://platform.openai.com/api-keys',pricingUrl:'https://developers.openai.com/api/docs/pricing',keySteps:'进入 OpenAI API 平台，在项目中创建 API Key，并核对项目计费与模型权限。ChatGPT 订阅和 API 账户分别管理。',tokenParameter:'max_completion_tokens',sendTemperature:false,models:[
  {id:'gpt-6.1-sol',label:'GPT-6.1 Sol',purposes:vision,description:'复杂作文要求与完整反馈的均衡选择。'},
  {id:'gpt-6-luna',label:'GPT-6 Luna',purposes:vision,description:'面向批量任务的轻量视觉模型。'},
  {id:'gpt-6-astra',label:'GPT-6 Astra',purposes:vision,description:'高能力方案；调用前核对供应商价格与用量。'}]},
 {id:'mistral',label:'Mistral · 专业 OCR',region:'国际',apiUrl:'https://api.mistral.ai/v1/ocr',modelsUrl:'https://api.mistral.ai/v1/models',helpUrl:'https://docs.mistral.ai/studio/document-processing/basic_ocr',visionUrl:'https://docs.mistral.ai/api/endpoint/ocr',keyUrl:'https://console.mistral.ai/api-keys',pricingUrl:'https://mistral.ai/pricing',keySteps:'进入 Mistral 控制台创建 API Key，确认 Document AI / OCR 的账户权限及计费。',tokenParameter:'max_tokens',sendTemperature:false,models:[
  {id:'mistral-ocr-4-1',label:'Mistral OCR 4.1',purposes:['ocr'],description:'专业文档与图片文字识别，使用独立 OCR 接口。',specialist:true},
  {id:'mistral-ocr-latest',label:'Mistral OCR · 最新别名',purposes:['ocr'],description:'跟随供应商更新的 OCR 型号，使用前检查效果。',specialist:true}]},
 {id:'custom',label:'其他兼容接口',region:'自定义',apiUrl:'',modelsUrl:'',helpUrl:'https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create',visionUrl:'',keyUrl:'',pricingUrl:'',keySteps:'填写服务地址与密钥。自定义型号需自行确认图片输入与结构化文本输出能力。',tokenParameter:'max_tokens',sendTemperature:true,models:[]}
];
export const providerById=(id:string)=>modelProviders.find(p=>p.id===id);
export function modelRecommendation(providerId:string,id:string):ModelPreset|null{
 const provider=providerById(providerId),known=provider?.models.find(m=>m.id===id);if(known)return known;
 if(!provider||id.length>120||!/^[-a-zA-Z0-9_./]+$/.test(id)||/(?:audio|tts|live|realtime|image|embedding|rerank|codex|transcribe|omni|thinking)/i.test(id))return null;
 let allowed=false,specialist=false;
 if(providerId==='qwen'){specialist=/^qwen(?:3\.5-ocr|-vl-ocr)(?:-latest|-\d{4}-\d{2}-\d{2})?$/.test(id);allowed=specialist||/^qwen3\.[5-8]-(?:plus|flash|max)(?:-latest|-\d{4}-\d{2}-\d{2}|-\d{4})?$/.test(id)||/^qwen3-vl-(?:plus|flash)(?:-latest|-\d{4}-\d{2}-\d{2})?$/.test(id);}
 if(providerId==='openai')allowed=/^(?:gpt-6\.1-sol|gpt-6-(?:astra|luna))(?:-\d{4}-\d{2}-\d{2})?$/.test(id);
 if(providerId==='gemini')allowed=/^gemini-(?:3\.[678]-flash|3\.5-flash-lite|3\.1-pro-preview)(?:-\d{2}-\d{2})?$/.test(id);
 if(providerId==='glm')allowed=/^glm-4\.[56]v(?:-flashx?)?$/.test(id);
 if(providerId==='siliconflow')allowed=/^(?:Pro\/)?Qwen\/Qwen3(?:\.\d+)?-VL-[\w-]+-Instruct$/.test(id);
 if(providerId==='mistral'){specialist=/^mistral-ocr-(?:latest|4-1)$/.test(id);allowed=specialist;}
 return allowed?{id,label:id,purposes:specialist?['ocr']:['grading','ocr'],specialist,description:specialist?'专用图片文字识别；请核对实际手写效果。':'账户返回的视觉型号；请先检查图片输入与报告输出。'}:null;
}
export function curatedModels(providerId:string,purpose:ModelPurpose,ids?:string[]){
 const provider=providerById(providerId);if(!provider)return [];
 const models=(ids?ids.map(id=>modelRecommendation(providerId,id)).filter((m):m is ModelPreset=>!!m):provider.models).filter(m=>m.purposes.includes(purpose));
 const unique=[...new Map(models.map(m=>[m.id,m])).values()];
 return unique.sort((a,b)=>Number(!!b.specialist)-Number(!!a.specialist)||(provider.models.findIndex(m=>m.id===a.id)<0?99:provider.models.findIndex(m=>m.id===a.id))-(provider.models.findIndex(m=>m.id===b.id)<0?99:provider.models.findIndex(m=>m.id===b.id))||b.id.localeCompare(a.id,undefined,{numeric:true})).slice(0,8);
}
export function modelProtocol(providerId:string,model:string){return providerId==='mistral'&&/^mistral-ocr-/.test(model)?'mistral-ocr':providerId==='qwen'&&/^qwen(?:3\.5-ocr|-vl-ocr)/.test(model)?'qwen-ocr':'chat';}
