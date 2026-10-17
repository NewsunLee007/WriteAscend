import React,{useEffect,useRef,useState} from 'react';
import LegacyPaper from '../report/LegacyPaper.jsx';
import {importLegacy,reportCsv,exportReportBundle} from '../report/legacy-import';
import type {ImportBundle,ReportRecord} from '../report/contracts';
import {printLegacyReport} from './legacy-archive-print';
import './legacy-archive.css';
import {useWorkspaceLeaveGuard} from './workspace-navigation';

type Report=ReportRecord&{cloudId:string;revision:number};
type Batch={id:string;label:string;reportCount:number;processedCount:number;status:'pending'|'complete'|'withdrawn';revision:number;created:string;legacyIndex:boolean};
function download(value:Blob|string,name:string,type='application/json'){
 const url=URL.createObjectURL(value instanceof Blob?value:new Blob([value],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export default function LegacyArchivePanel({workspace,onClose,onExpired,onLoad,embedded=false}:{embedded?:boolean;workspace:string;onClose:()=>void;onExpired:()=>void;onLoad:(report:ReportRecord)=>void}){
 const [tab,setTab]=useState<'reports'|'batches'>('reports'),[reports,setReports]=useState<Report[]>([]),[batches,setBatches]=useState<Batch[]>([]),[next,setNext]=useState<string|null>(null),[query,setQuery]=useState(''),[trash,setTrash]=useState(false);
 const [preview,setPreview]=useState<ImportBundle|null>(null),[fileName,setFileName]=useState(''),[selected,setSelected]=useState<Report|null>(null),[activeBatch,setActiveBatch]=useState<Batch|null>(null);
 const [busy,setBusy]=useState(false),[transferring,setTransferring]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[pausing,setPausing]=useState(false);
 const input=useRef<HTMLInputElement>(null),paper=useRef<HTMLDivElement>(null),content=useRef<HTMLDivElement>(null),dialog=useRef<HTMLElement>(null),generation=useRef(0),live=useRef(false),locked=useRef(false),stop=useRef(false),controllers=useRef(new Set<AbortController>()),printCleanup=useRef<(()=>void)|null>(null);
 useWorkspaceLeaveGuard(()=>!locked.current);
 useEffect(()=>{content.current?.scrollTo({top:0});},[selected?.cloudId,preview,tab]);
 const abort=()=>new DOMException('Operation cancelled','AbortError');
 async function api(path:string,body?:unknown,method=body===undefined?'GET':'POST',blob=false):Promise<any>{
  const epoch=generation.current,controller=new AbortController();controllers.current.add(controller);const timer=setTimeout(()=>controller.abort(),120000);
  try{
   const response=await fetch(path,{method,cache:'no-store',headers:{'X-Workspace-Id':workspace,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal});
   if(!live.current||generation.current!==epoch)throw abort();
   if(response.status===401){onExpired();throw Error('登录已过期，已导入的部分仍保留，请重新登录后继续。');}
   if(!response.ok){let message='暂时无法读取旧版档案，请稍后重试。';try{const value=await response.json();message=value.error?.message||message;}catch{}throw Error(message);}
   const value=blob?await response.blob():await response.json();if(!live.current||generation.current!==epoch)throw abort();return value;
  }finally{clearTimeout(timer);controllers.current.delete(controller);}
 }
 async function operation(action:()=>Promise<void>){
  if(locked.current)return;const epoch=generation.current;locked.current=true;setBusy(true);setError('');
  try{await action();}catch(e){if(live.current&&generation.current===epoch&&!(e instanceof DOMException&&e.name==='AbortError'))setError(e instanceof Error?e.message:'操作中断，已完成的部分仍保留。');}
  finally{if(live.current&&generation.current===epoch){locked.current=false;setBusy(false);setPausing(false);}}
 }
 async function listReports(cursor:string|null=null,search=query){const value=await api('/api/reports?'+new URLSearchParams({...cursor?{cursor}:{},...search?{q:search}:{}}));setReports(previous=>cursor?[...previous,...value.reports]:value.reports);setNext(value.nextCursor);}
 async function listBatches(cursor:string|null=null,withdrawn=trash){const value=await api('/api/legacy-imports?'+new URLSearchParams({withdrawn:withdrawn?'1':'0',...cursor?{cursor}:{}}));setBatches(previous=>cursor?[...previous,...value.batches]:value.batches);setNext(value.next);}
 useEffect(()=>{
  live.current=true;generation.current++;void operation(()=>listReports());if(!embedded)dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
  const keys=(event:KeyboardEvent)=>{if(embedded)return;if(event.key==='Escape'){event.preventDefault();onClose();return;}if(event.key!=='Tab')return;const fields=[...dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),[tabindex="0"]')||[]].filter(el=>el.offsetParent!==null);const first=fields[0],last=fields.at(-1);if(!first)return;if(event.shiftKey&&(document.activeElement===first||!dialog.current?.contains(document.activeElement))){event.preventDefault();last?.focus();}else if(!event.shiftKey&&(document.activeElement===last||!dialog.current?.contains(document.activeElement))){event.preventDefault();first.focus();}};
  document.addEventListener('keydown',keys);return()=>{document.removeEventListener('keydown',keys);live.current=false;generation.current++;locked.current=false;stop.current=true;for(const controller of controllers.current)controller.abort();controllers.current.clear();printCleanup.current?.();};
 },[]);
 async function choose(file:File){
  await operation(async()=>{
   if(file.size>8*1024*1024)throw Error('云端旧档案目前支持8MB以内的JSON。较大文件可先在设置中还原，再按原批次保存云端存档。');
   const epoch=generation.current;let value:unknown;try{value=JSON.parse(await file.text());}catch{throw Error('请选择原系统导出的有效JSON备份。');}
   const bundle=await importLegacy(value,{shareReadOnlyContext:true});if(!live.current||generation.current!==epoch)throw abort();
   if(bundle.reports.length>10000)throw Error('单份文件最多迁移10000份报告，请按原批次分开处理。');
   if(new TextEncoder().encode(JSON.stringify({schema:'newsun-legacy-import-request-v1',payload:bundle.sanitizedPayload,label:file.name.slice(0,160)})).byteLength>8*1024*1024)throw Error('处理后的文件仍超过8MB，请按原批次分别迁移。');
   setPreview(bundle);setFileName(file.name);setSelected(null);setActiveBatch(null);setNotice('');
  });
 }
 async function finish(batch:Batch){
  setActiveBatch(batch);
  while(batch.status==='pending'&&!stop.current&&live.current){const value=await api('/api/legacy-imports/'+batch.id+'/continue',{});batch=value.batch;setActiveBatch(batch);}
  setNotice(batch.status==='complete'?'迁移完成，报告已保存在当前教师的私有档案中。':'已暂停，已完成的报告和原备份保留，可在“备份文件”继续。');
 }
 async function transfer(load:()=>Promise<Batch>){const epoch=generation.current;stop.current=false;setPausing(false);setTransferring(true);try{await finish(await load());}finally{if(live.current&&epoch===generation.current)setTransferring(false);}}
 async function start(){if(!preview)return;await operation(()=>transfer(async()=>{const value=await api('/api/legacy-imports',{schema:'newsun-legacy-import-request-v1',label:fileName.slice(0,160)||'旧版作文备份',payload:preview.sanitizedPayload});return value.batch;}));}
 async function openReport(report:Report){await operation(async()=>{const value=await api('/api/reports/'+report.cloudId);setSelected(value.report);setPreview(null);setNotice('');});}
 async function changeTab(value:'reports'|'batches'){if(locked.current)return;setTab(value);setSelected(null);setPreview(null);setActiveBatch(null);setNext(null);setNotice('');await operation(()=>value==='reports'?listReports(null,''):listBatches(null,false));setQuery('');setTrash(false);}
 const missing=preview?.reports.filter(report=>!report.rubric).length||0;
 const names=new Set(preview?.reports.map(report=>report.result.class_name+'|'+report.result.student_name).filter(name=>name!=='|'));
 const classes=new Set(preview?.reports.map(report=>report.result.class_name).filter(Boolean));
 const canLoad=!!selected?.rubric?.items?.length&&Number(selected.rubric.total)>0;
 return <div className={"legacy-archive-overlay no-print"+(embedded?" ar-legacy-embedded":"")}><section ref={dialog} role={embedded?"region":"dialog"} aria-modal={embedded?undefined:true} aria-labelledby="legacy-archive-title" className="legacy-archive-dialog">
  <header><div><p>教师数据管理</p><h2 id="legacy-archive-title">历史导入档案</h2><span>保留原分数和批语。学生账号归属需另行核对。</span></div>{!embedded&&<button aria-label="关闭旧版批改档案" onClick={onClose}>×</button>}</header>
  <nav className="legacy-archive-nav"><button disabled={busy} aria-pressed={tab==='reports'} onClick={()=>void changeTab('reports')}>历史报告</button><button disabled={busy} aria-pressed={tab==='batches'} onClick={()=>void changeTab('batches')}>备份文件</button><button disabled={busy} className="legacy-primary" onClick={()=>input.current?.click()}>迁移旧备份</button><input ref={input} aria-label="选择旧版JSON备份" type="file" accept=".json,application/json" hidden onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void choose(file);}}/></nav>
  {error&&<p className="legacy-notice legacy-error" role="alert">{error}</p>}{notice&&<p className="legacy-notice" role="status">{notice}</p>}
  {transferring&&!preview&&<div className="legacy-transfer-bar" role="status"><span>{activeBatch?'已迁移 '+activeBatch.processedCount+' / '+activeBatch.reportCount+' 份':'正在核对迁移进度…'}</span><button disabled={pausing} onClick={()=>{stop.current=true;setPausing(true);}}>{pausing?'正在保存当前进度…':'完成当前部分后暂停'}</button></div>}
  <div ref={content} className="legacy-archive-content">
   {preview?<div className="legacy-import-preview"><h3>核对迁移内容</h3><p className="legacy-filename">{fileName}</p><dl><div><dt>报告</dt><dd>{preview.reports.length} 份</dd></div><div><dt>班级名称</dt><dd>{classes.size} 个</dd></div><div><dt>姓名条目</dt><dd>{names.size} 条</dd></div><div><dt>缺少原评分标准</dt><dd>{missing} 份</dd></div></dl><p>旧模型密钥和登录凭据已在本机排除。确认后保存原备份和报告，不会重新调用AI或修改原分数。</p><p>原图链接需重新核对；缺少评分标准的报告仍可查看、打印和导出。姓名与本机学号保留为历史信息。</p>{activeBatch&&<p role="status">已迁移 {activeBatch.processedCount} / {activeBatch.reportCount} 份 · {activeBatch.status==='complete'?'已完成':pausing?'正在保存当前进度…':'可继续'}</p>}<div className="legacy-actions">{activeBatch?.status==='pending'?<button disabled={busy} className="legacy-primary" onClick={()=>void operation(async()=>{await transfer(async()=>(await api('/api/legacy-imports/'+activeBatch.id)).batch);})}>继续迁移</button>:<button disabled={busy||activeBatch?.status==='complete'} className="legacy-primary" onClick={()=>void start()}>确认迁入我的云端档案</button>}{transferring&&<button disabled={pausing} onClick={()=>{stop.current=true;setPausing(true);}}>完成当前部分后暂停</button>}<button disabled={busy} onClick={()=>{setPreview(null);setTab('batches');setTrash(false);void operation(()=>listBatches(null,false));}}>查看备份文件</button></div></div>:
   selected?<div className="legacy-report-detail"><div className="legacy-actions"><button disabled={busy} onClick={()=>setSelected(null)}>返回列表</button><button onClick={()=>download(JSON.stringify(exportReportBundle([selected]),null,2),'Legacy_Report.json')}>下载JSON</button><button onClick={()=>download(reportCsv([selected]),'Legacy_Report.csv','text/csv;charset=utf-8')}>导出CSV</button><button onClick={()=>{if(paper.current){printCleanup.current?.();printCleanup.current=printLegacyReport(paper.current.querySelector('.writing-feedback')!,selected.pdfConfig.padding);}}}>打印 / PDF</button><button disabled={busy||!canLoad} onClick={()=>onLoad(selected)}>载入工作台编辑副本</button></div>{!selected.rubric&&<p className="legacy-notice">此记录缺少当时的评分标准；展示原分数，不推测满分。</p>}{selected.warnings.length>0&&<p className="legacy-report-warnings">{selected.warnings.join(' ')}</p>}<div ref={paper} className="legacy-report-paper"><LegacyPaper data={selected.result} assignment={selected.assignment} rubric={selected.rubric} pdfConfig={selected.pdfConfig} studentIndex={selected.result.student_no} readOnly/></div></div>:
   tab==='reports'?<><form className="legacy-search" onSubmit={e=>{e.preventDefault();void operation(()=>listReports());}}><input aria-label="搜索旧报告" value={query} onChange={e=>setQuery(e.target.value)} placeholder="姓名、班级或题目"/><button disabled={busy}>搜索</button></form><div className="legacy-report-list">{reports.map(report=><article key={report.cloudId}><div><strong>{report.result.student_name||'未标姓名'}</strong><p>{report.result.class_name||'未标班级'} · {String(report.assignment.title||report.assignment.examName||'旧版写作')}</p><small>存档分数 {String(report.result.total_score??'未记录')}{report.rubric?' / '+report.rubric.total:' · 满分未记录'}</small></div><button disabled={busy} onClick={()=>void openReport(report)}>查看报告</button></article>)}</div>{!reports.length&&!busy&&<p className="legacy-empty">暂无旧版云端报告。可迁移原系统导出的JSON备份。</p>}{next&&<button disabled={busy} onClick={()=>void operation(()=>listReports(next))}>加载更多报告</button>}</>:
   <><div className="legacy-actions"><button disabled={busy} onClick={()=>{setTrash(!trash);setNext(null);void operation(()=>listBatches(null,!trash));}}>{trash?'返回备份':'回收站'}</button><button disabled={busy} onClick={()=>void operation(()=>listBatches())}>刷新进度</button></div><div className="legacy-report-list">{batches.map(batch=><article key={batch.id}><div><strong>{batch.label}</strong><p>{batch.processedCount} / {batch.reportCount} 份 · {batch.status==='complete'?'已完成':batch.status==='withdrawn'?'已撤回':'待继续'}</p><small>{new Date(batch.created).toLocaleString()}</small>{batch.legacyIndex&&<p className="legacy-notice">旧批次需重新选择完整备份建立报告索引，之后可撤回。</p>}</div><div className="legacy-actions">{batch.status==='pending'&&<button disabled={busy} onClick={()=>void operation(async()=>{await transfer(async()=>(await api('/api/legacy-imports/'+batch.id)).batch);await listBatches();})}>继续迁移</button>}<button disabled={busy} onClick={()=>void operation(async()=>download(await api('/api/legacy-imports/'+batch.id+'/source',undefined,'GET',true),batch.label.replace(/\.json$/i,'')+'.json'))}>下载完整备份</button><button disabled={busy||batch.legacyIndex} onClick={()=>void operation(async()=>{if(batch.status!=='withdrawn'&&!window.confirm('撤回这个备份？仅隐藏本批次未修改且没有其他有效备份引用的报告，原文件和教师修改会保留。'))return;await api('/api/legacy-imports/'+batch.id+(batch.status==='withdrawn'?'/restore':''),{revision:batch.revision},batch.status==='withdrawn'?'POST':'DELETE');await listBatches();})}>{batch.status==='withdrawn'?'恢复备份':'撤回本批次'}</button></div></article>)}</div>{!batches.length&&!busy&&<p className="legacy-empty">{trash?'回收站为空':'暂无旧版备份文件。'}</p>}{next&&<button disabled={busy} onClick={()=>void operation(()=>listBatches(next))}>加载更多备份</button>}{activeBatch&&<p role="status">当前备份进度：{activeBatch.processedCount} / {activeBatch.reportCount}</p>}</>}
   {busy&&<p className="legacy-loading" role="status">{activeBatch?.status==='pending'?'正在保存导入进度…':'正在处理…'}</p>}
  </div>
 </section></div>;
}
