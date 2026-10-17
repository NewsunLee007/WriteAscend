import type {Env} from './index';
import {HttpError} from './errors';
import {digest,importLegacy,sanitizeLegacy} from '../src/report/legacy-import';

type Session={principal:string;role:string};
type Batch={id:string;owner:string;fingerprint:string;report_count:number;archive_key:string;created:string;label:string|null;status:string|null;processed_count:number|null;revision:number|null;lease_key:string|null;lease_until:number|null;updated:string|null};
const uuid=/^[a-f0-9-]{36}$/;
const fail=(status:number,message:string,code?:string):never=>{throw new HttpError(status,message,code);};
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
const select='SELECT b.*,s.label,s.status,s.processed_count,s.revision,s.lease_key,s.lease_until,s.updated FROM legacy_import_batches b LEFT JOIN legacy_import_state s ON s.batch_id=b.id';
const visible="(p.revision>1 OR NOT EXISTS(SELECT 1 FROM legacy_import_members m WHERE m.report_id=p.id) OR EXISTS(SELECT 1 FROM legacy_import_members m JOIN legacy_import_state s ON s.batch_id=m.batch_id WHERE m.report_id=p.id AND s.status<>'withdrawn'))";
const metadata=(r:Batch)=>({id:r.id,label:r.label||'旧版作文备份',reportCount:r.report_count,processedCount:r.processed_count??r.report_count,status:r.status||'complete',revision:r.revision??1,created:r.created,updated:r.updated||r.created,legacyIndex:r.status===null});
async function owned(env:Env,owner:string,id:string){const row=await env.DB.prepare(select+' WHERE b.id=? AND b.owner=?').bind(id,owner).first<Batch>();if(!row)fail(404,'旧版备份不存在。');return row!;}
async function sourceObject(env:Env,key:string){try{const object=await env.FILES.get(key);if(!object)fail(503,'原备份暂时无法读取，已完成的部分仍保留。');return object!;}catch{return fail(503,'原备份暂时无法读取，已完成的部分仍保留。');}}
function positionCursor(value:string|null){if(!value)return null;try{const v=JSON.parse(atob(value));if(!Array.isArray(v)||v.length!==2||typeof v[0]!=='string'||v[0].length>40||!uuid.test(v[1]))throw Error();return v as [string,string];}catch{fail(400,'历史分页位置不正确。');}}

async function advance(env:Env,row:Batch){
 if(row.status==='withdrawn')fail(409,'此备份已撤回，请先恢复。','legacy_withdrawn');
 if(row.status==='complete')return metadata(row);
 const key=crypto.randomUUID(),now=Date.now();
 const claim=await env.DB.prepare("UPDATE legacy_import_state SET lease_key=?,lease_until=? WHERE batch_id=? AND owner=? AND status='pending' AND processed_count=? AND lease_until<=?").bind(key,now+60000,row.id,row.owner,row.processed_count||0,now).run();
 if(!claim.meta.changes){const current=await owned(env,row.owner,row.id);if(current.status==='complete')return metadata(current);fail(409,'备份正在处理，请稍后刷新进度。','legacy_busy');}
 try{
  const object=await sourceObject(env,row.archive_key);
  const bundle=await importLegacy(await object!.json(),{shareReadOnlyContext:true});
  if(bundle.fingerprint!==row.fingerprint||bundle.reports.length!==row.report_count)fail(409,'原备份校验不一致，请保留原文件并重新核对。');
  const start=row.processed_count||0,part=bundle.reports.slice(start,start+10),stamp=new Date().toISOString();
  const guard="EXISTS(SELECT 1 FROM legacy_import_state WHERE batch_id=? AND owner=? AND lease_key=? AND status='pending')";
  const statements=part.flatMap((report,index)=>[
   env.DB.prepare('INSERT OR IGNORE INTO private_reports(id,owner,fingerprint,payload,revision,created,updated) SELECT ?,?,?,?,1,?,? WHERE '+guard).bind(crypto.randomUUID(),row.owner,report.fingerprint,JSON.stringify(report),stamp,stamp,row.id,row.owner,key),
   env.DB.prepare('INSERT OR IGNORE INTO private_report_revisions SELECT id,owner,revision,payload,updated FROM private_reports WHERE owner=? AND fingerprint=? AND '+guard).bind(row.owner,report.fingerprint,row.id,row.owner,key),
   env.DB.prepare('INSERT OR IGNORE INTO legacy_import_members SELECT ?,id,?,? FROM private_reports WHERE owner=? AND fingerprint=? AND '+guard).bind(row.id,row.owner,start+index,row.owner,report.fingerprint,row.id,row.owner,key),
  ]);
  statements.push(env.DB.prepare("UPDATE legacy_import_state SET processed_count=?,status=?,revision=revision+1,updated=?,lease_key=NULL,lease_until=0 WHERE batch_id=? AND owner=? AND lease_key=? AND status='pending' AND processed_count=?").bind(start+part.length,start+part.length>=row.report_count?'complete':'pending',stamp,row.id,row.owner,key,start));
  await env.DB.batch(statements);
  const current=await owned(env,row.owner,row.id);if(current.status==='withdrawn')fail(409,'此备份已撤回，未继续导入。','legacy_withdrawn');return metadata(current);
 }finally{await env.DB.prepare('UPDATE legacy_import_state SET lease_key=NULL,lease_until=0 WHERE batch_id=? AND owner=? AND lease_key=?').bind(row.id,row.owner,key).run();}
}

