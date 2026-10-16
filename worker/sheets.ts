import type {Env} from './index';
import type {TaskSession} from './tasks';
import {HttpError} from './errors';
import {digest} from '../src/report/legacy-import';
type Task={id:string;owner:string;title:string;status:string;revision:number;current_version:number};
type Member={id:string;task_id:string;task_version:number;class_id:string;name:string;class_name:string;academic_year:string;subject:string;status:string};
type Bridge=(env:Env,path:string,body:Record<string,unknown>)=>Promise<Record<string,any>>;
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function fail(status:number,message:string):never{throw new HttpError(status,message);}
const uuid=/^[a-f0-9-]{36}$/;
function allowed(session:TaskSession,classId:string,scope:string){if(!session.classes.some(c=>c.id===classId&&c.scopes.includes('roster.read')&&c.scopes.includes(scope)))fail(403,'当前没有此班级的名单及操作权限。');}
async function fresh(env:Env,session:TaskSession,bridge:Bridge,classIds:string[],scope:string){
  const verified=await bridge(env,'introspect',{grantId:session.grant_id});
  if(!verified.active||verified.provider!==session.provider||verified.subject!==session.subject||verified.role!==session.role||!Array.isArray(verified.classes))fail(401,'账号授权已发生变化，请重新登录。');
  for(const id of classIds)allowed({...session,classes:verified.classes},id,scope);
}
async function taskRow(env:Env,session:TaskSession,id:string){const row=await env.DB.prepare('SELECT * FROM writing_tasks WHERE id=? AND owner=?').bind(id,session.principal).first<Task>();if(!row)fail(404,'写作任务不存在。');return row;}
async function operation(env:Env,owner:string,requestId:string,hash:string){
  const old=await env.DB.prepare('SELECT request_hash,result_json,committed FROM writing_sheet_operations WHERE owner=? AND request_id=?').bind(owner,requestId).first<{request_hash:string;result_json:string;committed:number}>();
  if(!old)return null;if(old.request_hash!==hash)fail(409,'操作编号已用于其他写作单，请重新生成。');if(!old.committed)fail(409,'写作单尚未完整生成，请重试。');return JSON.parse(old.result_json);
}
export async function handleSheets(req:Request,env:Env,session:TaskSession,bridge:Bridge,input:(req:Request,max?:number)=>Promise<unknown>):Promise<Response|null>{
  const url=new URL(req.url),match=url.pathname.match(/^\/api\/tasks\/([a-f0-9-]{36})\/sheets(?:\/(resolve))?$/);if(!match)return null;
  if(!['teacher','admin'].includes(session.role))fail(403,'此操作需要教师账号。');
  const task=await taskRow(env,session,match[1]);
  if(match[2]==='resolve'&&req.method==='POST'){
    const body=await input(req,4096) as any,code=typeof body?.code==='string'?body.code.trim():'';
    let where='',value='';
    if(/^WA1:[a-zA-Z0-9_-]{43}$/.test(code)){where='p.token_hash=?';value=await digest(code);}
    else if(/^[A-Fa-f0-9]{4}-?[A-Fa-f0-9]{4}-?[A-Fa-f0-9]{4}$/.test(code)){where='p.check_code=?';value=code.replaceAll('-','').toUpperCase();}
    else fail(400,'未识别到本系统写作单，请重拍二维码或输入纸面 12 位校验编号。');
    const rows=await env.DB.prepare(`SELECT p.id AS sheetId,p.page_number AS pageNumber,p.check_code AS checkCode,s.id AS setId,s.task_id AS taskId,s.task_version AS taskVersion,s.draft_number AS draftNumber,s.page_count AS pageCount,s.status,m.id AS memberId,m.name,m.class_name AS className,m.academic_year AS academicYear,m.class_id AS classId,m.subject,m.provider,m.status AS memberStatus FROM writing_sheets p JOIN writing_sheet_sets s ON s.id=p.set_id JOIN task_members m ON m.id=s.member_id WHERE ${where} AND s.owner=? LIMIT 2`).bind(value,session.principal).all<any>();
    if(!rows.results.length)fail(404,'此写作单不存在或不属于当前教师。');if(rows.results.length>1)fail(409,'校验编号有重复，请扫描完整二维码。');
    const row=rows.results[0];if(row.taskId!==task.id)fail(409,'这是另一项任务的写作单，请先切换任务。');
    allowed(session,row.classId,'writing.grade');await fresh(env,session,bridge,[row.classId],'writing.grade');
    if(row.status!=='active')fail(410,'此写作单已作废，请使用补打后的新写作单。');
    if(task.status!=='open'||row.memberStatus!=='active')fail(409,'任务已关闭或学生任务关系已停用，请先核对任务。');
    const {status,memberStatus,...sheet}=row;return json({sheet,identityConfirmed:false,message:'请核对纸面姓名、班级与识别结果后收取页面。'});
  }
  if(match[2])fail(405,'扫码核对请求方式不支持。');
  if(req.method==='GET'){
    const after=url.searchParams.get('after')||'';if(after&&!uuid.test(after))fail(400,'写作单分页位置不正确。');
    const rows=await env.DB.prepare('SELECT s.*,m.class_id AS classId FROM writing_sheet_sets s JOIN task_members m ON m.id=s.member_id WHERE s.task_id=? AND s.owner=? AND s.id>? ORDER BY s.id LIMIT 101').bind(task.id,session.principal,after).all<any>();
    for(const row of rows.results)allowed(session,row.classId,'writing.manage');
    return json({sets:rows.results.slice(0,100).map(({owner,layout_json,...row})=>({...row,layout:JSON.parse(layout_json)})),next:rows.results.length>100?rows.results[99].id:null});
  }
  if(req.method!=='POST')fail(405,'写作单请求方式不支持。');
  const body=await input(req,128*1024) as any;
  if(!body||typeof body.requestId!=='string'||!/^[-a-zA-Z0-9_]{16,128}$/.test(body.requestId)||!Number.isInteger(body.expectedRevision)||!Number.isInteger(body.draftNumber)||body.draftNumber<1||body.draftNumber>20||!Number.isInteger(body.pageCount)||body.pageCount<1||body.pageCount>4||!Array.isArray(body.members)||!body.members.length||body.members.length>100)fail(400,'请选择 1–100 名学生、稿次及 1–4 页写作单。');
  const schoolLabel=typeof body.schoolLabel==='string'?body.schoolLabel.trim():'';if(schoolLabel.length>120||/[\x00-\x1f]/.test(schoolLabel))fail(400,'打印学校名称请控制在 120 字以内。');
  const seen=new Set(),tokens=new Set(),members=[];
  const listed=await env.DB.prepare('SELECT * FROM task_members WHERE task_id=? AND id IN(SELECT value FROM json_each(?))').bind(task.id,JSON.stringify(body.members.map((v:any)=>typeof v?.memberId==='string'?v.memberId:''))).all<Member>();
  for(const value of body.members){
    if(!value||typeof value.memberId!=='string'||!uuid.test(value.memberId)||seen.has(value.memberId)||typeof value.expectedSetId!=='string'||value.expectedSetId&&!uuid.test(value.expectedSetId)||!Array.isArray(value.tokens)||value.tokens.length!==body.pageCount||value.tokens.some((t:unknown)=>typeof t!=='string'||!/^WA1:[a-zA-Z0-9_-]{43}$/.test(t)))fail(400,'学生身份、页码或补打版本不正确，请刷新名单。');
    seen.add(value.memberId);
    const member=listed.results.find(m=>m.id===value.memberId);if(!member||member.status!=='active')fail(409,'所选学生不在当前任务名单中。');
    allowed(session,member.class_id,'writing.manage');
    const pages=[];for(let i=0;i<value.tokens.length;i++){
      const hash=await digest(value.tokens[i]);if(tokens.has(hash))fail(400,'不同页面不能使用相同二维码。');tokens.add(hash);pages.push({pageNumber:i+1,tokenHash:hash,checkCode:hash.slice(0,12).toUpperCase()});
    }
    members.push({member,expectedSetId:value.expectedSetId,pages});
  }
  await fresh(env,session,bridge,[...new Set(members.map(v=>v.member.class_id))],'writing.manage');
  const requestHash=await digest({action:'issue',taskId:task.id,expectedRevision:body.expectedRevision,draftNumber:body.draftNumber,pageCount:body.pageCount,schoolLabel,members:members.map(v=>({memberId:v.member.id,expectedSetId:v.expectedSetId,pages:v.pages}))});
  if(task.status!=='open')fail(409,'任务已关闭，请重新开放后生成写作单。');
  const previous=await operation(env,session.principal,body.requestId,requestHash);if(previous)return json({...previous,replayed:true});
  if(task.status!=='open'||task.revision!==body.expectedRevision)fail(409,'任务状态或版本已改变，请刷新任务。');
  const sets=members.map(v=>({...v,setId:crypto.randomUUID(),sheets:v.pages.map(p=>({...p,id:crypto.randomUUID()}))}));
  const result={taskId:task.id,taskVersion:task.current_version,templateVersion:'handwriting-a4-v1',schoolLabel,draftNumber:body.draftNumber,pageCount:body.pageCount,sets:sets.map(v=>({id:v.setId,memberId:v.member.id,name:v.member.name,className:v.member.class_name,academicYear:v.member.academic_year,subjectShort:v.member.subject.slice(-8),sheets:v.sheets.map(({tokenHash,...page})=>page)}))};
  const now=Date.now(),checks=JSON.stringify(sets.map(v=>({memberId:v.member.id,expectedSetId:v.expectedSetId}))),payload=JSON.stringify(sets.map(v=>({id:v.setId,memberId:v.member.id,sheets:v.sheets})));
  const claimed="EXISTS(SELECT 1 FROM writing_sheet_operations WHERE owner=? AND request_id=? AND request_hash=? AND committed=0)";
  const binds=[session.principal,body.requestId,requestHash];
  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO writing_sheet_operations SELECT ?,?,?,?,0,? WHERE EXISTS(SELECT 1 FROM writing_tasks WHERE id=? AND owner=? AND revision=? AND status='open') AND NOT EXISTS(SELECT 1 FROM json_each(?) j WHERE COALESCE((SELECT s.id FROM writing_sheet_sets s WHERE s.task_id=? AND s.member_id=json_extract(j.value,'$.memberId') AND s.draft_number=? AND s.status='active'),'')<>json_extract(j.value,'$.expectedSetId'))").bind(...binds,JSON.stringify(result),now,task.id,session.principal,task.revision,checks,task.id,body.draftNumber),
    env.DB.prepare(`UPDATE writing_sheet_sets SET status='revoked' WHERE task_id=? AND draft_number=? AND member_id IN(SELECT json_extract(value,'$.memberId') FROM json_each(?)) AND status='active' AND ${claimed}`).bind(task.id,body.draftNumber,checks,...binds),
    env.DB.prepare(`INSERT INTO writing_sheet_sets SELECT json_extract(value,'$.id'),?,?,json_extract(value,'$.memberId'),?,?,?,?,?,'active',? FROM json_each(?) WHERE ${claimed}`).bind(session.principal,task.id,task.current_version,body.draftNumber,body.pageCount,'handwriting-a4-v1',JSON.stringify({schoolLabel}),now,payload,...binds),
    env.DB.prepare(`INSERT INTO writing_sheets SELECT json_extract(p.value,'$.id'),json_extract(s.value,'$.id'),json_extract(p.value,'$.pageNumber'),json_extract(p.value,'$.tokenHash'),json_extract(p.value,'$.checkCode') FROM json_each(?) s,json_each(s.value,'$.sheets') p WHERE ${claimed}`).bind(payload,...binds),
    env.DB.prepare('UPDATE writing_sheet_operations SET committed=1 WHERE owner=? AND request_id=? AND request_hash=? AND committed=0').bind(...binds),
  ]);
  const accepted=await operation(env,session.principal,body.requestId,requestHash);if(!accepted)fail(409,'写作单已在其他设备生成或补打，请刷新后核对；原写作单没有改变。');return json(accepted,201);
}
