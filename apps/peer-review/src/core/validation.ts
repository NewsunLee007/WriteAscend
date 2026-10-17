export class PeerError extends Error {
 constructor(public code:string,message:string,public details?:unknown){super(message);this.name='PeerError';}
}
export function requireThat(condition:unknown,code:string,message:string,details?:unknown):asserts condition{if(!condition)throw new PeerError(code,message,details);}
export function record(value:unknown,keys:string[]){requireThat(value&&typeof value==='object'&&!Array.isArray(value),'invalid_fields','请提交完整的互评内容。');const object=value as Record<string,unknown>;requireThat(Object.keys(object).every(k=>keys.includes(k)),'invalid_fields','互评内容包含不支持的字段。');return object;}
export function text(value:unknown,label:string,min=1,max=1200){requireThat(typeof value==='string'&&value.trim().length>=min&&value.trim().length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value),'invalid_text','请填写有效的'+label+'。');return value.trim();}
export function id(value:unknown){return text(value,'记录编号',1,128);}
export function integer(value:unknown,min:number,max:number,label:string){requireThat(typeof value==='number'&&Number.isSafeInteger(value)&&value>=min&&value<=max,'invalid_number',label+'不正确。');return value;}
export async function hash(value:unknown){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))),b=>b.toString(16).padStart(2,'0')).join('');}
export function freeze<T>(value:T):T{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
