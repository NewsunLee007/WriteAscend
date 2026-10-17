import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {DatabaseSync,backup} from 'node:sqlite';

export const activationKeys=[
  'WRITING_BRIDGE_SERVICE_TOKEN','WRITING_BRIDGE_STORAGE_KEY','WRITING_ALLOWED_CALLBACKS',
  'WRITING_PEER_SERVICE_TOKEN','WRITING_PEER_STORAGE_KEY','WRITING_PEER_ALLOWED_CALLBACKS',
];
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const inside=(parent,child)=>{const relative=path.relative(parent,child);return relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));};
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function regular(file){if(!fs.lstatSync(file).isFile())throw Error('Expected a regular file: '+file);}
function privateFile(file,bytes){fs.writeFileSync(file,bytes,{mode:0o600,flag:'wx'});}
export function envValues(bytes){
  const values=new Map();
  // Match Daily config.mjs: first occurrence wins, even if empty.
  for(const raw of bytes.toString('utf8').split(/\r?\n/)){
    const line=raw.trim(),at=line.indexOf('=');if(!line||line.startsWith('#')||at<0)continue;
    const key=line.slice(0,at).trim();let value=line.slice(at+1).trim();
    if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'")))value=value.slice(1,-1);
    if(!values.has(key))values.set(key,value);
  }
  return values;
}
export function activationEnv(before,pack,teacherOrigin,peerOrigin,inherited=process.env){
  if(Object.keys(pack).sort().join()!==[...activationKeys].sort().join())throw Error('Expected exactly the six Daily writing variables.');
  const current=envValues(before);
  for(const key of activationKeys){
    if(key in inherited)throw Error('Writing variable inherited from process environment: '+key);
    if(current.get(key))throw Error('Writing variable already configured: '+key);
    if(typeof pack[key]!=='string'||!pack[key]||/[\r\n"'\s#]/.test(pack[key]))throw Error('Invalid writing variable: '+key);
  }
  for(const origin of [teacherOrigin,peerOrigin]){const url=new URL(origin);if(url.protocol!=='https:'||url.origin!==origin)throw Error('Expected an exact HTTPS application origin.');}
  if(teacherOrigin===peerOrigin)throw Error('Teacher and peer applications must be separate.');
  if(pack.WRITING_ALLOWED_CALLBACKS!==teacherOrigin+'/api/auth/callback'||pack.WRITING_PEER_ALLOWED_CALLBACKS!==peerOrigin+'/api/auth/callback')throw Error('Callback origin mismatch.');
  const secrets=activationKeys.filter(key=>!key.endsWith('CALLBACKS')).map(key=>pack[key]);
  if(new Set(secrets).size!==4||secrets.some(value=>!/^[-_A-Za-z0-9]{43,128}$/.test(value)))throw Error('Four independent strong writing secrets are required.');
  const eol=before.includes(Buffer.from('\r\n'))?'\r\n':'\n';
  // Remove only empty prior writing assignments; leave all unrelated bytes intact.
  const kept=before.toString('utf8').split(/(?<=\n)/).filter(raw=>{
    const line=raw.trim(),at=line.indexOf('=');return line.startsWith('#')||at<0||!activationKeys.includes(line.slice(0,at).trim());
  }).join('');
  return Buffer.from(kept+(kept&&!kept.endsWith('\n')?eol:'')+'# WriteAscend / independent peer staging login'+eol+activationKeys.map(key=>key+'='+pack[key]+eol).join(''));
}
export async function backupDatabase(source,destination){
  regular(source);if(fs.existsSync(destination))throw Error('Backup destination already exists.');
  privateFile(destination,Buffer.alloc(0));let db;
  try{
    db=new DatabaseSync(source,{readOnly:true});db.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=5000');
    await backup(db,destination,{rate:64});
    const check=new DatabaseSync(destination,{readOnly:true});
    try{if(check.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw Error('SQLite backup verification failed.');}finally{check.close();}
    fs.chmodSync(destination,0o600);
    return {name:path.basename(destination),sha256:hash(fs.readFileSync(destination)),bytes:fs.statSync(destination).size,verified:true};
  }catch(error){fs.rmSync(destination,{force:true});throw error;}finally{db?.close();}
}
export async function prepareActivation({daily,pack,teacherOrigin,peerOrigin,backupDirectory,inherited=process.env}){
  daily=fs.realpathSync(daily);const parent=fs.realpathSync(path.dirname(backupDirectory));backupDirectory=path.join(parent,path.basename(backupDirectory));
  if(inside(root,backupDirectory)||inside(daily,backupDirectory))throw Error('Real Daily backups must be outside both checkouts.');
  const env=path.join(daily,'.env');regular(env);const before=fs.readFileSync(env),after=activationEnv(before,pack,teacherOrigin,peerOrigin,inherited);
  const values=envValues(before);
  if(values.get('DAILY_LINE_DATA_DIR')||inherited.DAILY_LINE_DATA_DIR)throw Error('Custom Daily data directory requires an explicitly reviewed backup plan.');
  fs.mkdirSync(backupDirectory,{mode:0o700});
  privateFile(path.join(backupDirectory,'env.before'),before);privateFile(path.join(backupDirectory,'env.after'),after);
  const databases=[];
  for(const [relative,name] of [['data/daily-line.sqlite','daily-line.sqlite'],['storage/recitations/recitations.sqlite','recitations.sqlite']])databases.push(await backupDatabase(path.join(daily,relative),path.join(backupDirectory,name)));
  if(hash(fs.readFileSync(env))!==hash(before))throw Error('Daily environment changed during preparation. Prepare a fresh snapshot.');
  const record={version:1,daily,preparedAt:new Date().toISOString(),before:hash(before),after:hash(after),originalMode:fs.statSync(env).mode&0o777,teacherOrigin,peerOrigin,databases,applied:false};
  privateFile(path.join(backupDirectory,'record.json'),JSON.stringify(record,null,2));
  return {ok:true,backupDirectory,databases:databases.map(({name,bytes,verified})=>({name,bytes,verified})),environmentChanged:false,productionRestart:false};
}
export function switchActivation(directory,rollback=false){
  directory=fs.realpathSync(directory);const record=JSON.parse(fs.readFileSync(path.join(directory,'record.json'),'utf8'));
  if(record.version!==1||!path.isAbsolute(record.daily))throw Error('Invalid activation snapshot.');
  const env=path.join(record.daily,'.env');regular(env);
  const wanted=rollback?'before':'after',expected=rollback?'after':'before';
  for(const side of ['before','after'])if(hash(fs.readFileSync(path.join(directory,'env.'+side)))!==record[side])throw Error('Environment backup checksum mismatch.');
  for(const item of record.databases){if(!['daily-line.sqlite','recitations.sqlite'].includes(item.name)||hash(fs.readFileSync(path.join(directory,item.name)))!==item.sha256)throw Error('Database backup checksum mismatch.');}
  const lock=env+'.writing-activation.lock';fs.mkdirSync(lock,{mode:0o700});let temporary;
  try{
    if(hash(fs.readFileSync(env))!==record[expected])throw Error('Daily environment changed; refusing to overwrite concurrent configuration.');
    if(!rollback&&Date.now()-Date.parse(record.preparedAt)>15*60_000)throw Error('Activation snapshot is older than 15 minutes. Prepare fresh backups during maintenance.');
    temporary=path.join(record.daily,'.env.writing-'+crypto.randomUUID());privateFile(temporary,fs.readFileSync(path.join(directory,'env.'+wanted)));
    fs.chmodSync(temporary,record.originalMode&0o600);
    if(hash(fs.readFileSync(env))!==record[expected])throw Error('Daily environment changed before replacement.');
    fs.renameSync(temporary,env);temporary=undefined;
    return {ok:true,environmentChanged:true,rolledBack:rollback,productionRestart:false,databasesChanged:false};
  }finally{if(temporary)fs.rmSync(temporary,{force:true});fs.rmdirSync(lock);}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [mode,target,packFile,destination]=process.argv.slice(2);
  if(mode==='prepare'){
    const teacher=JSON.parse(fs.readFileSync(path.join(root,'wrangler.jsonc'),'utf8')).env.staging.vars.PUBLIC_ORIGIN;
    const peer=JSON.parse(fs.readFileSync(path.join(root,'apps/peer-review/wrangler.jsonc'),'utf8')).env.staging.vars.PUBLIC_ORIGIN;
    if(!target||!packFile||!destination)throw Error('Usage: daily-activation.mjs prepare DAILY PRIVATE_PACK NEW_BACKUP_DIRECTORY');
    console.log(JSON.stringify(await prepareActivation({daily:target,pack:JSON.parse(fs.readFileSync(packFile,'utf8')),teacherOrigin:teacher,peerOrigin:peer,backupDirectory:destination})));
  }else if(['apply','rollback'].includes(mode)&&target&&process.argv.includes('--apply'))console.log(JSON.stringify(switchActivation(target,mode==='rollback')));
  else throw Error('Usage: daily-activation.mjs apply|rollback SNAPSHOT --apply. Neither command restarts Daily.');
}
