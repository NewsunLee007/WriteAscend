import {useEffect, useRef, useState} from 'react';
import {BookOpen, ChevronLeft, ChevronRight, Download, FileText, History, Import, PencilLine, Printer, ShieldCheck, SlidersHorizontal} from 'lucide-react';
import LegacyPaper from '../report/LegacyPaper.jsx';
import {importLegacy, reportCsv, exportReportBundle} from '../report/legacy-import';
import {DEFAULT_PDF, type ImportBundle, type LegacyResult, type PdfConfig, type ReportRecord} from '../report/contracts';

function download(data: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], {type}));
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function App() {
  const [reports, setReports] = useState<ReportRecord[]>([]), [selected, setSelected] = useState('');
  const [imports, setImports] = useState<Array<{name:string; bundle:ImportBundle}>>([]);
  const [tab, setTab] = useState<'reports'|'rubric'|'history'>('reports');
  const [query, setQuery] = useState(''), [editing, setEditing] = useState(false), [settings, setSettings] = useState(false);
  const [pdf, setPdf] = useState<PdfConfig>({...DEFAULT_PDF}), [printAll, setPrintAll] = useState(false);
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const [session, setSession] = useState<{authenticated:boolean;name?:string}|null>(null);
  const input = useRef<HTMLInputElement>(null);
  const filtered = reports.filter(r => `${r.result.student_name} ${r.result.class_name} ${r.assignment.title||''}`.includes(query));
  const current = filtered.find(r=>r.id===selected) ?? filtered[0];
  const index = current ? filtered.findIndex(r=>r.id===current.id) : -1;

  useEffect(()=>{
    const abort = new AbortController();
    fetch('/api/me',{signal:abort.signal,cache:'no-store'}).then(async r=>{
      if(r.status===401){setSession({authenticated:false});return;}
      if(!r.ok || !r.headers.get('content-type')?.includes('json'))return;
      setSession(await r.json());
    }).catch(()=>{});
    return ()=>abort.abort();
  },[]);
  useEffect(()=>{
    if(import.meta.env.DEV && new URLSearchParams(location.search).get('sample')==='1') {
      import('../report/fixtures').then(async ({sampleBackup})=>{
        const bundle=await importLegacy(sampleBackup);setReports(bundle.reports);setSelected(bundle.reports[0]?.id||'');
        setImports([{name:'合成验收样例',bundle}]);setMessage('正在查看合成样例，不包含真实学生数据。');
      });
    }
  },[]);
  useEffect(()=>{setEditing(false);if(current)setPdf(current.pdfConfig);},[current?.id]);
  useEffect(()=>{
    const style=document.createElement('style');style.textContent=`@page { size: A4; margin: ${Math.min(30,Math.max(5,pdf.padding))}mm; }`;
    document.head.append(style);return ()=>style.remove();
  },[pdf.padding]);
  function update(result: LegacyResult) {
    if(!current)return;
    setReports(list=>list.map(r=>r.id===current.id?{...r,result:structuredClone(result),modified:true}:r));
  }
  function changePdf(patch:Partial<PdfConfig>) {
    const next={...pdf,...patch};setPdf(next);
    if(current)setReports(list=>list.map(r=>r.id===current.id?{...r,pdfConfig:next,modified:true}:r));
  }
  async function openFiles(files: FileList | null) {
    if(!files)return;setBusy(true);setError('');setMessage('');
    try {
      const loaded: Array<{name:string;bundle:ImportBundle}>=[];
      for(const file of Array.from(files)) {
        if(file.size>25*1024*1024)throw Error('单个文件请控制在 25MB 以内。');
        let parsed:unknown;try{parsed=JSON.parse(await file.text());}catch{throw Error(`${file.name} 不是有效的 JSON 备份。`);}
        loaded.push({name:file.name,bundle:await importLegacy(parsed)});
      }
      const all=loaded.flatMap(x=>x.bundle.reports);
      setReports(prev=>[...prev,...all.filter(r=>!prev.some(p=>p.fingerprint===r.fingerprint))].filter((r,i,list)=>list.findIndex(x=>x.fingerprint===r.fingerprint)===i));
      setImports(prev=>[...prev,...loaded.filter(x=>!prev.some(p=>p.bundle.fingerprint===x.bundle.fingerprint))]);
      if(all[0])setSelected(all[0].id);
      setMessage(`已读取 ${all.length} 份结果。认证字段已在本机排除；学生归属尚待关联。`);
      setTab('reports');
    } catch(e) {setError(e instanceof Error?e.message:'导入失败，请检查备份文件。');}
    finally{setBusy(false);if(input.current)input.current.value='';}
  }
  function print(all:boolean) {setPrintAll(all);setEditing(false);setTimeout(()=>window.print(),100);}
  const renderRubric = current?.rubric ?? {total:'未提供',wordCount:'未提供',items:[]};
  const printReports = printAll ? filtered : current ? [current] : [];
  return <>
    <div className="workspace-shell no-print">
      <aside className="sidebar">
        <a className="brand" href="/"><span className="brand-icon"><PencilLine size={23}/></span><span>WriteAscend<small>英语写作成长空间</small></span></a>
        <p className="nav-label">写作工作台</p>
        <nav aria-label="主导航">
          <button className={tab==='reports'?'active':''} onClick={()=>setTab('reports')}><FileText size={19}/>批改报告<span>{reports.length||''}</span></button>
          <button className={tab==='rubric'?'active':''} onClick={()=>setTab('rubric')}><SlidersHorizontal size={19}/>评分标准</button>
          <button className={tab==='history'?'active':''} onClick={()=>setTab('history')}><History size={19}/>导入记录<span>{imports.length||''}</span></button>
        </nav>
        <div className="sidebar-footer"><ShieldCheck size={18}/><p>保留每一次修改<small>初稿、反馈与修订，各有记录。</small></p></div>
        <a className="daily-link" href="https://daily.newsunenglish.com/">返回 Daily <ChevronRight size={16}/></a>
      </aside>
      <div className="workspace-main">
        <header className="topbar"><div className="breadcrumb">写作工作台 <span>/</span> {{reports:'批改报告',rubric:'评分标准',history:'导入记录'}[tab]}</div>
          {session?.authenticated?<span className="account-dot">{session.name||'已登录'}</span>:<a className="account-link" href="/api/auth/start">使用 Daily 登录 <ChevronRight size={15}/></a>}
        </header>
        <main className="workspace-content">
          <div className="page-heading"><div><p className="eyebrow">WRITE · REFLECT · GROW</p><h1>{{reports:'让每一次反馈，成为进步的起点。',rubric:'让评价标准清楚可见。',history:'每一份历史结果，都有出处。'}[tab]}</h1><p className="page-subtitle">{{reports:'核对原文与反馈，保留教师判断，再把建议交给学生。',rubric:'沿用任务当时的标准，保留分值、要求与教师设置。',history:'在本机读取旧备份，保留结果与历史资料。'}[tab]}</p></div>
            <button className="primary-button" onClick={()=>input.current?.click()} disabled={busy}><Import size={18}/>{busy?'正在读取…':'导入原有结果'}</button>
            <input ref={input} type="file" accept=".json,application/json" multiple hidden onChange={e=>void openFiles(e.target.files)}/>
          </div>
          {error&&<div role="alert" className="notice error">{error}</div>}
          {message&&<div role="status" className="notice">{message}<button onClick={()=>setMessage('')} aria-label="关闭提示">×</button></div>}
          {tab==='reports'&&<>
            <div className="summary-row"><div><span>已读取报告</span><strong>{reports.length}<small>份</small></strong></div><div><span>待关联学生</span><strong>{reports.filter(r=>r.identity.status==='unlinked').length}<small>份</small></strong></div><div><span>本轮教师修改</span><strong>{reports.filter(r=>r.modified).length}<small>份</small></strong></div><div className="summary-note"><BookOpen size={22}/><p>原有报告内容完整保留<small>总评、亮点、纠错、优化建议与双稿对照</small></p></div></div>
            {!reports.length?<section className="empty-state"><div className="empty-icon"><FileText size={34}/></div><h2>从熟悉的批改结果开始</h2><p>导入原系统的 JSON 备份或已保存结果，<br/>核对报告、查看评分，并继续修改。</p><button className="primary-button" onClick={()=>input.current?.click()}><Import size={18}/>选择结果文件</button><span>本页数据仅保留在当前页面；离开前请导出修改结果。</span></section>:<div className="review-layout">
              <section className="report-list" aria-label="报告列表"><div className="list-heading"><h2>作文报告 <small>{filtered.length}</small></h2><input aria-label="搜索报告" placeholder="搜索姓名、班级或任务" value={query} onChange={e=>setQuery(e.target.value)}/></div>
                {filtered.map(r=><button key={r.id} className={'report-item '+(current?.id===r.id?'selected':'')} onClick={()=>setSelected(r.id)}><span className="avatar">{r.result.student_name.slice(-2)||'未识别'}</span><span className="report-person"><strong>{r.result.student_name||'未提供姓名'}</strong><small>{r.result.class_name||'未分班'} · {r.assignment.title||'历史作文'}</small><em>{r.modified?'已修改 · 本页保存':'待核对'}</em></span><span className="list-score">{r.result.total_score??'—'}<small>/{r.rubric?.total??'?'}</small></span></button>)}
                {!filtered.length&&<p className="list-empty">没有符合条件的报告。</p>}
              </section>
              <section className="report-detail" aria-label="报告详情">
                <div className="report-toolbar"><div className="report-position"><button aria-label="上一份" disabled={index<=0} onClick={()=>setSelected(filtered[index-1].id)}><ChevronLeft size={18}/></button><span>{index+1} / {filtered.length}</span><button aria-label="下一份" disabled={index<0||index>=filtered.length-1} onClick={()=>setSelected(filtered[index+1].id)}><ChevronRight size={18}/></button></div><div className="toolbar-actions"><button disabled={!current?.rubric} onClick={()=>setEditing(v=>!v)} aria-pressed={editing}><PencilLine size={16}/>{editing?'完成编辑':'修改报告'}</button><button onClick={()=>setSettings(v=>!v)} aria-expanded={settings}><SlidersHorizontal size={16}/>排版</button><button onClick={()=>print(false)}><Printer size={16}/>打印 / PDF</button></div></div>
                {settings&&<div className="print-settings">
                  {([['padding','页边距（mm）',5,30,1],['lineHeight','行距',1,2,0.1],['fontSizeScale','字号比例',0.8,1.4,0.05],['sectionGapPt','章节间距',1,20,1],['paragraphGapPt','段落间距',0,12,1]] as const).map(([key,label,min,max,step])=><label key={key}>{label}<input type="number" value={pdf[key]} min={min} max={max} step={step} onChange={e=>changePdf({[key]:Math.max(min,Math.min(max,Number(e.target.value)))})}/></label>)}
                  <label><input type="checkbox" checked={pdf.showPrompt} onChange={e=>changePdf({showPrompt:e.target.checked})}/>显示题目</label><label><input type="checkbox" checked={pdf.showOriginal} onChange={e=>changePdf({showOriginal:e.target.checked})}/>显示原稿</label>
                </div>}
                {current?.warnings.map(w=><p className="report-warning" key={w}>{w}</p>)}
                {current&&<LegacyPaper key={current.id} data={current.result} assignment={current.assignment} rubric={renderRubric} studentIndex={index+1} onUpdate={update} readOnly={!editing} pdfConfig={pdf}/>}
              </section>
            </div>}
            {reports.length>0&&<div className="export-bar"><span>修改仅在当前页面保留，导出后可重新导入。</span><button onClick={()=>download(reportCsv(filtered),'作文成绩.csv','text/csv;charset=utf-8')}><Download size={16}/>成绩 CSV</button><button onClick={()=>download(JSON.stringify(exportReportBundle(reports),null,2),'作文批改结果.json','application/json')}><Download size={16}/>保存全部结果</button><button onClick={()=>print(true)}><Printer size={16}/>批量打印</button></div>}
          </>}
          {tab==='rubric'&&<section className="rubric-panel"><h2>{current?.assignment.title||'任务评分标准'}</h2>{current?.rubric?<><p>满分 {current.rubric.total} 分 · {current.rubric.gradeLevel} · {current.rubric.wordCount}</p><div className="rubric-grid">{current.rubric.items.map(c=><article key={c.id}><span>{c.score} 分</span><h3>{c.label}</h3><p>{c.desc}</p></article>)}</div><p className="muted">这是历史任务的标准。导入不会重新评分。</p></>:<p>请选择带有评分标准的完整备份或已保存结果。</p>}</section>}
          {tab==='history'&&<section className="history-panel">{imports.length?imports.map(x=><article key={x.bundle.fingerprint}><Import size={23}/><div><h2>{x.name}</h2><p>{x.bundle.reports.length} 份结果 · 已排除 {x.bundle.removedCredentialFields} 个认证字段</p>{x.bundle.warnings.map(w=><small key={w}>{w}</small>)}</div><button onClick={()=>download(JSON.stringify(x.bundle.sanitizedPayload,null,2),'已清理认证字段_'+x.name,'application/json')}><Download size={16}/>导出原有资料</button></article>):<p>还没有导入记录。</p>}</section>}
        </main>
      </div>
    </div>
    <div className="print-only">{printReports.map((r,i)=><section className="print-report" key={r.id}><LegacyPaper data={r.result} assignment={r.assignment} rubric={r.rubric??{total:'未提供',wordCount:'未提供',items:[]}} studentIndex={i+1} onUpdate={()=>{}} readOnly={true} pdfConfig={pdf}/></section>)}</div>
  </>;
}
