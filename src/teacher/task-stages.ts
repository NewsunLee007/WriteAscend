import type {WritingTask} from './task-contracts';
export type TaskStage='brief'|'sheets'|'collect'|'grade'|'publish'|'peer';
/** Stage access is shared by the step navigation and the next-step action. */
export function canEnterTaskStage(stage:TaskStage,task:Pick<WritingTask,'status'>|undefined,canGrade:boolean,peerReady:boolean){
 if(stage==='brief')return true;
 if(!task||task.status==='draft')return false;
 if(stage==='sheets'&&task.status!=='open')return false;
 if(['grade','publish','peer'].includes(stage)&&!canGrade)return false;
 return stage!=='peer'||peerReady&&task.status==='open';
}
