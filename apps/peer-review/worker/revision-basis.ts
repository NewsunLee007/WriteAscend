import type {Env} from './index';
import {AuthError,bridge,sha} from './auth';
import {canonical,exchange,importConfigured,read,savedSource,type Imported} from './imports';
import {verifyRubric} from '../src/core/rubric';
import {validateAuthorResponse,type PeerReview} from '../src/core/feedback';
import {hash,PeerError} from '../src/core/validation';

const uuid=/^[a-f0-9-]{36}$/;
function fail(status:number,message:string):never{throw new AuthError(status,message);}
const json=(v:unknown)=>Response.json(v,{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});

// Fixed source-to-peer machine exchange. A browser's claimed identity is never
// accepted: WriteAscend attests its own authenticated author on every request.
export async function handleRevisionBasis(req:Request,env:Env):Promise<Response|null>{try{
 if(new URL(req.url).pathname!=='/api/integrations/writeascend/revision-basis')return null;
 if(!importConfigured(env))fail(503,'手写修订连接尚未配置。');
 const actual=await sha(req.headers.get('authorization')||''),expected=await sha('Bearer '+env.SOURCE_EXCHANGE_TOKEN);
 let different=0;for(let i=0;i<actual.length;i++)different|=actual.charCodeAt(i)^expected.charCodeAt(i);
 if(different)fail(401,'修订来源服务认证失败。');
 if(req.method!=='POST')fail(405,'修订依据请求方式不支持。');
 const body=await read(req,8192),actor=body?.actor;
 if(!uuid.test(body?.roundId)||!actor||actor.provider!=='wordup'||actor.role!=='student'||typeof actor.subject!=='string'||!actor.subject||actor.subject.length>200)fail(403,'请使用本篇作者的学校账号。');
 const round=await env.DB.prepare('SELECT * FROM peer_rounds WHERE id=?').bind(body.roundId).first<any>();
 if(!round)fail(404,'互评轮次不存在。');
 if(round.state==='paused')fail(409,'老师暂时暂停了本轮互评。');
 const person=await env.DB.prepare('SELECT * FROM peer_round_people WHERE round_id=? AND provider=? AND subject=?').bind(round.id,actor.provider,actor.subject).first<any>();
 if(!person)fail(404,'本轮没有当前作者的稿件。');
 const imported=await env.DB.prepare("SELECT * FROM peer_source_imports WHERE id=? AND source_origin=? AND receipt_state='acknowledged'").bind(round.import_id,env.SOURCE_ORIGIN!).first<Imported>();
 if(!imported||imported.owner!==round.owner||imported.content_hash!==round.source_hash)fail(409,'本轮来源版本不同。');
 const source=await savedSource(imported),entry=source.entries.find(e=>e.memberId===person.member_id&&e.provider===actor.provider&&e.subject===actor.subject);
 if(!entry||entry.text!==person.text||await hash(person.text)!==person.material_hash)fail(409,'作者原稿关联已变化。');
 const rubric=await verifyRubric(JSON.parse(round.rubric_json));
 const rows=await env.DB.prepare("SELECT a.id,a.revision,a.review_revision,a.review_hash,v.document_json AS review_json,v.content_hash,r.revision AS response_revision,r.review_hash AS response_review_hash,r.document_json AS response_json FROM peer_assignments a JOIN peer_review_versions v ON v.assignment_id=a.id AND v.revision=a.review_revision LEFT JOIN peer_author_responses r ON r.assignment_id=a.id AND r.author_id=? WHERE a.round_id=? AND a.author_id=? AND a.state='published' ORDER BY a.id").bind(person.id,round.id,person.id).all<any>();
 if(!rows.results.length)fail(409,'请先查看老师已发布的同伴建议。');
 const feedback=[];
 for(const row of rows.results){
  const review=JSON.parse(row.review_json) as PeerReview,{hash:reviewHash,...content}=review;
  if(row.content_hash!==row.review_hash||reviewHash!==row.review_hash||await hash(content)!==reviewHash||review.rubricHash!==rubric.hash||review.materialHash!==person.material_hash)fail(409,'同伴建议版本校验未通过。');
  if(!row.response_json||row.response_review_hash!==reviewHash)fail(409,'请先逐条保存对当前同伴建议的回应和修改计划。');
  const saved=JSON.parse(row.response_json),response=await validateAuthorResponse({reviewHash:saved.reviewHash,responses:saved.responses},review);
  if(response.hash!==saved.hash)fail(409,'作者回应版本校验未通过。');
  feedback.push({assignmentId:row.id,publicationRevision:row.revision,reviewRevision:row.review_revision,responseRevision:row.response_revision,review,response});
 }
 const document={schema:'newsun-peer-revision-basis-v1',roundId:round.id,author:{provider:'wordup',subject:actor.subject},source:{exportId:source.exportId,contentHash:imported.content_hash,taskId:source.task.id,taskVersion:source.task.version,rubricHash:source.task.rubricHash,owner:source.owner,memberId:entry.memberId,parentDraftId:entry.draftId,inputHash:entry.inputHash,inputRevision:entry.inputRevision,draftNumber:entry.draftNumber},peerRubricHash:rubric.hash,feedback};
 if(new TextEncoder().encode(JSON.stringify(document)).byteLength>1400000)fail(413,'本轮反馈内容过长，请老师核对后再进入手写修订。');
 const authority=await bridge(env,'round/author',{roundId:round.id,actor});
 if(authority?.active!==true||authority.bindingHash!==round.binding_hash||authority.role!=='student')fail(409,'本轮学校成员或授权已变化。');
 // Status has no actor projection. It never grants student access by posing as
 // the teacher; Daily above checks current membership and teacher authority.
 const current=await exchange(env,null,'status',{exportId:source.exportId,contentHash:imported.content_hash,receiptId:imported.receipt_id});
 if(current?.active!==true||current.contentHash!==imported.content_hash)fail(409,'互评来源已变化。');
 const expectedVersions=rows.results.map(r=>({id:r.id,revision:r.revision,reviewHash:r.review_hash,responseRevision:r.response_revision}));
 const valid=await env.DB.prepare("SELECT 1 FROM peer_rounds WHERE id=? AND revision=? AND state=? AND NOT EXISTS(SELECT 1 FROM json_each(?) j LEFT JOIN peer_assignments a ON a.id=json_extract(j.value,'$.id') LEFT JOIN peer_author_responses r ON r.assignment_id=a.id AND r.author_id=? WHERE a.id IS NULL OR a.state<>'published' OR a.revision<>json_extract(j.value,'$.revision') OR a.review_hash<>json_extract(j.value,'$.reviewHash') OR r.revision IS NULL OR r.revision<>json_extract(j.value,'$.responseRevision') OR r.review_hash<>a.review_hash) AND (SELECT COUNT(*) FROM peer_assignments WHERE round_id=? AND author_id=? AND state='published')=?").bind(round.id,round.revision,round.state,JSON.stringify(expectedVersions),person.id,round.id,person.id,feedback.length).first();
 if(!valid)fail(409,'建议或回应在核对期间改变，请重新读取。');
 return json({document,hash:await sha(canonical(document))});
}catch(e){if(e instanceof PeerError)throw new AuthError(409,e.message);throw e;}
}
