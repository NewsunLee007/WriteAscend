export type ModelPurpose='grading'|'ocr';
export type ModelPreset={id:string;label:string;purposes:ModelPurpose[];description:string;specialist?:boolean;preview?:boolean};
export type ModelProvider={id:string;label:string;region:string;apiUrl:string;modelsUrl:string;helpUrl:string;visionUrl:string;keyUrl:string;pricingUrl:string;keySteps:string;tokenParameter:'max_tokens'|'max_completion_tokens';sendTemperature:boolean;wireFormat?:'anthropic';models:ModelPreset[]};
export const modelCatalogCheckedAt='2026-10-17';
const vision:ModelPurpose[]=['grading','ocr'];
// Recommendations are reviewed against official docs; account discovery never
// turns an unreviewed audio/image-generation/text-only model into a vision model.
export const modelProviders:ModelProvider[]=[
 {id:'deepseek',label:'DeepSeek · 深度求索',region:'国内',apiUrl:'https://api.deepseek.com/chat/completions',modelsUrl:'https://api.deepseek.com/models',helpUrl:'https://api-docs.deepseek.com/',visionUrl:'https://api-docs.deepseek.com/guides/vision/',keyUrl:'https://platform.deepseek.com/api_keys',pricingUrl:'https://api-docs.deepseek.com/quick_start/pricing/',keySteps:'登录 DeepSeek 开放平台创建 API Key，并核对账户余额。照片批阅选择支持图片的 Flash；纯文字 Pro 不列入照片批阅。',tokenParameter:'max_tokens',sendTemperature:true,models:[
  {id:'deepseek-flash',label:'DeepSeek Flash · 视觉',purposes:vision,description:'官方当前视觉型号，可直接读取作文照片；默认关闭额外思考以减少等待。'}]},
 {id:'doubao',label:'火山方舟 · 豆包',region:'国内 · 北京地域',apiUrl:'https://ark.cn-beijing.volces.com/api/v3/chat/completions',modelsUrl:'',helpUrl:'https://www.volcengine.com/docs/82379/1399008',visionUrl:'https://docs.volcengine.com/docs/82379/1330310?lang=zh',keyUrl:'https://ark.volcengine.com/region:cn-beijing/apikey',pricingUrl:'https://www.volcengine.com/docs/82379/1544106',keySteps:'在火山方舟北京地域创建普通按量 API Key，开通所选豆包模型。接入点 ep-… 可手动填写；套餐密钥和普通按量接口需对应。',tokenParameter:'max_tokens',sendTemperature:true,models:[
  {id:'doubao-seed-2-1-lite-260915',label:'豆包 Seed 2.1 Lite',purposes:vision,description:'通用多模态型号，适合先测试批量作文识别与反馈。'},
  {id:'doubao-seed-2-1-pro-260915',label:'豆包 Seed 2.1 Pro',purposes:vision,description:'用于复杂题目、细致反馈；先用少量实际作文核对。'},
  {id:'doubao-seed-2-1-turbo-260628',label:'豆包 Seed 2.1 Turbo',purposes:vision,description:'另一种多模态速度选择，需核对账户权限与效果。'}]},
 {id:'moonshot',label:'月之暗面 · Kimi',region:'国内',apiUrl:'https://api.moonshot.cn/v1/chat/completions',modelsUrl:'https://api.moonshot.cn/v1/models',helpUrl:'https://platform.kimi.com/docs/get-api-key',visionUrl:'https://platform.kimi.com/docs/guide/use-kimi-vision-model',keyUrl:'https://platform.kimi.com/console/api-keys',pricingUrl:'https://platform.kimi.com/docs/pricing',keySteps:'登录 Kimi API 开放平台，在 API Keys 页面创建密钥，并核对账户余额。Kimi 聊天会员与开放平台 API 分别管理。',tokenParameter:'max_tokens',sendTemperature:false,models:[
  {id:'kimi-k3',label:'Kimi K3',purposes:vision,description:'当前通用多模态型号，适合整篇理解与反馈；采用较低推理强度减少等待。'},
  {id:'kimi-k2.6',label:'Kimi K2.6',purposes:vision,description:'支持图片输入的通用型号，默认使用非思考模式。'}]},
 {id:'minimax',label:'MiniMax · 稀宇科技',region:'国内',apiUrl:'https://api.minimax.cn/v1/chat/completions',modelsUrl:'',helpUrl:'https://platform.minimax.cn/docs/api-reference/text-openai-api',visionUrl:'https://platform.minimax.cn/docs/api-reference/text-openai-api',keyUrl:'https://platform.minimax.cn/console/access?tab=api-keys',pricingUrl:'https://platform.minimax.cn/docs/pricing/overview',keySteps:'在 MiniMax 国内开放平台创建普通按量 API Key。M3 支持图片；M2 系列纯文字型号不列入照片批阅。订阅套餐密钥需核对适用范围。',tokenParameter:'max_completion_tokens',sendTemperature:true,models:[
  {id:'MiniMax-M3',label:'MiniMax M3 · 多模态',purposes:vision,description:'支持图片与文本输入，使用独立文字结果，避免把思考内容混入报告。'}]},
 {id:'baidu',label:'百度智能云 · 千帆文心',region:'国内',apiUrl:'https://qianfan.baidubce.com/v2/chat/completions',modelsUrl:'https://qianfan.baidubce.com/v2/models',helpUrl:'https://cloud.baidu.com/doc/qianfan-api/s/3m7of64lb',visionUrl:'https://cloud.baidu.com/doc/qianfan-docs/s/7m95lyy43',keyUrl:'https://console.bce.baidu.com/iam/#/iam/apikey',pricingUrl:'https://cloud.baidu.com/product/wenxinworkshop/pricing',keySteps:'在百度智能云创建用于千帆 v2 接口的 API Key，并开通对应模型。使用 API Key，不使用旧版 API Key＋Secret Key 的鉴权组合。',tokenParameter:'max_tokens',sendTemperature:true,models:[
  {id:'ernie-5.0',label:'文心 ERNIE 5.0',purposes:vision,description:'文心多模态型号，适合图片理解与文字反馈；核对实际账户可用目录。'}]},
 {id:'hunyuan',label:'腾讯云 · 混元 TokenHub',region:'国内',apiUrl:'https://tokenhub.tencentmaas.com/v1/chat/completions',modelsUrl:'https://tokenhub.tencentmaas.com/v1/models',helpUrl:'https://cloud.tencent.com/document/product/1823/136956',visionUrl:'https://cloud.tencent.com/document/product/1823/136956',keyUrl:'https://console.cloud.tencent.com/tokenhub/apikey',pricingUrl:'https://cloud.tencent.com/document/product/1823/130051',keySteps:'在腾讯云 TokenHub 创建普通按量 API Key，开通视觉模型。请使用与此地址对应的 TokenHub 密钥，避免混用旧混元密钥或 Token Plan 专属密钥。',tokenParameter:'max_tokens',sendTemperature:false,models:[
  {id:'hy-vision-2.0-instruct',label:'混元 HY-Vision 2.0 Instruct',purposes:vision,description:'专门的视觉语言型号，支持多张图片理解和文字反馈。'}]},
 {id:'anthropic',label:'Anthropic · Claude',region:'国际',apiUrl:'https://api.anthropic.com/v1/messages',modelsUrl:'https://api.anthropic.com/v1/models',helpUrl:'https://platform.claude.com/docs/en/api/messages',visionUrl:'https://platform.claude.com/docs/en/build-with-claude/vision',keyUrl:'https://platform.claude.com/settings/keys',pricingUrl:'https://platform.claude.com/docs/en/about-claude/pricing',keySteps:'在 Claude API 平台指定工作区创建 API Key 并开通 API 计费。网页聊天订阅与 API 分开；系统已适配原生 Messages 接口。',tokenParameter:'max_tokens',sendTemperature:false,wireFormat:'anthropic',models:[
  {id:'claude-sonnet-5-5',label:'Claude Sonnet 5.5',purposes:vision,description:'通用视觉理解与作文反馈的均衡选择，使用原生接口。'},
  {id:'claude-haiku-5-5',label:'Claude Haiku 5.5',purposes:vision,description:'轻量视觉型号，可用于小批量比较速度与手写识别质量。'},
  {id:'claude-opus-5-5',label:'Claude Opus 5.5',purposes:vision,description:'用于复杂写作要求与细致反馈，调用前核对账户费用。'}]},
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

export function modelCapabilityIssue(provider:string,model:string,supportsImages:boolean){
 if(provider==='moonshot'&&(/^(?:kimi-k2\.5|moonshot-v1|kimi-latest|kimi-k2-)/.test(model)))return '此 Kimi 历史型号已下线，请选择当前视觉型号。';
 if(supportsImages&&(provider==='deepseek'&&['deepseek-v4-pro','deepseek-chat','deepseek-reasoner'].includes(model)||provider==='minimax'&&/^MiniMax-M2(?:[.-]|$)/.test(model)))return '此型号不支持当前照片批阅，请选择视觉型号。';
 return '';
}
