import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {validateProduction,productionBootstrap} from '../scripts/production-release.mjs';
import {productionCallbacks,prepareProductionCallbacks} from '../scripts/daily-production-cutover.mjs';
import {envValues,switchActivation} from '../scripts/daily-activation.mjs';
const root=JSON.parse(fs.readFileSync('wrangler.jsonc','utf8')),peer=JSON.parse(fs.readFileSync('apps/peer-review/wrangler.jsonc','utf8'));
function fixture(){return Buffer.from('# retain comments\r\nPUBLIC_ORIGIN=https://daily.newsunenglish.com\r\nWRITING_BRIDGE_SERVICE_TOKEN=synthetic-teacher-token\r\nWRITING_BRIDGE_STORAGE_KEY=synthetic-teacher-storage\r\nWRITING_PEER_SERVICE_TOKEN=synthetic-peer-token\r\nWRITING_PEER_STORAGE_KEY=synthetic-peer-storage\r\nWRITING_ALLOWED_CALLBACKS=https://writeascend-staging.317792050.workers.dev/api/auth/callback\r\nWRITING_PEER_ALLOWED_CALLBACKS=https://newsun-writing-peer-staging.317792050.workers.dev/api/auth/callback\r\nUNRELATED=keep-exactly\r\n');}
test('production deployment claims exactly the approved hostname and isolates databases, files, queues and peer services',()=>{
 assert.equal(validateProduction(root,peer).teacher.name,'writeascend-production');
 const bad=[(a:any)=>a.env.production.routes[0].pattern='*.newsunenglish.com/*',(a:any)=>a.env.production.d1_databases[0].database_id=a.env.staging.d1_databases[0].database_id,(a:any)=>a.env.production.services[0].service='newsun-writing-peer-staging',(a:any)=>a.env.production.queues.consumers[0].queue='writeascend-staging-model-jobs',(a:any)=>a.env.production.r2_buckets[0].bucket_name='writeascend-staging-private',(a:any)=>a.env.production.vars.API_KEY='private'];
 for(const change of bad){const a=structuredClone(root);change(a);assert.throws(()=>validateProduction(a,peer));}
 const b=structuredClone(peer);b.env.production.d1_databases[0].database_id=root.env.production.d1_databases[0].database_id;assert.throws(()=>validateProduction(root,b));
 const bootstrap=productionBootstrap(process.cwd());assert(!bootstrap.env.production.routes);assert(!bootstrap.env.production.services);assert.equal(bootstrap.env.production.vars.PUBLIC_ORIGIN,'https://writeascend.newsunenglish.com');assert.deepEqual(bootstrap.env.staging, {...root.env.staging,d1_databases:root.env.staging.d1_databases.map((d:any)=>({...d,migrations_dir:path.join(process.cwd(),d.migrations_dir)}))});
});
test('Daily production callback switch preserves staging login and every credential/unrelated byte, and is idempotent',()=>{
 const before=fixture(),after=productionCallbacks(before,{}),old=envValues(before),next=envValues(after);
 assert.equal(next.get('WRITING_ALLOWED_CALLBACKS'),'https://writeascend.newsunenglish.com/api/auth/callback,https://writeascend-staging.317792050.workers.dev/api/auth/callback');
 assert.equal(next.get('WRITING_PEER_ALLOWED_CALLBACKS'),'https://newsun-writing-peer-production.317792050.workers.dev/api/auth/callback,https://newsun-writing-peer-staging.317792050.workers.dev/api/auth/callback');
 for(const [key,value] of old)if(!key.endsWith('CALLBACKS'))assert.equal(next.get(key),value);assert(after.includes(Buffer.from('# retain comments\r\n')));assert.deepEqual(productionCallbacks(after,{}),after);
 assert.throws(()=>productionCallbacks(Buffer.from(before.toString().replace('writeascend-staging.317792050.workers.dev','foreign.example')),{}));assert.throws(()=>productionCallbacks(before,{WRITING_ALLOWED_CALLBACKS:'inherited'}));assert.throws(()=>productionCallbacks(Buffer.concat([before,Buffer.from('WRITING_ALLOWED_CALLBACKS=duplicate\n')]),{}));
});
test('production callback maintenance backs up active SQLite data and config rollback never overwrites later classroom records',async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'writing-production-')),daily=path.join(temp,'daily'),backup=path.join(temp,'backup');fs.mkdirSync(path.join(daily,'data'),{recursive:true});fs.mkdirSync(path.join(daily,'storage/recitations'),{recursive:true});fs.writeFileSync(path.join(daily,'.env'),fixture());const live:DatabaseSync[]=[];
 try{for(const file of ['data/daily-line.sqlite','storage/recitations/recitations.sqlite']){const db=new DatabaseSync(path.join(daily,file));db.exec("PRAGMA journal_mode=WAL; CREATE TABLE records(id INTEGER PRIMARY KEY,value TEXT); INSERT INTO records VALUES(1,'before')");live.push(db);}
 const prepared=await prepareProductionCallbacks(daily,backup,{});assert(prepared.ok);assert(prepared.databases.every((d:any)=>d.verified));assert.deepEqual(fs.readFileSync(path.join(daily,'.env')),fixture());switchActivation(backup);assert(envValues(fs.readFileSync(path.join(daily,'.env'))).get('WRITING_ALLOWED_CALLBACKS')!.startsWith('https://writeascend.newsunenglish.com/'));
 live[1].exec("INSERT INTO records VALUES(2,'after maintenance')");switchActivation(backup,true);assert.deepEqual(fs.readFileSync(path.join(daily,'.env')),fixture());assert.equal(live[1].prepare('SELECT COUNT(*) n FROM records').get()!.n,2);
 fs.appendFileSync(path.join(daily,'.env'),'CONCURRENT=change\n');assert.throws(()=>switchActivation(backup));
 }finally{for(const db of live)db.close();fs.rmSync(temp,{recursive:true,force:true});}
});
