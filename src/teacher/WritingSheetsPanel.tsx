import {useWorkspaceLeaveGuard} from './workspace-navigation';
import React,{useEffect,useRef,useState} from 'react';
import {useTeacherCloud} from './TeacherCloud';
import type {TaskEnvelope,TaskMember,WritingTask} from './task-contracts';
import {buildWritingSheetHtml,newSheetToken,type SheetIssueInput,type PrintPacket} from './writing-sheet-print';
import {writingSchoolDefaults} from '../../integrations/daily/src/writing-school-config.mjs';
import './writing-sheets.css';
export default function WritingSheetsPanel({task,onClose,embedded=false}:{task:WritingTask;onClose:()=>void;embedded?:boolean}){
  const cloud=useTeacherCloud(),workspace=cloud.identity?.workspaceId||'',storageKey='wa_sheet_pending:'+workspace+':'+task.id;
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[members,setMembers]=useState<TaskMember[]>([]),[sets,setSets]=useState<any[]>([]),[envelope,setEnvelope]=useState<TaskEnvelope|null>(null);
  const [classId,setClassId]=useState(task.targets[0]?.id||''),[selected,setSelected]=useState<string[]>([]),[search,setSearch]=useState(''),[pageCount,setPageCount]=useState(1),[draftNumber,setDraftNumber]=useState(1),[schoolLabel,setSchoolLabel]=useState(writingSchoolDefaults.schoolName);
  const [replace,setReplace]=useState(false),[pending,setPending]=useState<SheetIssueInput|null>(null),[html,setHtml]=useState(''),[packet,setPacket]=useState<PrintPacket|null>(null);
  useWorkspaceLeaveGuard(()=>!busy);
  const alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  async function api(path:string,body?:any){const r=await fetch(path,{method:body?'POST':'GET',cache:'no-store',headers:{'Content-Type':'application/json','X-Workspace-Id':workspace},...(body?{body:JSON.stringify(body)}:{})});const value=await r.json();if(!r.ok){if(r.status===401)cloud.expired();throw Error(value.error?.message||'写作单暂时无法处理。');}return value;}
  async function run(action:()=>Promise<void>){setBusy(true);setError('');try{await action();}catch(e){if(alive.current)setError(e instanceof Error?e.message:'写作单暂时无法处理。');}finally{if(alive.current)setBusy(false);}}
  async function loadSets(){const all:any[]=[];let after='';do{const p=await api('/api/tasks/'+task.id+'/sheets'+(after?'?after='+after:''));all.push(...p.sets);after=p.next||'';}while(after);if(alive.current)setSets(all);return all;}
  useEffect(()=>{void run(async()=>{
    const document=await api('/api/tasks/'+task.id) as TaskEnvelope,all:TaskMember[]=[];let after='';do{const p=await api('/api/tasks/'+task.id+'/members'+(after?'?after='+after:''));all.push(...p.members);after=p.next||'';}while(after);
    if(alive.current){setEnvelope(document);setMembers(all);setSelected(all.filter(m=>m.classId===classId).slice(0,100).map(m=>m.id!));}
    await loadSets();try{const stored=sessionStorage.getItem(storageKey);if(stored&&alive.current)setPending(JSON.parse(stored));}catch{}
  });},[]);
  const available=members.filter(m=>m.classId===classId),visible=available.filter(m=>!search||[m.name,m.subject].some(v=>v.includes(search))),existing=sets.filter(s=>s.status==='active'&&s.draft_number===draftNumber&&selected.includes(s.member_id));
  function change(){setReplace(false);setHtml('');setPacket(null);}
  async function send(input:SheetIssueInput){
    const value=await api('/api/tasks/'+task.id+'/sheets',input) as PrintPacket,latest=await loadSets();
    if(value.sets.some(s=>!latest.some(row=>row.id===s.id&&row.status==='active')))throw Error('这批写作单已被重新签发，旧码已作废。请重新选择并生成。');
    const document=envelope||await api('/api/tasks/'+task.id);const generated=await buildWritingSheetHtml(value,input,document.document);
    if(alive.current){setPacket(value);setHtml(generated);}
  }
  async function generate(){if(!envelope)throw Error('任务尚未读取完成。');
    const input:SheetIssueInput={requestId:crypto.randomUUID(),expectedRevision:envelope.task.revision,draftNumber,pageCount,schoolLabel,members:members.filter(m=>m.id&&selected.includes(m.id)).map(m=>({memberId:m.id!,expectedSetId:sets.find(s=>s.status==='active'&&s.draft_number===draftNumber&&s.member_id===m.id)?.id||'',tokens:Array.from({length:pageCount},newSheetToken)}))};
    // Persist before the POST, so an uncertain response can be retried with the
    // same operation and the original random tokens; the server stores hashes.
    try{sessionStorage.setItem(storageKey,JSON.stringify(input));}catch{throw Error('浏览器无法保存打印准备记录，请允许本站临时存储后重试。');}setPending(input);await send(input);
  }
  function reset(){try{sessionStorage.removeItem(storageKey);}catch{}setPending(null);change();}
  function preview(){const popup=window.open('','_blank');if(!popup){setError('打印预览未能打开，请允许本站打开打印窗口。');return;}popup.document.open();popup.document.write(html);popup.document.close();popup.document.getElementById('print-sheets')?.addEventListener('click',()=>popup.print());}
  return <div className={"writing-sheets-overlay no-print"+(embedded?" wa-embedded":"")}><section className="writing-sheets-dialog" role={embedded?"region":"dialog"} aria-modal={embedded?undefined:true} aria-labelledby="writing-sheets-title"><header><div><h2 id="writing-sheets-title">个性化写作单</h2><p>{task.title} · 评分标准第 {task.version} 版</p></div><button disabled={busy} aria-label="关闭写作单" onClick={onClose}>×</button></header><div className="writing-sheets-content">
    {error&&<p className="sheet-error" role="alert">{error}</p>}{busy&&<p role="status">正在准备写作单，请稍候…</p>}
    {packet&&html?<section className="sheet-ready"><h3>写作单已准备好</h3><p>{packet.sets.length} 名学生，每人 {packet.pageCount} 页，第 {packet.draftNumber} 稿。每页 18 行宽行距书写区，下方另留自由书写空间。另含一份完整任务说明和评价标准。</p><button className="sheet-primary" onClick={preview}>打开打印预览</button><button disabled={busy} onClick={reset}>重新选择并生成</button><p>在预览中选择 A4、单面打印、100% 大小并关闭浏览器页眉页脚，可打印或存为 PDF。保留 PDF 可直接补印相同写作单；重新签发将作废旧二维码。</p></section>:pending?<section className="sheet-ready"><h3>有一份打印准备记录</h3><p>可恢复相同二维码，避免网络重试重复签发。恢复时会核对当前教师权限和写作单状态。</p><button className="sheet-primary" disabled={busy||!envelope} onClick={()=>void run(()=>send(pending))}>恢复上次写作单</button><button disabled={busy} onClick={reset}>放弃上次打印准备</button></section>:<>
      <div className="sheet-fields"><label>打印学校页眉<input disabled={busy} aria-label="打印学校页眉" value={schoolLabel} maxLength={120} onChange={e=>{setSchoolLabel(e.target.value);change();}}/></label><label>任务班级<select disabled={busy} aria-label="写作单班级" value={classId} onChange={e=>{setClassId(e.target.value);setSelected(members.filter(m=>m.classId===e.target.value).slice(0,100).map(m=>m.id!));change();}}>{task.targets.map(c=><option key={c.id} value={c.id}>{c.name} · {c.academicYear}</option>)}</select></label><label>作文稿次<select disabled={busy} aria-label="写作单稿次" value={draftNumber} onChange={e=>{setDraftNumber(Number(e.target.value));change();}}>{Array.from({length:20},(_,i)=><option key={i+1} value={i+1}>第 {i+1} 稿</option>)}</select></label><label>每人页数<select disabled={busy} aria-label="每人写作单页数" value={pageCount} onChange={e=>{setPageCount(Number(e.target.value));change();}}>{[1,2,3,4].map(n=><option key={n} value={n}>{n} 页</option>)}</select></label></div>
      <p>每页 18 行，采用宽行距并保留自由书写空间；印有姓名、班级、稿次、页码和专属二维码。同名学生分别生成；学校页眉仅供打印，不改变学生所属学校。</p><div className="sheet-select-tools"><button disabled={busy} onClick={()=>{setSelected(available.slice(0,100).map(m=>m.id!));change();}}>选择本班前 100 人</button><button disabled={busy} onClick={()=>{setSelected([]);change();}}>清除选择</button><span>已选 {selected.length}/{available.length} 人</span></div><input aria-label="搜索写作单学生" type="search" placeholder="搜索姓名或身份短编号" value={search} onChange={e=>setSearch(e.target.value)}/><div className="sheet-members">{visible.map(m=><label key={m.id}><input disabled={busy} type="checkbox" checked={selected.includes(m.id!)} onChange={e=>{setSelected(old=>e.target.checked?[...old,m.id!]:old.filter(id=>id!==m.id));change();}}/><span><strong>{m.name}</strong><small>{m.className} · #{m.subject.slice(-8)}</small></span></label>)}</div>
      {existing.length>0&&<label className="sheet-confirm"><input disabled={busy} type="checkbox" checked={replace} onChange={e=>setReplace(e.target.checked)}/>所选 {existing.length} 人已有本稿写作单。我确认重新签发并作废旧码；历史写作单记录保留。</label>}
      <button className="sheet-primary" disabled={busy||!envelope||!selected.length||selected.length>100||existing.length>0&&!replace} onClick={()=>void run(generate)}>生成写作单（{selected.length} 人）</button>{selected.length>100&&<p role="alert">单次最多 100 人，请减少选择后分批生成。</p>}
    </>}
  </div></section></div>;
}
