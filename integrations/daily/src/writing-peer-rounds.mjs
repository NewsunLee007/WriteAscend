import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import path from 'node:path';
import os from 'node:os';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const uuid=/^[a-f0-9-]{36}$/,hex=/^[a-f0-9]{64}$/;
const digest=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
export function readPeerTeacher(subject,sourceFile=process.env.WORDUP_REPORT_DB||path.join(os.homedir(),'Library/Application Support/WordUp/data/wordup.sqlite3')){let source;try{source=new DatabaseSync(sourceFile,{readOnly:true});source.exec('PRAGMA query_only=ON');return source.prepare('SELECT id,status FROM teacher_accounts WHERE id=?').get(subject)||null;}catch{fail(503,'学校教师账号暂时无法核验。');}finally{source?.close();}}
// Only authorizes the fixed peer client's frozen participants. No general
// directory/roster endpoint, raw source cookie or model authority is returned.
export function createPeerRoundAuthority({db,inspect,classesFor,sourceGrant,seal,unseal,verifySource,identity,epoch,readTeacher,readRoster,now}){
 let initialized=false;
 function initialize(){if(initialized)return;db.exec(`CREATE TABLE IF NOT EXISTS writing_peer_round_sources(round_id TEXT PRIMARY KEY,binding_hash TEXT NOT NULL,binding_json TEXT NOT NULL,admin_context TEXT,admin_source TEXT,created INTEGER NOT NULL,updated INTEGER NOT NULL);`);initialized=true;}
 function binding(v){if(!v||!uuid.test(v.exportId)||!hex.test(v.contentHash)||typeof v.classId!=='string'||!v.classId||v.classId.length>200||!Number.isSafeInteger(v.classVersion)||v.classVersion<1||!Number.isSafeInteger(v.grantVersion)||v.grantVersion<1||!v.owner||!['wordup','daily_legacy_admin'].includes(v.owner.provider)||typeof v.owner.subject!=='string'||!v.owner.subject||v.owner.subject.length>200||!['teacher','admin'].includes(v.owner.role)||!Array.isArray(v.members)||v.members.length<2||v.members.length>300)fail(400,'互评来源、班级或参与学生不完整。');
  const members=v.members.map(m=>{if(!m||m.provider!=='wordup'||typeof m.subject!=='string'||!m.subject||m.subject.length>200)fail(400,'互评学生须来自学校稳定账号。');return {provider:'wordup',subject:m.subject};}).sort((a,b)=>a.subject<b.subject?-1:a.subject>b.subject?1:0);if(new Set(members.map(m=>m.subject)).size!==members.length)fail(400,'本轮学生不能重复。');return {exportId:v.exportId,contentHash:v.contentHash,classId:v.classId,classVersion:v.classVersion,grantVersion:v.grantVersion,owner:{provider:v.owner.provider,subject:v.owner.subject,role:v.owner.role},members};
 }
 const ownerIs=(a,b)=>a.provider===b.provider&&a.subject===b.subject&&a.role===b.role;
 function classroom(b){const c=classesFor(b.owner).find(c=>c.id===b.classId&&c.scopes.includes('peer.manage'));if(!c)fail(403,'任课教师的本班互评权限已经撤销。');if(c.version!==b.classVersion||c.grantVersion!==b.grantVersion)fail(409,'本轮班级或教师授权已改变，请老师重新安排。');return c;}
 async function authority(b,adminRow){
  const c=classroom(b);
  if(b.owner.role==='teacher'){
   if(b.owner.provider!=='wordup')fail(403,'任课教师账号不正确。');let a;try{a=await readTeacher(b.owner.subject);}catch{fail(503,'学校账号状态暂时无法核验。');}if(!a||a.id!==b.owner.subject||a.status!=='active')fail(403,'任课教师账号已停用。');
  }else{
   if(!adminRow?.admin_source||!adminRow.admin_context)fail(403,'管理员需重新确认本轮授权。');const context=JSON.parse(adminRow.admin_context);if(epoch(context.source_hash)!==context.source_epoch)fail(403,'管理员来源授权已变化，请重新确认本轮。');let v;try{v=identity(await verifySource(unseal({...context,source_sealed:adminRow.admin_source})));}catch(e){fail([401,403].includes(e.status)?403:503,[401,403].includes(e.status)?'管理员来源授权已失效，请重新确认本轮。':'管理员账号暂时无法核验。');}if(!ownerIs(v,b.owner))fail(403,'管理员身份已变化。');
  }
  const expected=new Set(b.members.map(m=>m.subject)),names=new Map();let after='',snapshot='',count=0;const cursors=new Set();
  do{let page;try{page=await readRoster({classId:b.classId,after,limit:100});}catch{fail(503,'本轮学校名单暂时无法核验。');}if(!page||!Array.isArray(page.students)||page.students.length>100||!hex.test(page.snapshotHash)||snapshot&&snapshot!==page.snapshotHash)fail(409,'名单在核验期间改变，请老师重新安排。');snapshot=page.snapshotHash;
   for(const s of page.students)if(expected.has(s.subject)){if(typeof s.name!=='string'||!s.name||names.has(s.subject))fail(503,'学校学生回执不完整或重复。');names.set(s.subject,s.name);}
   if(page.next!==null&&(typeof page.next!=='string'||!page.next||cursors.has(page.next)))fail(503,'名单分页不完整。');after=page.next||'';if(after)cursors.add(after);if(++count>50)fail(413,'本班名单分页过多。');
  }while(after);
  if(names.size!==expected.size)fail(409,'本轮有学生已停用、转班或退出目录，请老师核对。');
  const latest=classroom(b);if(latest.version!==c.version||latest.grantVersion!==c.grantVersion)fail(409,'互评授权在核验期间改变。');return names;
 }
 async function adminProof(actor,roundId,b){if(actor.role!=='admin')return {admin_context:null,admin_source:null};const grant=sourceGrant(actor.grantId);if(!grant)fail(401,'请重新登录管理员账号。');const context={id:'round:'+roundId+':'+digest(b),provider:actor.provider,subject:actor.subject,role:actor.role,source_hash:grant.source_hash,source_epoch:grant.source_epoch};return {admin_context:JSON.stringify(context),admin_source:seal(unseal(grant),context)};}
 return async function handle(endpoint,body){if(!endpoint.startsWith('round/'))return null;initialize();const actor=await inspect(body.grantId);
  if(endpoint==='round/preview'||endpoint==='round/authorize'){
   const b=binding(body.binding);if(!ownerIs(actor,b.owner)||!['teacher','admin'].includes(actor.role))fail(403,'只有原任课教师可以安排本轮。');const id=endpoint==='round/authorize'?body.roundId:crypto.randomUUID();if(!uuid.test(id))fail(400,'互评轮次编号不正确。');const proof=await adminProof(actor,id,b),names=await authority(b,proof),hash=digest(b);
   // Recheck the actor after asynchronous authority reads, including source logout.
   const latest=await inspect(body.grantId);if(!ownerIs(latest,b.owner))fail(401,'当前账号已变化，请重新登录。');classroom(b);
   if(endpoint==='round/authorize'){
    const old=db.prepare('SELECT * FROM writing_peer_round_sources WHERE round_id=?').get(id);if(old&&old.binding_hash!==hash)fail(409,'该轮次已关联其他来源内容。');
    db.prepare('INSERT INTO writing_peer_round_sources VALUES(?,?,?,?,?,?,?) ON CONFLICT(round_id) DO UPDATE SET admin_context=excluded.admin_context,admin_source=excluded.admin_source,updated=excluded.updated WHERE binding_hash=excluded.binding_hash').run(id,hash,JSON.stringify(b),proof.admin_context,proof.admin_source,now(),now());
   }
   return {active:true,bindingHash:hash,members:b.members.map(m=>({subject:m.subject,name:names.get(m.subject)}))};
  }
  if(endpoint!=='round/check')fail(404,'互评轮次授权接口不存在。');if(!uuid.test(body.roundId))fail(400,'互评轮次编号不正确。');const row=db.prepare('SELECT * FROM writing_peer_round_sources WHERE round_id=?').get(body.roundId);if(!row)fail(404,'互评轮次尚未授权。');const b=JSON.parse(row.binding_json),isOwner=ownerIs(actor,b.owner);
  if(!isOwner&&!(actor.role==='student'&&actor.provider==='wordup'&&b.members.some(m=>m.subject===actor.subject)&&actor.classes.some(c=>c.id===b.classId&&c.scopes.includes('peer.own'))))fail(404,'没有分配给当前账号的互评轮次。');
  const names=await authority(b,row),latest=await inspect(body.grantId);if(latest.provider!==actor.provider||latest.subject!==actor.subject||latest.role!==actor.role)fail(401,'当前账号已变化。');
  if(!isOwner&&!latest.classes.some(c=>c.id===b.classId&&c.scopes.includes('peer.own')))fail(403,'当前学校成员关系已改变。');return {active:true,bindingHash:row.binding_hash,role:isOwner?'teacher':'student',...(isOwner?{members:b.members.map(m=>({subject:m.subject,name:names.get(m.subject)}))}:{})};
 };
}
