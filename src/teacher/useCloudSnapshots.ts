import {useEffect,useRef,useState} from 'react';
import {uploadCloudAsset} from './cloud-assets';
import {sanitizeLegacy} from '../report/legacy-import';

export type CloudSnapshotRef={id:string;localId:string;name:string;className:string;gradedCount:number;revision:number;latestRevision?:number;updated:number;created:number;deleted:boolean};
export type SnapshotEnvelope={snapshot:any;cloud:CloudSnapshotRef};
type Entry={workspaceId:string;requestId:string;snapshot:any;expectedRevision:number;images:Array<{fileId:string;blob:Blob}>;created:number;conflict?:boolean};
type Options={workspaceId:string|null;onSynced:(value:SnapshotEnvelope)=>void;onExpired:()=>void};
function open(){return new Promise<IDBDatabase>((resolve,reject)=>{
  const r=indexedDB.open('writeascend-cloud-sync',1);r.onupgradeneeded=()=>{r.result.createObjectStore('outbox',{keyPath:'requestId'}).createIndex('workspace','workspaceId');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
});}
async function outbox(workspaceId:string,action:'list'|'put'|'delete',entry?:Entry){
  const db=await open();
  try{return await new Promise<any>((resolve,reject)=>{
    const tx=db.transaction('outbox',action==='list'?'readonly':'readwrite'),store=tx.objectStore('outbox');let value:any;
    const request=action==='list'?store.index('workspace').getAll(workspaceId):action==='put'?store.put(entry):store.delete(entry!.requestId);
    request.onsuccess=()=>{value=request.result;};tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });}finally{db.close();}
}
async function parsed(response:Response){
  let value;try{value=await response.json();}catch{throw Object.assign(new Error('暂时无法读取云端存档，请检查连接后重试。'),{status:response.status});}
  if(!response.ok)throw Object.assign(new Error(value.error?.message||'云端存档暂时无法处理。'),{status:response.status,code:value.error?.code});return value;
}
export function useCloudSnapshots({workspaceId,onSynced,onExpired}:Options){
  const [status,setStatus]=useState('idle'),[message,setMessage]=useState(''),[conflict,setConflict]=useState<Entry|null>(null);
  const [items,setItems]=useState<CloudSnapshotRef[]>([]),[next,setNext]=useState<string|null>(null),[loading,setLoading]=useState(false),[listError,setListError]=useState('');
  const listRequest=useRef(0),lastFilter=useRef<{deleted?:boolean;query?:string}>({});
  const running=useRef(false),rerun=useRef(false),controller=useRef<AbortController|null>(null),callbacks=useRef({onSynced,onExpired}),alive=useRef(true),lastEntry=useRef<Entry|null>(null);
  callbacks.current={onSynced,onExpired};
  async function list(options:{deleted?:boolean;cursor?:string;query?:string}={}){
    if(!workspaceId)return;const request=++listRequest.current;lastFilter.current={deleted:options.deleted,query:options.query};setLoading(true);setListError('');
    try{
      const search=new URLSearchParams({...(options.deleted?{deleted:'1'}:{}),...(options.cursor?{cursor:options.cursor}:{}),...(options.query?{q:options.query}:{})});
      const value=await parsed(await fetch('/api/snapshots?'+search,{cache:'no-store'}));
      if(!alive.current||request!==listRequest.current)return;
      setItems(previous=>options.cursor?[...previous,...value.snapshots]:value.snapshots);setNext(value.next);
    }catch(error){if(alive.current&&request===listRequest.current)setListError(error instanceof Error?error.message:'云端列表暂时无法读取。');}
    finally{if(alive.current&&request===listRequest.current)setLoading(false);}
  }
  async function drain(){
    if(!workspaceId||!alive.current)return;
    if(running.current){rerun.current=true;return;}
    running.current=true;controller.current=new AbortController();const signal=controller.current.signal;
    try{
      const entries=(await outbox(workspaceId,'list') as Entry[]).sort((a,b)=>a.created-b.created);
      const waiting=entries.filter(e=>!e.conflict);
      if(!waiting.length){const existing=entries.find(e=>e.conflict);if(existing){setConflict(existing);setStatus('conflict');setMessage('另一个设备已更新存档。当前修改仍保留在本机，可查看云端版本或另存副本。');}return;}
      setStatus('pending');setMessage('正在同步报告与原稿…');
      for(const entry of waiting){
        signal.throwIfAborted();lastEntry.current=entry;
        for(const image of entry.images){
          const asset=await uploadCloudAsset(image.blob,workspaceId,signal);
          const file=entry.snapshot.data.files.find((f:any)=>f.id===image.fileId);if(file)file.cloudAssetIds=[asset.id];
        }
        entry.images=[];await outbox(workspaceId,'put',entry);
        const response=await fetch('/api/snapshots',{method:'POST',headers:{'Content-Type':'application/json','X-Workspace-Id':workspaceId},body:JSON.stringify({requestId:entry.requestId,expectedRevision:entry.expectedRevision,snapshot:entry.snapshot}),signal});
        const value=await parsed(response);
        if(value.cloud.deleted)throw Object.assign(new Error('此存档已移入回收站，请先恢复或另存副本。'),{status:409,code:'snapshot_conflict'});
        await outbox(workspaceId,'delete',entry);
        if(!alive.current)return;
        callbacks.current.onSynced({snapshot:entry.snapshot,cloud:value.cloud});
        setStatus('saved');setMessage('已保存到云端 · 第 '+value.cloud.revision+' 版');setConflict(null);
      }
      const remaining=await outbox(workspaceId,'list') as Entry[];
      const existing=remaining.find(e=>e.conflict);
      if(existing){setConflict(existing);setStatus('conflict');setMessage('另一个设备已更新存档。当前修改仍保留在本机，可查看云端版本或另存副本。');}
      await list(lastFilter.current);
    }catch(error:any){
      if(!alive.current||signal.aborted)return;
      if(error.status===401)callbacks.current.onExpired();
      if(error.status===409&&error.code==='snapshot_conflict'&&lastEntry.current){lastEntry.current.conflict=true;await outbox(workspaceId,'put',lastEntry.current);setConflict(lastEntry.current);setStatus('conflict');}
      else setStatus('error');
      setMessage(error.message||'本机结果已保留，云端同步尚未完成。');
    }finally{running.current=false;if(rerun.current&&alive.current){rerun.current=false;void drain();}}
  }
  async function save(snapshot:any,files:any[],reference:CloudSnapshotRef|null){
    if(!workspaceId)return;
    if(files.some(file=>file.status==='loading'||file.cloudPendingJobId)){setStatus('error');setMessage('本机快照已保留。请先暂停并接收当前批改结果，再重新保存到云端。');return;}
    const safe=sanitizeLegacy(JSON.parse(JSON.stringify(snapshot))).value as any;
    delete safe.cloud;
    const entry:Entry={workspaceId,requestId:crypto.randomUUID(),snapshot:safe,expectedRevision:reference?.revision||0,images:[],created:Date.now()};
    for(const file of safe.data.files){
      const original=files.find(f=>f.id===file.id);
      if(original?.file instanceof Blob&&!file.cloudAssetIds?.length)entry.images.push({fileId:file.id,blob:original.file});
    }
    try{await outbox(workspaceId,'put',entry);await drain();}
    catch(error){setStatus('error');setMessage('本机结果已保存，但这台设备未能建立云端同步记录，请稍后重新保存。');}
  }
  async function copyConflict(){
    if(!workspaceId||!conflict)return;
    const previous=conflict,copy={...previous,requestId:crypto.randomUUID(),expectedRevision:0,created:Date.now(),conflict:false,snapshot:{...previous.snapshot,id:crypto.randomUUID(),name:String(previous.snapshot.name).slice(0,225)+'（副本）'}};
    await outbox(workspaceId,'put',copy);await outbox(workspaceId,'delete',previous);setConflict(null);await drain();
  }
  async function read(id:string,revision?:number):Promise<SnapshotEnvelope>{return parsed(await fetch('/api/snapshots/'+id+(revision?'?revision='+revision:''),{cache:'no-store'}));}
  async function versions(id:string,before?:number){return parsed(await fetch('/api/snapshots/'+id+'/versions'+(before?'?before='+before:''),{cache:'no-store'}));}
  async function changeVisibility(item:CloudSnapshotRef,deleted:boolean){
    if(!workspaceId)return;
    await parsed(await fetch('/api/snapshots/'+item.id+(deleted?'':'/restore'),{method:deleted?'DELETE':'POST',headers:{'Content-Type':'application/json','X-Workspace-Id':workspaceId},body:JSON.stringify({expectedRevision:item.revision})}));
  }
  useEffect(()=>{
    alive.current=true;if(!workspaceId)return;
    void list();void drain();
    const resume=()=>{if(navigator.onLine)void drain();};
    window.addEventListener('online',resume);window.addEventListener('focus',resume);
    return()=>{alive.current=false;controller.current?.abort();window.removeEventListener('online',resume);window.removeEventListener('focus',resume);};
  },[workspaceId]);
  return {status,message,conflict,items,next,loading,listError,list,save,retry:drain,copyConflict,read,versions,changeVisibility};
}
export type CloudSnapshots=ReturnType<typeof useCloudSnapshots>;
