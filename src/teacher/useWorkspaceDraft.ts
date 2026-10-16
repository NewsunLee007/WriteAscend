import {useEffect,useRef,useState} from 'react';

type Draft={files:any[];selectedFileId:string|null;step:number;activeCloudSnapshot?:unknown;sourceTask?:unknown};
type Options={workspaceId:string|null;draft:Draft;restore:(draft:Draft)=>void};
function openDatabase(){return new Promise<IDBDatabase>((resolve,reject)=>{
  const request=indexedDB.open('writeascend-private-drafts',1);
  request.onupgradeneeded=()=>{request.result.createObjectStore('drafts');request.result.createObjectStore('images');};
  request.onerror=()=>reject(request.error);request.onsuccess=()=>resolve(request.result);
});}
function read(store:IDBObjectStore,key:IDBValidKey){return new Promise<any>((resolve,reject)=>{
  const request=store.get(key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
});}
function done(transaction:IDBTransaction){return new Promise<void>((resolve,reject)=>{
  transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error);
});}

// Photos are stored once; grading-state updates only replace the small manifest.
// Every key is owned by the authenticated workspace, including after account switches.
export function useWorkspaceDraft({workspaceId,draft,restore}:Options){
  const database=useRef<IDBDatabase|null>(null),knownImages=useRef(new Set<string>()),restoreRef=useRef(restore);
  restoreRef.current=restore;
  const [ready,setReady]=useState(false),[error,setError]=useState('');
  useEffect(()=>{
    if(!workspaceId)return;
    let cancelled=false;
    void(async()=>{
      try{
        const db=await openDatabase();if(cancelled){db.close();return;}database.current=db;
        const old=await read(db.transaction('drafts').objectStore('drafts'),workspaceId) as Draft|undefined;
        if(old&&Array.isArray(old.files)){
          const files=[];
          for(const item of old.files){
            const blob=await read(db.transaction('images').objectStore('images'),[workspaceId,item.id]);
            const file=blob instanceof Blob?new File([blob],item.name||'作文.jpg',{type:blob.type}):null;
            const assetId=item.cloudAssetIds?.[0];
            const url=file?URL.createObjectURL(file):typeof assetId==='string'&&/^[a-f0-9-]{36}$/.test(assetId)?'/api/assets/'+assetId:'';
            if(file)knownImages.current.add(item.id);
            files.push({...item,file,url,status:item.status==='loading'?'idle':item.status,result:item.result?{...item.result,...(url?{original_image_url:url}:{})}:null});
          }
          if(!cancelled)restoreRef.current({...old,files});
        }
        if(!cancelled)setReady(true);
      }catch{if(!cancelled)setError('这台设备未能恢复临时作文，请保留原图并及时保存批改结果。');}
    })();
    return()=>{cancelled=true;database.current?.close();database.current=null;};
  },[workspaceId]);
  useEffect(()=>{
    const db=database.current;if(!ready||!db||!workspaceId)return;
    try{
      const transaction=db.transaction(['drafts','images'],'readwrite'),images=transaction.objectStore('images'),active=new Set(draft.files.map(f=>f.id));
      const next=new Set(knownImages.current);
      for(const id of knownImages.current)if(!active.has(id)){images.delete([workspaceId,id]);next.delete(id);}
      for(const file of draft.files)if(file.file instanceof Blob&&!knownImages.current.has(file.id)){images.put(file.file,[workspaceId,file.id]);next.add(file.id);}
      const files=draft.files.map(file=>({...file,file:null,url:null,result:file.result?{...file.result,original_image_url:''}:null}));
      transaction.objectStore('drafts').put({...draft,files},workspaceId);
      void done(transaction).then(()=>{knownImages.current=next;setError('');},()=>setError('临时作文未能保存在这台设备上，请保留原图并及时保存结果。'));
    }catch{setError('临时作文未能保存在这台设备上，请保留原图并及时保存结果。');}
  },[workspaceId,ready,draft.files,draft.selectedFileId,draft.step,draft.activeCloudSnapshot,draft.sourceTask]);
  return error;
}
