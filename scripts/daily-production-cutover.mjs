import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {activationKeys,envValues,backupDatabase,switchActivation} from './daily-activation.mjs';
const teacher='https://writeascend.newsunenglish.com',peer='https://newsun-writing-peer-production.317792050.workers.dev';
const oldTeacher='https://writeascend-staging.317792050.workers.dev',oldPeer='https://newsun-writing-peer-staging.317792050.workers.dev';
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
export function productionCallbacks(before,inherited=process.env){
 const values=envValues(before);for(const key of activationKeys)if(key in inherited)throw Error('An inherited bridge variable would override the saved Daily configuration.');
 for(const key of activationKeys.filter(k=>!k.endsWith('CALLBACKS')))if(!values.get(key))throw Error('Daily writing bridge is not configured.');
 const edits=new Map([['WRITING_ALLOWED_CALLBACKS',[teacher,oldTeacher]],['WRITING_PEER_ALLOWED_CALLBACKS',[peer,oldPeer]]]);
 for(const [key,origins] of edits){const current=(values.get(key)||'').split(',');const allowed=origins.map(o=>o+'/api/auth/callback');if(!current.length||current.some(v=>!allowed.includes(v))||new Set(current).size!==current.length)throw Error('Unexpected existing callback list; review before replacement.');}
 const eol=before.includes(Buffer.from('\r\n'))?'\r\n':'\n';const seen=new Set();
 const after=before.toString('utf8').split(/(?<=\n)/).map(raw=>{const line=raw.trim(),at=line.indexOf('=');if(line.startsWith('#')||at<0)return raw;const key=line.slice(0,at).trim();if(!edits.has(key))return raw;if(seen.has(key))throw Error('Duplicate callback variable.');seen.add(key);return key+'='+edits.get(key).map(o=>o+'/api/auth/callback').join(',')+(raw.endsWith('\n')?eol:'');}).join('');
 if(seen.size!==2)throw Error('Expected both existing callback variables.');const parsed=envValues(Buffer.from(after));for(const key of activationKeys.filter(k=>!k.endsWith('CALLBACKS')))if(values.get(key)!==parsed.get(key))throw Error('Bridge credential changed unexpectedly.');
 return Buffer.from(after);
}
export async function prepareProductionCallbacks(daily,directory,inherited=process.env){
 daily=fs.realpathSync(daily);directory=path.resolve(directory);const repo=path.resolve(import.meta.dirname,'..');for(const folder of [repo,daily]){const rel=path.relative(folder,directory);if(!rel||!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel))throw Error('Private backup must be outside both repositories.');}
 const env=path.join(daily,'.env'),before=fs.readFileSync(env),after=productionCallbacks(before,inherited);if(before.equals(after))throw Error('Production callbacks are already configured.');if(envValues(before).get('DAILY_LINE_DATA_DIR')||inherited.DAILY_LINE_DATA_DIR)throw Error('Custom Daily data directory requires explicit backup review.');
 fs.mkdirSync(directory,{mode:0o700});for(const [name,bytes] of [['env.before',before],['env.after',after]])fs.writeFileSync(path.join(directory,name),bytes,{mode:0o600,flag:'wx'});
 const databases=[];for(const [relative,name] of [['data/daily-line.sqlite','daily-line.sqlite'],['storage/recitations/recitations.sqlite','recitations.sqlite']])databases.push(await backupDatabase(path.join(daily,relative),path.join(directory,name)));
 if(hash(fs.readFileSync(env))!==hash(before))throw Error('Daily environment changed during backup.');
 const record={version:1,daily,preparedAt:new Date().toISOString(),before:hash(before),after:hash(after),originalMode:fs.statSync(env).mode&0o777,teacherOrigin:teacher,peerOrigin:peer,databases,applied:false};fs.writeFileSync(path.join(directory,'record.json'),JSON.stringify(record,null,2),{mode:0o600,flag:'wx'});
 return {ok:true,backupDirectory:directory,databases:databases.map(({name,bytes,verified})=>({name,bytes,verified})),environmentChanged:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const [mode,target,destination]=process.argv.slice(2);if(mode==='prepare'&&target&&destination)console.log(JSON.stringify(await prepareProductionCallbacks(target,destination)));else if(['apply','rollback'].includes(mode)&&target&&process.argv.includes('--apply'))console.log(JSON.stringify(switchActivation(target,mode==='rollback')));else throw Error('Usage: daily-production-cutover.mjs prepare DAILY NEW_PRIVATE_DIRECTORY | apply/rollback SNAPSHOT --apply. This tool does not restart Daily.');}
