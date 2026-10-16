import React,{createContext,useContext,useEffect,useMemo,useState} from 'react';
import {sanitizeLegacy} from '../report/legacy-import';
import {legacyKeys,workspaceStorage,type WorkspaceStorage} from './workspace-storage';
import {chooseGradingModel,chooseOcrModel,supportsPurpose,type TeacherModelProfile} from './model-selection';
import {checkImageModel} from './model-check';
import './teacher-cloud.css';

type Profile=TeacherModelProfile;
type Identity={name:string;role:string;workspaceId:string};
type Cloud={mode:'local'|'cloud';status:string;message:string;identity:Identity|null;profiles:Profile[];profileId:string;ocrProfileId:string;ocrChoice:string;setOcrProfileId:(id:string)=>void;setProfileId:(id:string)=>void;storage:WorkspaceStorage;refresh:()=>Promise<void>;expired:()=>void;logout:()=>Promise<void>};
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
        const existing=legacyKeys.some(key=>namespace.getItem(key)!==null);
        setMigration(!existing&&!namespace.getItem('migration_decision')&&legacyKeys.some(key=>localStorage.getItem(key)!==null));
      }catch{}
      setIdentity(me);
      const modelResponse=await fetch('/api/model/profiles',{cache:'no-store'});
      const models=await modelResponse.json();
      if(!modelResponse.ok)throw Error(models.error?.message||'暂时无法读取云端模型。');
      const available=Array.isArray(models.profiles)?models.profiles as Profile[]:[];
      let wanted='';try{wanted=namespace.getItem('cloud_profile')||'';}catch{}
      selectProfile(chooseGradingModel(available,wanted));
      let ocr='';try{ocr=namespace.getItem('cloud_ocr_profile')||'';}catch{}selectOcr(available.some(p=>p.id===ocr&&supportsPurpose(p,'ocr'))?ocr:'');
      setProfiles(available);setStatus('ready');setMessage('');
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
      const response=await fetch('/api/auth/logout',{method:'POST'});
      if(!response.ok)throw Error();
      try{for(const key of Object.keys(sessionStorage))if(key.startsWith('wa_sheet_pending:'))sessionStorage.removeItem(key);}catch{}
      let cleanupMessage='';
      if(identity){try{localStorage.setItem('wa_signed_out',JSON.stringify({workspaceId:identity.workspaceId,nonce:crypto.randomUUID()}));}catch{}try{await scans.clearScanWorkspace(identity.workspaceId);}catch{cleanupMessage='已退出，但本机扫描缓存未能清理；共享设备请在浏览器中清除此网站的数据。';}}
      setIdentity(null);setProfiles([]);setMigration(false);setStatus('anonymous');setMessage(cleanupMessage);
    }catch{setMessage('退出暂未完成，请检查网络后重试。');}
  }
  function decideMigration(importData:boolean){
    try{
      if(importData)for(const key of legacyKeys){
        const raw=localStorage.getItem(key);if(raw===null)continue;
        let safe=raw;
        if(key!=='writeascend_teacher_mode')safe=JSON.stringify(sanitizeLegacy(JSON.parse(raw)).value);
        storage.setItem(key,safe);
      }
      storage.setItem('migration_decision',importData?'imported':'fresh');setMigration(false);setGeneration(g=>g+1);setMessage('');
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
    <div><strong title={cloud.identity?.name}>{cloud.identity?.name}</strong><span>{cloud.message|| (cloud.status==='expired'?'登录已过期，已保存的任务可在重新登录后继续。':cloud.status==='error'?'暂时无法核对登录，请刷新连接。':cloud.profiles.length?'云端已连接':'云端模型尚未配置，请联系管理员。')}</span></div>
    <div>{cloud.status==='expired'?<a href="/api/auth/start">重新登录</a>:<><button disabled={busy} onClick={()=>void cloud.refresh()}>刷新连接</button><button disabled={busy} onClick={()=>void cloud.logout()}>退出</button></>}</div>
  </aside>;
}

export function CloudModelSettings({temperature,onTemperatureChange}:{temperature:number;onTemperatureChange:(value:number)=>void}){
  const cloud=useTeacherCloud(),[checking,setChecking]=useState(false),[check,setCheck]=useState(''),controller=React.useRef<AbortController|null>(null);
  useEffect(()=>{setCheck('');controller.current?.abort();setChecking(false);return()=>controller.current?.abort();},[cloud.profileId,cloud.ocrProfileId]);
  const grading=cloud.profiles.filter(p=>supportsPurpose(p,'grading')),ocr=cloud.profiles.filter(p=>supportsPurpose(p,'ocr'));
  const selected=cloud.profiles.find(p=>p.id===cloud.profileId),same=cloud.profileId===cloud.ocrProfileId;
  async function testModels(){
    const request=new AbortController();controller.current=request;setChecking(true);setCheck('正在使用系统测试图片检查连接和图片读取…');let timedOut=false;const timer=setTimeout(()=>{timedOut=true;request.abort();},300000);
    try{for(const id of [...new Set([cloud.profileId,cloud.ocrProfileId])].filter(Boolean))await checkImageModel(id,cloud.identity!.workspaceId,request.signal,cloud.expired);if(!request.signal.aborted)setCheck('连接、测试图片读取与 JSON 返回均通过。正式批改前仍需用少量实际手写作文核对识别与评分质量。');}
    catch(e){if(timedOut)setCheck('检查超时，服务器任务可能仍在处理；重试会先核对原请求。');else if(!request.signal.aborted)setCheck(e instanceof Error&&e.name!=='TypeError'?e.message:'连接检查中断，请恢复网络后重试。');}
    finally{clearTimeout(timer);if(controller.current===request){controller.current=null;setChecking(false);}}
  }
  return <div className="cloud-model-settings"><h3>AI 批改与图片识别</h3><p>选好批改模型即可开始；图片识别默认沿用同一模型，无需重复配置。API 地址与密钥由服务器保管。</p><label>选择批改模型<select aria-label="选择批改模型" value={cloud.profileId} onChange={event=>cloud.setProfileId(event.target.value)} disabled={!grading.length||checking}>{!grading.length&&<option value="">尚未配置可读取作文图片的模型</option>}{grading.map(p=><option key={p.id} value={p.id}>{p.label}（{p.model}）</option>)}</select></label>
    <p>题目与纸面姓名使用 OCR 模型；作文正文由批改模型直接读图批阅。</p><label>图片文字识别（OCR）<select aria-label="选择图片识别模型" value={cloud.ocrChoice} onChange={e=>cloud.setOcrProfileId(e.target.value)} disabled={!ocr.length||checking}><option value="">自动选择：优先沿用批改模型</option>{ocr.map(p=><option key={p.id} value={p.id}>{p.label}（{p.model}）</option>)}</select></label><p>{cloud.ocrProfileId?(same?'当前使用同一模型完成图片识别与作文批改。':'已分开设置图片识别与作文批改模型。'):'图片识别尚未就绪，请联系管理员配置支持图片输入的模型。'}</p>
    <button className="cloud-model-check" disabled={checking||!cloud.profileId||!cloud.ocrProfileId||cloud.status!=='ready'} onClick={()=>void testModels()}>{checking?'正在检查…':'检查连接和图片识别'}</button><p>使用系统测试图片，每个不同模型调用一次，按供应商正常计费。不会使用学生作文。</p>{check&&<p role="status">{check}</p>}
    <details><summary>配置帮助与识别要求</summary><p>拍照作文需要支持图片输入的视觉模型；纯文字模型不能直接读取照片。二维码定位在本机完成，无需 OCR 模型。印刷测试通过后，还需核对中文手写姓名和英文手写正文。</p><p>学校已配置模型时，教师直接选择即可。需要添加或更换服务时，由管理员在服务器登记兼容接口、实际可用型号和密钥，并完成图片检查。</p><p><a href="https://ai.google.dev/gemini-api/docs/image-understanding" target="_blank" rel="noreferrer">Gemini 图片输入说明</a> · <a href="https://ai.google.dev/gemini-api/docs/openai" target="_blank" rel="noreferrer">Gemini 兼容接口配置</a>{selected?.helpUrl&&<> · <a href={selected.helpUrl} target="_blank" rel="noreferrer">当前模型服务帮助</a></>}</p></details>
    <details><summary>更多生成选项</summary><label>Temperature · {Number.isFinite(temperature)?temperature:0.3}<input type="range" min="0" max="1" step="0.05" value={Number.isFinite(temperature)?temperature:0.3} onChange={e=>onTemperatureChange(Number(e.target.value))}/></label></details>{cloud.status==='expired'&&<a href="/api/auth/start">重新使用 Daily 登录</a>}</div>;
}
