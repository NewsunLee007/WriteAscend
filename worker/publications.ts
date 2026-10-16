import type {Env} from './index';
import type {TaskSession} from './tasks';
import {HttpError} from './errors';
import {digest} from '../src/report/legacy-import';
import {readBoundReport} from './grading';
import {readPrivateAsset} from './assets';
import {studentReport} from './publication-projection';
export type PublicationSession=TaskSession&{scopes?:string[];display_name?:string};
type Bridge=(env:Env,path:string,body:Record<string,unknown>)=>Promise<Record<string,any>>;
type Input=(req:Request,max?:number)=>Promise<unknown>;
type Publication={draft_id:string;owner:string;task_id:string;member_id:string;class_id:string;student_provider:string;student_subject:string;version:number;state:string;report_id:string;report_revision:number;input_hash:string;object_key:string;content_hash:string;summary_json:string;published_at:number;updated:number};
const uuid=/^[a-f0-9-]{36}$/,token=/^[-a-zA-Z0-9_]{16,128}$/;
const fail=(status:number,message:string,code?:string):never=>{throw new HttpError(status,message,code);};
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
function teacherClass(session:PublicationSession,id:string,publish=false){const scopes=publish?['roster.read','writing.grade','writing.publish']:['roster.read','writing.grade'];if(!['teacher','admin'].includes(session.role)||!session.classes.some(c=>c.id===id&&scopes.every(s=>c.scopes.includes(s))))fail(403,publish?'当前没有此班级的报告发布权限。':'当前没有此班级的报告核对权限。');}
async function livePublish(env:Env,session:PublicationSession,classId:string,bridge:Bridge){
 teacherClass(session,classId,true);const access=await bridge(env,'introspect',{grantId:session.grant_id});
 if(!access.active||access.provider+':'+access.subject!==session.principal||access.role!==session.role)fail(401,'账号授权已变化，请重新登录。');
 teacherClass({...session,classes:access.classes||[]},classId,true);
}
async function reportContext(env:Env,session:PublicationSession,id:string){
 const report=await env.DB.prepare('SELECT r.id,r.draft_id,r.task_id,r.member_id,r.current_revision,r.input_hash,g.class_id,g.state FROM writing_reports r JOIN grading_runs g ON g.id=r.run_id WHERE r.id=? AND r.owner=?').bind(id,session.principal).first<{id:string;draft_id:string;task_id:string;member_id:string;current_revision:number;input_hash:string;class_id:string;state:string}>();
 if(!report)fail(404,'批改报告不存在。');teacherClass(session,report!.class_id);return report!;
}
async function head(env:Env,draftId:string){return env.DB.prepare('SELECT * FROM writing_publications WHERE draft_id=?').bind(draftId).first<Publication>();}
async function status(env:Env,session:PublicationSession,reportId:string){
 const report=await reportContext(env,session,reportId),p=await head(env,report.draft_id);
 if(!p)return {publication:null,canPublish:session.classes.some(c=>c.id===report.class_id&&c.scopes.includes('writing.publish'))};
 if(p.owner!==session.principal)fail(404,'发布记录不存在。');
 const current=await env.DB.prepare('SELECT input_hash FROM writing_drafts WHERE id=?').bind(p.draft_id).first<{input_hash:string}>();
 const viewed=await env.DB.prepare('SELECT first_read,last_read FROM writing_publication_reads WHERE draft_id=? AND version=? AND student_provider=? AND student_subject=?').bind(p.draft_id,p.version,p.student_provider,p.student_subject).first();
 const sync=await env.DB.prepare('SELECT state,last_error,updated FROM writing_integration_outbox WHERE draft_id=? AND version=?').bind(p.draft_id,p.version).first();
 return {publication:{draftId:p.draft_id,version:p.version,state:p.state,reportId:p.report_id,reportRevision:p.report_revision,inputHash:p.input_hash,publishedAt:p.published_at,updated:p.updated,outdated:current?.input_hash!==p.input_hash,isThisReport:p.report_id===reportId,viewed,sync},canPublish:session.classes.some(c=>c.id===report.class_id&&c.scopes.includes('writing.publish'))};
}
async function replay(env:Env,owner:string,requestId:string,hash:string){const row=await env.DB.prepare('SELECT request_hash FROM writing_publication_operations WHERE owner=? AND request_id=?').bind(owner,requestId).first<{request_hash:string}>();if(!row)return false;if(row.request_hash!==hash)fail(409,'同一发布操作编号不能提交不同内容。');return true;}
function mutationBody(body:any){if(!body||!token.test(body.requestId)||!Number.isSafeInteger(body.expectedPublicationVersion)||body.expectedPublicationVersion<0)fail(400,'请提供当前发布版本和操作编号。');}
async function publish(env:Env,session:PublicationSession,id:string,body:any,bridge:Bridge){
 mutationBody(body);const report=await reportContext(env,session,id);await livePublish(env,session,report.class_id,bridge);
 const hash=await digest({action:'publish',id,body});if(await replay(env,session.principal,body.requestId,hash))return status(env,session,id);
 if(body.teacherConfirmed!==true||!Number.isSafeInteger(body.expectedReportRevision)||typeof body.inputHash!=='string')fail(400,'请核对原稿、学生归属、评分和反馈，并明确确认本次发布。');
 const current=await readBoundReport(env,session,id);
 if(current.report.outdated||current.document.provenance.inputHash!==body.inputHash)fail(409,'原稿已更新，请重新批阅和核对后发布。','publication_input_changed');
 if(current.report.revision!==body.expectedReportRevision)fail(409,'报告已更新，请读取最新版本后发布。','publication_report_changed');
 if(current.document.result.identity_name_mismatch&&!current.document.result.identity_name_mismatch_verified)fail(409,'请先对照原稿核对姓名差异，保存核对结果后再发布。','publication_identity_unconfirmed');
 const previous=await head(env,report.draft_id),expected=body.expectedPublicationVersion;
 if((previous?.version||0)!==expected)fail(409,'发布状态已在其他设备变化，请刷新后再操作。','publication_conflict');
 if(previous?.state==='published'&&previous.report_id===id&&previous.report_revision===body.expectedReportRevision&&previous.input_hash===body.inputHash)return status(env,session,id);
 const now=Date.now(),version=expected+1,eventId=crypto.randomUUID();
 const document=studentReport(current.document,{draftId:report.draft_id,version,reportRevision:body.expectedReportRevision,publishedAt:now,teacherName:session.display_name||'教师'});
 const contentHash=await digest(document),key='published-reports/'+await digest(session.principal)+'/'+report.draft_id+'/'+version+'/'+contentHash+'.json';
 await env.FILES.put(key,JSON.stringify(document),{httpMetadata:{contentType:'application/json'}});
 const summary={title:document.taskTitle||document.assignment.title,teacherName:document.publication.teacherName,className:document.identity.className,academicYear:document.identity.academicYear,draftNumber:document.draftNumber,score:document.result.total_score,total:document.rubric.total};
 const submission=await env.DB.prepare('SELECT submission_id FROM writing_drafts WHERE id=?').bind(report.draft_id).first<{submission_id:string}>();
 const payload={schemaVersion:1,eventId,eventType:'published',occurredAt:now,draftId:report.draft_id,taskId:report.task_id,submissionId:submission!.submission_id,publicationVersion:version,reportId:id,reportRevision:body.expectedReportRevision,classId:report.class_id,recipient:{provider:current.document.identity.provider,subject:current.document.identity.subject},summary};
 const binds=[session.principal,body.requestId,hash,eventId];
 const own='EXISTS(SELECT 1 FROM writing_publication_operations WHERE owner=? AND request_id=? AND request_hash=? AND event_id=?)';
 await livePublish(env,session,report.class_id,bridge);
 await env.DB.batch([
  env.DB.prepare("INSERT OR IGNORE INTO writing_publication_operations SELECT ?,?,?,?,?,?,'publish',? WHERE COALESCE((SELECT version FROM writing_publications WHERE draft_id=?),0)=? AND EXISTS(SELECT 1 FROM writing_reports WHERE id=? AND owner=? AND current_revision=?) AND EXISTS(SELECT 1 FROM writing_drafts WHERE id=? AND state='received' AND input_hash=?) AND EXISTS(SELECT 1 FROM task_members WHERE id=? AND status='active')").bind(session.principal,body.requestId,hash,report.draft_id,version,eventId,now,report.draft_id,expected,id,session.principal,body.expectedReportRevision,report.draft_id,body.inputHash,report.member_id),
  env.DB.prepare(`INSERT INTO writing_publications SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${own} ON CONFLICT(draft_id) DO UPDATE SET version=excluded.version,state=excluded.state,report_id=excluded.report_id,report_revision=excluded.report_revision,input_hash=excluded.input_hash,object_key=excluded.object_key,content_hash=excluded.content_hash,summary_json=excluded.summary_json,published_at=excluded.published_at,updated=excluded.updated WHERE writing_publications.owner=excluded.owner AND writing_publications.version=?`).bind(report.draft_id,session.principal,report.task_id,report.member_id,report.class_id,current.document.identity.provider,current.document.identity.subject,version,'published',id,body.expectedReportRevision,body.inputHash,key,contentHash,JSON.stringify(summary),now,now,...binds,expected),
  env.DB.prepare(`INSERT INTO writing_publication_versions SELECT draft_id,version,state,report_id,report_revision,input_hash,object_key,content_hash,?,'教师核对并确认发布',?,? FROM writing_publications WHERE draft_id=? AND version=? AND ${own}`).bind(session.principal,eventId,now,report.draft_id,version,...binds),
  env.DB.prepare(`INSERT INTO writing_integration_outbox(id,draft_id,version,owner,grant_id,payload_json,state,created,updated) SELECT ?,?,?,?,?,?,'pending',?,? WHERE ${own}`).bind(eventId,report.draft_id,version,session.principal,session.grant_id,JSON.stringify(payload),now,now,...binds),
 ]);
 if(!await replay(env,session.principal,body.requestId,hash))fail(409,'报告、原稿或发布版本已变化，请刷新后核对。','publication_conflict');
 return status(env,session,id);
}
async function withdraw(env:Env,session:PublicationSession,id:string,body:any,bridge:Bridge){
 mutationBody(body);const report=await reportContext(env,session,id);await livePublish(env,session,report.class_id,bridge);
 const hash=await digest({action:'withdraw',id,body});if(await replay(env,session.principal,body.requestId,hash))return status(env,session,id);
 if(typeof body.reason!=='string'||body.reason.trim().length<5||body.reason.length>500)fail(400,'请说明撤回原因（至少 5 字）。');
 const previous=await head(env,report.draft_id);if(!previous||previous.owner!==session.principal)fail(404,'此稿尚未发布。');
 if(previous!.version!==body.expectedPublicationVersion)fail(409,'发布状态已变化，请刷新后再撤回。','publication_conflict');
 if(previous!.state==='withdrawn')return status(env,session,id);
 const p=previous!,version=p.version+1,eventId=crypto.randomUUID(),now=Date.now(),binds=[session.principal,body.requestId,hash,eventId],own='EXISTS(SELECT 1 FROM writing_publication_operations WHERE owner=? AND request_id=? AND request_hash=? AND event_id=?)';
 const submission=await env.DB.prepare('SELECT submission_id FROM writing_drafts WHERE id=?').bind(p.draft_id).first<{submission_id:string}>();
 const payload={schemaVersion:1,eventId,eventType:'withdrawn',occurredAt:now,draftId:p.draft_id,taskId:p.task_id,submissionId:submission!.submission_id,publicationVersion:version,reportId:p.report_id,reportRevision:p.report_revision,classId:p.class_id,recipient:{provider:p.student_provider,subject:p.student_subject},summary:JSON.parse(p.summary_json)};
 await env.DB.batch([
  env.DB.prepare("INSERT OR IGNORE INTO writing_publication_operations SELECT ?,?,?,?,?,?,'withdraw',? WHERE EXISTS(SELECT 1 FROM writing_publications WHERE draft_id=? AND owner=? AND version=? AND state='published')").bind(session.principal,body.requestId,hash,p.draft_id,version,eventId,now,p.draft_id,session.principal,p.version),
  env.DB.prepare(`UPDATE writing_publications SET version=?,state='withdrawn',updated=? WHERE draft_id=? AND owner=? AND version=? AND ${own}`).bind(version,now,p.draft_id,session.principal,p.version,...binds),
  env.DB.prepare(`INSERT INTO writing_publication_versions SELECT draft_id,version,state,report_id,report_revision,input_hash,object_key,content_hash,?,?,?,? FROM writing_publications WHERE draft_id=? AND version=? AND ${own}`).bind(session.principal,body.reason.trim(),eventId,now,p.draft_id,version,...binds),
  env.DB.prepare(`INSERT INTO writing_integration_outbox(id,draft_id,version,owner,grant_id,payload_json,state,created,updated) SELECT ?,?,?,?,?,?,'pending',?,? WHERE ${own}`).bind(eventId,p.draft_id,version,session.principal,session.grant_id,JSON.stringify(payload),now,now,...binds),
 ]);
 if(!await replay(env,session.principal,body.requestId,hash))fail(409,'发布状态已变化，请刷新后再撤回。','publication_conflict');return status(env,session,id);
}
function student(session:PublicationSession){if(session.role!=='student'||session.provider!=='wordup'||!session.scopes?.includes('writing.own'))fail(403,'请使用学校学生账号查看自己的反馈。');}
const readable="p.state='published' AND d.input_hash=p.input_hash AND d.state='received' AND m.status='active'";
async function studentHead(env:Env,session:PublicationSession,id:string,version?:number){
 student(session);const p=await env.DB.prepare(`SELECT p.* FROM writing_publications p JOIN writing_drafts d ON d.id=p.draft_id JOIN task_members m ON m.id=p.member_id WHERE p.draft_id=? AND p.student_provider=? AND p.student_subject=? AND ${readable}`).bind(id,session.provider,session.subject).first<Publication>();
 if(!p||version!==undefined&&p.version!==version)fail(404,'这份反馈尚未发布、已更新或已撤回。');return p!;
}
async function released(env:Env,session:PublicationSession,id:string,version?:number){
 const p=await studentHead(env,session,id,version),object=await env.FILES.get(p.object_key);if(!object)fail(503,'反馈暂时无法读取，请稍后重试。');
 const document=await object!.json() as any;
 if(await digest(document)!==p.content_hash||document?.publication?.draftId!==id||document.publication.version!==p.version||document.publication.reportRevision!==p.report_revision)fail(503,'反馈内容校验未通过，请联系教师。');
 await studentHead(env,session,id,p.version);return {p,document};
}
export async function handlePublications(req:Request,env:Env,session:PublicationSession,bridge:Bridge,input:Input):Promise<Response|null>{
 const url=new URL(req.url),teacherMatch=url.pathname.match(/^\/api\/writing-reports\/([a-f0-9-]{36})\/publication(?:\/(withdraw))?$/),studentMatch=url.pathname.match(/^\/api\/student\/reports(?:\/([a-f0-9-]{36})(?:\/(read)|\/assets\/([a-f0-9-]{36}))?)?$/);
 if(teacherMatch){if(req.method==='GET'&&!teacherMatch[2])return json(await status(env,session,teacherMatch[1]));if(req.method==='POST'){const body=await input(req,8192);return json(await(teacherMatch[2]?withdraw(env,session,teacherMatch[1],body,bridge):publish(env,session,teacherMatch[1],body,bridge)));}fail(405,'发布请求方式不支持。');}
 if(!studentMatch)return null;student(session);
 if(!studentMatch[1]){
  if(req.method!=='GET')fail(405,'反馈列表请求方式不支持。');let before=Number.MAX_SAFE_INTEGER,after='~';const cursor=url.searchParams.get('cursor');
  if(cursor){try{const value=JSON.parse(atob(cursor));if(!Array.isArray(value)||!Number.isSafeInteger(value[0])||!uuid.test(value[1]))throw Error();[before,after]=value;}catch{fail(400,'反馈分页位置不正确。');}}
  const rows=await env.DB.prepare(`SELECT p.*,v.first_read FROM writing_publications p JOIN writing_drafts d ON d.id=p.draft_id JOIN task_members m ON m.id=p.member_id LEFT JOIN writing_publication_reads v ON v.draft_id=p.draft_id AND v.version=p.version AND v.student_provider=p.student_provider AND v.student_subject=p.student_subject WHERE p.student_provider=? AND p.student_subject=? AND ${readable} AND (p.published_at<? OR (p.published_at=? AND p.draft_id<?)) ORDER BY p.published_at DESC,p.draft_id DESC LIMIT 26`).bind(session.provider,session.subject,before,before,after).all<Publication&{first_read:number|null}>();
  const items=rows.results.slice(0,25),last=items.at(-1);return json({reports:items.map(p=>({id:p.draft_id,version:p.version,reportRevision:p.report_revision,publishedAt:p.published_at,readAt:p.first_read,...JSON.parse(p.summary_json)})),next:rows.results.length>25&&last?btoa(JSON.stringify([last.published_at,last.draft_id])):null});
 }
 const id=studentMatch[1];
 if(studentMatch[2]){
  if(req.method!=='POST')fail(405,'阅读确认请求方式不支持。');const body=await input(req,1024) as any;if(!Number.isSafeInteger(body?.version)||body.version<1)fail(400,'请选择当前反馈版本。');const p=await studentHead(env,session,id,body.version),now=Date.now();
  await env.DB.prepare(`INSERT INTO writing_publication_reads SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM writing_publications p JOIN writing_drafts d ON d.id=p.draft_id JOIN task_members m ON m.id=p.member_id WHERE p.draft_id=? AND p.version=? AND p.student_provider=? AND p.student_subject=? AND ${readable}) ON CONFLICT(draft_id,version,student_provider,student_subject) DO UPDATE SET last_read=excluded.last_read`).bind(id,p.version,session.provider,session.subject,now,now,id,p.version,session.provider,session.subject).run();
  await studentHead(env,session,id,p.version);return json({ok:true,version:p.version});
 }
 if(req.method!=='GET')fail(405,'反馈请求方式不支持。');const version=url.searchParams.has('version')?Number(url.searchParams.get('version')):undefined;if(version!==undefined&&(!Number.isSafeInteger(version)||version<1))fail(400,'反馈版本不正确。');
 const {p,document}=await released(env,session,id,version);
 if(studentMatch[3]){
  if(!document.pages.some((page:any)=>page.assetId===studentMatch[3]))fail(404,'这张原稿不属于当前已发布反馈。');const {row,object}=await readPrivateAsset(env,p.owner,studentMatch[3]);await studentHead(env,session,id,p.version);
  return new Response(object.body as any,{headers:{'Content-Type':row.mime,'Content-Length':String(row.bytes),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':'inline'}});
 }
 const urls=document.pages.map((page:any)=>'/api/student/reports/'+id+'/assets/'+page.assetId+'?version='+p.version);
 return json({...document,result:{...document.result,original_image_url:urls[0],original_image_urls:urls},pages:document.pages.map((page:any,i:number)=>({pageNumber:page.pageNumber,url:urls[i]}))});
}
