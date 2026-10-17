// Prepare a reviewable plan against read-only live sources. All projected
// directory rows and administrator actions below exist only in memory.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createWritingBridge} from '../integrations/daily/src/writing-bridge.mjs';
import {createWritingDirectory,readWritingAuthority} from '../integrations/daily/src/writing-directory.mjs';
import {writingSchoolDefaults} from '../integrations/daily/src/writing-school-config.mjs';
const authorityFile=process.argv[2]||path.join(os.homedir(),'Library/Application Support/WordUp/data/wordup.sqlite3');
const dailyFile=process.argv[3]||path.resolve(import.meta.dirname,'../../每日一句/storage/recitations/recitations.sqlite');
const db=new DatabaseSync(':memory:'),tables=['writing_schools','writing_classes','writing_memberships','writing_teacher_class_grants','writing_membership_periods'];
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function existing(){
  if(!fs.existsSync(dailyFile))throw Error('The current Daily database is missing; preflight cannot assume an empty directory.');
  const source=new DatabaseSync(dailyFile,{readOnly:true});
  try{
    source.exec('BEGIN');const result={};for(const table of tables){
      if(!source.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)){result[table]=[];continue;}
      const columns=db.prepare('PRAGMA table_info('+table+')').all().map(r=>r.name);assert(columns.every(n=>/^[a-z_]+$/.test(n)));
      result[table]=source.prepare('SELECT '+columns.join(',')+' FROM '+table+' ORDER BY '+(table==='writing_teacher_class_grants'?'provider,subject,class_id':'id')).all();
    }source.exec('COMMIT');return result;
  }finally{source.close();}
}
try{
  const bridge=createWritingBridge({db,publicOrigin:'https://audit.invalid',serviceToken:'synthetic-directory-preflight-service-token',storageKey:'synthetic-directory-preflight-encryption-key',callbacks:['https://audit.invalid/callback'],resolveIdentity:async()=>{throw Error('No live identity used');},verifySource:async()=>{throw Error('No live identity used');}});
  await bridge.handle({method:'GET',headers:{}},{writeHead(){},end(){}},new URL('https://audit.invalid/api/integrations/writeascend/audit-initialize'));
  const directory=createWritingDirectory({db,readAuthority:()=>readWritingAuthority(authorityFile)}),actor={provider:'daily_legacy_admin',subject:'isolated-preflight-only',role:'admin'};
  await directory.handle('overview',{},actor);const before=existing();
  for(const table of tables)for(const row of before[table]){
    const columns=Object.keys(row);db.prepare('INSERT INTO '+table+'('+columns.join(',')+') VALUES('+columns.map(()=>'?').join(',')+')').run(...columns.map(c=>row[c]));
  }
  const overview=await directory.handle('overview',{},actor),schools=overview.schools.filter(s=>s.name===writingSchoolDefaults.schoolName&&s.status==='active');assert(schools.length<=1,'Multiple matching schools require explicit administrator selection');
  const preview=await directory.handle('preview',{schoolId:schools[0]?.id||null,schoolName:writingSchoolDefaults.schoolName,academicYear:writingSchoolDefaults.academicYear,classKeys:overview.source.classes.map(c=>c.key)},actor);
  assert.equal(digest(readWritingAuthority(authorityFile).students),preview.sourceHash,'Authority changed during preflight');assert.equal(digest(existing()),digest(before),'Formal directory changed during preflight');
  process.stdout.write(JSON.stringify({verifiedAt:new Date().toISOString(),previewOnly:true,authorityReadOnly:true,dailyReadOnly:true,formalDirectoryWritten:false,identityRowsExported:false,formalDirectoryCounts:Object.fromEntries(tables.map(t=>[t,before[t].length])),...preview,classes:preview.classes.map(({removedSamples,...c})=>c)},null,2)+'\n');
}finally{db.close();}
