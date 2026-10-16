export type AuthorityClass={id:string;schoolId:string;academicYear:string;name:string;grade:string;version:number;grantVersion:number;scopes:string[]};
export type TaskTarget=Omit<AuthorityClass,'scopes'|'grantVersion'>;
export type WritingTask={id:string;title:string;status:'draft'|'open'|'closed';revision:number;version:number;rubricHash:string;targets:TaskTarget[];memberCount:number;created:number;updated:number};
export type TaskDocument={assignment:any;rubric:any;settings:any;targets:TaskTarget[]};
export type TaskEnvelope={task:WritingTask;document:TaskDocument};
export type TaskMember={id?:string;provider:'wordup';subject:string;name:string;classId:string;className:string;schoolId:string;academicYear:string;grade:string;sourceVersion:number};
