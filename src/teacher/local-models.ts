// Local inference is reached by an outbound connector, never by Worker SSRF.
export const localRelayProvider={id:'local-relay',label:'本地模型连接',apiUrl:'https://local-model.invalid/v1/chat/completions',tokenParameter:'max_tokens' as const,sendTemperature:true};
export type LocalModel={id:string;vision:boolean;ocrOnly?:boolean};
export function localVisionName(id:string){return /(?:qwen[^/]*(?:vl|vision)|llava|llama[^/]*vision|gemma[34]|pixtral|internvl|molmo|minicpm[^/]*v|glm[^/]*v)/i.test(id)&&!/(?:embed|rerank|audio|tts)/i.test(id);}
export function localModelOptions(models:LocalModel[]){return [...new Map(models.filter(m=>m.vision&&!/(?:embed|rerank|audio|tts|ocr|cloud)/i.test(m.id)).map(m=>[m.id,m])).values()].slice(0,16);}
export const localRuntimes=[
 {id:'ollama',label:'Ollama',url:'http://127.0.0.1:11434/v1',help:'https://docs.ollama.com/api/openai-compatibility'},
 {id:'lmstudio',label:'LM Studio',url:'http://127.0.0.1:1234/v1',help:'https://lmstudio.ai/docs/developer/core/server'},
 {id:'compatible',label:'vLLM / 其他 OpenAI 兼容服务',url:'http://127.0.0.1:8000/v1',help:'https://docs.vllm.ai/en/latest/serving/openai_compatible_server/'}
];
