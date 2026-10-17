import React,{createContext,useContext,useEffect,useMemo,useState} from 'react';
import {workspaceStorage,type WorkspaceStorage} from './workspace-storage';
import {needsLocalMigration,migrateLocalWorkspace} from './workspace-backup';
import {chooseGradingModel,chooseOcrModel,supportsPurpose,type TeacherModelProfile} from './model-selection';
import PersonalModels from './PersonalModels';
import LocalModels from './LocalModels';
import {checkImageModel} from './model-check';
import './teacher-cloud.css';

type Profile=TeacherModelProfile;
type Identity={name:string;role:string;workspaceId:string};
type Cloud={mode:'local'|'cloud';status:string;message:string;identity:Identity|null;profiles:Profile[];profileId:string;ocrProfileId:string;ocrChoice:string;setOcrProfileId:(id:string)=>void;setProfileId:(id:string)=>void;storage:WorkspaceStorage;refresh:()=>Promise<Profile[]|void>;expired:()=>void;logout:()=>Promise<void>};
const StudentReports=React.lazy(()=>import('../student/StudentReports'));
const context=createContext<Cloud|null>(null);
export const useTeacherCloud=()=>useContext(context)!;

export function TeacherCloudProvider({children}:{children:React.ReactNode}){
  const [mode,setMode]=useState<'local'|'cloud'>(import.meta.env.DEV?'local':'cloud');
  const [status,setStatus]=useState(import.meta.env.DEV?'local':'loading');
  const [identity,setIdentity]=useState<Identity|null>(null),[profiles,setProfiles]=useState<Profile[]>([]),[profileId,selectProfile]=useState(''),[ocrChoice,selectOcr]=useState('');
  const [message,setMessage]=useState(''),[migration,setMigration]=useState(false),[generation,setGeneration]=useState(0);
  const storage=useMemo(()=>identity?workspaceStorage(identity.workspaceId):localStorage,[identity?.workspaceId]);
  async function refresh(){
    try{
      const health=await fetch('/api/health',{cache:'no-store'});
      const body=await health.json();
      if(body.service!=='writeascend'||body.cloud!==true)throw Error('未连接作文后台。');
      setMode('cloud');
      if(!body.loginConfigured){setStatus('unconfigured');setMessage('统一登录正在接入，请稍后再来。');return;}
      const response=await fetch('/api/me',{cache:'no-store'});
      if(response.status===401){setIdentity(null);setProfiles([]);setMigration(false);setStatus('anonymous');return;}
      const me=await response.json();
      if(!response.ok)throw Error(me.error?.message||'暂时无法确认登录账号。');
      if(!['teacher','admin','student'].includes(me.role)){setIdentity(null);setProfiles([]);setMigration(false);setStatus('forbidden');return;}
      if(typeof me.workspaceId!=='string'||!/^[a-f0-9]{64}$/.test(me.workspaceId))throw Error('登录工作区信息不完整。');
      if(me.role==='student'){setIdentity(me);setProfiles([]);setMigration(false);setStatus('ready');setMessage('');return;}
      const namespace=workspaceStorage(me.workspaceId);
      try{
        setMigration(needsLocalMigration(localStorage,namespace));
      }catch{}
      setIdentity(me);
      const modelResponse=await fetch('/api/model/profiles',{cache:'no-store'});
      const models=await modelResponse.json();
      if(!modelResponse.ok)throw Error(models.error?.message||'暂时无法读取云端模型。');
      const available=Array.isArray(models.profiles)?models.profiles as Profile[]:[];
      let wanted='';try{wanted=namespace.getItem('cloud_profile')||'';}catch{}
      selectProfile(chooseGradingModel(available,wanted));
      let ocr='';try{ocr=namespace.getItem('cloud_ocr_profile')||'';}catch{}selectOcr(available.some(p=>p.id===ocr&&supportsPurpose(p,'ocr'))?ocr:ocr.startsWith('personal_')?ocr:'');
      setProfiles(available);setStatus('ready');setMessage('');return available;
    }catch(error){
      if(import.meta.env.DEV&&mode==='local'){setStatus('local');return;}
      setStatus('error');setMessage(error instanceof Error?error.message:'暂时无法连接作文后台。');
    }
  }
  useEffect(()=>{void refresh();},[]);
  const setProfileId=(id:string)=>{selectProfile(id);try{storage.setItem('cloud_profile',id);}catch{}};
  const setOcrProfileId=(id:string)=>{selectOcr(id);try{storage.setItem('cloud_ocr_profile',id);}catch{}};
  useEffect(()=>{
    const onStorage=(event:StorageEvent)=>{if(event.key!=='wa_signed_out'||!event.newValue||!identity)return;try{if(JSON.parse(event.newValue).workspaceId===identity.workspaceId){setIdentity(null);setProfiles([]);setMigration(false);setStatus('anonymous');setMessage('当前账号已在另一页面退出。');}}catch{}};
    window.addEventListener('storage',onStorage);return()=>window.removeEventListener('storage',onStorage);
  },[identity?.workspaceId]);
  async function logout(){
    try{
      const scans=await import('./scan-outbox');
      if(identity){const pending=(await scans.readScanItems(identity.workspaceId)).filter(i=>i.stage!=='received');if(pending.length&&!window.confirm('本机还有 '+pending.length+' 张扫描照片尚未确认收取。退出会清除这些本机照片，需保留原图或重新拍摄。是否退出并清理？'))return;}
      if(identity?.role==='student'){const revisions=await import('../student/revision-cache');if(await revisions.revisionCacheCount(identity.workspaceId)&&!window.confirm('本机还有尚未保存到服务器的修订或照片。退出会清除这些本机内容，请先保存或保留原图。是否退出？'))return;}
      const response=await fetch('/api/auth/logout',{method:'POST'});
      if(!response.ok)throw Error();
      try{for(const key of Object.keys(sessionStorage))if(key.startsWith('wa_sheet_pending:'))sessionStorage.removeItem(key);}catch{}
      let cleanupMessage='';
      if(identity){try{localStorage.setItem('wa_signed_out',JSON.stringify({workspaceId:identity.workspaceId,nonce:crypto.randomUUID()}));}catch{}try{await scans.clearScanWorkspace(identity.workspaceId);}catch{cleanupMessage='已退出，但本机扫描缓存未能清理；共享设备请在浏览器中清除此网站的数据。';}}
      if(identity?.role==='student')try{const revisions=await import('../student/revision-cache');await revisions.clearRevisionWorkspace(identity.workspaceId);}catch{cleanupMessage='已退出，但本机修订缓存未能清理；共享设备请清除此网站的数据。';}
      setIdentity(null);setProfiles([]);setMigration(false);setStatus('anonymous');setMessage(cleanupMessage);
    }catch{setMessage('退出暂未完成，请检查网络后重试。');}
  }
  function decideMigration(importData:boolean){
    try{
      migrateLocalWorkspace(localStorage,storage,importData);
      setMigration(false);setGeneration(g=>g+1);setMessage('');
    }catch{setMessage('本机数据未能完整读取，原数据仍保留。请先下载旧版备份后再导入。');}
  }
  const value:Cloud={mode,status,message,identity,profiles,profileId,ocrProfileId:chooseOcrModel(profiles,profileId,ocrChoice),ocrChoice,setOcrProfileId,setProfileId,storage,refresh,expired:()=>setStatus('expired'),logout};
  const mounted=mode==='local'||(identity&&['ready','expired','error'].includes(status)&&!migration);
  return <context.Provider value={value}>{mounted?<React.Fragment key={(identity?.workspaceId||'local')+':'+generation}>{identity?.role==='student'?<React.Suspense fallback={<main className="student-loading" role="status">正在打开我的作文…</main>}><StudentReports/></React.Suspense>:children}</React.Fragment>:<main className="teacher-cloud-gate">
    <section><img src="/favicon.svg" alt=""/><p className="cloud-eyebrow">教师作文工作区</p><h1>英语作文，一键批阅。</h1><p>设置或复用题目与评分标准，批量上传作文，借助大模型批阅，再核对、编辑和导出。</p>
      {migration?<><h2>保留这台设备上的原有数据</h2><p>发现旧版批改设置或历史记录。可将它们带入当前教师工作区，原数据会继续保留。模型密钥不会带入云端模式。</p><button onClick={()=>decideMigration(true)}>带入本机原有数据</button><button className="secondary" onClick={()=>decideMigration(false)}>新建空工作区</button></>:<>
        <p role="status">{status==='loading'?'正在连接教师工作区…':status==='forbidden'?'当前账号暂不支持作文反馈，请使用学校账号。':status==='unconfigured'||status==='error'?message:message||'使用 Daily 学校账号登录，教师可批阅作文，学生可查看已发布反馈。'}</p>
        {['anonymous','forbidden'].includes(status)&&<a className="cloud-primary" href={"/api/auth/start?next="+encodeURIComponent(location.pathname.startsWith('/student')?location.pathname+location.search:'/')}>使用 Daily 登录</a>}
        {status==='forbidden'&&<button className="secondary" onClick={()=>void logout()}>退出当前账号</button>}
        {['error','unconfigured'].includes(status)&&<button onClick={()=>void refresh()}>重新连接</button>}
      </>}
      {migration&&message&&<p role="alert">{message}</p>}
    </section>
  </main>}</context.Provider>;
}

