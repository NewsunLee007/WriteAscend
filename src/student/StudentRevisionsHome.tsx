import React,{useEffect,useRef,useState} from 'react';
import {useTeacherCloud} from '../teacher/TeacherCloud';
import {gradingApi} from '../teacher/bound-grading';
import './student-revisions.css';
const labels:Record<string,string>={draft:'修订草稿',submitted:'待老师收取',returned:'老师退回，请修改',accepted:'老师已收取'};
export default function StudentRevisionsHome({onOpen,onClose}:{onOpen:(id:string)=>void;onClose:()=>void}){
 const cloud=useTeacherCloud(),[items,setItems]=useState<any[]>([]),[next,setNext]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),a=useRef(new AbortController()),alive=useRef(true),lock=useRef(false);
 async function load(cursor=''){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{const value=await gradingApi('/api/student/revisions'+(cursor?'?cursor='+encodeURIComponent(cursor):''),cloud.identity!.workspaceId,undefined,'GET',a.current.signal);if(alive.current){setItems(old=>cursor?[...old,...value.revisions.filter((x:any)=>!old.some(i=>i.id===x.id))]:value.revisions);setNext(value.next);}}catch(e:any){if(alive.current){setError(e.message);if(e.status===401)cloud.expired();}}finally{lock.current=false;if(alive.current)setBusy(false);}}
 useEffect(()=>{alive.current=true;void load();return()=>{alive.current=false;a.current.abort();};},[]);
 return <section className="student-revisions-home" aria-label="我的修订列表"><header><h1>我的自主修订</h1><button onClick={onClose}>返回作文反馈</button></header><p>从老师发布的反馈开始新稿，在这里继续保存、提交或查看收取状态。</p>{error&&<p role="alert" className="student-report-error">{error}</p>}<button disabled={busy} onClick={()=>void load()}>刷新修订列表</button>{items.map(item=><article key={item.id}><div><h2>{item.title} · 第 {item.draftNumber} 稿</h2><p>{item.className} · {item.academicYear} · {labels[item.state]}</p>{item.teacherNote&&<p>{item.teacherNote}</p>}</div><button disabled={busy} onClick={()=>onOpen(item.id)}>打开修订</button></article>)}{!items.length&&!busy&&<p>还没有自主修订。从一篇已发布的反馈中选择“开始下一稿修订”。</p>}{busy&&<p role="status">正在读取修订…</p>}{next&&<button disabled={busy} onClick={()=>void load(next)}>查看更多修订</button>}</section>;
}
