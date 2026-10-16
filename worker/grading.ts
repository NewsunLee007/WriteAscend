import type {Env} from './index';
import type {TaskSession} from './tasks';
import type {GradingRun,GradingStep} from './grading-types';
import {HttpError} from './errors';
import {digest,sanitizeLegacy} from '../src/report/legacy-import';
import {readPrivateAsset} from './assets';
import {configuredGradingModel,enqueueModelJob} from './model-jobs';
import {GRADING_PIPELINE_VERSION,gradeMessages,optimizedMessages,difficultyMessages,repairJsonMessages,responseContent,parseGradingObject,applyStage,nextStage,finalizeGrade,type PipelineInput,type PipelineStage} from '../src/report/grading-pipeline';

type Bridge=(env:Env,path:string,body:Record<string,unknown>)=>Promise<Record<string,any>>;
type Input=(req:Request,max?:number)=>Promise<unknown>;
type Member={id:string;task_id:string;task_version:number;provider:string;subject:string;name:string;class_id:string;class_name:string;grade:string;academic_year:string;school_id:string;status:string};
type Task={id:string;owner:string;status:string;title:string;current_version:number;revision:number};
type Draft={id:string;submission_id:string;draft_number:number;revision:number;input_hash:string;state:string};
type ModelImage={pageVersionId:string;assetId:string;sha256:string;bytes:number;mime:string};
type Context={task:Task;member:Member;draft:Draft;manifest:any;document:any;modelImages:ModelImage[];modelInputHash:string;pipeline:PipelineInput};
const uuid=/^[a-f0-9-]{36}$/;
const token=/^[-a-zA-Z0-9_]{16,128}$/;
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function fail(status:number,message:string,code?:string):never{throw new HttpError(status,message,code);}
function allowClass(classes:TaskSession['classes'],id:string){if(!classes.some(c=>c.id===id&&['roster.read','writing.grade'].every(scope=>c.scopes.includes(scope))))fail(403,'当前没有此班级的名单与作文批改权限。');}
async function authority(env:Env,owner:string,grantId:string,classId:string,bridge:Bridge){
 const verified=await bridge(env,'introspect',{grantId});
 if(!verified.active||verified.provider+':'+verified.subject!==owner||!['teacher','admin'].includes(verified.role))fail(401,'账号授权已变化，请重新登录后继续。');
 if(!Array.isArray(verified.classes)||!verified.scopes?.includes('writing.personal'))fail(403,'当前没有教师批改权限。');
 allowClass(verified.classes,classId);return verified;
}
async function objectJson(env:Env,key:string){const object=await env.FILES.get(key);if(!object)fail(503,'批改所需的已保存内容暂时无法读取。');return object!.json() as Promise<any>;}
async function saveJson(env:Env,key:string,value:unknown){const text=JSON.stringify(value);if(new TextEncoder().encode(text).length>4*1024*1024)fail(422,'批改结果内容过长，请检查模型输出。');await env.FILES.put(key,text,{httpMetadata:{contentType:'application/json'}});return key;}
const gradeLevel=(value:string,fallback:string)=>({'6':'六年级','7':'七年级','8':'八年级','9':'九年级'} as Record<string,string>)[value]||value||fallback;
async function context(env:Env,owner:string,taskId:string,memberId:string,draftId:string,inputRevision:number,inputHash:string,images?:unknown):Promise<Context>{
 const task=await env.DB.prepare('SELECT * FROM writing_tasks WHERE id=? AND owner=?').bind(taskId,owner).first<Task>();if(!task)fail(404,'写作任务不存在。');
 const member=await env.DB.prepare('SELECT * FROM task_members WHERE id=? AND task_id=?').bind(memberId,taskId).first<Member>();if(!member)fail(404,'任务学生不存在。');
 const draft=await env.DB.prepare('SELECT d.* FROM writing_drafts d JOIN writing_submissions s ON s.id=d.submission_id WHERE d.id=? AND s.task_id=? AND s.member_id=? AND s.owner=?').bind(draftId,taskId,memberId,owner).first<Draft>();if(!draft)fail(404,'学生稿次不存在。');
 const input=await env.DB.prepare('SELECT * FROM writing_draft_inputs WHERE draft_id=? AND revision=?').bind(draftId,inputRevision).first<{manifest_json:string;input_hash:string}>();if(!input||input.input_hash!==inputHash)fail(409,'稿件输入版本已改变，请重新核对。','grading_input_changed');
 const manifest=JSON.parse(input.manifest_json);
 if(await digest(manifest)!==inputHash||manifest.taskId!==taskId||manifest.memberId!==memberId||manifest.identity.provider!==member.provider||manifest.identity.subject!==member.subject||manifest.identity.classId!==member.class_id||manifest.taskVersion!==member.task_version)fail(409,'稿件身份或输入摘要不一致，请核对原稿。');
 if(!Array.isArray(manifest.pages)||manifest.pages.length!==manifest.pageCount||manifest.pages.some((p:any,i:number)=>p.pageNumber!==i+1)||manifest.pageCount<1||manifest.pageCount>4)fail(409,'请先收齐本稿的全部页面。','grading_pages_missing');
 const version=await env.DB.prepare('SELECT * FROM rubric_versions WHERE task_id=? AND version=?').bind(taskId,manifest.taskVersion).first<{content_hash:string;rubric_hash:string;object_key:string}>();if(!version||version.rubric_hash!==manifest.rubricHash)fail(409,'稿件与评分标准版本不一致。');
 const document=await objectJson(env,version.object_key);if(await digest({title:task.title,document})!==version.content_hash||await digest(document.rubric)!==version.rubric_hash)fail(503,'已保存的评分标准校验未通过，请联系管理员。');
 if(images!==undefined&&(!Array.isArray(images)||images.length!==manifest.pages.length))fail(400,'批改用图片须与原稿每一页对应。');
 const modelImages:ModelImage[]=[];
 for(const page of manifest.pages){
  const original=await readPrivateAsset(env,owner,page.assetId);if(original.row.sha256!==page.sha256)fail(409,'原稿图片摘要不一致。');
  const chosen=images===undefined?{pageVersionId:page.id,assetId:page.assetId}:(images as any[]).find(p=>p?.pageVersionId===page.id);
  if(!chosen||typeof chosen.assetId!=='string'||!uuid.test(chosen.assetId))fail(400,'批改用图片缺少对应原稿页。');
  const image=chosen.assetId===page.assetId?original:await readPrivateAsset(env,owner,chosen.assetId);
  modelImages.push({pageVersionId:page.id,assetId:image.row.id,sha256:image.row.sha256,bytes:image.row.bytes,mime:image.row.mime});
 }
 if(new Set(modelImages.map(p=>p.sha256)).size!==manifest.pageCount)fail(400,'批改用图片不能将同一照片重复作为多页。');
 if(new Set(modelImages.map(p=>p.pageVersionId)).size!==manifest.pageCount)fail(400,'批改图片不能重复页码。');
 if(modelImages.reduce((sum,p)=>sum+p.bytes,0)>12*1024*1024)fail(413,'本稿图片合计超过模型上限，请先准备整页批改副本；原图会继续保留。','grading_images_too_large');
 const roster=await env.DB.prepare("SELECT name FROM task_members WHERE task_id=? AND class_id=? AND status='active' ORDER BY id").bind(taskId,member.class_id).all<{name:string}>();
 return {task,member,draft,manifest,document,modelImages,modelInputHash:await digest(modelImages),pipeline:{assignment:document.assignment,rubric:document.rubric,languageDifficulty:document.settings?.languageDifficulty,grade:gradeLevel(member.grade,document.rubric.gradeLevel),className:member.class_name,rosterText:roster.results.map(m=>m.name).join('\n'),images:modelImages.map(p=>'wa-asset:'+p.assetId)}};
}
async function runRow(env:Env,id:string){return env.DB.prepare('SELECT * FROM grading_runs WHERE id=?').bind(id).first<GradingRun>();}
async function ownerRun(env:Env,session:TaskSession,id:string){const run=await runRow(env,id);if(!run||run.owner!==session.principal)fail(404,'批阅运行不存在。');allowClass(session.classes,run!.class_id);return run!;}
function summary(run:GradingRun,currentHash?:string){return {id:run.id,taskId:run.task_id,memberId:run.member_id,draftId:run.draft_id,inputRevision:run.input_revision,inputHash:run.input_hash,taskVersion:run.task_version,rubricHash:run.rubric_hash,profileId:run.profile_id,model:run.model_name,pipelineVersion:run.pipeline_version,generation:run.generation,state:run.state,reportId:run.report_id,created:run.created,updated:run.updated,...(currentHash?{outdated:currentHash!==run.input_hash}:{}),canUseSavedResult:!!run.result_key&&['failed','uncertain','cancelled'].includes(run.state),error:run.error_message?{status:run.error_status,message:run.error_message}:null};}
async function deliver(env:Env,id:string){if(!env.MODEL_JOBS)fail(503,'后台批改队列尚未配置。');await env.MODEL_JOBS!.send({runId:id});await env.DB.prepare("UPDATE grading_runs SET dispatched_at=? WHERE id=? AND state IN ('queued','running')").bind(Date.now(),id).run();}
async function operation(env:Env,owner:string,requestId:string,requestHash:string){const op=await env.DB.prepare('SELECT * FROM grading_operations WHERE owner=? AND request_id=?').bind(owner,requestId).first<{request_hash:string;run_id:string}>();if(!op)return null;if(op.request_hash!==requestHash)fail(409,'同一操作编号不能提交不同稿件或设置。');return (await runRow(env,op.run_id))!;}
async function createRun(env:Env,session:TaskSession,taskId:string,body:any,bridge:Bridge){
 if(!body||!token.test(body.requestId)||!uuid.test(body.memberId)||!uuid.test(body.draftId)||!Number.isSafeInteger(body.inputRevision)||body.inputRevision<1||!/^([a-f0-9]{64})$/.test(body.inputHash)||typeof body.profileId!=='string')fail(400,'请提供已收齐稿件、输入版本及批改模型。');
 const requestHash=await digest({action:'create',taskId,body}),previous=await operation(env,session.principal,body.requestId,requestHash);
 if(previous){allowClass(session.classes,previous.class_id);return previous;}
 const scope=await env.DB.prepare('SELECT class_id FROM task_members WHERE id=? AND task_id=?').bind(body.memberId,taskId).first<{class_id:string}>();if(!scope)fail(404,'任务学生不存在。');allowClass(session.classes,scope.class_id);
 const c=await context(env,session.principal,taskId,body.memberId,body.draftId,body.inputRevision,body.inputHash,body.modelImages);
 allowClass(session.classes,c.member.class_id);await authority(env,session.principal,session.grant_id,c.member.class_id,bridge);
 if(c.task.status==='draft'||c.member.status!=='active')fail(409,'此任务或学生暂不允许批阅。');
 if(c.draft.revision!==body.inputRevision||c.draft.input_hash!==body.inputHash||c.draft.state!=='received')fail(409,'原稿已经更新，请重新核对收取情况。','grading_input_changed');
 const model=await configuredGradingModel(env,body.profileId),temperature=body.temperature??0.25;
 if(typeof temperature!=='number'||!Number.isFinite(temperature)||temperature<0||temperature>1)fail(400,'批改温度参数不正确。');
 const effectiveTemperature=Math.min(temperature,0.25),key=await digest({owner:session.principal,draftId:body.draftId,inputHash:body.inputHash,profileId:model.id,profileRevision:model.revision,pipeline:GRADING_PIPELINE_VERSION,temperature:effectiveTemperature});
 const latest=await env.DB.prepare('SELECT * FROM grading_runs WHERE owner=? AND draft_id=? ORDER BY created DESC,id DESC LIMIT 1').bind(session.principal,c.draft.id).first<GradingRun>();
 let generation=0,prior:GradingRun|null=null;const reason=typeof body.reason==='string'?body.reason.trim():'';
 if(body.previousRunId){
  if(body.confirmBillable!==true||!uuid.test(body.previousRunId)||reason.length<5||reason.length>500)fail(400,'重新批阅须选择原运行、填写至少 5 字的原因，并确认重新调用 AI。');
  prior=await ownerRun(env,session,body.previousRunId);
  if(prior.draft_id!==c.draft.id||prior.task_id!==taskId||prior.member_id!==c.member.id||prior.input_hash!==c.draft.input_hash||prior.state!=='ready'||latest?.id!==prior.id)fail(409,'稿件或最近批阅已变化，请刷新后核对；未完成的运行请使用继续处理。');
  generation=prior.generation+1;
 }else if(latest&&latest.input_hash===body.inputHash){
  if(latest.run_key!==key)fail(409,'本稿已有批阅记录；更换模型请使用明确的重新批阅入口。');
  await env.DB.prepare("INSERT OR IGNORE INTO grading_operations(owner,request_id,request_hash,run_id,action,created) VALUES(?,?,?,?,'create',?)").bind(session.principal,body.requestId,requestHash,latest.id,Date.now()).run();
  return (await operation(env,session.principal,body.requestId,requestHash))!;
 }
 const id=crypto.randomUUID(),now=Math.max(Date.now(),(latest?.created||0)+1);
 const latestGuard=latest?'AND (SELECT id FROM grading_runs WHERE owner=? AND draft_id=? ORDER BY created DESC,id DESC LIMIT 1)=?':'AND NOT EXISTS(SELECT 1 FROM grading_runs WHERE owner=? AND draft_id=?)',latestBinds=latest?[session.principal,c.draft.id,latest.id]:[session.principal,c.draft.id];
 await env.DB.batch([
  env.DB.prepare(`INSERT OR IGNORE INTO grading_runs(id,owner,grant_id,task_id,member_id,submission_id,draft_id,input_revision,input_hash,task_version,rubric_hash,class_id,student_provider,student_subject,profile_id,profile_revision,model_name,model_images_json,model_input_hash,pipeline_version,temperature,run_key,generation,previous_run_id,reason,state,created,updated) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'queued',?,? WHERE EXISTS(SELECT 1 FROM writing_drafts WHERE id=? AND revision=? AND input_hash=? AND state='received') AND EXISTS(SELECT 1 FROM task_members WHERE id=? AND task_id=? AND status='active') ${latestGuard}`)
   .bind(id,session.principal,session.grant_id,taskId,c.member.id,c.draft.submission_id,c.draft.id,body.inputRevision,body.inputHash,c.manifest.taskVersion,c.manifest.rubricHash,c.member.class_id,c.member.provider,c.member.subject,model.id,model.revision,model.model,JSON.stringify(c.modelImages),c.modelInputHash,GRADING_PIPELINE_VERSION,effectiveTemperature,key,generation,prior?.id||null,reason,now,now,c.draft.id,body.inputRevision,body.inputHash,c.member.id,taskId,...latestBinds),
  env.DB.prepare("INSERT OR IGNORE INTO grading_operations(owner,request_id,request_hash,run_id,action,created) SELECT ?,?,?,id,'create',? FROM grading_runs WHERE owner=? AND run_key=? AND generation=? AND id=(SELECT id FROM grading_runs WHERE owner=? AND draft_id=? ORDER BY created DESC,id DESC LIMIT 1)").bind(session.principal,body.requestId,requestHash,now,session.principal,key,generation,session.principal,c.draft.id),
 ]);
 const accepted=await operation(env,session.principal,body.requestId,requestHash);if(!accepted)fail(409,'原稿或运行状态已改变，请重新读取。','grading_input_changed');
 if(accepted.state==='queued')try{await deliver(env,accepted.id);}catch{}return accepted;
}

