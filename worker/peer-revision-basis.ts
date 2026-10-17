import type {Env} from './index';
import {HttpError} from './errors';
import {digest} from '../src/report/legacy-import';
import {peerSharingConfigured,peerExportLiveSql} from './peer-exports';

const uuid=/^[a-f0-9-]{36}$/,hex=/^[a-f0-9]{64}$/;
function fail(status:number,message:string):never{throw new HttpError(status,message,'student_revision_peer_changed');}
export type PeerBasis={document:{schema:string;roundId:string;author:{provider:string;subject:string};source:{exportId:string;contentHash:string;taskId:string;taskVersion:number;rubricHash:string;owner:{provider:string;subject:string;role:string};memberId:string;parentDraftId:string;inputHash:string;inputRevision:number;draftNumber:number};peerRubricHash:string;feedback:any[]};hash:string;parent:any};

export async function peerRevisionBasis(env:Env,principal:string,roundId:string):Promise<PeerBasis>{
 if(!peerSharingConfigured(env))fail(503,'同伴反馈修订连接尚未配置。');
 if(!uuid.test(roundId)||!principal.startsWith('wordup:')||!principal.slice(7))fail(403,'请选择本人参与的互评轮次。');
 let response:Response;
 try{
  const request=new Request(env.PEER_ORIGIN+'/api/integrations/writeascend/revision-basis',{method:'POST',headers:{Authorization:'Bearer '+env.PEER_EXCHANGE_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({roundId,actor:{provider:'wordup',subject:principal.slice(7),role:'student'}}),signal:AbortSignal.timeout(10000),redirect:'manual'});
  response=env.PEER_SERVICE?await env.PEER_SERVICE.fetch(request as any) as unknown as Response:await fetch(request);
 }catch{fail(503,'同伴建议暂时无法核验，自己的修订草稿仍保留。');}
 if(!response!.ok){const status=[403,404,409,410,413].includes(response!.status)?response!.status:503;let message=status===409?'请先在互批项目保存对当前建议的回应和修改计划，再核对修订依据。':status===413?'同伴反馈内容过长，请老师核对。':status===503?'同伴建议暂时无法核验，自己的修订草稿仍保留。':'本轮同伴建议已改变或暂不可用，请联系老师核对。';fail(status,message);}
 if(!response!.body)fail(503,'同伴反馈回执暂时无法读取。');
 const reader=response!.body!.getReader(),chunks:Uint8Array[]=[];let bytes=0;
 try{while(true){const r=await reader.read();if(r.done)break;bytes+=r.value.byteLength;if(bytes>1800000){await reader.cancel();fail(413,'同伴反馈回执过大，请老师核对。');}chunks.push(r.value);}}catch(e){if(e instanceof HttpError)throw e;fail(503,'同伴反馈传输中断，请恢复连接后重新核对。');}
 const all=new Uint8Array(bytes);let offset=0;for(const c of chunks){all.set(c,offset);offset+=c.length;}
 let wire:any;try{wire=JSON.parse(new TextDecoder().decode(all));}catch{fail(503,'同伴反馈回执暂时无法读取。');}
 const d=wire?.document,s=d?.source;
 if(!hex.test(wire?.hash)||!d||d.schema!=='newsun-peer-revision-basis-v1'||d.roundId!==roundId||d.author?.provider+':'+d.author?.subject!==principal||!s||![s.exportId,s.taskId,s.memberId,s.parentDraftId].every(id=>uuid.test(id))||![s.contentHash,s.inputHash,s.rubricHash,d.peerRubricHash].every(h=>hex.test(h))||!Number.isSafeInteger(s.inputRevision)||s.inputRevision<1||!Number.isSafeInteger(s.taskVersion)||s.taskVersion<1||!Number.isSafeInteger(s.draftNumber)||s.draftNumber<1||!Array.isArray(d.feedback)||d.feedback.length<1||d.feedback.length>5||await digest(d)!==wire.hash)fail(409,'同伴反馈版本或作者关联校验未通过。');
 const parent=await env.DB.prepare("SELECT d.*,s.task_id,s.member_id,m.provider,m.subject,m.class_id,m.name,m.class_name,m.academic_year,t.owner,t.title,t.revision AS task_revision,t.status AS task_status FROM writing_drafts d JOIN writing_submissions s ON s.id=d.submission_id JOIN task_members m ON m.id=s.member_id AND m.task_id=s.task_id JOIN writing_tasks t ON t.id=s.task_id WHERE d.id=? AND m.provider||':'||m.subject=? AND m.status='active' AND d.state='received'").bind(s.parentDraftId,principal).first<any>();
 if(!parent||parent.owner!==s.owner?.provider+':'+s.owner?.subject||parent.task_id!==s.taskId||parent.member_id!==s.memberId||parent.task_version!==s.taskVersion||parent.rubric_hash!==s.rubricHash||parent.input_hash!==s.inputHash||parent.revision!==s.inputRevision||parent.draft_number!==s.draftNumber)fail(409,'同伴建议对应的本人原稿已改变，请老师核对。');
 const exported=await env.DB.prepare('SELECT content_hash,owner,task_id FROM writing_peer_exports WHERE id=? AND target_origin=?').bind(s.exportId,env.PEER_ORIGIN!).first<any>();
 if(!exported||exported.content_hash!==s.contentHash||exported.owner!==parent.owner||exported.task_id!==parent.task_id||!await env.DB.prepare(peerExportLiveSql).bind(s.exportId).first())fail(409,'同伴建议的来源分享已撤回或改变。');
 return {document:d,hash:wire.hash,parent};
}

export function samePeerParent(w:{parent_draft_id:string;parent_input_hash:string;task_id:string;task_version:number;rubric_hash:string;teacher_owner:string;member_id:string},p:PeerBasis){const s=p.document.source;return w.parent_draft_id===s.parentDraftId&&w.parent_input_hash===s.inputHash&&w.task_id===s.taskId&&w.task_version===s.taskVersion&&w.rubric_hash===s.rubricHash&&w.teacher_owner===s.owner.provider+':'+s.owner.subject&&w.member_id===s.memberId;}
