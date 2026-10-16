import type {Env} from './index';
import type {TaskSession} from './tasks';
import {HttpError} from './errors';
import {digest} from '../src/report/legacy-import';
import {readPrivateAsset} from './assets';
type Bridge=(env:Env,path:string,body:Record<string,unknown>)=>Promise<Record<string,any>>;
type Input=(req:Request,max?:number)=>Promise<unknown>;
type Member={id:string;task_id:string;task_version:number;provider:string;subject:string;name:string;class_id:string;class_name:string;academic_year:string;grade:string;status:string};
type Task={id:string;owner:string;status:string;current_version:number;revision:number;rubric_hash:string};
type Draft={id:string;submission_id:string;draft_number:number;task_version:number;rubric_hash:string;page_count:number;revision:number;state:string;input_hash:string};
type Page={id:string;pageNumber:number;revision:number;assetId:string;sha256:string;sheetId:string|null;detectedSheetId:string|null;identityMethod:string;identityNote:string;fileName:string;confirmedBy:string;created:number};
type Manifest={taskId:string;memberId:string;identity:{provider:string;subject:string;classId:string};taskVersion:number;rubricHash:string;draftNumber:number;pageCount:number;pages:Page[]};
const uuid=/^[a-f0-9-]{36}$/;
function fail(status:number,message:string,code?:string):never{throw new HttpError(status,message,code);}
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const validNumber=(n:unknown,max:number)=>typeof n==='number'&&Number.isInteger(n)&&n>=1&&n<=max;
function authorized(session:TaskSession,classId:string){if(!session.classes.some(c=>c.id===classId&&['roster.read','writing.grade'].every(s=>c.scopes.includes(s))))fail(403,'当前没有此班级的名单及作文批改权限。');}
async function fresh(env:Env,session:TaskSession,bridge:Bridge,classId:string){const v=await bridge(env,'introspect',{grantId:session.grant_id});if(!v.active||v.provider!==session.provider||v.subject!==session.subject||v.role!==session.role||!Array.isArray(v.classes))fail(401,'账号授权已发生变化，请重新登录。');authorized({...session,classes:v.classes},classId);}
const stableId=async(value:unknown)=>{const h=await digest(value);return h.slice(0,8)+'-'+h.slice(8,12)+'-8'+h.slice(13,16)+'-a'+h.slice(17,20)+'-'+h.slice(20,32);};
async function context(env:Env,task:Task,member:Member,number:number){
  const submissionId=await stableId({kind:'submission',owner:task.owner,taskId:task.id,memberId:member.id}),draftId=await stableId({kind:'draft',submissionId,number});
  const draft=await env.DB.prepare('SELECT * FROM writing_drafts WHERE id=?').bind(draftId).first<Draft>();
  const old=draft?await env.DB.prepare('SELECT manifest_json FROM writing_draft_inputs WHERE draft_id=? AND revision=?').bind(draftId,draft.revision).first<{manifest_json:string}>():null;
  if(draft&&!old)fail(503,'稿次记录暂时无法完整读取，请稍后重试。');
  const set=await env.DB.prepare("SELECT id,page_count,task_version FROM writing_sheet_sets WHERE task_id=? AND member_id=? AND draft_number=? AND status='active'").bind(task.id,member.id,number).first<{id:string;page_count:number;task_version:number}>();
  return {submissionId,draftId,draft,manifest:old?JSON.parse(old.manifest_json) as Manifest:null,set};
}
async function replay(env:Env,owner:string,requestId:string,hash:string){const old=await env.DB.prepare('SELECT * FROM writing_collection_operations WHERE owner=? AND request_id=?').bind(owner,requestId).first<{request_hash:string;result_json:string;committed:number}>();if(!old)return null;if(old.request_hash!==hash)fail(409,'操作编号已用于其他页面，请重新核对。');if(!old.committed)fail(409,'页面尚未完整保存，请重试。');return {...JSON.parse(old.result_json),replayed:true};}
function receipt(task:Task,member:Member,c:Awaited<ReturnType<typeof context>>,manifest:Manifest,revision:number,hash:string,page:Page|null){return {taskId:task.id,memberId:member.id,submissionId:c.submissionId,draftId:c.draftId,draftNumber:manifest.draftNumber,inputRevision:revision,inputHash:hash,pageCount:manifest.pageCount,receivedPages:manifest.pages.length,complete:manifest.pages.length===manifest.pageCount,pageNumber:page?.pageNumber??null,pageRevision:page?.revision??null,pageVersionId:page?.id??null};}
export async function handleCollection(req:Request,env:Env,session:TaskSession,bridge:Bridge,input:Input):Promise<Response|null>{
  const url=new URL(req.url),match=url.pathname.match(/^\/api\/tasks\/([a-f0-9-]{36})\/collection$/);if(!match)return null;
  if(!['teacher','admin'].includes(session.role))fail(403,'此操作需要教师账号。');
  const task=await env.DB.prepare('SELECT * FROM writing_tasks WHERE id=? AND owner=?').bind(match[1],session.principal).first<Task>();if(!task)fail(404,'写作任务不存在。');
  if(req.method==='GET'){
    const number=Number(url.searchParams.get('draftNumber')||1);if(!validNumber(number,20))fail(400,'作文稿次不正确。');
    const memberId=url.searchParams.get('memberId');
    if(memberId){
      if(!uuid.test(memberId))fail(400,'任务学生编号不正确。');const member=await env.DB.prepare('SELECT * FROM task_members WHERE id=? AND task_id=?').bind(memberId,task.id).first<Member>();if(!member)fail(404,'任务学生不存在。');authorized(session,member.class_id);
      const c=await context(env,task,member,number),revisionText=url.searchParams.get('revision');let manifest=c.manifest,revision=c.draft?.revision||0,hash=c.draft?.input_hash||'';
      if(revisionText!==null){revision=Number(revisionText);if(!Number.isSafeInteger(revision)||revision<1)fail(400,'稿次输入版本不正确。');const v=await env.DB.prepare('SELECT manifest_json,input_hash FROM writing_draft_inputs WHERE draft_id=? AND revision=?').bind(c.draftId,revision).first<{manifest_json:string;input_hash:string}>();if(!v)fail(404,'该稿次输入版本不存在。');manifest=JSON.parse(v.manifest_json);hash=v.input_hash;}
      return json({member:{id:member.id,name:member.name,classId:member.class_id,className:member.class_name,academicYear:member.academic_year,subjectShort:member.subject.slice(-8)},draft:c.draft?{id:c.draftId,submissionId:c.submissionId,draftNumber:number,inputRevision:revision,inputHash:hash,complete:manifest!.pages.length===manifest!.pageCount,manifest}:null,activeSheetSet:c.set,expectedPageCount:c.set?.page_count||manifest?.pageCount||null});
    }
    const after=url.searchParams.get('after')||'';if(after&&!uuid.test(after))fail(400,'收取名单分页位置不正确。');
    const ids=session.classes.filter(c=>['roster.read','writing.grade'].every(s=>c.scopes.includes(s))).map(c=>c.id);if(!ids.length)fail(403,'当前没有可收取作文的学校班级权限。');
    const rows=await env.DB.prepare("SELECT m.id,m.name,m.class_id AS classId,m.class_name AS className,m.academic_year AS academicYear,m.subject,m.status,d.id AS draftId,d.revision AS inputRevision,d.input_hash AS inputHash,d.state,d.page_count AS pageCount,(SELECT json_array_length(i.manifest_json,'$.pages') FROM writing_draft_inputs i WHERE i.draft_id=d.id AND i.revision=d.revision) AS receivedPages FROM task_members m LEFT JOIN writing_submissions s ON s.task_id=m.task_id AND s.member_id=m.id LEFT JOIN writing_drafts d ON d.submission_id=s.id AND d.draft_number=? WHERE m.task_id=? AND m.id>? AND m.class_id IN(SELECT value FROM json_each(?)) ORDER BY m.id LIMIT 101").bind(number,task.id,after,JSON.stringify(ids)).all<any>();
    return json({members:rows.results.slice(0,100).map(({subject,...m})=>({...m,subjectShort:subject.slice(-8),receivedPages:m.receivedPages||0})),next:rows.results.length>100?rows.results[99].id:null,draftNumber:number});
  }
  if(req.method!=='POST')fail(405,'收作业请求方式不支持。');
  const body=await input(req,16384) as any;
  if(!body||typeof body.requestId!=='string'||!/^[-a-zA-Z0-9_]{16,128}$/.test(body.requestId)||!['collect','remove'].includes(body.action))fail(400,'缺少收作业操作编号或操作类型。');
  const removing=body.action==='remove';let member:Member|null,number:number,pageNumber:number,pageCount:number,detectedSheetId:string|null=null,sheetId:string|null=null,setId='';
  if(!removing&&body.mode==='qr'){
    if(typeof body.sheetId!=='string'||!uuid.test(body.sheetId))fail(400,'请先识别并核对写作单。');
    const sheet=await env.DB.prepare('SELECT p.id,p.page_number,s.task_id,s.owner,s.id AS set_id,s.member_id,s.draft_number,s.page_count,s.status FROM writing_sheets p JOIN writing_sheet_sets s ON s.id=p.set_id WHERE p.id=? AND s.owner=?').bind(body.sheetId,session.principal).first<any>();
    if(!sheet||sheet.task_id!==task.id)fail(404,'写作单不属于当前教师或当前任务。');
    member=await env.DB.prepare('SELECT * FROM task_members WHERE id=? AND task_id=?').bind(sheet.member_id,task.id).first<Member>();number=sheet.draft_number;pageNumber=sheet.page_number;pageCount=sheet.page_count;sheetId=sheet.id;detectedSheetId=sheet.id;setId=sheet.set_id;
  }else{
    if(!removing&&body.mode!=='manual'||typeof body.memberId!=='string'||!uuid.test(body.memberId)||!validNumber(body.draftNumber,20)||!validNumber(body.pageNumber,4)||!removing&&(!validNumber(body.pageCount,4)||body.pageNumber>body.pageCount))fail(400,'请明确选择任务学生、稿次、页码和总页数。');
    member=await env.DB.prepare('SELECT * FROM task_members WHERE id=? AND task_id=?').bind(body.memberId,task.id).first<Member>();number=body.draftNumber;pageNumber=body.pageNumber;pageCount=removing?0:body.pageCount;
    if(!removing&&body.detectedSheetId){if(typeof body.detectedSheetId!=='string'||!uuid.test(body.detectedSheetId))fail(400,'检测到的纸张编号不正确。');const detected=await env.DB.prepare('SELECT p.id FROM writing_sheets p JOIN writing_sheet_sets s ON s.id=p.set_id WHERE p.id=? AND s.task_id=? AND s.owner=?').bind(body.detectedSheetId,task.id,session.principal).first();if(!detected)fail(409,'检测到其他任务的写作单，请先切换任务。');detectedSheetId=body.detectedSheetId;}
  }
  if(!member)fail(404,'任务学生不存在。');authorized(session,member.class_id);
  const note=typeof body.identityNote==='string'?body.identityNote.trim():'',reason=typeof body.reason==='string'?body.reason.trim():'';
  if(note.length>500||reason.length>500||removing&&reason.length<5||!removing&&body.mode==='manual'&&note.length<5)fail(400,'手工确认或移除页面时，请填写至少 5 字的核对说明，最多 500 字。');
  if(!Number.isSafeInteger(body.expectedPageRevision)||body.expectedPageRevision<0||!removing&&body.identityConfirmed!==true)fail(400,'请先核对纸面姓名、班级与当前页面版本。');
  const identityMethod=removing?'remove':body.mode,requestHash=await digest({action:body.action,taskId:task.id,memberId:member.id,draftNumber:number,pageNumber,pageCount,identityMethod,sheetId,detectedSheetId,assetId:removing?null:body.assetId,expectedPageRevision:body.expectedPageRevision,note,reason,fileName:typeof body.fileName==='string'?body.fileName.slice(0,240):''});
  await fresh(env,session,bridge,member.class_id);
  const previous=await replay(env,session.principal,body.requestId,requestHash);if(previous)return json(previous);
  if(task.status!=='open'||member.status!=='active')fail(409,'任务已关闭或学生任务关系已停用，请先核对。');
  const c=await context(env,task,member,number),pages=[...(c.manifest?.pages||[])],old=pages.find(p=>p.pageNumber===pageNumber);
  if(removing){if(!old)fail(404,'该页尚未收取。');pageCount=c.manifest!.pageCount;}
  else{
    if(body.mode==='qr'&&c.set?.id!==setId)fail(410,'此写作单已作废，请使用当前写作单。');
    if(body.mode==='manual')setId=c.set?.id||'';
    if((c.set&&c.set.page_count!==pageCount)||(pages.length&&c.manifest?.pageCount!==pageCount))fail(409,'总页数与现有写作单或已收稿次不同，请核对页数。');
  }
  let page:Page|null=null,assetHash='';
  if(!removing){
    if(typeof body.assetId!=='string'||!uuid.test(body.assetId))fail(400,'原稿照片尚未上传完成。');const {row:asset}=await readPrivateAsset(env,session.principal,body.assetId);assetHash=asset.sha256;
    if(old?.sha256===asset.sha256)return json({...receipt(task,member,c,c.manifest!,c.draft!.revision,c.draft!.input_hash,old),duplicate:true});
    const claim=await env.DB.prepare('SELECT draft_id,page_number FROM writing_page_claims WHERE owner=? AND sha256=?').bind(session.principal,asset.sha256).first<{draft_id:string;page_number:number}>();if(claim&&(claim.draft_id!==c.draftId||claim.page_number!==pageNumber))fail(409,'这张照片已经收进另一名学生、另一稿或另一页，请先核对并移除错误归属。','photo_already_assigned');
    page={id:crypto.randomUUID(),pageNumber,revision:(await env.DB.prepare('SELECT COALESCE(MAX(revision),0) AS n FROM submission_page_versions WHERE draft_id=? AND page_number=?').bind(c.draftId,pageNumber).first<{n:number}>())!.n+1,assetId:asset.id,sha256:asset.sha256,sheetId,detectedSheetId,identityMethod,identityNote:note,fileName:typeof body.fileName==='string'?body.fileName.slice(0,240):'',confirmedBy:session.principal,created:Date.now()};
  }
  if((old?.revision||0)!==body.expectedPageRevision)fail(409,'这一页已有其他照片或版本变化，请核对后明确选择替换。','page_changed');
  const manifest:Manifest={taskId:task.id,memberId:member.id,identity:{provider:member.provider,subject:member.subject,classId:member.class_id},taskVersion:member.task_version,rubricHash:task.rubric_hash,draftNumber:number,pageCount,pages:[...pages.filter(p=>p.pageNumber!==pageNumber),...(page?[page]:[])].sort((a,b)=>a.pageNumber-b.pageNumber)};
  if(manifest.pages.some(p=>p.pageNumber>pageCount))fail(409,'已有页面超过新总页数，请先核对。');
  const revision=(c.draft?.revision||0)+1,inputHash=await digest(manifest),now=Date.now(),result={...receipt(task,member,c,manifest,revision,inputHash,page),action:body.action,...(removing?{removedPageVersionId:old!.id,reason,confirmedBy:session.principal}:{})};
  const binds=[session.principal,body.requestId,requestHash],claimed='EXISTS(SELECT 1 FROM writing_collection_operations WHERE owner=? AND request_id=? AND request_hash=? AND committed=0)',gate=removing?'1=1':"COALESCE((SELECT id FROM writing_sheet_sets WHERE task_id=? AND member_id=? AND draft_number=? AND status='active'),'')=?";
  const statements=[
    env.DB.prepare(`INSERT OR IGNORE INTO writing_collection_operations SELECT ?,?,?,?,?,?,0,? WHERE EXISTS(SELECT 1 FROM writing_tasks WHERE id=? AND owner=? AND status='open' AND revision=?) AND EXISTS(SELECT 1 FROM task_members WHERE id=? AND task_id=? AND status='active') AND COALESCE((SELECT revision FROM writing_drafts WHERE id=?),0)=? AND ${gate}`).bind(...binds,task.id,member.id,JSON.stringify(result),now,task.id,session.principal,task.revision,member.id,task.id,c.draftId,c.draft?.revision||0,...(removing?[]:[task.id,member.id,number,setId])),
    env.DB.prepare(`INSERT OR IGNORE INTO writing_submissions SELECT ?,?,?,?,? WHERE ${claimed}`).bind(c.submissionId,session.principal,task.id,member.id,now,...binds),
    env.DB.prepare(`INSERT OR IGNORE INTO writing_drafts SELECT ?,?,?,?,?,?,0,'collecting','',?,? WHERE ${claimed}`).bind(c.draftId,c.submissionId,number,member.task_version,task.rubric_hash,pageCount,now,now,...binds),
    env.DB.prepare(`DELETE FROM writing_page_claims WHERE draft_id=? AND page_number=? AND ${claimed}`).bind(c.draftId,pageNumber,...binds),
  ];
  if(page){statements.push(env.DB.prepare(`INSERT INTO writing_page_claims SELECT ?,?,?,? WHERE ${claimed}`).bind(session.principal,assetHash,c.draftId,pageNumber,...binds),env.DB.prepare(`INSERT INTO submission_page_versions SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${claimed}`).bind(page.id,session.principal,c.draftId,pageNumber,page.revision,page.assetId,page.sha256,page.sheetId,page.detectedSheetId,page.identityMethod,page.identityNote,page.fileName,page.confirmedBy,page.created,...binds));}
  statements.push(env.DB.prepare(`INSERT INTO writing_draft_inputs SELECT ?,?,?,?,? WHERE ${claimed}`).bind(c.draftId,revision,inputHash,JSON.stringify(manifest),now,...binds),env.DB.prepare(`UPDATE writing_drafts SET page_count=?,revision=?,state=?,input_hash=?,updated=? WHERE id=? AND ${claimed}`).bind(pageCount,revision,manifest.pages.length===pageCount?'received':'collecting',inputHash,now,c.draftId,...binds),env.DB.prepare('UPDATE writing_collection_operations SET committed=1 WHERE owner=? AND request_id=? AND request_hash=? AND committed=0').bind(...binds));
  try{await env.DB.batch(statements);}catch(e){const conflict=await env.DB.prepare('SELECT draft_id,page_number FROM writing_page_claims WHERE owner=? AND sha256=?').bind(session.principal,assetHash).first();if(conflict)fail(409,'照片归属或页面已有变化，请重新核对。','collection_changed');throw e;}
  const accepted=await replay(env,session.principal,body.requestId,requestHash);if(!accepted)fail(409,'页面或写作单已在其他设备改变，请刷新后重试。','collection_changed');return json(accepted,201);
}
