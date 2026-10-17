import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {validateStaging} from './release-manifest.mjs';
const requireThat=(ok,message)=>{if(!ok)throw Error(message);};
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
export function validateProduction(root,peer){
 const staging=validateStaging(root,peer),a=root.env?.production,b=peer.env?.production;
 requireThat(root.account_id==='41c0024342aae8d7b6a8b67c7def1d3e','Unexpected production account.');
 requireThat(a&&b,'Both applications require an explicit production configuration.');
 requireThat(a.name==='writeascend-production'&&b.name==='newsun-writing-peer-production','Unexpected production Worker.');
 requireThat(a.vars?.PUBLIC_ORIGIN==='https://writeascend.newsunenglish.com'&&a.vars?.DAILY_ORIGIN==='https://daily.newsunenglish.com','Unexpected production school/teacher origin.');
 requireThat(b.vars?.PUBLIC_ORIGIN==='https://newsun-writing-peer-production.317792050.workers.dev'&&b.vars?.SOURCE_ORIGIN===a.vars.PUBLIC_ORIGIN&&a.vars?.PEER_ORIGIN===b.vars.PUBLIC_ORIGIN&&b.vars?.DAILY_ORIGIN===a.vars.DAILY_ORIGIN,'Production exchange origins must match.');
 requireThat(a.routes?.length===1&&a.routes[0].pattern==='writeascend.newsunenglish.com/*'&&a.routes[0].zone_id==='18f1e2f6aa0dead6233f033ffc66db5d'&&!a.routes[0].custom_domain&&!a.route&&!a.domains,'Only the authorized teacher hostname may be replaced.');
 requireThat(!b.routes?.length&&!b.route&&!b.domains,'Peer publishing must not claim an additional custom hostname.');
 const ids=new Set([staging.teacher.d1_databases[0].database_id,staging.peer.d1_databases[0].database_id]);
 for(const [env,name] of [[a,'writeascend-production'],[b,'writing-peer-production']]){
  const db=env.d1_databases?.[0];requireThat(env.d1_databases?.length===1&&db.binding==='DB'&&db.database_name===name&&/^[a-f0-9-]{36}$/.test(db.database_id)&&!/^0{8}-/.test(db.database_id)&&!ids.has(db.database_id),'Production databases must be distinct from testing and from each other.');ids.add(db.database_id);
  requireThat(env.workers_dev===true&&env.preview_urls===false&&env.version_metadata?.binding==='VERSION','Production must report immutable deployed versions and disable preview URLs.');
  requireThat(Object.entries(env.vars||{}).every(([key,value])=>!/(?:TOKEN|SECRET|API_KEY|STORAGE_KEY|VAULT_KEY$)/i.test(key)&&!String(value).includes('synthetic-local-')),'Production configuration cannot contain credentials or QA values.');
 }
 requireThat(a.r2_buckets?.length===1&&a.r2_buckets[0].binding==='FILES'&&a.r2_buckets[0].bucket_name==='writeascend-production-private','Production files need a dedicated private bucket.');
 const names=['writeascend-production-model-jobs','writeascend-production-feedback-events'];
 for(const kind of ['producers','consumers'])requireThat(a.queues?.[kind]?.length===2&&new Set(a.queues[kind].map(q=>q.queue)).size===2&&a.queues[kind].every(q=>names.includes(q.queue)),'Production queues must be isolated.');
 requireThat(a.services?.length===1&&a.services[0].binding==='PEER_SERVICE'&&a.services[0].service===b.name&&b.services?.length===1&&b.services[0].binding==='SOURCE_SERVICE'&&b.services[0].service===a.name,'Production service bindings must not point to testing.');
 return {accountId:root.account_id,teacher:a,peer:b};
}
function files(folder){const result=[];for(const e of fs.readdirSync(folder,{withFileTypes:true})){const p=path.join(folder,e.name);if(e.isDirectory())for(const item of files(p))result.push({...item,path:e.name+'/'+item.path});else result.push({path:e.name,bytes:fs.statSync(p).size,sha256:hash(fs.readFileSync(p))});}return result.sort((a,b)=>a.path.localeCompare(b.path));}
export function collectProduction(root){
 const config=validateProduction(JSON.parse(fs.readFileSync(path.join(root,'wrangler.jsonc'))),JSON.parse(fs.readFileSync(path.join(root,'apps/peer-review/wrangler.jsonc'))));
 const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();requireThat(!git('status','--porcelain'),'Commit the reviewed configuration before release.');
 const source=git('ls-files','-z').split('\0').filter(Boolean).filter(p=>/^(?:src\/|worker\/|migrations\/|public\/|apps\/peer-review\/(?:src\/|worker\/|migrations\/|public\/)|(?:apps\/peer-review\/)?(?:package(?:-lock)?\.json|wrangler\.jsonc|index\.html|vite\.config\.ts)$)/.test(p));
 const apps=[['teacher',config.teacher,''],['peer',config.peer,'apps/peer-review/']].map(([kind,env,prefix])=>{const assets=files(path.join(root,prefix+'dist'));requireThat(assets.some(a=>a.path==='index.html'),'Build both applications before releasing.');const migrations=fs.readdirSync(path.join(root,prefix+'migrations')).filter(n=>/^\d{4}_.+\.sql$/.test(n)).sort().map((name,i)=>{requireThat(Number(name.slice(0,4))===i+1,'Incomplete migrations.');return {name,sha256:hash(fs.readFileSync(path.join(root,prefix+'migrations',name)))};});return {kind,name:env.name,origin:env.vars.PUBLIC_ORIGIN,database:env.d1_databases[0],assets,migrations};});
 return {schema:'newsun-writing-production-release-v1',createdAt:new Date().toISOString(),gitCommit:git('rev-parse','HEAD'),accountId:config.accountId,applications:apps,sourceSha256:Object.fromEntries(source.map(p=>[p,hash(fs.readFileSync(path.join(root,p)))]))};
}
export function productionBootstrap(root){const config=JSON.parse(fs.readFileSync(path.join(root,'wrangler.jsonc')));delete config.env.production.routes;delete config.env.production.services;config.main=path.join(root,config.main);config.assets.directory=path.join(root,config.assets.directory);for(const env of Object.values(config.env))for(const db of env.d1_databases||[])db.migrations_dir=path.join(root,db.migrations_dir);return config;}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const root=path.resolve(import.meta.dirname,'..'),manifest=collectProduction(root),folder=path.join(root,'output/production/releases',manifest.createdAt.replace(/[:.]/g,'-')+'-'+manifest.gitCommit.slice(0,8));fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');fs.writeFileSync(path.join(folder,'teacher-bootstrap.json'),JSON.stringify(productionBootstrap(root),null,2)+'\n');console.log(JSON.stringify({directory:folder,gitCommit:manifest.gitCommit,applications:manifest.applications.map(a=>({name:a.name,assets:a.assets.length,migrations:a.migrations.length}))}));}
