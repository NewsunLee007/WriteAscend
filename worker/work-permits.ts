import type {Env} from './index';
import type {GradingRun} from './grading-types';
import {HttpError} from './errors';
import {digest} from '../src/report/legacy-import';
export type WorkBridge=(env:Env,path:string,body:any)=>Promise<Record<string,any>>;
export type WorkScope={type:'grading-run';runId:string;taskId:string;memberId:string;draftId:string;classId:string;inputHash:string;modelInputHash:string;profileId:string;profileRevision:string;pipelineVersion:string}|{type:'model-job';jobId:string;requestHash:string;profileId:string;profileRevision:string};
const callback=(env:Env)=>env.PUBLIC_ORIGIN+'/api/auth/callback';
export async function stableWorkId(owner:string,requestId:string,kind:string){const h=await digest({owner,requestId,kind});return h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-8'+h.slice(17,20)+'-'+h.slice(20,32);}
export function runWorkScope(run:Pick<GradingRun,'id'|'task_id'|'member_id'|'draft_id'|'class_id'|'input_hash'|'model_input_hash'|'profile_id'|'profile_revision'|'pipeline_version'>):WorkScope{return {type:'grading-run',runId:run.id,taskId:run.task_id,memberId:run.member_id,draftId:run.draft_id,classId:run.class_id,inputHash:run.input_hash,modelInputHash:run.model_input_hash,profileId:run.profile_id,profileRevision:run.profile_revision,pipelineVersion:run.pipeline_version};}
async function receipt(owner:string,scope:WorkScope,value:any){
 if(value.active!==true||value.provider+':'+value.subject!==owner||!['teacher','admin'].includes(value.role)||!value.scopes?.includes('writing.personal')||!Number.isFinite(value.expires)||value.expires<=Date.now()||typeof value.permitId!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(value.permitId)||await digest(value.scope)!==await digest(scope))throw new HttpError(403,'后台批阅授权范围或账号已变化，请重新登录并继续。');
 if(scope.type==='grading-run'&&!value.classes?.some((c:any)=>c.id===scope.classId&&['roster.read','writing.grade'].every(s=>c.scopes?.includes(s))))throw new HttpError(403,'此班级的后台批阅授权已变化。');return value;
}
export async function assertWorkNotRevoked(env:Env,grantId:string){if(await env.DB.prepare('SELECT 1 FROM background_grant_revocations WHERE grant_id=?').bind(grantId).first())throw new HttpError(401,'此登录已退出，后台批阅已停止；请重新登录并继续。');}
export async function issueWork(env:Env,owner:string,grantId:string,requestId:string,scope:WorkScope,bridge:WorkBridge){await assertWorkNotRevoked(env,grantId);const value=await receipt(owner,scope,await bridge(env,'work/authorize',{grantId,requestId,callbackUri:callback(env),scope}));await assertWorkNotRevoked(env,grantId);return value;}
export async function inspectWork(env:Env,owner:string,permitId:string,scope:WorkScope,bridge:WorkBridge){const value=await receipt(owner,scope,await bridge(env,'work/introspect',{permitId,callbackUri:callback(env),scope}));if(value.permitId!==permitId)throw new HttpError(403,'后台批阅授权回执不一致。');return value;}
export async function revokeWork(env:Env,permitId:string|null|undefined,scope:WorkScope,bridge:WorkBridge){if(!permitId)return;try{await bridge(env,'work/revoke',{permitId,callbackUri:callback(env),scope});}catch{/* Local run state also blocks future dispatch; the permit is bounded and expires. */}}