function bindIdentity(run:GradingRun,c:Context,result:any){
 const observedName=typeof result.detected_student_name==='string'?result.detected_student_name:String(result.student_name||''),observedClass=typeof result.detected_class_name==='string'?result.detected_class_name:String(result.class_name||'');
 const normalizedName=(name:string)=>name.normalize('NFKC').replace(/\s/g,'');
 return {...result,detected_student_name:observedName,detected_class_name:observedClass,detected_student_no:result.detected_student_no??result.student_no??'',student_id:c.member.provider+':'+c.member.subject,class_id:'daily:'+c.member.class_id,student_name:c.member.name,class_name:c.member.class_name,student_no:'',identity_status:'matched',identity_source:'confirmed_task_member',identity_name_mismatch:!!observedName&&normalizedName(observedName)!==normalizedName(c.member.name),identity_name_mismatch_verified:false,graded_at:new Date(run.created).toISOString(),original_image_url:'/api/assets/'+c.manifest.pages[0].assetId,original_image_urls:c.manifest.pages.map((p:any)=>'/api/assets/'+p.assetId),bound_identity:{taskId:run.task_id,memberId:run.member_id,provider:run.student_provider,subject:run.student_subject,classId:run.class_id,draftId:run.draft_id,inputRevision:run.input_revision,inputHash:run.input_hash,rubricHash:run.rubric_hash}};
}
async function createStep(env:Env,run:GradingRun,stage:string,base:PipelineStage,previousResultKey:string|null,repairKey:string|null,attempt=1){
 const id=crypto.randomUUID(),now=Date.now();
 await env.DB.batch([
  env.DB.prepare("INSERT OR IGNORE INTO grading_steps(id,run_id,stage,base_stage,attempt,previous_result_key,repair_content_key,state,created,updated) SELECT ?,?,?,?,?,?,?,'queued',?,? WHERE EXISTS(SELECT 1 FROM grading_runs WHERE id=? AND state='running' AND lease_token=?)").bind(id,run.id,stage,base,attempt,previousResultKey,repairKey,now,now,run.id,run.lease_token),
  env.DB.prepare("UPDATE grading_runs SET current_step_id=(SELECT id FROM grading_steps WHERE run_id=? AND stage=? AND attempt=?),updated=? WHERE id=? AND state='running' AND lease_token=?").bind(run.id,stage,attempt,now,run.id,run.lease_token),
 ]);
 const step=await env.DB.prepare('SELECT * FROM grading_steps WHERE run_id=? AND stage=? AND attempt=?').bind(run.id,stage,attempt).first<GradingStep>();if(!step)fail(409,'批阅状态已改变，请重新读取。');return step!;
}
async function finishReport(env:Env,run:GradingRun,c:Context,result:any,accept?:{requestId:string;hash:string;reason:string}){
 const final=finalizeGrade(c.pipeline,result),id=run.id,now=Date.now(),envelope={schema:'writeascend-bound-report-v1',result:final,assignment:c.document.assignment,rubric:c.document.rubric,settings:c.document.settings||{},identity:{memberId:c.member.id,provider:c.member.provider,subject:c.member.subject,name:c.member.name,classId:c.member.class_id,className:c.member.class_name,schoolId:c.member.school_id,academicYear:c.member.academic_year,grade:c.member.grade},provenance:{runId:run.id,taskId:run.task_id,taskTitle:c.task.title,taskVersion:run.task_version,draftId:run.draft_id,draftNumber:c.draft.draft_number,inputRevision:run.input_revision,inputHash:run.input_hash,modelInputHash:run.model_input_hash,model:run.model_name,profileId:run.profile_id,pipelineVersion:run.pipeline_version,generatedBy:'ai',pipelineComplete:!accept},...(accept?{warnings:[{code:'teacher_accepted_saved_result',message:'后续润色或难度调整未全部完成。教师已选择保留当前完整批阅结果。',reason:accept.reason}]}:{}),source:{manifest:c.manifest,modelImages:c.modelImages}};
 const contentHash=await digest(envelope),key='writing-reports/'+await digest(run.owner)+'/'+id+'/1/'+contentHash+'.json';await saveJson(env,key,envelope);
 const gate="EXISTS(SELECT 1 FROM grading_runs WHERE id=? AND state='running' AND lease_token=?)";
 await env.DB.batch([
  env.DB.prepare(`INSERT OR IGNORE INTO writing_reports(id,run_id,owner,task_id,member_id,draft_id,input_revision,input_hash,rubric_hash,current_revision,created,updated) SELECT ?,?,?,?,?,?,?,?,?,1,?,? WHERE ${gate}`).bind(id,run.id,run.owner,run.task_id,run.member_id,run.draft_id,run.input_revision,run.input_hash,run.rubric_hash,now,now,run.id,run.lease_token),
  env.DB.prepare(`INSERT OR IGNORE INTO writing_report_revisions(report_id,revision,object_key,content_hash,source,actor,created) SELECT ?,1,?,?,'ai',?,? WHERE ${gate}`).bind(id,key,contentHash,run.owner,now,run.id,run.lease_token),
  ...(accept?[env.DB.prepare(`INSERT OR IGNORE INTO grading_operations(owner,request_id,request_hash,run_id,action,created) SELECT ?,?,?,?,'accept',? WHERE ${gate}`).bind(run.owner,accept.requestId,accept.hash,id,now,run.id,run.lease_token)]:[]),
  env.DB.prepare("UPDATE grading_runs SET state='ready',report_id=?,error_status=NULL,error_message=NULL,lease_token=NULL,lease_until=0,updated=? WHERE id=? AND state='running' AND lease_token=?").bind(id,now,run.id,run.lease_token),
 ]);
}
export async function advanceGradingRun(env:Env,id:string,bridge:Bridge){
 let run=await runRow(env,id);if(!run||!['queued','running'].includes(run.state))return;
 const lease=crypto.randomUUID(),now=Date.now();
 const acquired=await env.DB.prepare("UPDATE grading_runs SET state='running',lease_token=?,lease_until=?,updated=? WHERE id=? AND state IN ('queued','running') AND lease_until<=?").bind(lease,now+120000,now,id,now).run();if(!acquired.meta.changes)return;
 run=(await runRow(env,id))!;
 try{
  const access=await authority(env,run.owner,run.grant_id,run.class_id,bridge);
  const c=await context(env,run.owner,run.task_id,run.member_id,run.draft_id,run.input_revision,run.input_hash,JSON.parse(run.model_images_json));
  if(c.member.provider!==run.student_provider||c.member.subject!==run.student_subject||c.member.class_id!==run.class_id||c.manifest.rubricHash!==run.rubric_hash||c.manifest.taskVersion!==run.task_version||c.modelInputHash!==run.model_input_hash)fail(409,'运行输入与学生或评分标准不一致。');
  if(c.member.status!=='active'||c.task.status==='draft')fail(409,'任务或学生当前不允许继续批阅。');
  for(let transitions=0;transitions<8;transitions++){
   run=(await runRow(env,id))!;if(run.lease_token!==lease||run.state!=='running')return;
   let step=run.current_step_id?await env.DB.prepare('SELECT * FROM grading_steps WHERE id=? AND run_id=?').bind(run.current_step_id,run.id).first<GradingStep>():null;
   if(!step)step=await createStep(env,run,'grade','grade',null,null);
   if(!step.job_id){
    const model=await configuredGradingModel(env,run.profile_id);if(model.revision!==run.profile_revision||run.pipeline_version!==GRADING_PIPELINE_VERSION)fail(409,'模型或批阅规则已更新，请核对后建立新的批阅运行。');
    const previous=step.previous_result_key?await objectJson(env,step.previous_result_key):null;
    const messages=step.stage.endsWith(':json')?repairJsonMessages((await objectJson(env,step.repair_content_key!)).content):step.base_stage==='grade'?gradeMessages(c.pipeline):step.base_stage==='optimized'?optimizedMessages(c.pipeline,previous):difficultyMessages(c.pipeline,previous);
    const requestId='wa-grade-'+run.id+'-'+step.stage.replace(':','-')+'-'+step.attempt;
    let response:Response;
    try{response=await enqueueModelJob(env,{principal:run.owner,grant_id:run.grant_id,role:access.role,classes:access.classes},{profileId:run.profile_id,requestId,payload:{messages,temperature:step.stage.endsWith(':json')?0:run.temperature,response_format:{type:'json_object'}}},{runId:run.id,stepId:step.id,classId:run.class_id});}
    catch(e){const saved=await env.DB.prepare('SELECT id FROM model_jobs WHERE owner=? AND request_id=?').bind(run.owner,requestId).first<{id:string}>();if(saved)await env.DB.prepare('UPDATE grading_steps SET job_id=?,updated=? WHERE id=? AND job_id IS NULL').bind(saved.id,Date.now(),step.id).run();throw e;}
    const job=await response.json() as {id:string};await env.DB.prepare('UPDATE grading_steps SET job_id=?,updated=? WHERE id=? AND job_id IS NULL').bind(job.id,Date.now(),step.id).run();return;
   }
   const job=await env.DB.prepare('SELECT * FROM model_jobs WHERE id=? AND owner=?').bind(step.job_id,run.owner).first<{state:string;result_key:string;error_status:number;error_message:string}>();if(!job)fail(503,'模型步骤记录暂时无法读取。');
   if(job.state==='failed'||job.state==='uncertain'){
    await env.DB.batch([env.DB.prepare('UPDATE grading_steps SET state=?,updated=? WHERE id=?').bind(job.state,Date.now(),step.id),env.DB.prepare("UPDATE grading_runs SET state=?,error_status=?,error_message=?,lease_token=NULL,lease_until=0,updated=? WHERE id=? AND lease_token=?").bind(job.state,job.error_status,job.error_message,Date.now(),id,lease)]);return;
   }
   if(job.state!=='succeeded')return;
   const raw=await objectJson(env,job.result_key),content=responseContent(raw);let answer:any;
   try{answer=parseGradingObject(content);}catch{
    if(step.stage.endsWith(':json'))fail(422,'模型返回内容经一次格式修复仍不能读取，请核对模型配置后重试。');
    const repairKey=await saveJson(env,'grading-progress/'+await digest(run.owner)+'/'+run.id+'/'+step.id+'/raw-'+lease+'.json',{content});
    await env.DB.prepare("UPDATE grading_steps SET state='succeeded',result_key=?,updated=? WHERE id=?").bind(repairKey,Date.now(),step.id).run();
    await createStep(env,run,step.base_stage+':json',step.base_stage,step.previous_result_key,repairKey);continue;
   }
   const previous=step.previous_result_key?await objectJson(env,step.previous_result_key):null;let result:any;
   try{result=applyStage(c.pipeline,step.base_stage,previous,sanitizeLegacy(answer).value);}catch(e){fail(422,e instanceof Error&&e.message.startsWith('原稿文字')?e.message:'批改结果缺少完整原稿或必要字段，请检查模型输出后重试。');}
   result=bindIdentity(run,c,result);
   const key=await saveJson(env,'grading-progress/'+await digest(run.owner)+'/'+run.id+'/'+step.id+'/result-'+lease+'.json',result);
   await env.DB.batch([env.DB.prepare("UPDATE grading_steps SET state='succeeded',result_key=?,updated=? WHERE id=?").bind(key,Date.now(),step.id),env.DB.prepare("UPDATE grading_runs SET result_key=?,updated=? WHERE id=? AND lease_token=? AND state='running'").bind(key,Date.now(),run.id,lease)]);
   const following=nextStage(c.pipeline,step.base_stage,result);run=(await runRow(env,id))!;
   if(following){await createStep(env,run,following,following,key,null);continue;}
   await finishReport(env,run,c,result);return;
  }
  fail(503,'批阅步骤暂未推进，可稍后继续核对。');
 }catch(e){
  // No provider request exists when intake is full. Keep this class batch queued;
  // the scheduled sweep resumes it after earlier students have finished.
  if(e instanceof HttpError&&e.code==='model_pending_limit'){
   await env.DB.prepare("UPDATE grading_runs SET state='queued',error_status=NULL,error_message=NULL,updated=? WHERE id=? AND lease_token=? AND state='running'").bind(Date.now(),id,lease).run();return;
  }
  const status=e instanceof HttpError?e.status:503,message=e instanceof HttpError?e.message:'批阅进度保存暂未完成，已完成的模型响应会保留，请稍后继续。';
  await env.DB.prepare("UPDATE grading_runs SET state='failed',error_status=?,error_message=?,updated=? WHERE id=? AND lease_token=? AND state='running'").bind(status,message,Date.now(),id,lease).run();
 }finally{await env.DB.prepare('UPDATE grading_runs SET lease_token=NULL,lease_until=0 WHERE id=? AND lease_token=?').bind(id,lease).run();}
}
export async function advanceRunForModelJob(env:Env,jobId:string,bridge:Bridge){const binding=await env.DB.prepare('SELECT run_id FROM model_job_bindings WHERE job_id=?').bind(jobId).first<{run_id:string}>();if(binding)await advanceGradingRun(env,binding.run_id,bridge);}
export async function recoverGradingRuns(env:Env,bridge:Bridge){
 const rows=await env.DB.prepare("SELECT id FROM grading_runs WHERE state IN ('queued','running') AND lease_until<=? ORDER BY updated LIMIT 25").bind(Date.now()).all<{id:string}>();
 for(const row of rows.results)try{await deliver(env,row.id);}catch{break;}
}

