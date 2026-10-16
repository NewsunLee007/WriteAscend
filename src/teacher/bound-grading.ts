import {uploadCloudAsset} from './cloud-assets';
export type GradingRun={id:string;memberId:string;draftId:string;inputRevision:number;inputHash:string;state:'queued'|'running'|'ready'|'failed'|'uncertain'|'cancelled';reportId:string|null;updated:number;model:string;outdated?:boolean;canUseSavedResult?:boolean;error:{status:number;message:string}|null};
export type GradingMember={id:string;name:string;className:string;subjectShort:string;status:string;draftId:string|null;inputRevision:number|null;inputHash:string|null;collectionState:string|null;pageCount:number|null;draftNumber:number|null;run:GradingRun|null;publication?:{state:string;version:number;reportId:string;reportRevision:number;viewed:boolean;quarantined?:boolean;outdated:boolean}|null};
export async function gradingApi(path:string,workspace:string,body?:unknown,method=body?'POST':'GET',signal?:AbortSignal){
 const response=await fetch(path,{method,cache:'no-store',signal,headers:{'Content-Type':'application/json','X-Workspace-Id':workspace},...(body?{body:JSON.stringify(body)}:{})});
 let value:any;try{value=await response.json();}catch{throw Error('暂时无法读取批阅进度，请检查连接后刷新。');}
 if(!response.ok)throw Object.assign(new Error(value.error?.message||'批阅操作暂未完成。'),{status:response.status,code:value.error?.code});return value;
}
export async function gradingMutation(path:string,workspace:string,body:any,method='POST',signal?:AbortSignal){
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({path,body,method})))),b=>b.toString(16).padStart(2,'0')).join('');
 const key='wa_grading_pending:'+workspace+':'+digest;let requestId='';try{requestId=sessionStorage.getItem(key)||'';}catch{}requestId ||=crypto.randomUUID();try{sessionStorage.setItem(key,requestId);}catch{}
 const value=await gradingApi(path,workspace,{...body,requestId},method,signal);try{sessionStorage.removeItem(key);}catch{}return value;
}
async function wholePageCopy(blob:Blob,budget:number,signal:AbortSignal){
 const image=await createImageBitmap(blob,{imageOrientation:'from-image'});
 try{
  if(!image.width||!image.height||image.width*image.height>60000000)throw Error('照片尺寸暂不支持，请核对原稿清晰度并重新上传。');
  const canvas=document.createElement('canvas'),scale=Math.min(1,3200/Math.max(image.width,image.height));canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);
  const context=canvas.getContext('2d')!;context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
  for(const quality of [.92,.85,.75]){
   signal.throwIfAborted();const copy=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('整页批改图片准备失败，请重试。')),'image/jpeg',quality));if(copy.size<=budget)return copy;
  }
  throw Error('整页图片仍超过批改上限，请核对照片并重新上传；系统不会裁掉作文内容。');
 }finally{image.close();}
}
export async function prepareBoundInput(taskId:string,member:GradingMember,number:number,workspace:string,signal:AbortSignal){
 const {draft}=await gradingApi('/api/tasks/'+taskId+'/collection?memberId='+member.id+'&draftNumber='+number,workspace,undefined,'GET',signal);
 if(!draft?.complete)throw Error(member.name+'的本稿尚未收齐，请先完成收作业。');
 const body:any={memberId:member.id,draftId:draft.id,inputRevision:draft.inputRevision,inputHash:draft.inputHash};
 const pages=draft.manifest.pages,metas=[];for(const page of pages)metas.push(await gradingApi('/api/assets/'+page.assetId+'/meta',workspace,undefined,'GET',signal));
 if(metas.reduce((n,m)=>n+m.bytes,0)>12*1024*1024){
  // Copies retain every page; original asset IDs/hashes stay in the immutable source manifest.
  const budget=Math.floor(11*1024*1024/pages.length),images=[];
  for(let i=0;i<pages.length;i++){
   const page=pages[i];if(metas[i].bytes<=budget){images.push({pageVersionId:page.id,assetId:page.assetId});continue;}
   const response=await fetch('/api/assets/'+page.assetId,{cache:'no-store',signal});if(!response.ok)throw Error('原稿图片暂时无法读取，请稍后重试。');
   const copy=await wholePageCopy(await response.blob(),budget,signal),asset=await uploadCloudAsset(copy,workspace,signal);images.push({pageVersionId:page.id,assetId:asset.id});
  }
  body.modelImages=images;
 }
 return body;
}
