import type {PeerRubric} from './rubric';
import {verifyRubric} from './rubric';
import {requireThat,record,text,id,integer,hash,freeze} from './validation';
export type Rating='secure'|'partial'|'needs_work'|'unsure';
export type ReviewComment={id:string;criterionId:string;kind:'strength'|'improvement'|'question';anchor:{kind:'whole'}|{kind:'span';start:number;end:number;quote:string};explanation:string;suggestion:string};
export type PeerReview={schema:'newsun-peer-feedback-v1';rubricHash:string;materialHash:string;ratings:{criterionId:string;rating:Rating}[];comments:ReviewComment[];hash:string};
// Text offsets use JavaScript UTF-16 code units, matching the browser selection.
// Only a teacher-approved deidentified transcription is a reviewable material.
export async function validateReview(value:unknown,rubric:PeerRubric,material:{text:string;hash:string}):Promise<PeerReview>{
 const submitted=structuredClone(value);material={text:material.text,hash:material.hash};rubric=await verifyRubric(rubric);requireThat(typeof material.text==='string'&&material.text.length>0&&material.text.length<=40000&&await hash(material.text)===material.hash,'material_changed','互评材料已变化，请重新读取老师核对过的材料。');
 const v=record(submitted,['rubricHash','materialHash','ratings','comments']);requireThat(v.rubricHash===rubric.hash&&v.materialHash===material.hash,'review_version_changed','评价标准或稿件版本已变化，请先刷新。');
 const enabled=rubric.criteria.filter(c=>c.peerEnabled),ids=new Set(enabled.map(c=>c.id));requireThat(Array.isArray(v.ratings)&&v.ratings.length===enabled.length,'ratings_incomplete','请逐项回应本轮可评价的维度；拿不准可以选择请老师核对。');
 const seen=new Set<string>(),ratings=v.ratings.map(raw=>{const r=record(raw,['criterionId','rating']),criterionId=id(r.criterionId);requireThat(ids.has(criterionId)&&!seen.has(criterionId)&&['secure','partial','needs_work','unsure'].includes(String(r.rating)),'invalid_rating','评价维度、档位或重复记录不正确。');seen.add(criterionId);return {criterionId,rating:r.rating as Rating};});
 requireThat(Array.isArray(v.comments)&&v.comments.length>=2&&v.comments.length<=60,'comments_incomplete','请至少写出一处具体优点和一条可操作的修改建议。');
 const commentIds=new Set<string>(),comments=v.comments.map(raw=>{
  const c=record(raw,['id','criterionId','kind','anchor','explanation','suggestion']),commentId=id(c.id),criterionId=id(c.criterionId);requireThat(!commentIds.has(commentId)&&ids.has(criterionId)&&['strength','improvement','question'].includes(String(c.kind)),'invalid_comment','反馈编号、维度或类型不正确。');commentIds.add(commentId);
  const a=record(c.anchor,['kind','start','end','quote']);let anchor:ReviewComment['anchor'];
  if(a.kind==='whole'){requireThat(Object.keys(a).length===1,'invalid_anchor','整体反馈不能伪造原文引用。');anchor={kind:'whole'};}
  else{requireThat(a.kind==='span','invalid_anchor','请选择原文位置或整体反馈。');const start=integer(a.start,0,material.text.length-1,'引用起点'),end=integer(a.end,start+1,material.text.length,'引用终点');requireThat(end-start<=400&&typeof a.quote==='string'&&a.quote===material.text.slice(start,end)&&a.quote.trim().length>0,'invalid_quote','引用文字与所选原文不一致，请重新选择。');anchor={kind:'span',start,end,quote:a.quote};}
  return {id:commentId,criterionId,kind:c.kind as ReviewComment['kind'],anchor,explanation:text(c.explanation,'具体原因或疑问',5,1200),suggestion:c.kind==='strength'?text(c.suggestion||'','下一步建议',0,1200):text(c.suggestion,'可操作的建议或核对问题',5,1200)};
 });
 requireThat(comments.some(c=>c.kind==='strength')&&comments.some(c=>c.kind==='improvement'),'comments_incomplete','请同时给出具体优点和可操作的修改建议。');
 requireThat(comments.filter(c=>c.kind==='strength').some(c=>c.anchor.kind==='span'),'evidence_required','请从原文选择一处具体优点，并说明原因。');
 for(const r of ratings){if(r.rating==='unsure')requireThat(comments.some(c=>c.criterionId===r.criterionId&&c.kind==='question'),'question_required','选择请老师核对时，请写明具体疑问。');else if(['partial','needs_work'].includes(r.rating))requireThat(comments.some(c=>c.criterionId===r.criterionId&&c.kind==='improvement'),'action_required','指出某个维度需要改进时，请同时给出这一项的具体建议。');}
 const content={schema:'newsun-peer-feedback-v1' as const,rubricHash:rubric.hash,materialHash:material.hash,ratings,comments};return freeze({...content,hash:await hash(content)});
}
export async function validateAuthorResponse(value:unknown,review:PeerReview){
 const submitted=structuredClone(value);requireThat(review&&typeof review==='object','review_changed','同伴反馈无法读取。');review=structuredClone(review);const {hash:expectedHash,...saved}=review;requireThat(await hash(saved)===expectedHash,'review_changed','同伴反馈内容校验未通过。');freeze(review);
 const v=record(submitted,['reviewHash','responses']);requireThat(v.reviewHash===review.hash,'review_changed','同伴反馈版本已变化，请先重新查看。');
 requireThat(Array.isArray(v.responses)&&v.responses.length===review.comments.filter(c=>c.kind!=='strength').length,'response_incomplete','请回应每条修改建议和需要核对的问题。');
 const expected=new Set(review.comments.filter(c=>c.kind!=='strength').map(c=>c.id)),seen=new Set<string>();const responses=v.responses.map(raw=>{const r=record(raw,['commentId','decision','reason','plannedChange']),commentId=id(r.commentId);requireThat(expected.has(commentId)&&!seen.has(commentId)&&['adopt','partly','decline','question'].includes(String(r.decision)),'invalid_response','回应对象或处理方式不正确。');seen.add(commentId);return {commentId,decision:r.decision as 'adopt'|'partly'|'decline'|'question',reason:text(r.reason,'采纳或保留的理由',5,1200),plannedChange:['adopt','partly'].includes(String(r.decision))?text(r.plannedChange,'准备怎样修改',5,1200):text(r.plannedChange||'','需要核对的位置',0,1200)};});
 return freeze({reviewHash:review.hash,responses,hash:await hash({reviewHash:review.hash,responses})});
}
export function studentRubric(rubric:PeerRubric){return freeze({hash:rubric.hash,purpose:rubric.purpose,scorePolicy:rubric.scorePolicy,scaleVersion:rubric.scaleVersion,teacherTotal:rubric.teacherTotal,wordCount:rubric.wordCount,wordCountStrict:rubric.wordCountStrict,tense:structuredClone(rubric.tense),gradeLevel:rubric.gradeLevel,criteria:structuredClone(rubric.criteria)});}
