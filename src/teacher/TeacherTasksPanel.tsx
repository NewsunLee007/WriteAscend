import React,{useRef,useState} from 'react';
import {useTeacherCloud} from './TeacherCloud';
import {uploadCloudAsset} from './cloud-assets';
import type {AuthorityClass,WritingTask,TaskEnvelope,TaskMember} from './task-contracts';
import './teacher-tasks.css';
const WritingSheetsPanel=React.lazy(()=>import('./WritingSheetsPanel'));
async function parsed(response:Response){
  let value:any;try{value=await response.json();}catch{throw new Error('任务暂时无法读取，请检查连接后重试。');}
  if(!response.ok)throw Object.assign(new Error(value.error?.message||'任务操作未完成。'),{status:response.status});return value;
}
export function TeacherTasksPanel({assignment,rubric,settings,busy:gradingBusy,sourceTask,onApply}:{assignment:any;rubric:any;settings:any;busy:boolean;sourceTask:WritingTask|null;onApply:(value:TaskEnvelope,members:TaskMember[])=>void}){
  const cloud=useTeacherCloud(),workspace=cloud.identity?.workspaceId||'';
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [tasks,setTasks]=useState<WritingTask[]>([]),[next,setNext]=useState<string|null>(null),[classes,setClasses]=useState<AuthorityClass[]>([]),[selected,setSelected]=useState<string[]>([]);
  const [title,setTitle]=useState(''),[preview,setPreview]=useState<{task:WritingTask;members:TaskMember[];rosterHash?:string;revision:number}|null>(null);
  const [memberSearch,setMemberSearch]=useState(''),[memberLimit,setMemberLimit]=useState(100);
  const [sheetTask,setSheetTask]=useState<WritingTask|null>(null);
  const visibleMembers=React.useMemo(()=>{
    const query=memberSearch.trim().toLocaleLowerCase();
    return [...(preview?.members||[])].filter(m=>!query||[m.name,m.className,m.academicYear,m.subject].some(value=>value.toLocaleLowerCase().includes(query))).sort((a,b)=>a.className.localeCompare(b.className,'zh')||a.name.localeCompare(b.name,'zh')||a.subject.localeCompare(b.subject,'en'));
  },[preview,memberSearch]);
  const mounted=useRef(true);
  React.useEffect(()=>()=>{mounted.current=false;},[]);
  async function run(action:()=>Promise<void>){setBusy(true);setError('');try{await action();}catch(e){if(mounted.current){setError(e instanceof Error?e.message:'任务暂未完成。');if((e as any).status===401)cloud.expired();}}finally{if(mounted.current)setBusy(false);}}
  async function api(path:string,body?:any,method=body?'POST':'GET'){
    return parsed(await fetch(path,{method,cache:'no-store',headers:{'Content-Type':'application/json','X-Workspace-Id':workspace},...(body?{body:JSON.stringify(body)}:{})}));
  }
  async function mutate(path:string,body:any,method='POST'){
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({path,method,body}))),hash=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
    const key='wa_pending_task:'+workspace+':'+hash;let requestId='';try{requestId=sessionStorage.getItem(key)||'';}catch{}
    requestId ||=crypto.randomUUID();try{sessionStorage.setItem(key,requestId);}catch{}
    const value=await api(path,{...body,requestId},method);try{sessionStorage.removeItem(key);}catch{}return value;
  }
  async function list(cursor?:string){const result=await api('/api/tasks'+(cursor?'?cursor='+encodeURIComponent(cursor):''));if(!mounted.current)return;setTasks(old=>cursor?[...old,...result.tasks]:result.tasks);setNext(result.next);}
  async function enter(){setOpen(true);setPreview(null);setNotice('');setTitle(assignment.title||assignment.examName||'写作任务');await run(async()=>{const result=await api('/api/classes');const available=result.classes.filter((c:AuthorityClass)=>['roster.read','writing.manage'].every(s=>c.scopes.includes(s)));setClasses(available);setSelected(old=>old.filter(id=>available.some((c:AuthorityClass)=>c.id===id)));await list();});}
  async function currentPayload(){
    const taskAssignment={...assignment};delete taskAssignment.isExtractingText;
    if(taskAssignment.promptImageBase64){
      const match=String(taskAssignment.promptImageBase64).match(/^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,(.+)$/s);if(!match)throw Error('题目图片格式暂不支持，请使用 JPG 或 PNG。');
      const image=new Blob([Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0))],{type:match[1]});
      taskAssignment.cloudPromptAssetId=(await uploadCloudAsset(image,workspace)).id;
    }
    delete taskAssignment.promptImageBase64;
    return {title:title.trim()||assignment.title||'写作任务',assignment:taskAssignment,rubric,settings,classIds:selected};
  }
  async function save(task?:WritingTask){await run(async()=>{const value=await mutate('/api/tasks'+(task?'/'+task.id:''),{...await currentPayload(),...(task?{expectedRevision:task.revision}:{})},task?'PUT':'POST');await list();setNotice('已保存任务草稿。请预览并核对学校名单，再建立班级任务。');setPreview(null);setSelected(value.task.targets.map((c:any)=>c.id));});}
  async function inspect(task:WritingTask){setMemberSearch('');setMemberLimit(100);await run(async()=>{
    if(task.status==='draft'){const value=await api('/api/tasks/'+task.id+'/preview');setPreview({task,members:value.members,rosterHash:value.rosterHash,revision:value.revision});}
    else{const members:TaskMember[]=[];let after='';do{const value=await api('/api/tasks/'+task.id+'/members'+(after?'?after='+after:''));members.push(...value.members);after=value.next||'';}while(after);setPreview({task,members,revision:task.revision});}
  });}
  async function apply(task:WritingTask){if(gradingBusy)throw Error('请先暂停当前批改，再载入任务。');const value=await api('/api/tasks/'+task.id) as TaskEnvelope;const members:TaskMember[]=[];if(value.task.status!=='draft'){let after='';do{const page=await api('/api/tasks/'+task.id+'/members'+(after?'?after='+after:''));members.push(...page.members);after=page.next||'';}while(after);}if(mounted.current){onApply(value,members);setOpen(false);}}
  return <>
    <aside className="teacher-tasks-bar no-print"><span>{sourceTask?'源任务：'+sourceTask.title+' · 标准第 '+sourceTask.version+' 版':'复用已保存的写作任务与评分标准。'}</span><button onClick={()=>void enter()}>写作任务</button></aside>
    {sheetTask&&<React.Suspense fallback={<p role="status">正在打开写作单…</p>}><WritingSheetsPanel task={sheetTask} onClose={()=>setSheetTask(null)}/></React.Suspense>}
    {open&&!sheetTask&&<div className="teacher-tasks-overlay no-print"><section className="teacher-tasks-dialog" role="dialog" aria-modal="true" aria-labelledby="teacher-tasks-title">
      <header><div><h2 id="teacher-tasks-title">写作任务与学校名册</h2><p>沿用当前题目与评分标准。名单来自已授权班级，建立任务后固定本次学生与标准。</p></div><button disabled={busy} onClick={()=>setOpen(false)} aria-label="关闭写作任务">×</button></header>
      <div className="teacher-tasks-content">
        {error&&<p className="task-error" role="alert">{error}</p>}{notice&&<p className="task-notice" role="status">{notice}</p>}
        {preview?<><button disabled={busy} onClick={()=>setPreview(null)}>返回任务列表</button><h3>{preview.task.title} · {preview.members.length} 名学生</h3><p>同名学生按各自的学校账号区分。请核对班级、学年与名单。</p><input className="task-member-search" aria-label="搜索任务学生" type="search" placeholder="搜索姓名、班级或短编号" value={memberSearch} onChange={event=>{setMemberSearch(event.target.value);setMemberLimit(100);}}/><div className="task-member-list">{visibleMembers.slice(0,memberLimit).map(m=><div key={m.provider+':'+m.subject}><strong>{m.name}</strong><small>{m.className} · {m.academicYear} · #{m.subject.slice(-8)}</small></div>)}{!visibleMembers.length&&<p>没有符合搜索条件的学生。</p>}</div>{visibleMembers.length>memberLimit&&<button onClick={()=>setMemberLimit(n=>n+100)}>显示更多学生（已显示 {memberLimit}/{visibleMembers.length}）</button>}{preview.rosterHash&&<button className="task-primary" disabled={busy} onClick={()=>void run(async()=>{await mutate('/api/tasks/'+preview.task.id+'/activate',{expectedRevision:preview.revision,rosterHash:preview.rosterHash});setPreview(null);await list();setNotice('班级任务已建立，名单与评分标准已固定。可载入原批改工作台。');})}>确认名单并建立任务</button>}</>:<>
          <section className="task-create"><h3>保存当前批改设置为任务</h3><label>任务名称<input aria-label="写作任务名称" value={title} onChange={e=>setTitle(e.target.value)} maxLength={240}/></label><fieldset><legend>选择学校授权班级</legend>{classes.length?classes.map(c=><label key={c.id}><input type="checkbox" checked={selected.includes(c.id)} onChange={e=>setSelected(old=>e.target.checked?[...old,c.id]:old.filter(id=>id!==c.id))}/><span>{c.name}<small>{c.academicYear} · {c.grade} · 学校 #{c.schoolId.slice(-6)}</small></span></label>):<p>当前没有学校班级管理权限。可先保存私人任务草稿，待管理员确认学校目录并授权后，再选择班级。</p>}</fieldset><p className="task-setting-summary">当前标准：{rubric.total} 分 · {rubric.items?.length||0} 个维度 · {rubric.gradeLevel}</p><button className="task-primary" disabled={busy||gradingBusy} onClick={()=>void save()}>保存为新任务草稿</button></section>
          <h3>我的写作任务</h3>{tasks.map(task=><article key={task.id}><div><strong>{task.title}</strong><small>{{draft:'草稿',open:'已建立',closed:'已关闭'}[task.status]} · 标准第 {task.version} 版 · {task.memberCount} 人</small><small>{task.targets.map(c=>c.name+'（'+c.academicYear+'）').join('、')||'尚未选择学校班级'}</small></div><nav><button disabled={busy||gradingBusy} onClick={()=>void run(()=>apply(task))}>载入批改设置</button>{task.status==='open'&&<button disabled={busy} onClick={()=>setSheetTask(task)}>打印写作单</button>}<button disabled={busy} onClick={()=>void inspect(task)}>{task.status==='draft'?'预览学校名单':'查看任务名单'}</button>{task.status==='draft'?<button disabled={busy||gradingBusy} onClick={()=>void save(task)}>用当前设置更新草稿</button>:<button disabled={busy} onClick={()=>void run(async()=>{await mutate('/api/tasks/'+task.id+'/status',{expectedRevision:task.revision,status:task.status==='open'?'closed':'open'});await list();})}>{task.status==='open'?'关闭任务':'重新开放'}</button>}</nav></article>)}
          {!tasks.length&&!busy&&<p>暂无任务。原一键批改仍可直接使用。</p>}{next&&<button disabled={busy} onClick={()=>void run(()=>list(next))}>加载更多任务</button>}
        </>}{busy&&<p role="status">正在处理任务，请稍候…</p>}
      </div>
    </section></div>}
  </>;
}
