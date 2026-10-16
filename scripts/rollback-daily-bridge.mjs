import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const snapshot=process.argv[2]&&path.resolve(process.argv[2]);
if(!snapshot)throw Error('Usage: node scripts/rollback-daily-bridge.mjs /absolute/path/to/snapshot [--apply]');
const record=JSON.parse(fs.readFileSync(path.join(snapshot,'snapshot.json'),'utf8'));
const allowed=new Set(['public/daily.html','public/history.html','src/server.mjs','public/login-routing.mjs','src/writing-feedback.mjs','src/writing-bridge.mjs','src/writing-authority.mjs','src/writing-directory.mjs','src/writing-school-config.mjs','public/writing-feedback.html','public/writing-feedback.css','public/writing-feedback.mjs','public/writing-entry.mjs','public/writing-connect.html','public/writing-connect.mjs','public/writing-connect.css','test/writing-login-routing.test.mjs']);
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
for(const file of record.files){
  if(!allowed.has(file.name))throw Error('Unexpected snapshot file.');
  if(hash(fs.readFileSync(path.join(record.target,file.name)))!==file.after)throw Error('Current source changed after installation. Review before rollback: '+file.name);
  if(file.existed&&hash(fs.readFileSync(path.join(snapshot,file.name)))!==file.before)throw Error('Snapshot checksum mismatch.');
}
if(!process.argv.includes('--apply')){console.log(JSON.stringify({ok:true,target:record.target,changes:record.files.map(f=>f.name),productionRestart:false}));process.exit(0);}
for(const file of record.files){
  const target=path.join(record.target,file.name);
  if(file.existed)fs.copyFileSync(path.join(snapshot,file.name),target);
  else fs.rmSync(target);
}
console.log(JSON.stringify({ok:true,restored:record.files.length,productionRestart:false,databasesChanged:false}));
