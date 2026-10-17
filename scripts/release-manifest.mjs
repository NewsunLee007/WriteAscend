import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const requireThat=(ok,message)=>{if(!ok)throw Error(message);};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function validateStaging(root,peer){
 const a=root.env?.staging,b=peer.env?.staging;
 requireThat(a&&b,'Both applications need an explicit staging environment.');
 requireThat(root.account_id&&root.account_id===peer.account_id,'Staging applications must use the same explicit Cloudflare account.');
 requireThat(a.name==='writeascend-staging'&&b.name==='newsun-writing-peer-staging','Unexpected staging Worker name.');
 for(const [config,env] of [[root,a],[peer,b]]){
  requireThat(env.workers_dev===true&&env.preview_urls===false,'Use explicit staging workers.dev origins without version preview URLs.');
  requireThat([config,env].every(v=>!v.routes?.length&&!v.route&&!v.domains?.length&&!v.domain),'Staging cannot alter production routes or custom domains.');
  requireThat(env.version_metadata?.binding==='VERSION','Version metadata binding is required.');
  requireThat(config.assets?.run_worker_first===true,'Page security headers must run before static assets.');
  requireThat(Object.entries(env.vars||{}).every(([key,value])=>!/(?:TOKEN|SECRET|API_KEY|STORAGE_KEY|VAULT_KEY$)/i.test(key)&&!String(value).includes('synthetic-local-')),'Staging vars cannot contain service credentials or local QA values.');
  requireThat(env.d1_databases?.length===1&&env.d1_databases[0].binding==='DB'&&uuid.test(env.d1_databases[0].database_id)&&!/^0{8}-/.test(env.d1_databases[0].database_id)&&env.d1_databases[0].database_name.includes('staging'),'Use a real, separate staging D1 database.');
  requireThat(env.vars.DAILY_ORIGIN==='https://daily.newsunenglish.com','Unexpected school identity origin.');
 }
 const u=new URL(a.vars.PUBLIC_ORIGIN),v=new URL(b.vars.PUBLIC_ORIGIN),suffix=u.hostname.slice(a.name.length+1);
 requireThat(u.protocol==='https:'&&v.protocol==='https:'&&u.origin===a.vars.PUBLIC_ORIGIN&&v.origin===b.vars.PUBLIC_ORIGIN&&u.hostname===a.name+'.'+suffix&&suffix.endsWith('.workers.dev')&&v.hostname===b.name+'.'+suffix,'Staging origins must match their workers.dev names and account subdomain.');
 requireThat(a.d1_databases[0].database_id!==b.d1_databases[0].database_id,'The two applications cannot share a D1 database.');
 requireThat(a.vars.PEER_ORIGIN===b.vars.PUBLIC_ORIGIN&&b.vars.SOURCE_ORIGIN===a.vars.PUBLIC_ORIGIN,'Cross-application origins do not match.');
 requireThat(a.services?.length===1&&a.services[0].binding==='PEER_SERVICE'&&a.services[0].service===b.name&&b.services?.length===1&&b.services[0].binding==='SOURCE_SERVICE'&&b.services[0].service===a.name,'Fixed service bindings must point to the other staging Worker.');
 requireThat(a.r2_buckets?.length===1&&a.r2_buckets[0].binding==='FILES'&&a.r2_buckets[0].bucket_name==='writeascend-staging-private','Unexpected private staging bucket.');
 const queues=['writeascend-staging-model-jobs','writeascend-staging-feedback-events'];
 requireThat(a.queues?.producers?.length===2&&a.queues?.consumers?.length===2&&new Set(a.queues.producers.map(q=>q.queue)).size===2&&new Set(a.queues.consumers.map(q=>q.queue)).size===2&&a.queues.producers.every(q=>queues.includes(q.queue))&&a.queues.consumers.every(q=>queues.includes(q.queue)),'Unexpected staging queues.');
 return {accountId:root.account_id,teacher:a,peer:b};
}
function assets(directory){
 requireThat(fs.existsSync(path.join(directory,'index.html')),'Build each application before preparing a release.');
 const files=[];function visit(folder){for(const entry of fs.readdirSync(folder,{withFileTypes:true})){if(entry.name.startsWith('.'))continue;const file=path.join(folder,entry.name);if(entry.isDirectory())visit(file);else if(entry.isFile()){const bytes=fs.readFileSync(file);files.push({path:path.relative(directory,file).split(path.sep).join('/'),bytes:bytes.length,sha256:hash(bytes)});}}}visit(directory);return files.sort((a,b)=>a.path.localeCompare(b.path));
}
function migrations(directory){const names=fs.readdirSync(directory).filter(n=>/^\d{4}_.+\.sql$/.test(n)).sort();requireThat(names.length&&names.every((n,i)=>Number(n.slice(0,4))===i+1),'Migration numbers must remain complete and ordered.');return names.map(name=>({name,sha256:hash(fs.readFileSync(path.join(directory,name)))}));}
export function collectRelease(rootDirectory){
 const root=JSON.parse(fs.readFileSync(path.join(rootDirectory,'wrangler.jsonc'))),peer=JSON.parse(fs.readFileSync(path.join(rootDirectory,'apps/peer-review/wrangler.jsonc'))),config=validateStaging(root,peer);
 const git=(...args)=>execFileSync('git',['-C',rootDirectory,...args],{encoding:'utf8'}).trim();
 requireThat(!git('status','--porcelain'),'Commit the reviewed source and configuration before preparing a release.');
 const tracked=git('ls-files','-z').split('\0').filter(Boolean).filter(p=>/^(?:src\/|worker\/|migrations\/|public\/|legacy\/|apps\/peer-review\/(?:src\/|worker\/|migrations\/|public\/)|(?:apps\/peer-review\/)?(?:package(?:-lock)?\.json|wrangler\.jsonc|index\.html|vite\.config\.ts)$)/.test(p));
 return {schema:'newsun-writing-staging-release-v1',createdAt:new Date().toISOString(),gitCommit:git('rev-parse','HEAD'),accountId:config.accountId,applications:[{kind:'teacher',name:config.teacher.name,origin:config.teacher.vars.PUBLIC_ORIGIN,database:config.teacher.d1_databases[0],assets:assets(path.join(rootDirectory,'dist')),migrations:migrations(path.join(rootDirectory,'migrations'))},{kind:'peer',name:config.peer.name,origin:config.peer.vars.PUBLIC_ORIGIN,database:config.peer.d1_databases[0],assets:assets(path.join(rootDirectory,'apps/peer-review/dist')),migrations:migrations(path.join(rootDirectory,'apps/peer-review/migrations'))}],sourceSha256:Object.fromEntries(tracked.map(p=>[p,hash(fs.readFileSync(path.join(rootDirectory,p)))]))};
}
export function bootstrapConfig(rootDirectory){const config=JSON.parse(fs.readFileSync(path.join(rootDirectory,'wrangler.jsonc')));delete config.env.staging.services;config.main=path.join(rootDirectory,config.main);config.assets.directory=path.join(rootDirectory,config.assets.directory);for(const env of Object.values(config.env))for(const db of env.d1_databases||[])db.migrations_dir=path.join(rootDirectory,db.migrations_dir);return config;}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const root=path.resolve(import.meta.dirname,'..'),manifest=collectRelease(root),folder=path.join(root,'output/releases',manifest.createdAt.replace(/[:.]/g,'-')+'-'+manifest.gitCommit.slice(0,8));fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');fs.writeFileSync(path.join(folder,'teacher-bootstrap.json'),JSON.stringify(bootstrapConfig(root),null,2)+'\n');console.log(JSON.stringify({directory:folder,gitCommit:manifest.gitCommit,applications:manifest.applications.map(a=>({name:a.name,assets:a.assets.length,migrations:a.migrations.length}))}));
}
