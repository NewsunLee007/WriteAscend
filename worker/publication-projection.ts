// Only explicit student-facing fields enter a released report. Raw observations,
// provider payloads, internal identity references and teacher configuration stay private.
function text(value:unknown){return typeof value==='string'?value:'';}
export function studentReport(document:any,publication:{draftId:string;version:number;reportRevision:number;publishedAt:number;teacherName:string}){
 const source=document.result,rubric=document.rubric;
 const result:any={student_name:text(document.identity.name),class_name:text(document.identity.className),student_no:text(source.student_no),total_score:source.total_score,breakdown:Object.fromEntries(rubric.items.map((item:any)=>[item.label,source.breakdown?.[item.label]??0])),word_count:source.word_count,isBlank:source.isBlank===true,original_essay:text(source.original_essay),brief_comment:text(source.brief_comment),content_logic:text(source.content_logic),optimized_essay:text(source.optimized_essay),standard_reference:text(source.standard_reference||document.assignment.modelEssay),difficulty_status:source.difficulty_status==='exceeded'?'exceeded':'ok'};
 result.highlights=(Array.isArray(source.highlights)?source.highlights:[]).map((h:any)=>({text:text(h.text??h.excerpt),comment:text(h.comment??h.why_good)}));
 result.errors=(Array.isArray(source.errors)?source.errors:[]).map((e:any)=>({orig:text(e.orig),corr:text(e.corr),note:text(e.note),type:text(e.type)}));
 const assignment={examName:text(document.assignment.examName),title:text(document.assignment.title),topic:text(document.assignment.topic),modelEssay:result.standard_reference};
 const visibleRubric={total:rubric.total,wordCount:text(rubric.wordCount),gradeLevel:text(rubric.gradeLevel),tense:Array.isArray(rubric.tense)?rubric.tense.filter((t:unknown)=>typeof t==='string'):[],items:rubric.items.map((item:any)=>({id:text(item.id),label:text(item.label),score:item.score,desc:text(item.desc)}))};
 const identity={name:text(document.identity.name),className:text(document.identity.className),grade:text(document.identity.grade),academicYear:text(document.identity.academicYear)};
 const pages=document.source.manifest.pages.map((page:any)=>({assetId:page.assetId,pageNumber:page.pageNumber,sha256:page.sha256}));
 return {schema:'writeascend-student-report-v1',publication,result,assignment,rubric:visibleRubric,identity,draftNumber:document.provenance.draftNumber,taskTitle:text(document.provenance.taskTitle),pages,warnings:document.provenance.pipelineComplete===false?['后续英文润色或难度调整未全部完成，请结合教师建议修订。']:[]};
}
