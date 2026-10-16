import type {Env} from './index';
import {HttpError} from './errors';
import {digest,isObject,sanitizeLegacy} from '../src/report/legacy-import';
import type {AuthorityClass,TaskTarget,TaskDocument,TaskMember} from '../src/teacher/task-contracts';
export type TaskSession={principal:string;grant_id:string;provider:string;subject:string;role:string;classes:AuthorityClass[]};
type Bridge=(env:Env,path:string,body:Record<string,unknown>)=>Promise<Record<string,any>>;
type Row={id:string;owner:string;title:string;status:'draft'|'open'|'closed';revision:number;current_version:number;content_hash:string;object_key:string;rubric_hash:string;targets_json:string;activation_request:string|null;member_count:number;created:number;updated:number};
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function fail(status:number,message:string):never{throw new HttpError(status,message,status===409?'task_conflict':undefined);}
const uuid=/^[a-f0-9-]{36}$/;
const summary=(row:Row)=>({id:row.id,title:row.title,status:row.status,revision:row.revision,version:row.current_version,rubricHash:row.rubric_hash,targets:JSON.parse(row.targets_json),memberCount:row.member_count,created:row.created,updated:row.updated});
function target(c:AuthorityClass):TaskTarget{return {id:c.id,schoolId:c.schoolId,academicYear:c.academicYear,name:c.name,grade:c.grade,version:c.version};}
function authorized(classes:AuthorityClass[],ids:string[]){
  return ids.map(id=>{
    const c=classes.find(c=>c.id===id&&['roster.read','writing.manage'].every(scope=>c.scopes.includes(scope)));
    if(!c)fail(403,'没有所选班级的任务与名册管理权限，请联系学校管理员。');
    if(!c.schoolId||!c.academicYear||!c.name||!c.grade||!Number.isInteger(c.version))fail(503,'学校班级目录尚未确认，请联系管理员。');
    return c;
  });
}
function prepare(body:any,classes:AuthorityClass[]){
  if(!body||!Array.isArray(body.classIds)||body.classIds.length>20||body.classIds.some((id:unknown)=>typeof id!=='string'||id.length>128)||new Set(body.classIds).size!==body.classIds.length)fail(400,'请选择至多 20 个不同的授权班级。');
  const safe=sanitizeLegacy({assignment:body.assignment,rubric:body.rubric,settings:body.settings||{}}).value as any;
  const {assignment,rubric}=safe;
  if(!isObject(assignment)||typeof assignment.topic!=='string'||!assignment.topic.trim()||assignment.topic.length>30000)fail(400,'请先在原批改设置中填写写作要求。');
  const title=String(body.title||assignment.title||assignment.examName||'写作任务').trim();if(!title||title.length>240)fail(400,'任务名称请控制在 240 字以内。');
  if(!isObject(rubric)||typeof rubric.total!=='number'||!Number.isFinite(rubric.total)||rubric.total<=0||rubric.total>1000||!Array.isArray(rubric.items)||!rubric.items.length||rubric.items.length>64)fail(400,'请保留有效的评分标准与分项。');
  const ids=new Set(),labels=new Set();let sum=0;
  for(const item of rubric.items){
    if(!isObject(item)||typeof item.id!=='string'||!/^[-a-zA-Z0-9_]{1,128}$/.test(item.id)||ids.has(item.id)||typeof item.label!=='string'||!item.label.trim()||labels.has(item.label)||typeof item.score!=='number'||!Number.isFinite(item.score)||item.score<0||item.score>rubric.total)fail(400,'评分维度须有不同的编号和名称，分值须在满分范围内。');
    ids.add(item.id);labels.add(item.label);sum+=item.score;
  }
  if(Math.abs(sum-rubric.total)>0.001)fail(400,'评分分项合计须等于作文满分，请先在原设置中调整。');
  delete assignment.promptImageBase64;delete assignment.isExtractingText;
  const settings=isObject(safe.settings)?Object.fromEntries(['pdfConfig','csvExportConfig','languageDifficulty'].filter(k=>k in safe.settings).map(k=>[k,safe.settings[k]])):{};
  const document:TaskDocument={assignment,rubric,settings,targets:authorized(classes,body.classIds).map(target)};
  return {title,document};
}
async function ownerRow(env:Env,session:TaskSession,id:string){
  const row=await env.DB.prepare('SELECT * FROM writing_tasks WHERE id=? AND owner=?').bind(id,session.principal).first<Row>();
  if(!row)fail(404,'写作任务不存在。');return row;
}
async function readDocument(env:Env,row:Row,version=row.current_version){
  const item=await env.DB.prepare('SELECT object_key,rubric_hash,created FROM rubric_versions WHERE task_id=? AND version=?').bind(row.id,version).first<{object_key:string;rubric_hash:string;created:number}>();
  if(!item)fail(404,'任务评分标准版本不存在。');
  const object=await env.FILES.get(item.object_key);if(!object)fail(503,'写作任务暂时无法读取，请稍后重试。');
  return {document:await object.json() as TaskDocument,task:{...summary(row),version,rubricHash:item.rubric_hash,latestVersion:row.current_version}};
}
async function operation(env:Env,session:TaskSession,body:any,hash:string){
  if(typeof body?.requestId!=='string'||!/^[-a-zA-Z0-9_]{16,128}$/.test(body.requestId))fail(400,'缺少任务操作编号，请重试。');
  const previous=await env.DB.prepare('SELECT request_hash,task_id,revision FROM writing_task_operations WHERE owner=? AND request_id=?').bind(session.principal,body.requestId).first<{request_hash:string;task_id:string;revision:number}>();
  if(!previous)return null;
  if(previous.request_hash!==hash)fail(409,'操作编号已用于其他任务内容，请重新操作。');
  return json({task:summary(await ownerRow(env,session,previous.task_id)),replayed:true,operationRevision:previous.revision});
}
async function roster(env:Env,session:TaskSession,row:Row,bridge:Bridge){
  const targets=JSON.parse(row.targets_json) as TaskTarget[];
  if(!targets.length)fail(409,'请先为任务选择已授权的学校班级。');
  const classes=authorized(session.classes,targets.map(c=>c.id));
  if(classes.some((c,i)=>JSON.stringify(target(c))!==JSON.stringify(targets[i])))fail(409,'班级目录已有变化，请先用当前设置更新草稿并重新核对名单。');
  const members:TaskMember[]=[],seen=new Set<string>();
  for(const c of classes){
    let after='',snapshotHash='';const cursors=new Set<string>();
    do{
      const page=await bridge(env,'roster',{grantId:session.grant_id,classId:c.id,after});
      if(page.classId!==c.id||page.version!==c.version||!Array.isArray(page.students)||page.students.length>100)fail(409,'名册版本已改变或返回不完整，请重新预览。');
      if(typeof page.snapshotHash!=='string'||!/^[a-f0-9]{64}$/.test(page.snapshotHash))fail(503,'名册完整性核验尚未接通，请联系管理员更新 Daily 集成。');
      if(snapshotHash&&snapshotHash!==page.snapshotHash)fail(409,'学生名单在分页期间发生变化，请重新预览。');snapshotHash=page.snapshotHash;
      for(const s of page.students){
        if(!s||s.provider!=='wordup'||typeof s.subject!=='string'||!s.subject||s.subject.length>200||typeof s.name!=='string'||!s.name.trim()||s.name.length>240||s.classId!==c.id||s.status!=='active'||s.grade!==c.grade)fail(502,'学校名册信息不完整，未建立任务。');
        if(seen.has(s.provider+':'+s.subject))fail(409,'名册出现重复学生身份，请联系管理员核对。');
        seen.add(s.provider+':'+s.subject);members.push({provider:'wordup',subject:s.subject,name:s.name,classId:c.id,className:c.name,schoolId:c.schoolId,academicYear:c.academicYear,grade:c.grade,sourceVersion:c.version});
        if(members.length>4000)fail(413,'一次任务请控制在 4000 名学生以内。');
      }
      if(page.next!==null&&(typeof page.next!=='string'||!page.next||page.next.length>200||cursors.has(page.next)))fail(502,'名册分页未完成，请稍后重试。');
      after=page.next||'';if(after)cursors.add(after);
      if(cursors.size>50)fail(413,'班级名册分页过多，请联系管理员。');
    }while(after);
  }
  // A role or class grant can change while multiple roster pages are read.
  const verified=await bridge(env,'introspect',{grantId:session.grant_id});
  if(!verified.active||verified.provider!==session.provider||verified.subject!==session.subject||verified.role!==session.role||!Array.isArray(verified.classes))fail(401,'账号授权已发生变化，请重新登录。');
  const latest=authorized(verified.classes,targets.map(c=>c.id));
  if(latest.some((c,i)=>c.version!==classes[i].version||c.grantVersion!==classes[i].grantVersion||JSON.stringify(target(c))!==JSON.stringify(targets[i])))fail(409,'班级授权或名册已有变化，请重新预览。');
  members.sort((a,b)=>(a.classId+'\n'+a.subject).localeCompare(b.classId+'\n'+b.subject,'en'));
  return {members,rosterHash:await digest({targets,members})};
}
export async function handleTasks(req:Request,env:Env,session:TaskSession,bridge:Bridge,readInput:(req:Request,max?:number)=>Promise<unknown>):Promise<Response|null>{
  const url=new URL(req.url),path=url.pathname;if(!/^\/api\/tasks(?:\/|$)/.test(path))return null;
  if(!['teacher','admin'].includes(session.role))fail(403,'此操作需要教师账号。');
  if(path==='/api/tasks'&&req.method==='GET'){
    let before=Number.MAX_SAFE_INTEGER,id='~';const cursor=url.searchParams.get('cursor');
    if(cursor){try{const c=JSON.parse(atob(cursor));if(!Number.isSafeInteger(c[0])||!uuid.test(c[1]))throw Error();[before,id]=c;}catch{fail(400,'任务分页位置不正确。');}}
    const rows=await env.DB.prepare('SELECT * FROM writing_tasks WHERE owner=? AND (updated<? OR (updated=? AND id<?)) ORDER BY updated DESC,id DESC LIMIT 26').bind(session.principal,before,before,id).all<Row>();
    const items=rows.results.slice(0,25),last=items.at(-1);return json({tasks:items.map(summary),next:rows.results.length>25&&last?btoa(JSON.stringify([last.updated,last.id])):null});
  }
  const match=path.match(/^\/api\/tasks\/([a-f0-9-]{36})(?:\/(preview|activate|members|status|versions))?$/);
  if(path==='/api/tasks'&&req.method==='POST'||match&&!match[2]&&req.method==='PUT'){
    const body=await readInput(req,1024*1024) as any,{title,document}=prepare(body,session.classes);
    if(match&&(!Number.isInteger(body.expectedRevision)||body.expectedRevision<1))fail(400,'请提供当前任务版本。');
    if(document.assignment.cloudPromptAssetId){
      if(typeof document.assignment.cloudPromptAssetId!=='string'||!uuid.test(document.assignment.cloudPromptAssetId)||!await env.DB.prepare('SELECT id FROM private_assets WHERE id=? AND owner=? AND ready=1').bind(document.assignment.cloudPromptAssetId,session.principal).first())fail(400,'题目原图未关联到当前工作区，请重新上传。');
    }
    const hash=await digest({action:match?'update':'create',id:match?.[1]||null,title,document,expectedRevision:body.expectedRevision??0});
    const replay=await operation(env,session,body,hash);if(replay)return replay;
    const current=match?await ownerRow(env,session,match[1]):null;
    if(current&&(current.revision!==body.expectedRevision||current.status!=='draft'))fail(409,'任务已改变或已经建立。已建立任务的标准不可覆盖，请另建新任务。');
    const requestHash=await digest(session.principal+'\n'+body.requestId),requestUuid=requestHash.slice(0,8)+'-'+requestHash.slice(8,12)+'-8'+requestHash.slice(13,16)+'-a'+requestHash.slice(17,20)+'-'+requestHash.slice(20,32);
    const id=current?.id||requestUuid,revision=(current?.revision||0)+1,version=(current?.current_version||0)+1,now=Date.now();
    const contentHash=await digest({title,document}),rubricHash=await digest(document.rubric),key='writing-tasks/'+await digest(session.principal)+'/'+id+'/'+contentHash+'.json';
    await env.FILES.put(key,JSON.stringify(document),{httpMetadata:{contentType:'application/json'}});
    const statements=current?[
      env.DB.prepare("UPDATE writing_tasks SET title=?,revision=?,current_version=?,content_hash=?,object_key=?,rubric_hash=?,targets_json=?,updated=? WHERE id=? AND owner=? AND revision=? AND status='draft'").bind(title,revision,version,contentHash,key,rubricHash,JSON.stringify(document.targets),now,id,session.principal,body.expectedRevision),
    ]:[env.DB.prepare("INSERT OR IGNORE INTO writing_tasks VALUES(?,?,?,'draft',1,1,?,?,?,?,NULL,0,?,?)").bind(id,session.principal,title,contentHash,key,rubricHash,JSON.stringify(document.targets),now,now)];
    statements.push(env.DB.prepare('INSERT OR IGNORE INTO rubric_versions SELECT id,current_version,content_hash,rubric_hash,object_key,updated FROM writing_tasks WHERE id=? AND revision=? AND content_hash=?').bind(id,revision,contentHash),env.DB.prepare('INSERT OR IGNORE INTO writing_task_operations SELECT ?,?,?,id,revision,? FROM writing_tasks WHERE id=? AND revision=? AND content_hash=?').bind(session.principal,body.requestId,hash,now,id,revision,contentHash));
    await env.DB.batch(statements);
    const accepted=await operation(env,session,body,hash);if(!accepted)fail(409,'任务已在其他设备更新，请重新读取。');
    return json({task:summary(await ownerRow(env,session,id))},current?200:201);
  }
  if(!match)fail(404,'任务接口不存在。');
  const row=await ownerRow(env,session,match[1]);
  if(!match[2]&&req.method==='GET'){
    const version=Number(url.searchParams.get('version')||row.current_version);if(!Number.isSafeInteger(version)||version<1)fail(400,'任务标准版本不正确。');return json(await readDocument(env,row,version));
  }
  if(match[2]==='versions'&&req.method==='GET'){
    const before=Number(url.searchParams.get('before')||Number.MAX_SAFE_INTEGER);if(!Number.isSafeInteger(before)||before<1)fail(400,'版本分页位置不正确。');
    const result=await env.DB.prepare('SELECT version,rubric_hash AS rubricHash,created FROM rubric_versions WHERE task_id=? AND version<? ORDER BY version DESC LIMIT 51').bind(row.id,before).all<{version:number}>();return json({versions:result.results.slice(0,50),next:result.results.length>50?result.results[49].version:null});
  }
  if(match[2]==='preview'&&req.method==='GET'){
    if(row.status!=='draft')fail(409,'任务已建立，请查看已确认名单。');return json({...await roster(env,session,row,bridge),revision:row.revision});
  }
  if(match[2]==='activate'&&req.method==='POST'){
    const body=await readInput(req,10000) as any;
    if(!Number.isInteger(body?.expectedRevision)||typeof body.rosterHash!=='string'||!/^[a-f0-9]{64}$/.test(body.rosterHash))fail(400,'请先预览并核对这次任务的学生名单。');
    const hash=await digest({action:'activate',id:row.id,expectedRevision:body.expectedRevision,rosterHash:body.rosterHash}),replay=await operation(env,session,body,hash);if(replay)return replay;
    if(row.status!=='draft'||row.revision!==body.expectedRevision)fail(409,'任务已改变，请重新读取和核对。');
    const preview=await roster(env,session,row,bridge);if(preview.rosterHash!==body.rosterHash)fail(409,'学生名单已有变化，请重新预览后确认。');
    if(!preview.members.length)fail(409,'所选班级没有可关联的在用学生，请先核对学校目录。');
    const now=Date.now(),revision=row.revision+1;
    const statements=[env.DB.prepare("UPDATE writing_tasks SET status='open',revision=?,activation_request=?,member_count=?,updated=? WHERE id=? AND owner=? AND revision=? AND status='draft'").bind(revision,body.requestId,preview.members.length,now,row.id,session.principal,row.revision)];
    for(let offset=0;offset<preview.members.length;offset+=250){
      const members=preview.members.slice(offset,offset+250).map(m=>({...m,id:crypto.randomUUID()}));
      statements.push(env.DB.prepare("INSERT OR IGNORE INTO task_members SELECT json_extract(value,'$.id'),?,?,json_extract(value,'$.provider'),json_extract(value,'$.subject'),json_extract(value,'$.name'),json_extract(value,'$.classId'),json_extract(value,'$.className'),json_extract(value,'$.schoolId'),json_extract(value,'$.academicYear'),json_extract(value,'$.grade'),json_extract(value,'$.sourceVersion'),'active',? FROM json_each(?) WHERE EXISTS(SELECT 1 FROM writing_tasks WHERE id=? AND revision=? AND activation_request=? AND status='open')").bind(row.id,row.current_version,now,JSON.stringify(members),row.id,revision,body.requestId));
    }
    statements.push(env.DB.prepare("INSERT OR IGNORE INTO writing_task_operations SELECT ?,?,?,id,revision,? FROM writing_tasks WHERE id=? AND revision=? AND activation_request=? AND status='open'").bind(session.principal,body.requestId,hash,now,row.id,revision,body.requestId));
    await env.DB.batch(statements);const accepted=await operation(env,session,body,hash);if(!accepted)fail(409,'任务已在其他设备更新，请重新读取。');return json({task:summary(await ownerRow(env,session,row.id))});
  }
  if(match[2]==='members'&&req.method==='GET'){
    authorized(session.classes,(JSON.parse(row.targets_json) as TaskTarget[]).map(c=>c.id));
    const after=url.searchParams.get('after')||'';if(after&&!uuid.test(after))fail(400,'学生分页位置不正确。');
    const result=await env.DB.prepare('SELECT id,provider,subject,name,class_id AS classId,class_name AS className,school_id AS schoolId,academic_year AS academicYear,grade,source_version AS sourceVersion,status,task_version AS taskVersion FROM task_members WHERE task_id=? AND id>? ORDER BY id LIMIT 101').bind(row.id,after).all<{id:string}>();
    return json({members:result.results.slice(0,100),next:result.results.length>100?result.results[99].id:null});
  }
  if(match[2]==='status'&&req.method==='POST'){
    const body=await readInput(req,10000) as any;
    if(!body||!['open','closed'].includes(body.status)||!Number.isInteger(body.expectedRevision))fail(400,'请选择有效的任务状态与版本。');
    const hash=await digest({action:'status',id:row.id,status:body.status,expectedRevision:body.expectedRevision}),replay=await operation(env,session,body,hash);if(replay)return replay;
    if(row.status==='draft'||row.revision!==body.expectedRevision)fail(409,'请先建立任务，或刷新当前任务状态。');
    authorized(session.classes,(JSON.parse(row.targets_json) as TaskTarget[]).map(c=>c.id));
    const now=Date.now(),revision=row.revision+1;
    await env.DB.batch([env.DB.prepare('UPDATE writing_tasks SET status=?,revision=?,updated=? WHERE id=? AND owner=? AND revision=?').bind(body.status,revision,now,row.id,session.principal,row.revision),env.DB.prepare('INSERT OR IGNORE INTO writing_task_operations SELECT ?,?,?,id,revision,? FROM writing_tasks WHERE id=? AND revision=? AND status=?').bind(session.principal,body.requestId,hash,now,row.id,revision,body.status)]);
    const accepted=await operation(env,session,body,hash);if(!accepted)fail(409,'任务已在其他设备更新，请重新读取。');return json({task:summary(await ownerRow(env,session,row.id))});
  }
  fail(405,'任务请求方式不支持。');
}
