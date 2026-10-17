import {useWorkspaceLeaveGuard} from './workspace-navigation';
import React,{useEffect,useRef,useState} from 'react';
import type {CloudSnapshots,CloudSnapshotRef,SnapshotEnvelope} from './useCloudSnapshots';
import './cloud-snapshots.css';
export function CloudSnapshotsPanel({sync,onRestore,onDownload,embedded=false}:{embedded?:boolean;sync:CloudSnapshots;onRestore:(value:SnapshotEnvelope)=>void|boolean;onDownload:(snapshot:any)=>void}){
  const [open,setOpen]=useState(embedded),[trash,setTrash]=useState(false),[query,setQuery]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [selected,setSelected]=useState<CloudSnapshotRef|null>(null),[versions,setVersions]=useState<any[]>([]),[versionNext,setVersionNext]=useState<number|null>(null);
  useEffect(()=>{if(embedded)void sync.list();},[]);
  const locked=useRef(false);useWorkspaceLeaveGuard(()=>!locked.current);
  async function operation(action:()=>Promise<void>){if(locked.current)return;locked.current=true;setBusy(true);setError('');try{await action();}catch(error){setError(error instanceof Error?error.message:'操作暂未完成。');}finally{locked.current=false;setBusy(false);}}
  async function restore(item:CloudSnapshotRef,revision?:number){await operation(async()=>{const value=await sync.read(item.id,revision);if(onRestore(value)!==false&&!embedded)setOpen(false);});}
  async function history(item:CloudSnapshotRef,before?:number){await operation(async()=>{const result=await sync.versions(item.id,before);setSelected(item);setVersions(old=>before?[...old,...result.versions]:result.versions);setVersionNext(result.next);});}
  return <>
    {embedded&&sync.message&&<div className="wa-notice" role="status"><span>{sync.message}</span>{['error','conflict'].includes(sync.status)&&<button className="wa-text-button" disabled={busy} onClick={()=>void operation(sync.status==='conflict'?sync.copyConflict:sync.retry)}>{sync.status==='conflict'?'另存云端副本':'重试同步'}</button>}</div>}
    {!embedded&&<aside className="cloud-snapshot-bar no-print" aria-label="报告云端保存" data-status={sync.status}>
      <span role="status">{sync.message||''}</span>
      <div>{['error','conflict'].includes(sync.status)&&<button disabled={busy||sync.status==='pending'} onClick={()=>void operation(sync.status==='conflict'?sync.copyConflict:sync.retry)}>{sync.status==='conflict'?'另存云端副本':'重试同步'}</button>}<button onClick={()=>{setTrash(false);setSelected(null);setQuery('');setError('');setOpen(true);void sync.list();}}>云端存档</button></div>
    </aside>}
    {open&&<div className={"cloud-snapshot-overlay no-print"+(embedded?" ar-cloud-embedded":"")}><section role={embedded?"region":"dialog"} aria-modal={embedded?undefined:true} aria-labelledby="cloud-history-title" className="cloud-snapshot-dialog">
      <header><div><h2 id="cloud-history-title">{trash?'云端回收站':'云端批次档案'}</h2><p>按保存批次继续查看、编辑与导出，沿用当时的题目和评分标准。</p></div>{!embedded&&<button onClick={()=>setOpen(false)} aria-label="关闭云端存档">×</button>}</header>
      <div className="cloud-history-toolbar"><form onSubmit={event=>{event.preventDefault();setSelected(null);void sync.list({deleted:trash,query});}}><input aria-label="搜索云端存档" value={query} onChange={e=>setQuery(e.target.value)} placeholder="按名称或班级搜索"/><button type="submit">搜索</button></form><button onClick={()=>{setTrash(!trash);setSelected(null);void sync.list({deleted:!trash,query});}}>{trash?'返回存档':'回收站'}</button></div>
      {error&&<p role="alert" className="cloud-history-error">{error}</p>}
      {sync.listError&&<p role="alert" className="cloud-history-error">{sync.listError}</p>}
      <div className="cloud-history-list">{selected?<><button onClick={()=>setSelected(null)}>返回存档列表</button><h3>{selected.name} · 历史版本</h3>{versions.map(version=><article key={version.revision}><div><strong>第 {version.revision} 版</strong><small>{new Date(version.created).toLocaleString()}</small></div><button disabled={busy} onClick={()=>void restore(selected,version.revision)}>恢复此版本</button></article>)}{versionNext&&<button onClick={()=>void history(selected,versionNext)}>更早版本</button>}</>:<>
        {sync.items.map(item=><article key={item.id}><div><strong>{item.name}</strong><small>{item.className||'未分班级'} · {item.gradedCount} 份 · 第 {item.revision} 版 · {new Date(item.updated).toLocaleString()}</small></div><nav>{trash?<button disabled={busy} onClick={()=>void operation(async()=>{await sync.changeVisibility(item,false);await sync.list({deleted:true,query});})}>移回存档</button>:<><button disabled={busy} onClick={()=>void restore(item)}>恢复</button><button disabled={busy} onClick={()=>void operation(async()=>onDownload((await sync.read(item.id)).snapshot))}>下载 JSON</button><button disabled={busy} onClick={()=>void history(item)}>版本</button><button disabled={busy} onClick={()=>void operation(async()=>{await sync.changeVisibility(item,true);await sync.list({query});})}>移入回收站</button></>}</nav></article>)}
        {!sync.items.length&&!sync.loading&&!sync.listError&&<p className="cloud-history-empty">{trash?'回收站为空':'暂无云端存档。完成批改后点击“保存批改结果”即可同步。'}</p>}
        {sync.next&&<button disabled={sync.loading} onClick={()=>void sync.list({deleted:trash,cursor:sync.next!,query})}>加载更多</button>}
      </>}{sync.loading&&<p role="status">正在读取云端列表…</p>}</div>
    </section></div>}
  </>;
}
