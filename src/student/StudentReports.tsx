import React,{useEffect,useRef,useState} from 'react';
import {useTeacherCloud} from '../teacher/TeacherCloud';
import StudentRevision from './StudentRevision';
import StudentRevisionsHome from './StudentRevisionsHome';
import {gradingApi,gradingMutation} from '../teacher/bound-grading';
import LegacyPaper from '../report/LegacyPaper.jsx';
import './student-reports.css';
const date=(value:number)=>new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(value);
export default function StudentReports(){
 const cloud=useTeacherCloud(),workspace=cloud.identity!.workspaceId;
 const [items,setItems]=useState<any[]>([]),[next,setNext]=useState<string|null>(null),[report,setReport]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [revisionId,setRevisionId]=useState(()=>{const id=new URLSearchParams(location.search).get('revision')||'';return /^[a-f0-9-]{36}$/.test(id)?id:'';}),[showRevisions,setShowRevisions]=useState(new URLSearchParams(location.search).has('revisions'));
 function revisionLocation(id=''){history.replaceState(null,'',id?'/student?revision='+encodeURIComponent(id):'/student?revisions=1');}
 const [query,setQuery]=useState('');const alive=useRef(true),controller=useRef(new AbortController()),lock=useRef(false),reportRef=useRef<any>(null),readReceipts=useRef(new Set<string>());reportRef.current=report;
 async function api(path:string,body?:unknown){return gradingApi(path,workspace,body,body?'POST':'GET',controller.current.signal);}
 async function list(cursor?:string){const value=await api('/api/student/reports'+(cursor?'?cursor='+encodeURIComponent(cursor):''));if(alive.current){setItems(old=>cursor?[...old,...value.reports.filter((item:any)=>!old.some(o=>o.id===item.id))]:value.reports);setNext(value.next);}}
 function failure(e:any){if(!alive.current)return;if(e.status===401){setReport(null);setItems([]);cloud.expired();}setError(e.name==='TypeError'?'连接暂时中断，请恢复网络后刷新。':e.message||'反馈暂时无法读取，请重试。');}
 async function run(action:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await action();}catch(e){failure(e);}finally{lock.current=false;if(alive.current)setBusy(false);}}
 async function startRevision(){await run(async()=>{const v=await gradingMutation('/api/student/revisions',workspace,{parentDraftId:report.publication.draftId,parentPublicationVersion:report.publication.version},'POST',controller.current.signal);if(alive.current){setRevisionId(v.id);revisionLocation(v.id);setReport(null);setShowRevisions(false);setNotice('');}});}
 async function open(id:string){await run(async()=>{try{const value=await api('/api/student/reports/'+id);if(alive.current){setReport(value);history.replaceState(null,'','/student?report='+id);setNotice('');window.scrollTo({top:0,behavior:'instant'});}}catch(e){if((e as any).status!==404)throw e;setReport(null);setNotice('老师正在更新这份反馈，稍后发布后可再次查看。');await list();}});}
 useEffect(()=>{alive.current=true;void run(async()=>{await list();const wanted=new URLSearchParams(location.search).get('report');if(wanted&&/^[a-f0-9-]{36}$/.test(wanted)){try{const value=await api('/api/student/reports/'+wanted);if(alive.current)setReport(value);}catch(e){if((e as any).status===404)setNotice('这份反馈尚未发布、已更新或已撤回。');else throw e;}}});return()=>{alive.current=false;controller.current.abort();};},[]);
 useEffect(()=>{
  async function check(){if(document.hidden||lock.current||cloud.status!=='ready')return;try{const current=reportRef.current;if(current){const fresh=await api('/api/student/reports/'+current.publication.draftId);if(alive.current&&reportRef.current?.publication.draftId===current.publication.draftId&&fresh.publication.version!==current.publication.version){setReport(fresh);setNotice('老师已发布更新版本，已载入最新反馈。');}}else await list();}catch(e){if((e as any).status===404){setReport(null);setNotice('老师正在更新这份反馈，稍后发布后可再次查看。');try{await list();}catch(error){failure(error);}}else failure(e);}}
  const visible=()=>{if(!document.hidden)void check();};window.addEventListener('focus',visible);document.addEventListener('visibilitychange',visible);const timer=setInterval(()=>void check(),30000);return()=>{clearInterval(timer);window.removeEventListener('focus',visible);document.removeEventListener('visibilitychange',visible);};
 },[cloud.status]);
 useEffect(()=>{document.title=report?(report.taskTitle||report.assignment.title)+' · 反馈第 '+report.publication.version+' 版':'我的作文反馈';},[report?.publication.draftId,report?.publication.version]);
 useEffect(()=>{if(!report||document.hidden)return;const {draftId,version}=report.publication,key=draftId+':'+version;if(readReceipts.current.has(key))return;
  const timer=setTimeout(()=>{if(reportRef.current?.publication.draftId!==draftId||reportRef.current?.publication.version!==version)return;void api('/api/student/reports/'+draftId+'/read',{version}).then(()=>{readReceipts.current.add(key);if(alive.current)setItems(old=>old.map(item=>item.id===draftId?{...item,readAt:Date.now()}:item));}).catch(failure);},350);return()=>clearTimeout(timer);
 },[report?.publication.draftId,report?.publication.version]);
 function print(){document.body.classList.remove('print-mode-single','print-mode-analysis');document.body.classList.add('print-mode-batch');window.print();}
 const filtered=items.filter(item=>!query||[item.title,item.className,item.academicYear].some(value=>String(value).toLocaleLowerCase().includes(query.toLocaleLowerCase())));
 return <div className="student-writing-app"><style>{'@media print{@page{size:A4 portrait;margin:15mm}.student-writing-app .print-container{page-break-after:auto!important}}'}</style>
  <header className="student-writing-header no-print"><a href="/student"><img src="/favicon.svg" alt=""/><strong>我的作文</strong></a><div><span>{cloud.identity?.name}</span>{cloud.status==='expired'?<a href="/api/auth/start?next=/student">重新登录</a>:<button onClick={()=>void cloud.logout()}>退出</button>}</div></header>
  <main className="student-writing-main no-print">
   {error&&<p role="alert" className="student-report-error">{error}</p>}{notice&&<p role="status" className="student-report-notice">{notice}</p>}
   {cloud.status==='expired'?<section className="student-writing-empty"><h1>请重新登录</h1><p>登录已过期，重新进入后即可继续查看自己的作文。</p><a href="/api/auth/start?next=/student">使用 Daily 登录</a></section>:revisionId?<StudentRevision key={revisionId} id={revisionId} onClose={()=>{setRevisionId('');setShowRevisions(true);revisionLocation();}} onFeedback={id=>{setRevisionId('');setShowRevisions(false);void open(id);}}/>:showRevisions?<StudentRevisionsHome onClose={()=>{setShowRevisions(false);history.replaceState(null,'','/student');}} onOpen={id=>{setRevisionId(id);revisionLocation(id);setShowRevisions(false);setReport(null);}}/>:report?<>
    <nav className="student-report-actions" aria-label="作文反馈操作"><button onClick={()=>{setReport(null);void run(()=>list());}}>返回作文列表</button><button disabled={busy} onClick={()=>void open(report.publication.draftId)}>刷新反馈</button><button className="student-primary" onClick={print}>打印我的反馈</button>{report.draftNumber<20&&<button disabled={busy} onClick={()=>void startRevision()}>开始下一稿修订</button>}</nav>
    <div className="student-feedback-meta"><span>第 {report.draftNumber} 稿 · 反馈第 {report.publication.version} 版</span><span>{report.publication.teacherName} · {date(report.publication.publishedAt)}发布</span></div>
    {report.revisionSource?.kind==='student'&&<details className="student-writing-criteria"><summary>本稿是我的自主修订 · 查看修改记录</summary>{report.revisionSource.changes.map((c:any,i:number)=><div key={i}><strong>{c.label}</strong><p>{c.evidence}</p></div>)}<p>{report.revisionSource.reflection}</p></details>}
    <details className="student-writing-criteria"><summary>写作要求与评分标准</summary><p className="student-prompt">{report.assignment.topic}</p>{report.rubric.items.map((item:any)=><div key={item.id}><strong>{item.label} · {item.score} 分</strong><p>{item.desc}</p></div>)}</details>
    <div className="student-feedback-paper"><LegacyPaper data={report.result} assignment={report.assignment} rubric={report.rubric} studentIndex={0} readOnly onUpdate={()=>{}} pdfConfig={{padding:15,lineHeight:1.45,fontSizeScale:1}}/></div>
    <details className="student-writing-original"><summary>查看我的手写原稿与识别文字（{report.pages.length} 页）</summary><div>{report.pages.map((page:any)=><figure key={page.pageNumber}><a href={page.url} target="_blank" rel="noreferrer"><img src={page.url} alt={'我的作文原稿第 '+page.pageNumber+' 页'}/></a><figcaption>第 {page.pageNumber} 页</figcaption></figure>)}</div><h3>原稿识别文字</h3><p className="student-prompt">{report.result.original_essay}</p><p>如识别文字有误，请联系老师核对。</p></details>
    {report.warnings?.map((warning:string)=><p key={warning} className="student-report-notice">{warning}</p>)}
   </>:<>
    <section className="student-writing-intro"><div><p>写作与修订</p><h1>每一次反馈，都用在下一稿。</h1><span>查看老师发布的作文反馈，对照原稿理解问题，再用自己的表达修改。</span></div><button disabled={busy} onClick={()=>void run(()=>list())}>{busy?'正在读取…':'刷新列表'}</button></section>
    {items.length>0&&<input aria-label="搜索我的作文" className="student-writing-search" type="search" placeholder="搜索题目、班级或学期" value={query} onChange={e=>setQuery(e.target.value)}/>}
    <button className="student-more" onClick={()=>{setShowRevisions(true);revisionLocation();setNotice('');}}>我的自主修订</button>
    <section className="student-writing-list" aria-label="已发布作文反馈">{filtered.map(item=><button key={item.id} disabled={busy} onClick={()=>void open(item.id)}><div><span className={'student-read-state'+(item.readAt?' read':'')}>{item.readAt?'已查看':'新反馈'}</span><h2>{item.title||'本次英语写作'}</h2><p>{item.className} · {item.academicYear} · 第 {item.draftNumber} 稿</p><small>{item.teacherName} · {date(item.publishedAt)}</small></div><div className="student-list-score"><strong>{item.score}</strong><span>/{item.total}</span></div></button>)}</section>
    {!filtered.length&&!busy&&<section className="student-writing-empty"><h2>{items.length?'没有找到这篇作文':'还没有已发布的作文反馈'}</h2><p>{items.length?'可以换个题目或学期关键词再试。':'老师核对并发布后，这里会显示属于你的作文。'}</p></section>}
    {next&&<button disabled={busy} className="student-more" onClick={()=>void run(()=>list(next))}>查看更多作文</button>}
   </>}
   {busy&&<p role="status" className="student-loading-status">正在读取，请稍候…</p>}
  </main>
  {report&&cloud.status!=='expired'&&<section className="print-container"><LegacyPaper data={report.result} assignment={report.assignment} rubric={report.rubric} studentIndex={0} readOnly onUpdate={()=>{}} pdfConfig={{padding:15,lineHeight:1.3,fontSizeScale:1}}/></section>}
 </div>;
}
