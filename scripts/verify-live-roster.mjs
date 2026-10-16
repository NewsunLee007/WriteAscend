// Read the configured authority through the production adapter. Directory rows
// exist only in memory; output contains counts, never student identity rows.
import {DatabaseSync} from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {readWritingAuthority} from '../integrations/daily/src/writing-directory.mjs';
import {createWritingBridge} from '../integrations/daily/src/writing-bridge.mjs';
import {createWritingRoster} from '../integrations/daily/src/writing-authority.mjs';
const sourceFile=process.argv[2]||path.join(os.homedir(),'Library/Application Support/WordUp/data/wordup.sqlite3');
const authority=readWritingAuthority(sourceFile),db=new DatabaseSync(':memory:');
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
try{
  const bridge=createWritingBridge({db,publicOrigin:'https://audit.invalid',serviceToken:'synthetic-readonly-audit-service-token',storageKey:'synthetic-readonly-audit-encryption-key',callbacks:['https://audit.invalid/callback'],resolveIdentity:async()=>{throw Error('No actual authentication is used by this audit');},verifySource:async()=>{throw Error('No actual authentication is used by this audit');}});
  await bridge.handle({method:'GET',headers:{}},{writeHead(){},end(){}},new URL('https://audit.invalid/api/integrations/writeascend/audit-initialize'));
  db.prepare('INSERT INTO writing_schools VALUES(?,?,?)').run('audit-only-school','Isolated audit; not a real school','active');
  const groups=new Map();for(const s of authority.students){const key=JSON.stringify([s.grade,s.class_name]);if(!groups.has(key))groups.set(key,{id:crypto.randomUUID(),grade:s.grade,name:s.class_name,students:[]});groups.get(key).students.push(s);}
  const roster=createWritingRoster({db,sourceFile}),seen=new Set(),byGrade=new Map();let pages=0;
  for(const c of groups.values()){
    db.prepare('INSERT INTO writing_classes VALUES(?,?,?,?,?,?,?,?)').run(c.id,'audit-only-school','__AUDIT_NOT_AN_ACADEMIC_YEAR__',c.name,c.name,c.grade,'active',1);
    for(const s of c.students)db.prepare('INSERT INTO writing_memberships(class_id,provider,subject,started) VALUES(?,?,?,?)').run(c.id,'wordup',s.id,'audit-only');
    const members=[],cursors=new Set();let after='',snapshotHash='';
    do{
      const result=roster({classId:c.id,after,limit:20});pages++;assert(!snapshotHash||snapshotHash===result.snapshotHash,'Authority changed during pagination');snapshotHash=result.snapshotHash;
      for(const s of result.students){assert(!seen.has(s.subject),'Duplicate authority subject');seen.add(s.subject);members.push(s);}
      after=result.next||'';assert(!after||!cursors.has(after),'Repeated roster cursor');cursors.add(after);
    }while(after);
    assert.deepEqual(members.map(s=>({id:s.subject,name:s.name,grade:s.grade})),c.students.map(s=>({id:s.id,name:s.name,grade:s.grade})),'Roster differs from current authority');
    byGrade.set(c.grade,(byGrade.get(c.grade)||0)+members.length);
  }
  assert.equal(seen.size,authority.students.length);assert.equal(digest(readWritingAuthority(sourceFile).students),digest(authority.students),'Authority changed during audit');
  process.stdout.write(JSON.stringify({verifiedAt:new Date().toISOString(),authorityReadOnly:true,directory:'isolated-memory-only',formalDirectoryWritten:false,activeSchoolStudents:authority.students.length,classes:groups.size,matchedStudents:seen.size,missing:0,duplicates:0,pages,activeTeachers:authority.teachers.filter(t=>t.status==='active').length,sourceUnchangedDuringAudit:true,byGrade:[...byGrade].sort().map(([grade,count])=>({grade,count})),identityRowsExported:false},null,2)+'\n');
}finally{db.close();}
