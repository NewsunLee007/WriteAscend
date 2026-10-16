import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'../..'),source=process.argv[2];if(!source)throw Error('Pass the existing Daily source directory.');
const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'writeascend-daily-install-')),snapshots=[];
const manifest=JSON.parse(fs.readFileSync(path.join(root,'integrations/daily/patch-manifest.json'))),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const command=(script,...args)=>execFileSync(process.execPath,[path.join(root,'scripts',script),fixture,...args],{encoding:'utf8'});
try{
 for(const folder of ['src','public','test'])fs.mkdirSync(path.join(fixture,folder),{recursive:true});
 for(const name of Object.keys(manifest))fs.copyFileSync(path.join(source,name),path.join(fixture,name));
 function cycle(label){
  const before=new Map(Object.keys(manifest).map(name=>[name,fs.readFileSync(path.join(fixture,name))]));JSON.parse(command('install-daily-bridge.mjs'));
  const result=JSON.parse(command('install-daily-bridge.mjs','--apply'));snapshots.push(result.snapshot);
  for(const [name,entry] of Object.entries(manifest))if(hash(fs.readFileSync(path.join(fixture,name)))!==entry.after)throw Error('Unexpected installed source: '+name);
  if(!command('install-daily-bridge.mjs','--apply').includes('already matches'))throw Error('Repeated install rewrites files');
  const edit=path.join(fixture,'public/history.html'),installed=fs.readFileSync(edit);fs.appendFileSync(edit,'<!-- unrelated user edit -->');
  let rejected=false;try{command('install-daily-bridge.mjs','--apply');}catch{rejected=true;}if(!rejected)throw Error('Installer overwrote unrelated user edit');
  rejected=false;try{execFileSync(process.execPath,[path.join(root,'scripts/rollback-daily-bridge.mjs'),result.snapshot,'--apply'],{stdio:'pipe'});}catch{rejected=true;}if(!rejected)throw Error('Rollback overwrote unrelated user edit');
  fs.writeFileSync(edit,installed);execFileSync(process.execPath,[path.join(root,'scripts/rollback-daily-bridge.mjs'),result.snapshot,'--apply'],{stdio:'pipe'});
  for(const [name,bytes] of before)if(!fs.readFileSync(path.join(fixture,name)).equals(bytes))throw Error('Rollback did not restore '+name);
  if(fs.existsSync(path.join(fixture,'src/writing-feedback.mjs')))throw Error('Rollback left a newly installed source file');return {label,installed:true,idempotent:true,unrelatedChangesProtected:true,rollbackExact:true};
 }
 // Normalize the four copied source files, accepting only manifest states.
 for(const [name,entry] of Object.entries(manifest)){
  let current=hash(fs.readFileSync(path.join(fixture,name)));
  if(entry.upgrades?.[current]){execFileSync('git',['-C',fixture,'apply','--include='+name,path.join(root,'integrations/daily',entry.upgrades[current])]);current=entry.after;}
  if(current===entry.after)execFileSync('git',['-C',fixture,'apply','--reverse','--include='+name,path.join(root,'integrations/daily/daily.patch')]);
  else if(current!==entry.before)throw Error('Unknown original fixture source: '+name);
 }
 const fresh=cycle('original Daily source');
 for(const name of ['src/server.mjs','public/login-routing.mjs'])execFileSync('git',['-C',fixture,'apply','--include='+name,path.join(root,'integrations/daily/daily.patch')]);
 execFileSync('git',['-C',fixture,'apply','--reverse','--include=public/login-routing.mjs',path.join(root,'integrations/daily/daily-upgrade.patch')]);
 const upgrade=cycle('previous installed bridge');console.log(JSON.stringify({passed:true,syntheticFixtureOnly:true,checks:[fresh,upgrade],realSourceUntouched:true}));
}finally{fs.rmSync(fixture,{recursive:true,force:true});for(const snapshot of snapshots)fs.rmSync(snapshot,{recursive:true,force:true});}
