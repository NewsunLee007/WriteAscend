import crypto from 'node:crypto';
import {Readable} from 'node:stream';
import {DatabaseSync} from 'node:sqlite';
import {createWritingBridge} from '../../integrations/daily/src/writing-bridge.mjs';
import {HttpError} from '../../worker/errors';
export async function workAuthority(){
 const db=new DatabaseSync(':memory:'),callback='https://write.test/api/auth/callback',service='synthetic-work-permit-machine-credential';let clock=Date.now(),disabled=false;
 const identity=()=>{if(disabled)throw Object.assign(Error('Synthetic source disabled'),{status:401});return {provider:'wordup',subject:'teacher',role:'teacher',name:'合成教师',expires:clock+48*3600000,source:{cookie:'wordup_session=synthetic-work-teacher'}};};
 const app=createWritingBridge({db,publicOrigin:'https://daily.test',serviceToken:service,storageKey:'synthetic-work-permit-Daily-only-storage-key',callbacks:[callback],resolveIdentity:identity,verifySource:identity,now:()=>clock});
 async function call(path:string,body:any,source=false){const req=Readable.from([Buffer.from(JSON.stringify(body))]) as any;req.method='POST';req.headers={'content-type':'application/json',origin:'https://daily.test',...(source?{cookie:'wordup_session=synthetic-work-teacher'}:{authorization:'Bearer '+service})};let status=0,value:any;await app.handle(req,{writeHead(code:number){status=code;},end(text:string){value=JSON.parse(text);}},new URL('https://daily.test/api/integrations/writeascend/'+path));return {status,body:value};}
 async function login(){const verifier='v'.repeat(43),authorized=await call('authorize',{client_id:'writeascend',redirect_uri:callback,state:'s'.repeat(43),code_challenge_method:'S256',code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url')},true);if(authorized.status!==200)throw Error(JSON.stringify(authorized));const grant=await call('token',{clientId:'writeascend',redirectUri:callback,code:new URL(authorized.body.redirect).searchParams.get('code'),verifier});if(grant.status!==200)throw Error(JSON.stringify(grant));return grant.body;}
 const login1=await login();db.exec("INSERT INTO writing_schools VALUES('school','合成学校','active');INSERT INTO writing_classes VALUES('class','school','2026-1','示例班','示例班','七年级','active',1);INSERT INTO writing_teacher_class_grants VALUES('wordup','teacher','class','[\"roster.read\",\"writing.grade\",\"writing.publish\"]',1,0);");
 const bridge=async(_env:any,path:string,body:any)=>{const r=await call(path,body);if(r.status!==200)throw new HttpError(r.status,r.body.error.message);return r.body;};
 return {db,login1,login,bridge,call,tick:(ms:number)=>{clock+=ms;},disable:(value=true)=>{disabled=value;},close:()=>db.close()};
}
