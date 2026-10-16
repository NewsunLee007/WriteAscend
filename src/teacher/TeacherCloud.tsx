import React,{createContext,useContext,useEffect,useMemo,useState} from 'react';
import {sanitizeLegacy} from '../report/legacy-import';
import {legacyKeys,workspaceStorage,type WorkspaceStorage} from './workspace-storage';
import './teacher-cloud.css';

type Profile={id:string;label:string;model:string};
type Identity={name:string;role:string;workspaceId:string};
type Cloud={mode:'local'|'cloud';status:string;message:string;identity:Identity|null;profiles:Profile[];profileId:string;setProfileId:(id:string)=>void;storage:WorkspaceStorage;refresh:()=>Promise<void>;expired:()=>void;logout:()=>Promise<void>};
const context=createContext<Cloud|null>(null);
export const useTeacherCloud=()=>useContext(context)!;

export function TeacherCloudProvider({children}:{children:React.ReactNode}){
  const [mode,setMode]=useState<'local'|'cloud'>(import.meta.env.DEV?'local':'cloud');
  const [status,setStatus]=useState(import.meta.env.DEV?'local':'loading');
  const [identity,setIdentity]=useState<Identity|null>(null),[profiles,setProfiles]=useState<Profile[]>([]),[profileId,selectProfile]=useState('');
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
      if(response.status===401){setStatus('anonymous');return;}
      const me=await response.json();
      if(!response.ok)throw Error(me.error?.message||'暂时无法确认登录账号。');
      if(!['teacher','admin'].includes(me.role)){setIdentity(null);setStatus('forbidden');return;}
      if(typeof me.workspaceId!=='string'||!/^[a-f0-9]{64}$/.test(me.workspaceId))throw Error('登录工作区信息不完整。');
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
      selectProfile(available.some(p=>p.id===wanted)?wanted:available[0]?.id||'');
      setProfiles(available);setStatus('ready');setMessage('');
    }catch(error){
      if(import.meta.env.DEV&&mode==='local'){setStatus('local');return;}
      setStatus('error');setMessage(error instanceof Error?error.message:'暂时无法连接作文后台。');
    }
  }
  useEffect(()=>{void refresh();},[]);
  const setProfileId=(id:string)=>{selectProfile(id);try{storage.setItem('cloud_profile',id);}catch{}};
  async function logout(){
    try{
      const response=await fetch('/api/auth/logout',{method:'POST'});
      if(!response.ok)throw Error();
      try{for(const key of Object.keys(sessionStorage))if(key.startsWith('wa_sheet_pending:'))sessionStorage.removeItem(key);}catch{}
      setIdentity(null);setProfiles([]);setStatus('anonymous');setMessage('');
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
  const value:Cloud={mode,status,message,identity,profiles,profileId,setProfileId,storage,refresh,expired:()=>setStatus('expired'),logout};
  const mounted=mode==='local'||(identity&&['ready','expired','error'].includes(status)&&!migration);
  return <context.Provider value={value}>{mounted?<React.Fragment key={(identity?.workspaceId||'local')+':'+generation}>{children}</React.Fragment>:<main className="teacher-cloud-gate">
    <section><img src="/favicon.svg" alt=""/><p className="cloud-eyebrow">教师作文工作区</p><h1>英语作文，一键批阅。</h1><p>设置或复用题目与评分标准，批量上传作文，借助大模型批阅，再核对、编辑和导出。</p>
      {migration?<><h2>保留这台设备上的原有数据</h2><p>发现旧版批改设置或历史记录。可将它们带入当前教师工作区，原数据会继续保留。模型密钥不会带入云端模式。</p><button onClick={()=>decideMigration(true)}>带入本机原有数据</button><button className="secondary" onClick={()=>decideMigration(false)}>新建空工作区</button></>:<>
        <p role="status">{status==='loading'?'正在连接教师工作区…':status==='forbidden'?'当前登录的是学生账号，请切换教师或管理员账号。':status==='unconfigured'||status==='error'?message:'使用 Daily 教师账号登录后开始批改。'}</p>
        {['anonymous','forbidden'].includes(status)&&<a className="cloud-primary" href="/api/auth/start">使用 Daily 登录</a>}
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
  return <aside className="cloud-connection no-print" aria-label="云端批改连接">
    <div><strong>{cloud.identity?.name} · 云端工作区</strong><span>{cloud.message|| (cloud.status==='expired'?'登录已过期，已保存的任务可在重新登录后继续。':cloud.status==='error'?'暂时无法核对登录，请刷新连接。':cloud.profiles.length?'支持刷新后继续批改，可将核对后的结果保存到云端。':'云端模型尚未配置，请联系管理员。')}</span></div>
    <div>{cloud.status==='expired'?<a href="/api/auth/start">重新登录</a>:<><button disabled={busy} onClick={()=>void cloud.refresh()}>刷新连接</button><button disabled={busy} onClick={()=>void cloud.logout()}>退出</button></>}</div>
  </aside>;
}

export function CloudModelSettings({temperature,onTemperatureChange}:{temperature:number;onTemperatureChange:(value:number)=>void}){
  const cloud=useTeacherCloud();
  return <div className="cloud-model-settings"><h3>云端模型</h3><p>教师的评分设置与原有报告保持可编辑。模型地址和密钥由服务器管理。</p><label>选择批改模型<select value={cloud.profileId} onChange={event=>cloud.setProfileId(event.target.value)} disabled={!cloud.profiles.length}>{!cloud.profiles.length&&<option value="">尚未配置模型</option>}{cloud.profiles.map(p=><option key={p.id} value={p.id}>{p.label}（{p.model}）</option>)}</select></label><label>Temperature · {Number.isFinite(temperature)?temperature:0.3}<input type="range" min="0" max="1" step="0.05" value={Number.isFinite(temperature)?temperature:0.3} onChange={e=>onTemperatureChange(Number(e.target.value))}/></label>{cloud.status==='expired'&&<a href="/api/auth/start">重新使用 Daily 登录</a>}</div>;
}
