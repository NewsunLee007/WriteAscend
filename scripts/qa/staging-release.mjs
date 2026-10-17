import fs from 'node:fs';
import path from 'node:path';
import {validateStaging} from '../release-manifest.mjs';

const root=path.resolve(import.meta.dirname,'../..'),teacher=JSON.parse(fs.readFileSync(path.join(root,'wrangler.jsonc'))),peer=JSON.parse(fs.readFileSync(path.join(root,'apps/peer-review/wrangler.jsonc'))),config=validateStaging(teacher,peer);
const checks=[];
async function get(origin,route){const response=await fetch(origin+route,{redirect:'manual',signal:AbortSignal.timeout(20000),headers:{'Cache-Control':'no-cache'}}),text=await response.text();return {response,text};}
for(const [kind,env,service] of [['teacher',config.teacher,'writeascend'],['peer',config.peer,'writing-peer']]){
 const origin=env.vars.PUBLIC_ORIGIN,{response,text}=await get(origin,'/api/health');if(response.status!==200)throw Error(kind+' health status '+response.status);const health=JSON.parse(text);if(health.service!==service||!health.release?.id)throw Error(kind+' version metadata missing');
 if(!response.headers.get('cache-control')?.includes('no-store'))throw Error(kind+' health is cacheable');
 const {response:html,text:document}=await get(origin,'/');if(html.status!==200||!document.includes('id="root"')||!html.headers.get('content-security-policy'))throw Error(kind+' page or CSP failed');
 const assets=[...document.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)].map(m=>m[1]);if(!assets.length)throw Error(kind+' HTML has no built assets');
 for(const asset of assets){const r=await get(origin,asset);if(r.response.status!==200||r.text.startsWith('<!doctype')||!r.response.headers.get('content-type')?.match(/javascript|css/))throw Error(kind+' asset failed '+asset);}
 const paths=kind==='teacher'?['/api/me','/api/classes','/api/student/reports','/api/tasks']:['/api/me','/api/rounds'];
 const protectedStatus={};for(const route of paths){const r=await get(origin,route);if(r.response.status!==401)throw Error(kind+' anonymous access unexpectedly returned '+r.response.status+' at '+route);protectedStatus[route]=r.response.status;}
 // Staging is deliberately not connected to the running school identity server
 // in this deployment stage. This flag is a configuration observation only.
 checks.push({kind,origin,release:health.release,loginConfigured:health.loginConfigured,page:html.status,assets:assets.length,anonymousProtectedStatus:protectedStatus});
}
console.log(JSON.stringify({passed:true,checkedAt:new Date().toISOString(),checks,schoolLoginVerified:false,studentDataVerified:false}));