export function CloudConnection({busy=false}:{busy?:boolean}){
  const cloud=useTeacherCloud();
  if(cloud.mode==='local')return null;
  return <aside className="cloud-connection no-print" aria-label="云端批改连接" data-status={cloud.status}>
    <div><strong title={cloud.identity?.name}>{cloud.identity?.name}</strong><span>{cloud.message|| (cloud.status==='expired'?'登录已过期，已保存的任务可在重新登录后继续。':cloud.status==='error'?'暂时无法核对登录，请刷新连接。':cloud.profiles.length?'云端已连接':'请选择系统模型，或在设置中添加个人模型。')}</span></div>
    <div>{cloud.status==='expired'?<a href="/api/auth/start">重新登录</a>:<><button disabled={busy} onClick={()=>void cloud.refresh()}>刷新连接</button><button disabled={busy} onClick={()=>void cloud.logout()}>退出</button></>}</div>
  </aside>;
}

export function CloudModelSettings({temperature,onTemperatureChange}:{temperature:number;onTemperatureChange:(value:number)=>void}){
  const cloud=useTeacherCloud(),[checking,setChecking]=useState(false),[check,setCheck]=useState(''),controller=React.useRef<AbortController|null>(null);
  useEffect(()=>{setCheck('');controller.current?.abort();setChecking(false);return()=>controller.current?.abort();},[cloud.profileId,cloud.ocrProfileId,cloud.profiles.find(p=>p.id===cloud.profileId)?.configurationVersion,cloud.profiles.find(p=>p.id===cloud.ocrProfileId)?.configurationVersion]);
  const grading=cloud.profiles.filter(p=>supportsPurpose(p,'grading')),ocr=cloud.profiles.filter(p=>supportsPurpose(p,'ocr'));
  const selected=cloud.profiles.find(p=>p.id===cloud.profileId),same=cloud.profileId===cloud.ocrProfileId;
  async function testModels(){
    const request=new AbortController();controller.current=request;setChecking(true);setCheck('正在使用系统测试图片检查连接和图片读取…');let timedOut=false;const timer=setTimeout(()=>{timedOut=true;request.abort();},300000);
    try{for(const id of [...new Set([cloud.profileId,cloud.ocrProfileId])].filter(Boolean))await checkImageModel(id,cloud.identity!.workspaceId,request.signal,cloud.expired,cloud.profiles.find(p=>p.id===id)?.configurationVersion);if(!request.signal.aborted)setCheck('连接、测试图片读取与 JSON 返回均通过。正式批改前仍需用少量实际手写作文核对识别与评分质量。');}
    catch(e){if(timedOut)setCheck('检查超时，服务器任务可能仍在处理；重试会先核对原请求。');else if(!request.signal.aborted)setCheck(e instanceof Error&&e.name!=='TypeError'?e.message:'连接检查中断，请恢复网络后重试。');}
    finally{clearTimeout(timer);if(controller.current===request){controller.current=null;setChecking(false);}}
  }
  return <div className="cloud-model-settings"><h3>AI 批阅与图片识别</h3><p>先连接服务商，再选择批阅模型。学校已提供模型时，可直接选择使用。</p>
    <div className="cloud-model-role-grid"><section><span className="cloud-model-role">作文批阅</span><label>批阅模型<select aria-label="选择批改模型" value={cloud.profileId} onChange={event=>cloud.setProfileId(event.target.value)} disabled={!grading.length||checking}>{!cloud.profileId&&<option value="">{grading.length?'请选择批阅模型':'请先添加视觉批阅模型'}</option>}{grading.map(p=><option key={p.id} value={p.id}>{p.label} · {p.model}</option>)}</select></label><p>直接读取作文照片，按本篇评分标准生成完整批改报告。</p></section>
    <section><span className="cloud-model-role">图片文字识别</span><label>OCR 模型<select aria-label="选择图片识别模型" value={cloud.ocrChoice} onChange={e=>cloud.setOcrProfileId(e.target.value)} disabled={!ocr.length||checking}><option value="">自动选择 · 专用 OCR 优先</option>{cloud.ocrChoice&&!ocr.some(p=>p.id===cloud.ocrChoice)&&<option value={cloud.ocrChoice} disabled>原个人模型不可用，请重新选择</option>}{ocr.map(p=><option key={p.id} value={p.id}>{p.label} · {p.model}</option>)}</select></label><p>{cloud.ocrProfileId?(same?'当前沿用批阅模型，识别题目、姓名和班级。':'当前使用：'+cloud.profiles.find(p=>p.id===cloud.ocrProfileId)?.label+'。用于题目、姓名与班级识别。'):'优先选择专用 OCR；尚未配置时沿用支持图片的批阅模型。'}</p></section></div>
    <div className="cloud-model-validation"><button className="cloud-model-check" disabled={checking||!cloud.profileId||!cloud.ocrProfileId||cloud.status!=='ready'} onClick={()=>void testModels()}>{checking?'正在检查…':'检查连接和图片识别'}</button><p>每个不同模型调用一次系统测试图片。云端按服务商计费，本地使用电脑算力。通过后请用少量手写作文核对效果。</p></div>{check&&<p className="cloud-model-check-result" role="status">{check}</p>}
    <PersonalModels workspace={cloud.identity!.workspaceId} disabled={checking||cloud.status!=='ready'} onExpired={cloud.expired} onSaved={async id=>{const profiles=await cloud.refresh();if(id){const profile=profiles?.find((p:Profile)=>p.id===id);if(profile&&supportsPurpose(profile,'grading'))cloud.setProfileId(id);else if(profile&&supportsPurpose(profile,'ocr'))cloud.setOcrProfileId(id);}}}/>
    <LocalModels workspace={cloud.identity!.workspaceId} disabled={checking||cloud.status!=='ready'} onExpired={cloud.expired} onSaved={async id=>{await cloud.refresh();if(id){cloud.setProfileId(id);cloud.setOcrProfileId(id);}}}/>
    <details><summary>识别与使用帮助</summary><p>作文批阅需要能够读取图片并生成文字的视觉模型。专用 OCR 用于提取文字，不参与评分；二维码定位在本机完成。账户模型目录经过用途筛选，查询失败时保留内置推荐。</p><p>个人密钥仅本人可用，由服务器加密托管。需要全校共用的模型，可由管理员配置。API Key 的申请、账户计费和权限开通均在对应服务商完成。</p>{selected?.helpUrl&&<p><a href={selected.helpUrl} target="_blank" rel="noreferrer">当前模型官方帮助 ↗</a></p>}</details>
    <details><summary>更多生成选项</summary><label>生成温度 · {Number.isFinite(temperature)?temperature:0.3}<input type="range" min="0" max="1" step="0.05" value={Number.isFinite(temperature)?temperature:0.3} disabled={selected?.sendTemperature===false} onChange={e=>onTemperatureChange(Number(e.target.value))}/></label>{selected?.sendTemperature===false&&<p>当前配置使用服务商支持的默认生成参数。</p>}</details>{cloud.status==='expired'&&<a href="/api/auth/start">重新使用 Daily 登录</a>}</div>;
}
