import React,{useEffect,useState} from 'react';
import {useTeacherCloud} from './TeacherCloud';
import {gradingApi,gradingMutation} from './bound-grading';
import './publication-controls.css';
export default function PublicationControls({report,dirty,onChanged}:{report:any;dirty:boolean;onChanged?:()=>void}){
 const cloud=useTeacherCloud(),workspace=cloud.identity!.workspaceId;
 const [value,setValue]=useState<any>(null),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const path='/api/writing-reports/'+report.report.id+'/publication';
 useEffect(()=>{const controller=new AbortController();setConfirmed(false);setValue(null);setNotice('');setError('');void gradingApi(path,workspace,undefined,'GET',controller.signal).then(setValue).catch(e=>{if(!controller.signal.aborted){setError(e.message);if(e.status===401)cloud.expired();}});return()=>controller.abort();},[report.report.id,report.report.revision]);
 useEffect(()=>{if(dirty)setConfirmed(false);},[dirty]);
 useEffect(()=>{if(!['pending','sending'].includes(value?.publication?.sync?.state)||value?.publication?.sync?.last_error)return;const controller=new AbortController();let checks=0;const timer=setInterval(()=>{if(document.hidden)return;if(checks++>=6){clearInterval(timer);return;}void gradingApi(path,workspace,undefined,'GET',controller.signal).then(setValue).catch(()=>{});},4000);return()=>{clearInterval(timer);controller.abort();};},[report.report.id,value?.publication?.version,value?.publication?.sync?.state,value?.publication?.sync?.last_error]);
 async function sync(){if(busy||!value?.publication)return;setBusy(true);setError('');try{setValue(await gradingApi(path+'/sync',workspace,{expectedPublicationVersion:value.publication.version}));setNotice('已核对 Daily 同步状态；缺少的记录会自动补发。');}catch(e){setError(e instanceof Error?e.message:'同步核对暂未完成。');if((e as any).status===401)cloud.expired();try{setValue(await gradingApi(path,workspace));}catch{}}finally{setBusy(false);}}
 async function refresh(){if(busy)return;setBusy(true);setError('');try{setValue(await gradingApi(path,workspace));}catch(e){setError(e instanceof Error?e.message:'暂时无法读取发布状态。');if((e as any).status===401)cloud.expired();}finally{setBusy(false);}}
 async function act(withdraw=false){if(busy||!value)return;setBusy(true);setError('');setNotice('');try{
  const next=await gradingMutation(path+(withdraw?'/withdraw':''),workspace,{expectedPublicationVersion:value.publication?.version||0,...(withdraw?{reason:'教师撤回当前反馈，待重新核对后再次发布'}:{expectedReportRevision:report.report.revision,inputHash:report.document.provenance.inputHash,teacherConfirmed:confirmed})});setValue(next);setConfirmed(false);setNotice(withdraw?'已撤回，学生暂不可查看；原报告仍保留。':'已发布。学生用自己的 Daily 学校账号即可查看。');onChanged?.();
 }catch(e){setError(e instanceof Error?e.message:'发布操作暂未完成。');if((e as any).status===401)cloud.expired();try{setValue(await gradingApi(path,workspace));}catch{}}
 finally{setBusy(false);}}
 const p=value?.publication,published=p?.state==='published'&&!p.outdated&&!p.quarantined,same=published&&p.isThisReport&&p.reportRevision===report.report.revision;
 return <section className="publication-controls no-print" aria-label="学生反馈发布"><div className="publication-heading"><h3>学生查看</h3><span>{!value?'正在读取发布状态…':published?'已发布第 '+p.reportRevision+' 版':p?.quarantined?'访问待核对':p?'已撤回':'尚未发布'}</span><button disabled={busy} onClick={()=>void refresh()}>刷新状态</button></div>
  {published&&<p>{p.isThisReport?'学生当前看到本报告第 '+p.reportRevision+' 版。':'本稿已发布另一份批阅结果。'}{p.viewed?' 学生已查看。':' 学生尚未查看。'}{!same&&' 当前修改尚未发布。'}</p>}
  {!published&&<p>核对原稿、学生归属、评分和反馈后，发布指定版本。保存修改不会自动改变学生看到的内容。</p>}
  {value&&!value.canPublish?<p>当前账号可核对本报告，尚无本班发布权限。</p>:<><label><input type="checkbox" checked={confirmed} disabled={dirty||busy||same||report.report.outdated||!!p?.quarantined} onChange={e=>setConfirmed(e.target.checked)}/>我已核对原稿、学生归属、评分和反馈，确认发布此版本</label><div className="publication-actions"><button className="publication-primary" disabled={!value||!confirmed||dirty||busy||same||report.report.outdated||!!p?.quarantined} onClick={()=>void act()}>{busy?'正在处理…':same?'当前版本已发布':'发布第 '+report.report.revision+' 版给学生'}</button>{published&&<button disabled={busy} onClick={()=>void act(true)}>撤回学生访问</button>}</div></>}
  {dirty&&<p>请先保存报告修改，再确认发布。</p>}{p?.sync&&<small>Daily：{p.sync.state==='sent'?'已同步':p.sync.state==='blocked'?'需要管理员检查同步配置':p.sync.state==='superseded'?'已有更新版本':'待同步'}</small>}{p?.sync&&<button disabled={busy} onClick={()=>void sync()}>核对 Daily 同步</button>}{p?.sync?.last_error&&<p>{p.sync.last_error}</p>}{p?.quarantined&&<p className="publication-error">两端发布记录需要对账，学生访问已暂停。{p.quarantined.reason}</p>}
  {error&&<p role="alert" className="publication-error">{error}</p>}{notice&&<p role="status" className="publication-notice">{notice}</p>}
 </section>;
}
