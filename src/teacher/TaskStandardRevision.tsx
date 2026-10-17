import React,{useRef,useState} from 'react';
import {ArrowLeft,Plus,Trash2} from 'lucide-react';
import RubricLibrary,{type RubricSelection} from './RubricLibrary';
import {genres,rubricProblem,scaleRubricItems,suggestedWordCount,wordCountConflict} from './rubric-library';
import {useTeacherCloud} from './TeacherCloud';
import {useWorkspaceLeaveGuard,useWorkspaceNavigation} from './workspace-navigation';
import {workspaceMutation} from './workspace-api';
import type {TaskEnvelope} from './task-contracts';

export default function TaskStandardRevision({detail,onClose,onSaved}:{detail:TaskEnvelope;onClose:()=>void;onSaved:()=>Promise<void>}){
 const cloud=useTeacherCloud(),navigation=useWorkspaceNavigation(),workspace=cloud.identity!.workspaceId;
 const [rubric,setRubric]=useState(()=>structuredClone(detail.document.rubric));
 const [languageDifficulty,setLanguageDifficulty]=useState(()=>structuredClone(detail.document.settings.languageDifficulty||{}));
 const [selection,setSelection]=useState<RubricSelection>({name:detail.task.title+' · 修订标准',genre:genres.find(g=>detail.document.rubric.items.some((c:any)=>String(c.desc).includes(g.content)))?.id||'narrative',fingerprint:JSON.stringify({rubric:detail.document.rubric,languageDifficulty:detail.document.settings.languageDifficulty||{}})});
 const [reason,setReason]=useState(''),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const locked=useRef(false),submitting=useRef(false),saved=useRef(false),baseline=useRef(JSON.stringify([rubric,languageDifficulty]));
 const changed=JSON.stringify([rubric,languageDifficulty])!==baseline.current,conflict=wordCountConflict(detail.document.assignment.topic,rubric.wordCount),problem=rubricProblem(rubric)||conflict;
 useWorkspaceLeaveGuard(async()=>!locked.current&&(submitting.current||saved.current||!changed&&!reason.trim()||await navigation.confirm('修订后的本次标准尚未保存，是否放弃这些修改？')));
 const field=(key:string,value:any)=>setRubric((r:any)=>({...r,[key]:value}));
 const item=(id:string,key:string,value:any)=>setRubric((r:any)=>({...r,items:r.items.map((c:any)=>c.id===id?{...c,[key]:value}:c)}));
 async function save(){
  if(locked.current||!changed||problem||!confirmed||reason.trim().length<5)return;
  submitting.current=true;const canSave=await navigation.canLeave();submitting.current=false;if(!canSave)return;
  locked.current=true;setBusy(true);setError('');
  try{await workspaceMutation('/api/tasks/'+detail.task.id+'/standard',workspace,{expectedRevision:detail.task.revision,rubric,settings:{...detail.document.settings,languageDifficulty},reason:reason.trim(),teacherConfirmed:true});saved.current=true;await onSaved();}
  catch(e){setError((e as Error).message);if((e as any).status===401)cloud.expired();}
  finally{locked.current=false;setBusy(false);}
 }
 return <div className="wa-standard-revision">
  <button className="wa-back" disabled={busy} onClick={async()=>{if(await navigation.canLeave())onClose();}}><ArrowLeft size={15}/>返回任务</button>
  <header className="wa-task-head"><span className="wa-tag">标准第 {detail.task.version} 版 → 第 {detail.task.version+1} 版</span><h2>修订本次标准</h2><p>{detail.task.title} · {detail.task.memberCount} 名学生 · {rubric.gradeLevel}</p></header>
  <section className="wa-panel"><h2>本次修订的影响</h2><p>已收原图、学生归属和旧报告完整保留。新标准保存后，旧报告会标为历史结果，需重新执行 AI 批阅，按模型供应商规则计费。</p><p>原有写作单二维码将失效；继续扫码收取前请重新打印。已拍摄但未上传的旧写作单，可先选学生，再核对上传。请向学生说明本次标准的变动。</p><details><summary>查看原题目</summary><p className="wa-prompt-summary">{detail.document.assignment.topic}</p></details><p className="wa-muted">已有发布记录或已交接互评材料的任务不能修订，请另建任务，以保留学生当时收到的评价依据。</p></section>
  <fieldset disabled={busy} className="wa-standard-fields">

    <section className="wa-panel wa-form"><h2>调整本次评价要求</h2>
     {conflict&&<div className="wa-alert" role="status">{conflict}<button className="wa-secondary" onClick={()=>field('wordCount',suggestedWordCount(detail.document.assignment.topic))}>采用题目词数要求</button></div>}
     <div className="wa-form-grid"><label>词数要求<input value={rubric.wordCount||''} onChange={e=>field('wordCount',e.target.value)} maxLength={500}/></label><label>作文满分<input type="number" min="0.5" max="1000" step="0.5" value={rubric.total} onChange={e=>field('total',Number(e.target.value))}/></label></div>
     <div className="wa-actions"><button className="wa-secondary" onClick={()=>field('items',scaleRubricItems(rubric.items,rubric.total))}>按满分等比例调整分项</button><span className="wa-muted">当前分项合计 {rubric.items.reduce((n:number,c:any)=>n+Number(c.score||0),0)} 分</span></div>
     <label className="wa-inline-check"><input type="checkbox" checked={rubric.wordCountStrict!==false} onChange={e=>field('wordCountStrict',e.target.checked)}/>按本次词数要求严格评价</label>
     <div className="wa-form-grid"><label>基本时态（用顿号分隔）<input value={(rubric.tense||[]).join('、')} onChange={e=>field('tense',e.target.value.split(/[、,，]/).map(s=>s.trim()).filter(Boolean))}/><small>用于提示常用时态；历史事件等仍应按语境判断。</small></label><label>批阅严格程度<select value={rubric.strictness||'适中'} onChange={e=>setRubric((r:any)=>({...r,strictness:e.target.value,strictnessLevel:({宽松:25,适中:45,严格:75} as any)[e.target.value]}))}>{[...new Set(['宽松','适中','严格',rubric.strictness].filter(Boolean))].map(s=><option key={s}>{s}</option>)}</select></label></div>
     <div><h3>评价维度与分值</h3>{rubric.items.map((c:any)=><div className="wa-criterion" key={c.id}><label>维度名称<input value={c.label} maxLength={120} onChange={e=>item(c.id,'label',e.target.value)}/></label><label>分值<input type="number" min="0" max={rubric.total} step="0.5" value={c.score} onChange={e=>item(c.id,'score',Number(e.target.value))}/></label><button aria-label={'删除维度：'+c.label} disabled={rubric.items.length<=1} onClick={()=>field('items',rubric.items.filter((x:any)=>x.id!==c.id))}><Trash2 size={17}/></button><label>具体要求<textarea rows={3} maxLength={8000} value={c.desc} onChange={e=>item(c.id,'desc',e.target.value)}/></label></div>)}<button className="wa-text-button" disabled={rubric.items.length>=64} onClick={()=>field('items',[...rubric.items,{id:'c_'+crypto.randomUUID(),label:'新增评价维度',score:0,desc:''}])}><Plus size={15}/>增加评价维度</button></div>
     <details><summary>润色难度设置</summary><div><label>目标难度<input value={rubric.modelDifficulty||''} maxLength={120} onChange={e=>field('modelDifficulty',e.target.value)}/></label><label className="wa-inline-check"><input type="checkbox" checked={languageDifficulty.enabled!==false} onChange={e=>setLanguageDifficulty((d:any)=>({...d,enabled:e.target.checked}))}/>检查润色结果的语言难度</label><label className="wa-inline-check"><input type="checkbox" checked={languageDifficulty.autoRewrite!==false} onChange={e=>setLanguageDifficulty((d:any)=>({...d,autoRewrite:e.target.checked}))}/>超出难度时自动尝试改写（可能增加模型调用）</label></div></details>
    </section>
   <details className="wa-panel wa-standard-library"><summary>改用其他标准或保存复用（可选）</summary><RubricLibrary rubric={rubric} setRubric={setRubric} languageDifficulty={languageDifficulty} setLanguageDifficulty={setLanguageDifficulty} selection={selection} onSelection={setSelection} lockGrade/></details>
   <section className="wa-panel wa-form"><h2>确认并保存新版本</h2><label>修订原因<textarea rows={2} value={reason} minLength={5} maxLength={500} onChange={e=>setReason(e.target.value)} placeholder="例如：按原题将词数要求更正为 60–80 词"/><small>至少 5 个字符，保留在修订记录中。</small></label><label className="wa-inline-check"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>我已核对新标准，确认旧报告需重新批阅、旧写作单二维码将失效。</label>{problem&&<p className="wa-error" role="alert">{problem}</p>}{error&&<p className="wa-error" role="alert">{error}</p>}<div className="wa-actions"><button className="wa-primary" disabled={busy||!changed||!!problem||!confirmed||reason.trim().length<5} onClick={()=>void save()}>{busy?'正在保存新版本…':'保存新标准，进入 AI 批阅'}</button><span className="wa-muted">保存本身不会调用模型或向学生发布。</span></div></section>
  </fieldset>
 </div>;
}
