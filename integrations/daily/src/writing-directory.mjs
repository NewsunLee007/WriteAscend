import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import path from 'node:path';
import os from 'node:os';
import {writingSchoolDefaults} from './writing-school-config.mjs';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const scopes=['roster.read','writing.manage','writing.grade','writing.publish'];
const classKey=(grade,name)=>hash([grade,name]);
const compare=(a,b)=>a<b?-1:a>b?1:0;
export function readWritingAuthority(sourceFile=process.env.WORDUP_REPORT_DB||path.join(os.homedir(),'Library/Application Support/WordUp/data/wordup.sqlite3')){
  let source;try{source=new DatabaseSync(sourceFile,{readOnly:true});}catch{fail(503,'学校账号库暂时无法连接。');}
  try{
    source.exec('BEGIN');
    const students=source.prepare("SELECT id,name,grade,class_name,status FROM students WHERE status='active' AND is_guest=0 AND source_key NOT LIKE 'public:%' ORDER BY id").all();
    const teachers=source.prepare('SELECT id,name,status FROM teacher_accounts ORDER BY id').all();
    source.exec('COMMIT');return {students,teachers};
  }catch{fail(503,'学校账号库暂时无法读取，请核对数据源配置。');}finally{source.close();}
}
export function createWritingDirectory({db,readAuthority=readWritingAuthority,defaults=writingSchoolDefaults,now=Date.now}){
  let initialized=false;
  function initialize(){if(initialized)return;db.exec(`
    CREATE TABLE IF NOT EXISTS writing_directory_operations(provider TEXT NOT NULL,subject TEXT NOT NULL,request_id TEXT NOT NULL,request_hash TEXT NOT NULL,result_json TEXT NOT NULL,created INTEGER NOT NULL,PRIMARY KEY(provider,subject,request_id));
    CREATE TABLE IF NOT EXISTS writing_directory_audit(id INTEGER PRIMARY KEY,provider TEXT NOT NULL,subject TEXT NOT NULL,request_id TEXT NOT NULL,action TEXT NOT NULL,summary_json TEXT NOT NULL,before_json TEXT NOT NULL,created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS writing_membership_periods(id TEXT PRIMARY KEY,class_id TEXT NOT NULL,provider TEXT NOT NULL,subject TEXT NOT NULL,name_snapshot TEXT NOT NULL,started TEXT NOT NULL,ended TEXT,observed INTEGER NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS writing_active_membership_period ON writing_membership_periods(class_id,provider,subject) WHERE ended IS NULL;
  `);initialized=true;}
  function sourceData(value){
    if(!value||!Array.isArray(value.students)||!Array.isArray(value.teachers)||value.students.length>20000)fail(503,'学校名册数据不完整或超过本次同步容量。');
    const seen=new Set();
    for(const s of value.students){if(!s||typeof s.id!=='string'||!s.id||typeof s.name!=='string'||!s.name.trim()||typeof s.grade!=='string'||!s.grade.trim()||typeof s.class_name!=='string'||!s.class_name.trim()||s.status!=='active'||seen.has(s.id))fail(503,'在用学校学生缺少唯一身份、姓名、年级或班级，请先核对账号库。');seen.add(s.id);}
    const students=value.students.map(s=>({id:s.id,name:s.name,grade:s.grade,class_name:s.class_name,status:'active'})).sort((a,b)=>compare(a.id,b.id));
    const teachers=value.teachers.map(t=>({id:t.id,name:t.name,status:t.status}));
    return {students,teachers,sourceHash:hash(students)};
  }
  function groups(source){
    const result=new Map();for(const s of source.students){const key=classKey(s.grade,s.class_name);if(!result.has(key))result.set(key,{key,sourceName:s.class_name,grade:s.grade,students:[]});result.get(key).students.push(s);}
    return [...result.values()].sort((a,b)=>compare(a.grade,b.grade)||compare(a.sourceName,b.sourceName));
  }
  function directory(){
    return {schools:db.prepare('SELECT id,name,status FROM writing_schools ORDER BY name,id').all(),classes:db.prepare("SELECT c.*,s.name AS schoolName,(SELECT COUNT(*) FROM writing_memberships m WHERE m.class_id=c.id AND m.status='active' AND m.ended IS NULL) AS memberCount FROM writing_classes c JOIN writing_schools s ON s.id=c.school_id ORDER BY c.academic_year DESC,c.grade,c.name,c.id").all(),grants:db.prepare('SELECT provider,subject,class_id AS classId,scopes,version,revoked FROM writing_teacher_class_grants ORDER BY class_id,provider,subject').all().map(g=>({...g,scopes:JSON.parse(g.scopes)}))};
  }
  function parameters(body){
    const schoolId=body.schoolId||null,schoolName=typeof body.schoolName==='string'?body.schoolName.trim():'',academicYear=typeof body.academicYear==='string'?body.academicYear.trim():'';
    if(schoolId!==null&&(typeof schoolId!=='string'||schoolId.length>128))fail(400,'请选择有效的学校。');
    if(!schoolId&&(!schoolName||schoolName.length>120||/[\x00-\x1f]/.test(schoolName)))fail(400,'请明确填写学校名称。');
    if(!/^\d{4}-[12]$/.test(academicYear))fail(400,'请填写学年学期，如 2026-1 或 2026-2。');
    if(!Array.isArray(body.classKeys)||!body.classKeys.length||body.classKeys.length>200||body.classKeys.some(k=>typeof k!=='string'||!/^[a-f0-9]{64}$/.test(k))||new Set(body.classKeys).size!==body.classKeys.length)fail(400,'请选择本次要同步的源班级，最多 200 个。');
    return {schoolId,schoolName,academicYear,classKeys:[...body.classKeys].sort()};
  }
  function plan(source,p){
    const school=p.schoolId?db.prepare("SELECT * FROM writing_schools WHERE id=? AND status='active'").get(p.schoolId):null;
    if(p.schoolId&&!school)fail(409,'所选学校已改变或停用，请刷新目录。');
    const all=groups(source),selected=p.classKeys.map(key=>{const item=all.find(c=>c.key===key);if(!item)fail(409,'源班级已改变，请刷新在用名册。');return item;});
    if(new Set(selected.map(c=>c.sourceName)).size!==selected.length)fail(409,'不同年级出现相同源班名，请先在账号库中区分班级。');
    const selectedSubjects=new Set(selected.flatMap(c=>c.students.map(s=>s.id))),current=directory();
    const transfers=current.classes.filter(c=>c.school_id===p.schoolId&&c.academic_year===p.academicYear).flatMap(c=>db.prepare("SELECT m.*,c.name AS className,c.version AS classVersion FROM writing_memberships m JOIN writing_classes c ON c.id=m.class_id WHERE m.class_id=? AND m.provider='wordup' AND m.status='active' AND m.ended IS NULL").all(c.id)).filter(m=>selectedSubjects.has(m.subject)&&!selected.some(g=>g.sourceName===current.classes.find(c=>c.id===m.class_id)?.source_name&&g.students.some(s=>s.id===m.subject)));
    const items=selected.map(g=>{
      const conflict=current.classes.find(c=>c.academic_year===p.academicYear&&c.source_name===g.sourceName&&c.grade===g.grade&&c.school_id!==p.schoolId&&c.status==='active');if(conflict)fail(409,'同一源班级在该学年已归属于另一学校，请选择已有学校或先停用原班级。');
      const existing=current.classes.find(c=>c.school_id===p.schoolId&&c.academic_year===p.academicYear&&c.source_name===g.sourceName)||null;
      if(existing&&existing.grade!==g.grade)fail(409,'已有班级年级与账号库不同，请先核对源班级。');
      const members=existing?db.prepare("SELECT * FROM writing_memberships WHERE class_id=? AND provider='wordup' AND status='active' AND ended IS NULL ORDER BY subject").all(existing.id):[];
      const periods=existing?db.prepare("SELECT * FROM writing_membership_periods WHERE class_id=? AND provider='wordup' AND ended IS NULL ORDER BY subject").all(existing.id):[];
      const incoming=new Set(g.students.map(s=>s.id)),old=new Set(members.map(m=>m.subject)),added=g.students.filter(s=>!old.has(s.id)),removed=members.filter(m=>!incoming.has(m.subject)),renamed=g.students.filter(s=>periods.some(m=>m.subject===s.id&&m.name_snapshot!==s.name));
      return {...g,existing,members,periods,added,removed,renamed,duplicateNames:g.students.length-new Set(g.students.map(s=>s.name)).size};
    });
    // Includes the exact source snapshot and current directory state. An admin
    // cannot confirm a preflight after another admin changes these records.
    const planHash=hash({p,school,sourceHash:source.sourceHash,items,transfers});
    return {p,school,items,transfers,planHash,sourceHash:source.sourceHash};
  }
  function publicPlan(value){return {planHash:value.planHash,sourceHash:value.sourceHash,school:{id:value.school?.id||null,name:value.school?.name||value.p.schoolName},academicYear:value.p.academicYear,total:value.items.reduce((n,c)=>n+c.students.length,0),transferCount:value.transfers.length,classes:value.items.map(c=>({key:c.key,sourceName:c.sourceName,grade:c.grade,count:c.students.length,classId:c.existing?.id||null,version:c.existing?.version||0,reactivate:c.existing?.status==='inactive',added:c.added.length,removed:c.removed.length,renamed:c.renamed.length,duplicateNames:c.duplicateNames,removedSamples:c.removed.slice(0,10).map(m=>({shortId:m.subject.slice(-8)}))}))};}
  function op(identity,body,requestHash){
    if(typeof body.requestId!=='string'||!/^[-a-zA-Z0-9_]{16,128}$/.test(body.requestId))fail(400,'缺少管理操作编号，请重试。');
    const old=db.prepare('SELECT * FROM writing_directory_operations WHERE provider=? AND subject=? AND request_id=?').get(identity.provider,identity.subject,body.requestId);
    if(!old)return null;if(old.request_hash!==requestHash)fail(409,'该操作编号已用于其他内容，请重新操作。');return {...JSON.parse(old.result_json),replayed:true};
  }
  function finish(identity,body,requestHash,action,result,before){
    db.prepare('INSERT INTO writing_directory_operations VALUES(?,?,?,?,?,?)').run(identity.provider,identity.subject,body.requestId,requestHash,JSON.stringify(result),now());
    db.prepare('INSERT INTO writing_directory_audit(provider,subject,request_id,action,summary_json,before_json,created) VALUES(?,?,?,?,?,?,?)').run(identity.provider,identity.subject,body.requestId,action,JSON.stringify(result),JSON.stringify(before),now());return result;
  }
  function transaction(action){db.exec('BEGIN IMMEDIATE');try{const result=action();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}
  function endPeriod(classId,subject,time,provider='wordup'){db.prepare('UPDATE writing_membership_periods SET ended=? WHERE class_id=? AND provider=? AND subject=? AND ended IS NULL').run(time,classId,provider,subject);}
  function endMember(m,time,source){
    if(!db.prepare("SELECT 1 FROM writing_memberships WHERE id=? AND status='active' AND ended IS NULL").get(m.id))return;
    if(!db.prepare('SELECT 1 FROM writing_membership_periods WHERE class_id=? AND provider=? AND subject=? AND ended IS NULL').get(m.class_id,m.provider,m.subject))db.prepare('INSERT INTO writing_membership_periods VALUES(?,?,?,?,?,?,NULL,?)').run(crypto.randomUUID(),m.class_id,m.provider,m.subject,m.provider==='wordup'?source.students.find(s=>s.id===m.subject)?.name||'':'',m.started,now());
    endPeriod(m.class_id,m.subject,time,m.provider);db.prepare("UPDATE writing_memberships SET status='inactive',ended=? WHERE id=?").run(time,m.id);
  }
  async function handle(action,body,identity){
    if(!identity||identity.role!=='admin'||!['wordup','daily_legacy_admin'].includes(identity.provider)||!identity.subject)fail(403,'此操作需要学校管理员账号。');
    initialize();
    if(action==='overview'){
      const source=sourceData(await readAuthority());return {...directory(),defaults:{schoolName:defaults.schoolName||'',academicYear:defaults.academicYear||''},source:{hash:source.sourceHash,total:source.students.length,classes:groups(source).map(g=>({key:g.key,sourceName:g.sourceName,grade:g.grade,count:g.students.length,duplicateNames:g.students.length-new Set(g.students.map(s=>s.name)).size}))},teachers:source.teachers};
    }
    if(action==='preview'){const source=sourceData(await readAuthority());return publicPlan(plan(source,parameters(body)));}
    if(action==='sync'){
      const p=parameters(body);if(typeof body.planHash!=='string'||!/^[a-f0-9]{64}$/.test(body.planHash))fail(400,'请先预检并核对目录变更。');
      const requestHash=hash({action,p,planHash:body.planHash}),old=op(identity,body,requestHash);if(old)return old;
      const source=sourceData(await readAuthority());
      return transaction(()=>{
        const replay=op(identity,body,requestHash);if(replay)return replay;
        const value=plan(source,p);if(value.planHash!==body.planHash)fail(409,'名册或目录已发生变化，请重新预检后确认。');
        const before={directory:directory(),members:db.prepare('SELECT * FROM writing_memberships ORDER BY id').all(),periods:db.prepare('SELECT * FROM writing_membership_periods ORDER BY id').all()},schoolId=value.school?.id||crypto.randomUUID(),time=new Date(now()).toISOString(),changed=new Set(),classIds=[];
        if(!value.school)db.prepare("INSERT INTO writing_schools VALUES(?,?,'active')").run(schoolId,p.schoolName);
        for(const m of value.transfers){endMember(m,time,source);changed.add(m.class_id);}
        for(const c of value.items){
          const classId=c.existing?.id||crypto.randomUUID();classIds.push(classId);
          if(!c.existing)db.prepare("INSERT INTO writing_classes VALUES(?,?,?,?,?,?,'active',1)").run(classId,schoolId,p.academicYear,c.sourceName,c.sourceName,c.grade);
          else if(c.added.length||c.removed.length||c.renamed.length||c.existing.status!=='active')changed.add(classId);
          db.prepare("UPDATE writing_classes SET status='active' WHERE id=?").run(classId);
          for(const m of c.removed)endMember(m,time,source);
          for(const s of c.students){
            const existing=db.prepare("SELECT * FROM writing_memberships WHERE class_id=? AND provider='wordup' AND subject=?").get(classId,s.id);
            if(existing){if(existing.status!=='active'||existing.ended)db.prepare("UPDATE writing_memberships SET status='active',started=?,ended=NULL WHERE id=?").run(time,existing.id);}
            else db.prepare("INSERT INTO writing_memberships(class_id,provider,subject,status,started) VALUES(?,'wordup',?,'active',?)").run(classId,s.id,time);
            const period=db.prepare("SELECT * FROM writing_membership_periods WHERE class_id=? AND provider='wordup' AND subject=? AND ended IS NULL").get(classId,s.id);
            if(period&&period.name_snapshot!==s.name)endPeriod(classId,s.id,time);
            if(!period||period.name_snapshot!==s.name)db.prepare('INSERT INTO writing_membership_periods VALUES(?,?,?,?,?,?,NULL,?)').run(crypto.randomUUID(),classId,'wordup',s.id,s.name,period?time:existing?.status==='active'&&!existing.ended?existing.started:time,now());
          }
        }
        for(const id of changed)db.prepare('UPDATE writing_classes SET version=version+1 WHERE id=?').run(id);
        const result={ok:true,schoolId,academicYear:p.academicYear,classIds,studentCount:value.items.reduce((n,c)=>n+c.students.length,0),sourceHash:value.sourceHash};
        return finish(identity,body,requestHash,action,result,before);
      });
    }
    if(action==='grant'){
      const {classId,subject,expectedVersion,revoked}=body;
      if(typeof classId!=='string'||typeof subject!=='string'||!subject||subject.length>200||!Number.isInteger(expectedVersion)||expectedVersion<0||typeof revoked!=='boolean'||!Array.isArray(body.scopes)||body.scopes.some(s=>!scopes.includes(s))||new Set(body.scopes).size!==body.scopes.length||(!revoked&&!body.scopes.length))fail(400,'请选择教师、班级、权限和当前版本。');
      const requestHash=hash({action,classId,subject,expectedVersion,revoked,scopes:[...body.scopes].sort()}),old=op(identity,body,requestHash);if(old)return old;
      if(!revoked&&!sourceData(await readAuthority()).teachers.some(t=>t.id===subject&&t.status==='active'))fail(403,'只能授权给已启用的学校教师账号。');
      return transaction(()=>{
        const replay=op(identity,body,requestHash);if(replay)return replay;
        const classroom=db.prepare("SELECT c.* FROM writing_classes c JOIN writing_schools s ON s.id=c.school_id WHERE c.id=? AND c.status='active' AND s.status='active'").get(classId);if(!classroom)fail(409,'班级已停用或不存在，请刷新目录。');
        const previous=db.prepare("SELECT * FROM writing_teacher_class_grants WHERE provider='wordup' AND subject=? AND class_id=?").get(subject,classId);
        if((previous?.version||0)!==expectedVersion)fail(409,'教师授权已在其他窗口修改，请刷新后再操作。');
        if(revoked&&!previous)fail(404,'没有可撤销的教师授权。');
        const version=expectedVersion+1,selected=JSON.stringify([...body.scopes].sort());
        db.prepare("INSERT INTO writing_teacher_class_grants VALUES('wordup',?,?,?,?,?) ON CONFLICT(provider,subject,class_id) DO UPDATE SET scopes=excluded.scopes,version=excluded.version,revoked=excluded.revoked").run(subject,classId,selected,version,revoked?1:0);
        return finish(identity,body,requestHash,action,{ok:true,subject,classId,version,revoked},previous||{});
      });
    }
    if(action==='class-status'){
      if(typeof body.classId!=='string'||!Number.isInteger(body.expectedVersion)||body.status!=='inactive')fail(400,'请选择要停用的班级及当前版本。');
      const requestHash=hash({action,classId:body.classId,expectedVersion:body.expectedVersion,status:body.status}),old=op(identity,body,requestHash);if(old)return old;
      const source={students:[]};
      return transaction(()=>{
        const replay=op(identity,body,requestHash);if(replay)return replay;
        const row=db.prepare('SELECT * FROM writing_classes WHERE id=?').get(body.classId);if(!row)fail(404,'班级不存在。');if(row.version!==body.expectedVersion||row.status!=='active')fail(409,'班级状态已改变，请刷新目录。');
        const members=db.prepare("SELECT * FROM writing_memberships WHERE class_id=? AND status='active' AND ended IS NULL").all(row.id),grants=db.prepare('SELECT * FROM writing_teacher_class_grants WHERE class_id=?').all(row.id),time=new Date(now()).toISOString();
        for(const m of members)endMember(m,time,source);
        db.prepare("UPDATE writing_classes SET status='inactive',version=version+1 WHERE id=?").run(row.id);db.prepare('UPDATE writing_teacher_class_grants SET revoked=1,version=version+1 WHERE class_id=?').run(row.id);
        return finish(identity,body,requestHash,action,{ok:true,classId:row.id,version:row.version+1,status:'inactive',endedMembers:members.length,revokedGrants:grants.length},{row,members,grants});
      });
    }
    fail(404,'目录管理接口不存在。');
  }
  return {handle};
}
