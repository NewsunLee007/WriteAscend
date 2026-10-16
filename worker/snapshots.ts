import type {Env} from './index';
import {HttpError} from './errors';
import {digest,isObject,sanitizeLegacy} from '../src/report/legacy-import';

type Row={id:string;owner:string;local_id:string;name:string;class_name:string;graded_count:number;revision:number;content_hash:string;object_key:string;rubric_hash:string;created:number;updated:number;deleted:number};
type Operation={request_hash:string;snapshot_id:string;revision:number};
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function fail(status:number,message:string,code?:string):never{throw new HttpError(status,message,code??(status===409?'snapshot_conflict':undefined));}
const metadata=(r:Row)=>({id:r.id,localId:r.local_id,name:r.name,className:r.class_name,gradedCount:r.graded_count,revision:r.revision,created:r.created,updated:r.updated,deleted:!!r.deleted,rubricHash:r.rubric_hash});
const uuid=/^[a-f0-9-]{36}$/;
export function prepareSnapshot(value:unknown){
  let safe:unknown;
  try{safe=sanitizeLegacy(value).value;}catch{fail(400,'存档结构无法读取，请使用原系统导出的结果。');}
  if(!isObject(safe)||typeof safe.id!=='string'||!/^[-a-zA-Z0-9_]{1,128}$/.test(safe.id)||typeof safe.name!=='string'||!safe.name.trim()||safe.name.length>240||!isObject(safe.data)||!Array.isArray(safe.data.files)||safe.data.files.length>200)fail(400,'批改存档格式不正确。');
  const data=safe.data;
  if(!isObject(data.assignment)||!isObject(data.rubric)||!Array.isArray(data.rubric.items)||!Number.isFinite(data.rubric.total))fail(400,'请保留这次写作题目与评分标准。');
  delete safe.cloud;delete data.config;
  const assetIds=new Set<string>();let graded=0;
  const files=(data.files as unknown[]).map(file=>{
    if(!isObject(file)||typeof file.id!=='string')fail(400,'作文条目缺少编号。');
    const ids=file.cloudAssetIds??[];
    if(!Array.isArray(ids)||ids.length>6||ids.some(id=>typeof id!=='string'||!uuid.test(id)))fail(400,'原稿图片编号不正确。');
    ids.forEach(id=>assetIds.add(id));
    const result=isObject(file.result)?{...file.result}:null;
    if(result)delete result.original_image_url;
    if(file.status==='loading'||file.cloudPendingJobId)fail(409,'请先暂停并接收当前批改结果，再同步存档。本机结果会继续保留。','snapshot_busy');
    if(file.status==='success'&&result)graded++;
    return {...file,file:null,url:null,result,cloudAssetIds:[...new Set(ids)]};
  });
  if(!graded)fail(400,'至少完成一份作文后再保存批改存档。');
  // Historical archive entries retain their own scores and rubrics. Blob links
  // are not portable and never become trusted image or identity references.
  if(isObject(data.studentProfiles))for(const profile of Object.values(data.studentProfiles)){
    if(isObject(profile)&&Array.isArray(profile.records))for(const record of profile.records){
      if(isObject(record)&&isObject(record.result))delete record.result.original_image_url;
    }
  }
  return {snapshot:{...safe,id:safe.id,name:safe.name,className:safe.className,gradedCount:graded,data:{...data,assignment:data.assignment,rubric:data.rubric,files}},assetIds:[...assetIds]};
}
async function readDocument(env:Env,row:Row,version:number){
  const stored=await env.DB.prepare('SELECT object_key,rubric_hash,created FROM teacher_snapshot_versions WHERE snapshot_id=? AND revision=?').bind(row.id,version).first<{object_key:string;rubric_hash:string;created:number}>();
  if(!stored)fail(404,'存档版本不存在。');
  const object=await env.FILES.get(stored.object_key);if(!object)fail(503,'云端存档暂时无法读取，请稍后重试。');
  const snapshot=await object.json() as any;
  return json({snapshot,cloud:{...metadata(row),revision:version,latestRevision:row.revision,rubricHash:stored.rubric_hash,versionCreated:stored.created,identityStatus:'unlinked'}});
}
async function ownerRow(env:Env,owner:string,id:string){
  const row=await env.DB.prepare('SELECT * FROM teacher_snapshots WHERE id=? AND owner=?').bind(id,owner).first<Row>();
  if(!row)fail(404,'云端存档不存在。');return row;
}
export async function handleSnapshots(req:Request,env:Env,owner:string,readInput:(req:Request,max?:number)=>Promise<unknown>):Promise<Response|null>{
  const url=new URL(req.url),path=url.pathname;
  if(!path.startsWith('/api/snapshots'))return null;
  if(path==='/api/snapshots'&&req.method==='GET'){
    const deleted=url.searchParams.get('deleted')==='1'?1:0,query=(url.searchParams.get('q')||'').trim();
    if(query.length>200)fail(400,'搜索内容过长。');
    let before=Number.MAX_SAFE_INTEGER,id='~';
    const cursor=url.searchParams.get('cursor');
    if(cursor){try{const c=JSON.parse(atob(cursor));if(!Number.isSafeInteger(c[0])||typeof c[1]!=='string'||!uuid.test(c[1]))throw Error();before=c[0];id=c[1];}catch{fail(400,'分页位置不正确。');}}
    const result=await env.DB.prepare("SELECT * FROM teacher_snapshots WHERE owner=? AND deleted=? AND (?='' OR instr(lower(name||' '||class_name),lower(?))>0) AND (updated<? OR (updated=? AND id<?)) ORDER BY updated DESC,id DESC LIMIT 26").bind(owner,deleted,query,query,before,before,id).all<Row>();
    const rows=result.results.slice(0,25),last=rows.at(-1);
    return json({snapshots:rows.map(metadata),next:result.results.length>25&&last?btoa(JSON.stringify([last.updated,last.id])):null});
  }
  if(path==='/api/snapshots'&&req.method==='POST'){
    const body=await readInput(req,16*1024*1024) as any;
    if(!body||typeof body.requestId!=='string'||!/^[-a-zA-Z0-9_]{16,128}$/.test(body.requestId)||!Number.isInteger(body.expectedRevision)||body.expectedRevision<0)fail(400,'请提供保存请求编号和原版本。');
    const {snapshot,assetIds}=prepareSnapshot(body.snapshot),contentHash=await digest(snapshot),rubricHash=await digest(snapshot.data.rubric);
    const requestHash=await digest({contentHash,expectedRevision:body.expectedRevision});
    const previous=await env.DB.prepare('SELECT * FROM teacher_snapshot_operations WHERE owner=? AND request_id=?').bind(owner,body.requestId).first<Operation>();
    if(previous){
      if(previous.request_hash!==requestHash)fail(409,'保存请求编号已用于其他内容，请重新保存。');
      const row=await ownerRow(env,owner,previous.snapshot_id);
      return json({cloud:{...metadata(row),revision:previous.revision,latestRevision:row.revision},replayed:true});
    }
    for(let offset=0;offset<assetIds.length;offset+=50){
      const ids=assetIds.slice(offset,offset+50);
      const exists=await env.DB.prepare('SELECT id FROM private_assets WHERE owner=? AND ready=1 AND id IN ('+ids.map(()=>'?').join(',')+')').bind(owner,...ids).all();
      if(exists.results.length!==ids.length)fail(400,'有原稿图片尚未保存到当前工作区，请重新同步。');
    }
    const current=await env.DB.prepare('SELECT * FROM teacher_snapshots WHERE owner=? AND local_id=?').bind(owner,snapshot.id).first<Row>();
    if(current?.deleted)fail(409,'此存档已移入回收站，请先恢复或另存副本。');
    if(current&&current.content_hash===contentHash){
      await env.DB.prepare('INSERT OR IGNORE INTO teacher_snapshot_operations VALUES(?,?,?,?,?,?)').bind(owner,body.requestId,requestHash,current.id,current.revision,Date.now()).run();
      return json({cloud:metadata(current),unchanged:true});
    }
    if((current?.revision||0)!==body.expectedRevision)fail(409,'其他设备已保存了新版本。当前修改仍保留在本机，可刷新后比较或另存副本。');
    const id=current?.id||crypto.randomUUID(),next=body.expectedRevision+1,now=Date.now();
    const objectKey='teacher-snapshots/'+await digest(owner)+'/'+snapshot.id+'/'+contentHash+'.json';
    await env.FILES.put(objectKey,JSON.stringify(snapshot),{httpMetadata:{contentType:'application/json'}});
    const statements=current?[
      env.DB.prepare('UPDATE teacher_snapshots SET name=?,class_name=?,graded_count=?,revision=?,content_hash=?,object_key=?,rubric_hash=?,updated=? WHERE id=? AND owner=? AND revision=? AND deleted=0').bind(snapshot.name,String(snapshot.className||''),snapshot.gradedCount,next,contentHash,objectKey,rubricHash,now,id,owner,body.expectedRevision),
    ]:[
      env.DB.prepare('INSERT OR IGNORE INTO teacher_snapshots VALUES(?,?,?,?,?,?,?,?,?,?,?,?,0)').bind(id,owner,snapshot.id,snapshot.name,String(snapshot.className||''),snapshot.gradedCount,1,contentHash,objectKey,rubricHash,now,now),
    ];
    statements.push(
      env.DB.prepare('INSERT OR IGNORE INTO teacher_snapshot_versions SELECT id,revision,content_hash,object_key,rubric_hash,updated FROM teacher_snapshots WHERE id=? AND owner=? AND revision=? AND content_hash=? AND deleted=0').bind(id,owner,next,contentHash),
      env.DB.prepare('INSERT OR IGNORE INTO teacher_snapshot_operations SELECT ?,?,?,id,revision,? FROM teacher_snapshots WHERE id=? AND owner=? AND revision=? AND content_hash=? AND deleted=0').bind(owner,body.requestId,requestHash,now,id,owner,next,contentHash),
    );
    await env.DB.batch(statements);
    const accepted=await env.DB.prepare('SELECT * FROM teacher_snapshot_operations WHERE owner=? AND request_id=?').bind(owner,body.requestId).first<Operation>();
    if(accepted&&accepted.request_hash===requestHash){
      const row=await ownerRow(env,owner,accepted.snapshot_id);return json({cloud:{...metadata(row),revision:accepted.revision,latestRevision:row.revision}},current?200:201);
    }
    // A concurrent create can win the local-id uniqueness constraint with a
    // different generated server ID. Replaying the same operation remains safe.
    const raced=await env.DB.prepare('SELECT * FROM teacher_snapshots WHERE owner=? AND local_id=? AND content_hash=? AND deleted=0').bind(owner,snapshot.id,contentHash).first<Row>();
    if(raced)return json({cloud:metadata(raced),unchanged:true});
    fail(409,'存档版本已改变，当前修改仍保留在本机，请刷新后比较或另存副本。');
  }
  const match=path.match(/^\/api\/snapshots\/([a-f0-9-]{36})(?:\/(versions|restore))?$/);
  if(!match)fail(404,'存档接口不存在。');
  const row=await ownerRow(env,owner,match[1]);
  if(match[2]==='versions'&&req.method==='GET'){
    if(row.deleted)fail(404,'请先从回收站恢复此存档。');
    const before=Number(url.searchParams.get('before')||Number.MAX_SAFE_INTEGER);
    if(!Number.isSafeInteger(before)||before<1)fail(400,'版本分页位置不正确。');
    const versions=await env.DB.prepare('SELECT revision,rubric_hash AS rubricHash,created FROM teacher_snapshot_versions WHERE snapshot_id=? AND revision<? ORDER BY revision DESC LIMIT 51').bind(row.id,before).all<{revision:number}>();
    return json({versions:versions.results.slice(0,50),next:versions.results.length>50?versions.results[49].revision:null});
  }
  if(!match[2]&&req.method==='GET'){
    if(row.deleted)fail(404,'此存档已移入回收站。');
    const version=Number(url.searchParams.get('revision')||row.revision);
    if(!Number.isInteger(version)||version<1)fail(400,'存档版本不正确。');
    return readDocument(env,row,version);
  }
  if((!match[2]&&req.method==='DELETE')||(match[2]==='restore'&&req.method==='POST')){
    const body=await readInput(req,10000) as any;
    if(body?.expectedRevision!==row.revision)fail(409,'存档版本已改变，请刷新列表后再操作。');
    const deleted=req.method==='DELETE'?1:0;
    const result=await env.DB.prepare('UPDATE teacher_snapshots SET deleted=?,updated=? WHERE id=? AND owner=? AND revision=?').bind(deleted,Date.now(),row.id,owner,row.revision).run();
    if(!result.meta.changes)fail(409,'存档版本已改变，请刷新列表后再操作。');
    return json({ok:true,deleted:!!deleted,revision:row.revision});
  }
  fail(405,'存档请求方式不支持。');
}
