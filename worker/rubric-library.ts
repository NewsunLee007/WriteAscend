import type {Env} from './index';
import {HttpError} from './errors';
import {digest} from '../src/report/legacy-import';
import {cleanRubricDocument,genres} from '../src/teacher/rubric-library';
type Who={principal:string;role:string;grant_id:string};
const fail=(status:number,message:string):never=>{throw new HttpError(status,message);};
const response=(value:any)=>Response.json(value,{headers:{'Cache-Control':'no-store'}});
function metadata(row:any){return {id:row.id,name:row.name,genre:row.genre,grade:row.grade,favorite:!!row.favorite,revision:row.revision,status:row.status,document:JSON.parse(row.document_json),created:row.created,updated:row.updated};}
export async function handleRubricLibrary(req:Request,env:Env,who:Who,input:(req:Request,max?:number)=>Promise<unknown>):Promise<Response|null>{
 const path=new URL(req.url).pathname,match=path.match(/^\/api\/rubric-templates(?:\/([a-f0-9-]{36})(?:\/(versions))?)?$/);if(!match)return null;
 if(!['teacher','admin'].includes(who.role))fail(403,'评分标准库需要教师账号。');
 const id=match[1];
 if(req.method==='GET'){
  if(!id){const rows=await env.DB.prepare('SELECT * FROM teacher_rubric_templates WHERE owner=? ORDER BY favorite DESC,updated DESC,id LIMIT 200').bind(who.principal).all();return response({templates:rows.results.map(metadata)});}
  const row=await env.DB.prepare('SELECT * FROM teacher_rubric_templates WHERE id=? AND owner=?').bind(id,who.principal).first();if(!row)fail(404,'未找到这份个人评分标准。');
  if(match[2]){const rows=await env.DB.prepare('SELECT revision,metadata_json,created FROM teacher_rubric_versions WHERE template_id=? ORDER BY revision DESC LIMIT 50').bind(id).all<any>();return response({versions:rows.results.map(r=>({revision:r.revision,template:JSON.parse(r.metadata_json),created:r.created}))});}
  return response({template:metadata(row)});
 }
 if(match[2]||!(req.method==='POST'&&!id||req.method==='PUT'&&id))fail(405,'评分标准库请求方式不支持。');
 const body=await input(req,70000) as any;
 if(!body||typeof body.requestId!=='string'||!/^[a-f0-9-]{36}$/.test(body.requestId))fail(400,'缺少有效操作编号。');
 const hash=await digest({id:id||null,body}),previous=await env.DB.prepare('SELECT request_hash,result_json FROM teacher_rubric_operations WHERE owner=? AND request_id=?').bind(who.principal,body.requestId).first<any>();
 if(previous){if(previous.request_hash!==hash)fail(409,'同一操作编号不能提交不同内容。');return response(JSON.parse(previous.result_json));}
 const old=id?await env.DB.prepare('SELECT * FROM teacher_rubric_templates WHERE id=? AND owner=?').bind(id,who.principal).first<any>():null;
 if(id&&!old)fail(404,'未找到这份个人评分标准。');
 if(id&&(!Number.isInteger(body.expectedRevision)||body.expectedRevision!==old.revision))fail(409,'这份标准已在其他页面修改，请刷新后重新核对。');
 if(typeof body.name!=='string'||!body.name.trim()||body.name.trim().length>100)fail(400,'请填写评分标准名称（最多100字）。');
 if(!genres.some(g=>g.id===body.genre))fail(400,'请选择文章类型。');
 if(!['active','archived'].includes(body.status||'active'))fail(400,'标准状态不正确。');
 let document;try{document=cleanRubricDocument(body.document);}catch(e){fail(400,(e as Error).message);}
 const stableId=await digest({owner:who.principal,requestId:body.requestId}),newId=[stableId.slice(0,8),stableId.slice(8,12),stableId.slice(12,16),stableId.slice(16,20),stableId.slice(20,32)].join('-');
 const now=Date.now(),row={id:id||newId,owner:who.principal,name:body.name.trim(),genre:body.genre,grade:document!.rubric.gradeLevel,favorite:body.favorite===undefined?(old?.favorite||0):body.favorite===true?1:0,revision:(old?.revision||0)+1,status:body.status||'active',document_json:JSON.stringify(document!),created:old?.created||now,updated:now},result={template:metadata(row)};
 // The operation receipt, compare-and-swap update, and revision history commit together.
 const guard='EXISTS(SELECT 1 FROM teacher_rubric_operations WHERE owner=? AND request_id=? AND request_hash=?)',binds=[who.principal,body.requestId,hash];
 const claim=env.DB.prepare('INSERT OR IGNORE INTO teacher_rubric_operations SELECT ?,?,?,?,? WHERE COALESCE((SELECT revision FROM teacher_rubric_templates WHERE id=? AND owner=?),0)=? AND NOT EXISTS(SELECT 1 FROM background_grant_revocations WHERE grant_id=?) AND (SELECT COUNT(*) FROM teacher_rubric_operations WHERE owner=? AND created>?)<120 AND (?=0 OR (SELECT COUNT(*) FROM teacher_rubric_templates WHERE owner=?)<200)').bind(who.principal,body.requestId,hash,JSON.stringify(result),now,row.id,who.principal,old?.revision||0,who.grant_id,who.principal,now-3600000,id?0:1,who.principal);
 const columns=Object.keys(row),values=Object.values(row),write=old?env.DB.prepare(`UPDATE teacher_rubric_templates SET ${columns.map(c=>c+'=?').join(',')} WHERE id=? AND owner=? AND revision=? AND ${guard}`).bind(...values,row.id,who.principal,old.revision,...binds):env.DB.prepare(`INSERT OR IGNORE INTO teacher_rubric_templates(${columns.join(',')}) SELECT ${columns.map(()=>'?').join(',')} WHERE ${guard}`).bind(...values,...binds);
 await env.DB.batch([claim,write,env.DB.prepare(`INSERT OR IGNORE INTO teacher_rubric_versions SELECT ?,?,?,? WHERE ${guard}`).bind(row.id,row.revision,JSON.stringify(metadata(row)),now,...binds)]);
 const accepted=await env.DB.prepare('SELECT request_hash,result_json FROM teacher_rubric_operations WHERE owner=? AND request_id=?').bind(who.principal,body.requestId).first<any>();if(!accepted)fail(409,'标准版本、数量或登录状态已变化，请刷新后核对（每位教师最多保存200份）。');if(accepted.request_hash!==hash)fail(409,'操作编号已被用于其他内容。');return response(JSON.parse(accepted.result_json));
}