async function alterRun(env:Env,session:TaskSession,id:string,action:'resume'|'pause',body:any,bridge:Bridge){
 const run=await ownerRun(env,session,id);if(!body||!token.test(body.requestId)||!Number.isSafeInteger(body.expectedUpdated))fail(400,'请提供当前运行版本与操作编号。');
 const hash=await digest({action,id,body}),replayed=await operation(env,session.principal,body.requestId,hash);if(replayed)return replayed;
 await authority(env,session.principal,session.grant_id,run.class_id,bridge);
 if(run.updated!==body.expectedUpdated)fail(409,'运行状态已有变化，请刷新后操作。');
 if(action==='pause'){
  if(!['queued','running'].includes(run.state))fail(409,'此运行已不在待批改或处理中。');
  await env.DB.batch([
   env.DB.prepare("INSERT OR IGNORE INTO grading_operations SELECT ?,?,?,?,'pause',? WHERE EXISTS(SELECT 1 FROM grading_runs WHERE id=? AND updated=? AND state IN ('queued','running'))").bind(session.principal,body.requestId,hash,id,Date.now(),id,body.expectedUpdated),
   env.DB.prepare("UPDATE grading_runs SET state='cancelled',lease_token=NULL,lease_until=0,updated=? WHERE id=? AND updated=? AND EXISTS(SELECT 1 FROM grading_operations WHERE owner=? AND request_id=? AND request_hash=?)").bind(Date.now(),id,body.expectedUpdated,session.principal,body.requestId,hash),
  ]);
 }else{
  if(!['failed','uncertain','cancelled'].includes(run.state))fail(409,'此运行不需要继续或重试。');
  if(run.state==='uncertain'&&(body.confirmUncertain!==true||typeof body.reason!=='string'||body.reason.trim().length<5||body.reason.length>500))fail(409,'上次模型处理结果无法确认，可能已计费；请明确确认重试并说明原因。','grading_uncertain_confirmation');
  const step=run.current_step_id?await env.DB.prepare('SELECT * FROM grading_steps WHERE id=? AND run_id=?').bind(run.current_step_id,id).first<GradingStep>():null;
  const job=step?.job_id?await env.DB.prepare('SELECT state FROM model_jobs WHERE id=?').bind(step.job_id).first<{state:string}>():null;
  const retry=!!step&&(job?.state==='failed'||job?.state==='uncertain'||job?.state==='succeeded'&&run.error_status===422),newStepId=retry?crypto.randomUUID():step?.id||null,now=Date.now();
  const guard='EXISTS(SELECT 1 FROM grading_operations WHERE owner=? AND request_id=? AND request_hash=?)',binds=[session.principal,body.requestId,hash];
  const statements=[env.DB.prepare("INSERT OR IGNORE INTO grading_operations SELECT ?,?,?,?,'resume',? WHERE EXISTS(SELECT 1 FROM grading_runs WHERE id=? AND updated=? AND state IN ('failed','uncertain','cancelled'))").bind(...binds,id,now,id,body.expectedUpdated)];
  if(retry)statements.push(env.DB.prepare(`INSERT OR IGNORE INTO grading_steps(id,run_id,stage,base_stage,attempt,previous_result_key,repair_content_key,state,created,updated) SELECT ?,?,?,?,?,?,?,'queued',?,? WHERE ${guard}`).bind(newStepId,id,step!.stage,step!.base_stage,step!.attempt+1,step!.previous_result_key,step!.repair_content_key,now,now,...binds));
  statements.push(env.DB.prepare(`UPDATE grading_runs SET state='queued',grant_id=?,current_step_id=?,error_status=NULL,error_message=NULL,reason=?,lease_token=NULL,lease_until=0,updated=? WHERE id=? AND updated=? AND ${guard}`).bind(session.grant_id,newStepId,body.reason?.trim()||run.reason,now,id,body.expectedUpdated,...binds));
  await env.DB.batch(statements);
 }
 const accepted=await operation(env,session.principal,body.requestId,hash);if(!accepted)fail(409,'运行状态已变化，请重新读取。');if(accepted.state==='queued')try{await deliver(env,accepted.id);}catch{}return accepted;
}
async function acceptSavedResult(env:Env,session:TaskSession,id:string,body:any,bridge:Bridge){
 const run=await ownerRun(env,session,id);
 if(!body||!token.test(body.requestId)||!Number.isSafeInteger(body.expectedUpdated)||typeof body.reason!=='string'||body.reason.trim().length<5||body.reason.length>500)fail(400,'请提供当前版本，并说明保留已有批阅结果的原因（至少 5 字）。');
 const hash=await digest({action:'accept',id,body}),prior=await operation(env,session.principal,body.requestId,hash);if(prior)return prior;
 await authority(env,session.principal,session.grant_id,run.class_id,bridge);
 if(!run.result_key||!['failed','uncertain','cancelled'].includes(run.state))fail(409,'尚无可保留的完整批阅结果，请先完成正文批改。');
 const lease=crypto.randomUUID(),now=Date.now(),claim=await env.DB.prepare("UPDATE grading_runs SET state='running',lease_token=?,lease_until=?,updated=? WHERE id=? AND updated=? AND state IN ('failed','uncertain','cancelled')").bind(lease,now+120000,now,id,body.expectedUpdated).run();if(!claim.meta.changes)fail(409,'批阅状态已变化，请刷新后操作。');
 try{
  const claimed=(await runRow(env,id))!,c=await context(env,run.owner,run.task_id,run.member_id,run.draft_id,run.input_revision,run.input_hash,JSON.parse(run.model_images_json));
  if(c.member.status!=='active'||c.member.provider!==run.student_provider||c.member.subject!==run.student_subject||c.modelInputHash!==run.model_input_hash||c.manifest.rubricHash!==run.rubric_hash)fail(409,'稿件身份或批阅依据已变化，请先核对。');
  await finishReport(env,claimed,c,await objectJson(env,run.result_key),{requestId:body.requestId,hash,reason:body.reason.trim()});return (await runRow(env,id))!;
 }catch(e){await env.DB.prepare("UPDATE grading_runs SET state='failed',lease_token=NULL,lease_until=0,error_status=503,error_message='已有批阅结果暂未保存成功，请刷新后继续。',updated=? WHERE id=? AND lease_token=?").bind(Date.now(),id,lease).run();throw e;}
}
export async function readBoundReport(env:Env,session:TaskSession,id:string,revision?:number){
 const row=await env.DB.prepare('SELECT * FROM writing_reports WHERE id=? AND owner=?').bind(id,session.principal).first<{id:string;run_id:string;current_revision:number;input_hash:string;draft_id:string}>();if(!row)fail(404,'批改报告不存在。');
 const run=await ownerRun(env,session,row.run_id),wanted=revision??row.current_revision;
 if(!Number.isSafeInteger(wanted)||wanted<1)fail(400,'报告版本不正确。');
 const version=await env.DB.prepare('SELECT * FROM writing_report_revisions WHERE report_id=? AND revision=?').bind(id,wanted).first<{object_key:string;content_hash:string;source:string;created:number}>();if(!version)fail(404,'该报告版本不存在。');
 const document=await objectJson(env,version.object_key);if(await digest(document)!==version.content_hash||document?.provenance?.runId!==run.id||document.provenance.inputHash!==run.input_hash||document?.identity?.provider!==run.student_provider||document.identity.subject!==run.student_subject)fail(503,'报告内容校验未通过，请联系管理员。');
 const current=await env.DB.prepare('SELECT input_hash FROM writing_drafts WHERE id=?').bind(row.draft_id).first<{input_hash:string}>();
 return {report:{id,runId:run.id,revision:wanted,latestRevision:row.current_revision,source:version.source,created:version.created,outdated:current?.input_hash!==row.input_hash},run:summary(run,current?.input_hash),document};
}
async function runHistory(env:Env,session:TaskSession,anchor:GradingRun,url:URL){
 let before=Number.MAX_SAFE_INTEGER,beforeId='~';const cursor=url.searchParams.get('cursor');
 if(cursor){try{const value=JSON.parse(atob(cursor));if(!Array.isArray(value)||value.length!==2||!Number.isSafeInteger(value[0])||value[0]<1||!uuid.test(value[1]))throw Error();[before,beforeId]=value;}catch{fail(400,'批阅历史分页位置不正确。');}}
 const rows=await env.DB.prepare('SELECT r.*,p.current_revision AS report_revision FROM grading_runs r LEFT JOIN writing_reports p ON p.id=r.report_id WHERE r.owner=? AND r.draft_id=? AND (r.created<? OR (r.created=? AND r.id<?)) ORDER BY r.created DESC,r.id DESC LIMIT 21').bind(session.principal,anchor.draft_id,before,before,beforeId).all<GradingRun&{report_revision:number|null}>();
 const current=await env.DB.prepare('SELECT input_hash FROM writing_drafts WHERE id=?').bind(anchor.draft_id).first<{input_hash:string}>(),page=rows.results.slice(0,20),last=page.at(-1);
 return {runs:page.map(r=>({...summary(r,current?.input_hash),reason:r.reason,previousRunId:r.previous_run_id,reportRevision:r.report_revision})),next:rows.results.length>20?btoa(JSON.stringify([last!.created,last!.id])):null};
}
async function revisionHistory(env:Env,session:TaskSession,id:string,url:URL){
 const run=await ownerRun(env,session,id),before=Number(url.searchParams.get('before')||Number.MAX_SAFE_INTEGER);if(!Number.isSafeInteger(before)||before<1)fail(400,'报告历史分页位置不正确。');
 const report=await env.DB.prepare('SELECT current_revision FROM writing_reports WHERE id=? AND owner=?').bind(id,session.principal).first<{current_revision:number}>();if(!report)fail(404,'批改报告不存在。');
 const rows=await env.DB.prepare('SELECT revision,source,reason,created FROM writing_report_revisions WHERE report_id=? AND revision<? ORDER BY revision DESC LIMIT 21').bind(id,before).all();
 const p=await env.DB.prepare("SELECT p.version,p.report_id,p.report_revision,p.state,m.status AS member_status,d.state AS input_state,EXISTS(SELECT 1 FROM writing_integration_quarantine q WHERE q.draft_id=p.draft_id) AS quarantined,d.input_hash AS current_hash,p.input_hash FROM writing_publications p JOIN writing_drafts d ON d.id=p.draft_id JOIN task_members m ON m.id=p.member_id WHERE p.draft_id=? AND p.owner=?").bind(run.draft_id,session.principal).first<any>();
 return {latestRevision:report.current_revision,revisions:rows.results.slice(0,20).map((r:any)=>({...r,studentVisible:!!p&&p.state==='published'&&p.member_status==='active'&&p.input_state==='received'&&!p.quarantined&&p.current_hash===p.input_hash&&p.report_id===id&&p.report_revision===r.revision})),next:rows.results.length>20?(rows.results[19] as any).revision:null};
}
async function editReport(env:Env,session:TaskSession,id:string,body:any,bridge:Bridge){
 if(!body||!token.test(body.requestId)||!Number.isSafeInteger(body.expectedRevision)||!body.result||typeof body.result!=='object'||Array.isArray(body.result))fail(400,'请提供报告修改、原版本及操作编号。');
 const run=await ownerRun(env,session,id),hash=await digest({action:'report-edit',id,body});
 const prior=await env.DB.prepare('SELECT * FROM grading_operations WHERE owner=? AND request_id=?').bind(session.principal,body.requestId).first<{request_hash:string;run_id:string;action:string}>();
 if(prior){if(prior.request_hash!==hash||prior.run_id!==run.id||!prior.action.startsWith('report-save/'))fail(409,'同一操作编号不能提交不同报告修改。');return readBoundReport(env,session,id,Number(prior.action.split('/')[1]));}
 await authority(env,session.principal,session.grant_id,run.class_id,bridge);
 const current=await readBoundReport(env,session,id);if(current.report.revision!==body.expectedRevision)fail(409,'报告已在其他设备修改，请先读取最新版本。','grading_report_conflict');
 const document=current.document,previous=document.result,safe=sanitizeLegacy(body.result).value as Record<string,any>;
 for(const key of ['student_id','class_id','student_name','class_name','original_essay','bound_identity'])if(key in safe&&JSON.stringify(safe[key])!==JSON.stringify(previous[key]))fail(400,'原稿和学生归属由已确认的稿次固定；请在收作业中更正归属，不能直接改绑报告。');
 for(const key of ['student_no','brief_comment','content_logic','optimized_essay'])if(key in safe&&typeof safe[key]!=='string')fail(400,'报告文字须为文本，请核对修改内容。');
 for(const [key,fields] of [['errors',['orig','corr','note','type']],['highlights',['text','excerpt','comment','why_good']]] as const){
  if(key in safe&&(!Array.isArray(safe[key])||safe[key].length>500||safe[key].some((item:any)=>!item||typeof item!=='object'||Array.isArray(item)||fields.some(field=>field in item&&typeof item[field]!=='string'))))fail(400,'报告亮点或纠错条目格式不正确。');
 }
 const allowed=['student_no','brief_comment','total_score','breakdown','highlights','errors','content_logic','optimized_essay','identity_name_mismatch_verified'];
 const result={...previous};for(const key of allowed)if(key in safe)result[key]=safe[key];
 if(!Number.isFinite(result.total_score)||result.total_score<0||result.total_score>document.rubric.total||!result.breakdown||typeof result.breakdown!=='object')fail(400,'报告总分或分项分数不正确。');
 let sum=0;for(const criterion of document.rubric.items){const value=result.breakdown[criterion.label];if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>criterion.score||value*2!==Math.round(value*2))fail(400,'分项分数须符合满分与半分要求。');sum+=value;}
 if(Math.abs(sum-result.total_score)>0.001)fail(400,'总分须与分项得分一致。');
 if(result.identity_name_mismatch_verified!==undefined&&typeof result.identity_name_mismatch_verified!=='boolean')fail(400,'姓名核对标记须为明确确认值。');
 const changed=await digest(previous)!==await digest(result),revision=current.report.revision+(changed?1:0),now=Date.now(),envelope={...document,result,...(changed?{modified:true}:{})},contentHash=await digest(envelope),key='writing-reports/'+await digest(session.principal)+'/'+id+'/'+revision+'/'+contentHash+'.json';
 if(changed)await saveJson(env,key,envelope);
 const binds=[session.principal,body.requestId,hash],guard='EXISTS(SELECT 1 FROM grading_operations WHERE owner=? AND request_id=? AND request_hash=?)';
 const statements=[env.DB.prepare('INSERT OR IGNORE INTO grading_operations(owner,request_id,request_hash,run_id,action,created) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM writing_reports WHERE id=? AND owner=? AND current_revision=?)').bind(...binds,run.id,'report-save/'+revision,now,id,session.principal,body.expectedRevision)];
 if(changed){statements.push(env.DB.prepare(`INSERT INTO writing_report_revisions(report_id,revision,object_key,content_hash,source,actor,reason,created) SELECT ?,?,?,?,'teacher',?,?,? WHERE ${guard} AND EXISTS(SELECT 1 FROM writing_reports WHERE id=? AND current_revision=?)`).bind(id,revision,key,contentHash,session.principal,typeof body.reason==='string'?body.reason.slice(0,500):'',now,...binds,id,body.expectedRevision),env.DB.prepare(`UPDATE writing_reports SET current_revision=?,updated=? WHERE id=? AND owner=? AND current_revision=? AND ${guard}`).bind(revision,now,id,session.principal,body.expectedRevision,...binds));}
 await env.DB.batch(statements);
 const accepted=await env.DB.prepare('SELECT action FROM grading_operations WHERE owner=? AND request_id=? AND request_hash=?').bind(...binds).first<{action:string}>();if(!accepted)fail(409,'报告已在其他设备修改，请先读取最新版本。','grading_report_conflict');
 return readBoundReport(env,session,id,Number(accepted.action.split('/')[1]));
}
export async function handleGrading(req:Request,env:Env,session:TaskSession,bridge:Bridge,input:Input):Promise<Response|null>{
 const url=new URL(req.url),taskMatch=url.pathname.match(/^\/api\/tasks\/([a-f0-9-]{36})\/grading$/),runMatch=url.pathname.match(/^\/api\/grading\/([a-f0-9-]{36})(?:\/(resume|pause|accept|history))?$/),reportMatch=url.pathname.match(/^\/api\/writing-reports\/([a-f0-9-]{36})(?:\/(history))?$/);
 if(!taskMatch&&!runMatch&&!reportMatch)return null;
 if(!['teacher','admin'].includes(session.role))fail(403,'此操作需要教师账号。');
 if(taskMatch){
  if(req.method==='POST'){const run=await createRun(env,session,taskMatch[1],await input(req,65536),bridge);return json({run:summary(run)},202);}
  if(req.method!=='GET')fail(405,'批阅列表请求方式不支持。');
  const task=await env.DB.prepare('SELECT id FROM writing_tasks WHERE id=? AND owner=?').bind(taskMatch[1],session.principal).first();if(!task)fail(404,'写作任务不存在。');
  const number=Number(url.searchParams.get('draftNumber')||1),after=url.searchParams.get('after')||'';if(!Number.isSafeInteger(number)||number<1||number>20||after&&!uuid.test(after))fail(400,'稿次或分页位置不正确。');
  const ids=session.classes.filter(c=>['roster.read','writing.grade'].every(s=>c.scopes.includes(s))).map(c=>c.id);if(!ids.length)fail(403,'当前没有班级批改权限。');
  const rows=await env.DB.prepare("SELECT m.id,m.name,m.class_name AS className,m.subject,m.status,d.id AS draftId,d.revision AS inputRevision,d.input_hash AS inputHash,d.state AS collectionState,d.page_count AS pageCount,d.draft_number AS draftNumber,r.id AS runId FROM task_members m LEFT JOIN writing_submissions s ON s.task_id=m.task_id AND s.member_id=m.id LEFT JOIN writing_drafts d ON d.submission_id=s.id AND d.draft_number=? LEFT JOIN grading_runs r ON r.id=(SELECT x.id FROM grading_runs x WHERE x.draft_id=d.id AND x.owner=? ORDER BY x.created DESC,x.id DESC LIMIT 1) WHERE m.task_id=? AND m.id>? AND m.class_id IN(SELECT value FROM json_each(?)) ORDER BY m.id LIMIT 101").bind(number,session.principal,taskMatch[1],after,JSON.stringify(ids)).all<any>();
  const page=rows.results.slice(0,100),runIds=page.map(m=>m.runId).filter(Boolean),draftIds=page.map(m=>m.draftId).filter(Boolean);
  const runRows=runIds.length?(await env.DB.prepare('SELECT * FROM grading_runs WHERE owner=? AND id IN(SELECT value FROM json_each(?))').bind(session.principal,JSON.stringify(runIds)).all<GradingRun>()).results:[];
  const publications=draftIds.length?(await env.DB.prepare('SELECT p.draft_id,p.state,p.version,p.report_id,p.report_revision,p.input_hash,EXISTS(SELECT 1 FROM writing_integration_quarantine q WHERE q.draft_id=p.draft_id) AS quarantined,(SELECT first_read FROM writing_publication_reads v WHERE v.draft_id=p.draft_id AND v.version=p.version AND v.student_provider=p.student_provider AND v.student_subject=p.student_subject) AS viewed FROM writing_publications p WHERE p.owner=? AND p.draft_id IN(SELECT value FROM json_each(?))').bind(session.principal,JSON.stringify(draftIds)).all<any>()).results:[];
  const runsById=new Map(runRows.map(run=>[run.id,run])),publishedByDraft=new Map(publications.map(p=>[p.draft_id,p]));
  const members=page.map(({subject,runId,...member})=>{const run=runsById.get(runId),p=publishedByDraft.get(member.draftId);return {...member,subjectShort:subject.slice(-8),run:run?summary(run,member.inputHash):null,publication:p?{state:p.state,version:p.version,reportId:p.report_id,reportRevision:p.report_revision,viewed:!!p.viewed,quarantined:!!p.quarantined,outdated:p.input_hash!==member.inputHash}:null};});
  return json({members,draftNumber:number,next:rows.results.length>100?rows.results[99].id:null});
 }
 if(runMatch){const run=await ownerRun(env,session,runMatch[1]);if(req.method==='GET'&&runMatch[2]==='history')return json(await runHistory(env,session,run,url));if(req.method==='GET'&&!runMatch[2]){const current=await env.DB.prepare('SELECT input_hash FROM writing_drafts WHERE id=?').bind(run.draft_id).first<{input_hash:string}>(),steps=await env.DB.prepare('SELECT id,stage,base_stage,attempt,job_id AS jobId,state,created,updated FROM grading_steps WHERE run_id=? ORDER BY created,id').bind(run.id).all();return json({run:summary(run,current?.input_hash),steps:steps.results});}if(req.method==='POST'&&runMatch[2]&&runMatch[2]!=='history')return json({run:summary(await (runMatch[2]==='accept'?acceptSavedResult(env,session,run.id,await input(req,8192),bridge):alterRun(env,session,run.id,runMatch[2] as 'resume'|'pause',await input(req,8192),bridge)))},202);fail(405,'批阅运行请求方式不支持。');}
 if(reportMatch){if(reportMatch[2]){if(req.method!=='GET')fail(405,'报告历史仅支持读取。');return json(await revisionHistory(env,session,reportMatch[1],url));}if(req.method==='GET')return json(await readBoundReport(env,session,reportMatch[1],url.searchParams.has('revision')?Number(url.searchParams.get('revision')):undefined));if(req.method==='PATCH')return json(await editReport(env,session,reportMatch[1],await input(req,2*1024*1024),bridge));fail(405,'报告请求方式不支持。');}
 return null;
}
