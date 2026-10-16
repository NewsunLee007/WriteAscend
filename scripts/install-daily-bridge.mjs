import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=process.argv[2] && path.resolve(process.argv[2]);
const apply=process.argv.includes('--apply');
if(!target)throw Error('Usage: node scripts/install-daily-bridge.mjs /absolute/path/to/Daily [--apply]');
const bundle=path.join(root,'integrations/daily');
const manifest=JSON.parse(fs.readFileSync(path.join(bundle,'patch-manifest.json'),'utf8'));
const additions=['src/writing-bridge.mjs','src/writing-authority.mjs','src/writing-directory.mjs','src/writing-school-config.mjs','public/writing-connect.html','public/writing-connect.mjs','public/writing-connect.css','test/writing-login-routing.test.mjs'];
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const installed=new Map();
const snapshots=path.join(root,'audit/private');
if(fs.existsSync(snapshots))for(const directory of fs.readdirSync(snapshots).filter(s=>s.startsWith('daily-bridge-'))){
  const record=path.join(snapshots,directory,'snapshot.json');
  if(!fs.existsSync(record))continue;
  const previous=JSON.parse(fs.readFileSync(record,'utf8'));
  if(previous.target!==target)continue;
  for(const file of previous.files){if(!installed.has(file.name))installed.set(file.name,new Set());installed.get(file.name).add(file.after);}
}
const original=Object.keys(manifest).every(name=>hash(fs.readFileSync(path.join(target,name)))===manifest[name].before);
const patched=Object.keys(manifest).every(name=>hash(fs.readFileSync(path.join(target,name)))===manifest[name].after);
if(!original&&!patched)throw Error('Daily source has changed since patch preparation. Review and regenerate the patch before installing.');
for(const name of additions)if(fs.existsSync(path.join(target,name))){
  const current=hash(fs.readFileSync(path.join(target,name)));
  if(current!==hash(fs.readFileSync(path.join(bundle,name)))&&!installed.get(name)?.has(current))throw Error('Existing integration file differs: '+name);
}
const patch=path.join(bundle,'daily.patch');
if(original)execFileSync('git',['-C',target,'apply','--check',patch],{stdio:'pipe'});
if(!apply){console.log(JSON.stringify({ok:true,alreadyPatched:patched,changes:[...Object.keys(manifest),...additions],productionRestart:false}));process.exit(0);}
if(patched&&additions.every(name=>fs.existsSync(path.join(target,name))&&hash(fs.readFileSync(path.join(target,name)))===hash(fs.readFileSync(path.join(bundle,name))))){console.log('Daily integration already matches this bundle.');process.exit(0);}
const snapshot=path.join(root,'audit/private/daily-bridge-'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(snapshot,{recursive:true,mode:0o700});
const previous=new Map();
for(const name of [...Object.keys(manifest),...additions]){
  const file=path.join(target,name),bytes=fs.existsSync(file)?fs.readFileSync(file):null;previous.set(name,bytes);
  if(bytes){fs.mkdirSync(path.dirname(path.join(snapshot,name)),{recursive:true,mode:0o700});fs.writeFileSync(path.join(snapshot,name),bytes,{mode:0o600});}
}
try{
  if(original)execFileSync('git',['-C',target,'apply',patch],{stdio:'pipe'});
  for(const name of additions)fs.copyFileSync(path.join(bundle,name),path.join(target,name));
  const files=[...previous].map(([name,bytes])=>({name,existed:bytes!==null,before:bytes?hash(bytes):null,after:hash(fs.readFileSync(path.join(target,name)))}));
  fs.writeFileSync(path.join(snapshot,'snapshot.json'),JSON.stringify({target,files},null,2),{mode:0o600});
  console.log(JSON.stringify({ok:true,snapshot,productionRestart:false,environmentChanged:false}));
}catch(error){
  for(const [name,bytes]of previous){const file=path.join(target,name);if(bytes)fs.writeFileSync(file,bytes);else fs.rmSync(file,{force:true});}
  throw error;
}
