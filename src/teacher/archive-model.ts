import {indexStudent,matchesStudent} from './student-search';
export const archiveNumber=(value:unknown)=>value===null||value===undefined||String(value).trim()===''?null:Number.isFinite(Number(value))?Number(value):null;
export function archiveDate(value:unknown){const date=typeof value==='number'?value:typeof value==='string'&&value.trim()?Date.parse(value):NaN;return Number.isFinite(date)&&date>0?date:null;}
export function archiveRows(files:any[],classes:any[]){
 return files.map((file,index)=>{
  const r=file.result||{},name=String(r.student_name||file.inferredStudentName||file.name||'未标姓名'),className=String(r.class_name||file.inferredClassName||classes.find(c=>String(c.id)===String(file.targetClassId||file.inferredClassId))?.name||'未标班级');
  const shortId=String(r.bound_identity?.subject||r.student_id||file.id).slice(-6),issue=!!r.identity_name_mismatch&&!r.identity_name_mismatch_verified||!!r.identity_status&&r.identity_status!=='matched',ready=file.status==='success'&&!!file.result;
  return {file,index,name,className,shortId,ready,issue,status:ready?(issue?'需核对':'已完成'):file.status==='loading'?'批阅中':file.status==='error'?'需处理':'待批阅',score:ready?archiveNumber(r.total_score):null,date:archiveDate(r.graded_at),search:indexStudent({name,className,no:String(r.student_no||''),subjectShort:shortId,aliases:[file.name||'']})};
 });
}
export type ArchiveRow=ReturnType<typeof archiveRows>[number];
export type ArchiveFilter={query:string;className:string;status:string;days:string;sort:string};
export function filterArchiveRows(rows:ArchiveRow[],filter:ArchiveFilter,now=Date.now()){
 const found=rows.filter(r=>matchesStudent(r.search,filter.query)&&(!filter.className||r.className===filter.className)&&(filter.status==='all'||filter.status==='ready'&&r.ready||filter.status==='pending'&&!r.ready||filter.status==='issues'&&(r.issue||r.file.status==='error'))&&(!filter.days||r.date!==null&&r.date>=now-Number(filter.days)*86400000));
 return found.sort((a,b)=>filter.sort==='name'?a.name.localeCompare(b.name,'zh',{numeric:true})||a.index-b.index:filter.sort==='score'?(a.score===null?b.score===null?0:1:b.score===null?-1:b.score-a.score)||a.index-b.index:filter.sort==='date'?(a.date===null?b.date===null?0:1:b.date===null?-1:b.date-a.date)||a.index-b.index:a.index-b.index);
}
