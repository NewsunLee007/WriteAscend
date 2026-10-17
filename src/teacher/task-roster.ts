import type {TaskEnvelope,TaskMember} from './task-contracts';
export function taskClasses(envelope:TaskEnvelope,members:TaskMember[],previous:any[]){
  return envelope.task.targets.map(target=>{
    const id='daily:'+target.id,old=previous.find(c=>c.id===id);
    const grade=/^([6789])[a-z]?$/i.exec(target.grade)?.[1];
    const gradeLevel=grade?({'6':'六年级','7':'七年级','8':'八年级','9':'九年级'} as Record<string,string>)[grade]:target.grade;
    return {...old,id,name:target.name,gradeLevel,authority:{classId:target.id,schoolId:target.schoolId,academicYear:target.academicYear,version:target.version},students:members.filter(m=>m.classId===target.id).map(member=>{
      const studentId=member.provider+':'+member.subject,oldStudent=old?.students?.find((s:any)=>s.id===studentId);
      return {...oldStudent,id:studentId,name:member.name,no:oldStudent?.no||'',aliases:oldStudent?.aliases||[],authority:{provider:member.provider,subject:member.subject,taskId:envelope.task.id,taskVersion:envelope.task.version,memberId:member.id}};
    })};
  });
}
// A recognized name or number is only usable when it resolves to one student.
export function uniqueStudent<T>(students:T[],matches:(student:T)=>boolean):T|null{
  const found=students.filter(matches);return found.length===1?found[0]:null;
}