export async function handleLegacyArchive(req:Request,env:Env,session:Session,input:(req:Request,max?:number)=>Promise<unknown>):Promise<Response|null>{
 const url=new URL(req.url),path=url.pathname;if(!/^\/api\/(?:legacy-imports|reports)(?:\/|$)/.test(path))return null;
 if(!['teacher','admin'].includes(session.role))fail(403,'此操作需要教师账号。');const owner=session.principal;
 if(path==='/api/legacy-imports'&&req.method==='POST'){
  const body=await input(req,8*1024*1024) as any,wrapped=body?.schema==='newsun-legacy-import-request-v1';let bundle;
  try{bundle=await importLegacy(wrapped?body.payload:body,{shareReadOnlyContext:true});}catch(e){fail(400,e instanceof Error?e.message:'旧备份格式不正确。');}
  if(bundle!.reports.length>10000)fail(413,'每份旧备份最多迁移10000份报告，请按原批次分开处理。');
  const label=wrapped&&typeof body.label==='string'?body.label.trim():'旧版作文备份';if(!label||label.length>160)fail(400,'备份名称须在160字以内。');
  let row=await env.DB.prepare(select+' WHERE b.owner=? AND b.fingerprint=?').bind(owner,bundle!.fingerprint).first<Batch>();
  if(row?.status==='withdrawn')fail(409,'此文件已撤回，可在回收站恢复；重复选择不会自动恢复。','legacy_withdrawn');
  if(!row||!row.status){
   const stamp=new Date().toISOString(),id=row?.id||crypto.randomUUID(),archiveKey=row?.archive_key||'legacy/'+await digest(owner)+'/'+bundle!.fingerprint+'.json';
   try{await env.FILES.put(archiveKey,JSON.stringify(bundle!.sanitizedPayload),{httpMetadata:{contentType:'application/json'}});}catch{fail(503,'原备份尚未保存到云端，请保留文件并稍后重试。');}
   await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO legacy_import_batches(id,owner,fingerprint,report_count,archive_key,created) VALUES(?,?,?,?,?,?)').bind(id,owner,bundle!.fingerprint,bundle!.reports.length,archiveKey,stamp),
    env.DB.prepare("INSERT OR IGNORE INTO legacy_import_state(batch_id,owner,label,status,processed_count,revision,updated) SELECT id,owner,?,'pending',0,1,? FROM legacy_import_batches WHERE owner=? AND fingerprint=?").bind(label,stamp,owner,bundle!.fingerprint),
   ]);
   row=await env.DB.prepare(select+' WHERE b.owner=? AND b.fingerprint=?').bind(owner,bundle!.fingerprint).first<Batch>();
  }
  const batch=await advance(env,row!);return json({ok:true,batch,reportCount:bundle!.reports.length,removedCredentialFields:bundle!.removedCredentialFields},batch.status==='complete'?201:202);
 }
 if(path==='/api/legacy-imports'&&req.method==='GET'){
  const cursor=positionCursor(url.searchParams.get('cursor')),withdrawn=url.searchParams.get('withdrawn')==='1';
  const result=await env.DB.prepare(select+" WHERE b.owner=? AND (COALESCE(s.status,'complete')='withdrawn')=? AND (b.created<? OR (b.created=? AND b.id<?)) ORDER BY b.created DESC,b.id DESC LIMIT 26").bind(owner,withdrawn?1:0,cursor?.[0]||'9999',cursor?.[0]||'9999',cursor?.[1]||'~').all<Batch>();
  const rows=result.results.slice(0,25),last=rows.at(-1);return json({batches:rows.map(metadata),next:result.results.length>25&&last?btoa(JSON.stringify([last.created,last.id])):null});
 }
 const match=path.match(/^\/api\/legacy-imports\/([a-f0-9-]{36})(?:\/(continue|source|reports|restore))?$/);
 if(match){
  const row=await owned(env,owner,match[1]);
  if(!match[2]&&req.method==='GET')return json({batch:metadata(row)});
  if(match[2]==='continue'&&req.method==='POST'){await input(req,2048);return json({batch:await advance(env,row)});}
  if(match[2]==='source'&&req.method==='GET'){
   const object=await sourceObject(env,row.archive_key);
   return new Response(object!.body as any,{headers:{'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="Legacy_Backup_'+row.id+'.json"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
  }
  if(match[2]==='reports'&&req.method==='GET'){
   const after=Number(url.searchParams.get('after')??-1);if(!Number.isSafeInteger(after)||after< -1)fail(400,'报告分页位置不正确。');
   const rows=await env.DB.prepare('SELECT p.id,p.payload,p.revision,m.position FROM legacy_import_members m JOIN private_reports p ON p.id=m.report_id WHERE m.batch_id=? AND m.owner=? AND p.owner=? AND m.position>? ORDER BY m.position LIMIT 26').bind(row.id,owner,owner,after).all<any>();
   return json({reports:rows.results.slice(0,25).map(r=>({...JSON.parse(r.payload),cloudId:r.id,revision:r.revision})),next:rows.results.length>25?rows.results[24].position:null});
  }
  if((!match[2]&&req.method==='DELETE')||(match[2]==='restore'&&req.method==='POST')){
   const body=await input(req,4096) as any;if(!Number.isSafeInteger(body?.revision)||body.revision<1)fail(400,'请提供备份的当前版本。');
   if(match[2]==='restore'&&row.status!=='withdrawn')fail(409,'此备份已在档案中，请刷新进度。');
   if(!row.status)fail(409,'此旧批次尚无报告索引，请重新选择完整备份建立索引后再撤回。','legacy_index_required');
   const restoring=match[2]==='restore',next=restoring?((row.processed_count??row.report_count)>=row.report_count?'complete':'pending'):'withdrawn';
   const result=await env.DB.prepare('UPDATE legacy_import_state SET status=?,revision=revision+1,lease_key=NULL,lease_until=0,updated=? WHERE batch_id=? AND owner=? AND revision=?').bind(next,new Date().toISOString(),row.id,owner,body.revision).run();
   if(!result.meta.changes)fail(409,'备份进度或状态已变化，请刷新后再操作。');return json({batch:metadata(await owned(env,owner,row.id))});
  }
  fail(405,'备份请求方式不支持。');
 }
 if(path==='/api/reports'&&req.method==='GET'){
  const cursor=positionCursor(url.searchParams.get('cursor')),query=(url.searchParams.get('q')||'').trim(),offset=cursor?0:Math.max(0,Math.min(100000,Number(url.searchParams.get('offset'))||0));if(query.length>160)fail(400,'搜索内容过长。');
  const rows=await env.DB.prepare("SELECT p.* FROM private_reports p WHERE p.owner=? AND "+visible+" AND (?='' OR instr(lower(COALESCE(json_extract(p.payload,'$.result.student_name'),'')||' '||COALESCE(json_extract(p.payload,'$.result.class_name'),'')||' '||COALESCE(json_extract(p.payload,'$.assignment.title'),'')),lower(?))>0) AND (p.updated<? OR (p.updated=? AND p.id<?)) ORDER BY p.updated DESC,p.id DESC LIMIT 26 OFFSET ?").bind(owner,query,query,cursor?.[0]||'9999',cursor?.[0]||'9999',cursor?.[1]||'~',offset).all<any>();
  const page=rows.results.slice(0,25),last=page.at(-1);return json({reports:page.map(r=>({...JSON.parse(r.payload),cloudId:r.id,revision:r.revision})),nextCursor:rows.results.length>25&&last?btoa(JSON.stringify([last.updated,last.id])):null,nextOffset:rows.results.length>25?offset+25:null});
 }
 const report=path.match(/^\/api\/reports\/([a-f0-9-]{36})$/);
 if(report){
  const row=await env.DB.prepare('SELECT * FROM private_reports p WHERE p.id=? AND p.owner=? AND '+visible).bind(report[1],owner).first<any>();if(!row)fail(404,'报告不存在。');
  if(req.method==='GET')return json({report:{...JSON.parse(row.payload),cloudId:row.id,revision:row.revision}});
  if(req.method==='PATCH'){
   const body=await input(req,1024*1024) as any;if(!Number.isInteger(body?.revision)||!body.result||typeof body.result!=='object'||Array.isArray(body.result))fail(400,'请提供结果及原版本号。');if(row.revision!==body.revision)fail(409,'报告已在其他设备修改，请重新读取。');
   const previous=JSON.parse(row.payload),safe=sanitizeLegacy(body.result).value as Record<string,unknown>;
   for(const key of ['student_id','class_id','original_essay'])if(safe[key]!==previous.result[key])fail(400,'此接口不能更改原稿或学生归属。');
   const edited={...previous.result};for(const key of ['student_name','class_name','student_no','brief_comment','total_score','breakdown','highlights','errors','content_logic','optimized_essay','identity_name_mismatch_verified'])if(key in safe)edited[key]=safe[key];
   if(JSON.stringify(edited.breakdown)!==JSON.stringify(previous.result.breakdown)||edited.total_score!==previous.result.total_score){
    const rubric=previous.rubric;if(!rubric||!Number.isFinite(edited.total_score)||edited.total_score<0||edited.total_score>rubric.total)fail(400,'分数不在评分标准范围内。');let sum=0;
    for(const criterion of rubric.items){const value=edited.breakdown?.[criterion.label];if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>criterion.score||value*2!==Math.round(value*2))fail(400,'分项分数须符合满分和半分要求。');sum+=value;}
    if(Math.abs(sum-edited.total_score)>0.001)fail(400,'总分须与分项分数相符。');
   }
   const result=await env.DB.batch([env.DB.prepare('UPDATE private_reports SET payload=?,revision=revision+1,updated=? WHERE id=? AND owner=? AND revision=?').bind(JSON.stringify({...previous,result:edited,modified:true}),new Date().toISOString(),row.id,owner,body.revision),env.DB.prepare('INSERT OR IGNORE INTO private_report_revisions SELECT id,owner,revision,payload,updated FROM private_reports WHERE id=? AND owner=?').bind(row.id,owner)]);
   if(!result[0].meta.changes)fail(409,'报告已在其他设备修改，请重新读取。');return json({ok:true,revision:body.revision+1});
  }
 }
 return fail(404,'旧版档案接口不存在。');
}
