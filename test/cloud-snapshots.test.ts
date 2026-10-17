import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {sqlD1} from './helpers/sql-d1';
import {handleAssets,hydrateAssetImages} from '../worker/assets';
import {handleSnapshots} from '../worker/snapshots';
import {HttpError} from '../worker/errors';
import type {Env} from '../worker/index';

const fixture=JSON.parse(fs.readFileSync(new URL('../scripts/qa/fixtures/teacher-workflow.json',import.meta.url),'utf8'));
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6b9sAAAAASUVORK5CYII=','base64');
const owner='wordup:teacher-1';
function document(assetId?:string){return {id:'synthetic-snapshot-1',name:'合成班写作存档',savedAt:'2026-10-16T10:00:00Z',classId:'legacy-class',className:'合成班',gradedCount:999,extension:{keep:'business metadata',apiKey:'must-not-survive'},data:{assignment:fixture.seed.assignment,rubric:fixture.seed.rubric,classes:fixture.seed.classes,studentProfiles:{},files:[{id:'synthetic-file',name:'作文.png',status:'success',file:null,url:'blob:expired',cloudAssetIds:assetId?[assetId]:[],result:{...JSON.parse(fixture.response.choices[0].message.content),student_id:'legacy-student',original_image_url:'blob:expired',unknown_teacher_field:{keep:true}}}]}};}
function sandbox(){
  const db=new DatabaseSync(':memory:');
  for(const name of ['0001_report_workspace.sql','0002_model_jobs.sql','0003_cloud_snapshots.sql'])db.exec(fs.readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
  const objects=new Map<string,Uint8Array>();let unavailable=false;
  const env={DB:sqlD1(db),FILES:{put:async(key:string,body:string|Uint8Array)=>{if(unavailable)throw Error('synthetic storage failure');objects.set(key,typeof body==='string'?new TextEncoder().encode(body):body.slice());},get:async(key:string)=>{const bytes=objects.get(key);if(!bytes)return null;return {body:new Response(bytes.slice().buffer as ArrayBuffer).body,arrayBuffer:async()=>bytes.slice().buffer,json:async()=>JSON.parse(new TextDecoder().decode(bytes))};}},PUBLIC_ORIGIN:'https://writeascend.test'} as unknown as Env;
  async function request(path:string,body?:any,method=body?'POST':'GET',principal=owner){
    const req=new Request('https://writeascend.test'+path,{method,headers:{'Content-Type':path==='/api/assets'?'image/png':'application/json'},body:body?path==='/api/assets'?body:JSON.stringify(body):undefined});
    try{return (await handleAssets(req,env,principal))||(await handleSnapshots(req,env,principal,r=>r.json()))!;}
    catch(error){if(error instanceof HttpError)return Response.json({error:{message:error.message,code:error.code}},{status:error.status});throw error;}
  }
  async function upload(principal=owner){const response=await request('/api/assets',png,'POST',principal);assert([200,201].includes(response.status));return await response.json() as any;}
  async function save(snapshot:any,expectedRevision=0,requestId='synthetic-save-operation-0001',principal=owner){return request('/api/snapshots',{snapshot,expectedRevision,requestId},'POST',principal);}
  return {db,env,objects,request,upload,save,storage:(down:boolean)=>{unavailable=down;},close:()=>db.close()};
}

test('private original images are content-deduplicated within one owner and remain isolated between teachers',async()=>{
  const h=sandbox();try{
    const image=await h.upload(),again=await h.upload();assert.equal(image.id,again.id);
    const other=await h.upload('wordup:teacher-2');assert.notEqual(other.id,image.id);
    const response=await h.request('/api/assets/'+image.id);assert.equal(response.status,200);assert.equal(response.headers.get('Content-Type'),'image/png');assert.equal(response.headers.get('Cache-Control'),'private, no-store');assert.deepEqual(Buffer.from(await response.arrayBuffer()),png);
    assert.equal((await h.request('/api/assets/'+image.id,undefined,'GET','wordup:teacher-2')).status,404);
    assert.equal((await h.request('/api/assets/'+image.id+'/meta',undefined,'GET','wordup:teacher-2')).status,404);
    assert.equal((await h.request('/api/assets',Buffer.from('<svg>not an uploaded bitmap</svg>'))).status,415);
    const hydrated=await hydrateAssetImages(h.env,owner,{messages:[{role:'user',content:[{type:'image_url',image_url:{url:'wa-asset:'+image.id}}]}]});
    assert.equal(hydrated.messages[0].content[0].image_url.url,'data:image/png;base64,'+png.toString('base64'));
    await assert.rejects(hydrateAssetImages(h.env,'wordup:teacher-2',{messages:hydrated.messages.map((m:any)=>({...m,content:[{type:'image_url',image_url:{url:'wa-asset:'+image.id}}]}))}),{status:404});
  }finally{h.close();}
});

test('saved cloud reports retain original sections, teacher scores, rubric and unknown fields without treating legacy IDs as authority',async()=>{
  const h=sandbox();try{
    const image=await h.upload(),snapshot=document(image.id);
    const saved=await h.save(snapshot);assert.equal(saved.status,201);const {cloud}=await saved.json() as any;
    assert.equal(cloud.revision,1);assert.equal(cloud.gradedCount,1);
    const body=await(await h.request('/api/snapshots/'+cloud.id)).json() as any;
    assert.equal(body.cloud.identityStatus,'unlinked');assert.equal(body.snapshot.data.files[0].result.student_id,'legacy-student');
    assert.equal(body.snapshot.data.files[0].result.total_score,15.5);assert.equal(body.snapshot.data.files[0].result.brief_comment,snapshot.data.files[0].result.brief_comment);
    assert.deepEqual(body.snapshot.data.rubric,snapshot.data.rubric);assert.deepEqual(body.snapshot.data.files[0].result.unknown_teacher_field,{keep:true});
    assert.equal(body.snapshot.extension.keep,'business metadata');assert(!JSON.stringify(body).includes('must-not-survive'));assert(!JSON.stringify(body).includes('blob:expired'));
    assert.equal(body.snapshot.data.files[0].cloudAssetIds[0],image.id);
    assert.equal(snapshot.data.files[0].result.original_image_url,'blob:expired');
    const replay=await h.save(snapshot);assert.equal(replay.status,200);assert.equal((await replay.json() as any).cloud.id,cloud.id);
    assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM teacher_snapshot_versions').get()!.n,1);
    assert.equal((await h.request('/api/snapshots/'+cloud.id,undefined,'GET','wordup:teacher-2')).status,404);
    assert.deepEqual((await(await h.request('/api/snapshots',undefined,'GET','wordup:teacher-2')).json() as any).snapshots,[]);
  }finally{h.close();}
});

test('concurrent devices cannot overwrite each other; immutable versions retain past rubric and manual changes',async()=>{
  const h=sandbox();try{
    const first=document(),initial=await(await h.save(first)).json() as any,id=initial.cloud.id;
    const a=structuredClone(first),b=structuredClone(first);a.data.files[0].result.brief_comment='教师 A 核对';a.data.files[0].result.total_score=14.5;a.data.rubric.gradeLevel='九年级';b.data.files[0].result.brief_comment='教师 B 核对';b.data.rubric.gradeLevel='八年级';
    const responses=await Promise.all([h.save(a,1,'synthetic-concurrent-A-0001'),h.save(b,1,'synthetic-concurrent-B-0001')]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
    const latest=await(await h.request('/api/snapshots/'+id)).json() as any;
    const winner=responses[0].status===200?a:b;assert.equal(latest.cloud.revision,2);assert.equal(latest.snapshot.data.files[0].result.brief_comment,winner.data.files[0].result.brief_comment);assert.equal(latest.snapshot.data.files[0].result.total_score,winner.data.files[0].result.total_score);
    const previous=await(await h.request('/api/snapshots/'+id+'?revision=1')).json() as any;
    assert.equal(previous.snapshot.data.files[0].result.total_score,15.5);assert.equal(previous.snapshot.data.rubric.gradeLevel,'七年级');assert.equal(previous.cloud.latestRevision,2);assert.notEqual(previous.cloud.rubricHash,latest.cloud.rubricHash);
    const replay=await(await h.save(first)).json() as any;assert.equal(replay.cloud.revision,1);assert.equal(replay.cloud.latestRevision,2);
    assert.equal((await(await h.request('/api/snapshots/'+id)).json() as any).cloud.revision,2);
    const conflict=await h.save({...b,name:'另一个保存'},1,'synthetic-stale-client-0001');assert.equal(conflict.status,409);assert.equal((await conflict.json() as any).error.code,'snapshot_conflict');
    assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM teacher_snapshot_versions').get()!.n,2);
    assert.equal((await h.request('/api/snapshots/'+id+'/versions',undefined,'GET','wordup:teacher-2')).status,404);
  }finally{h.close();}
});

test('cloud recycle bin is reversible and stale deletes do not hide newer content',async()=>{
  const h=sandbox();try{
    const value=await(await h.save(document())).json() as any,id=value.cloud.id;
    assert.equal((await h.request('/api/snapshots/'+id,{expectedRevision:0},'DELETE')).status,409);
    assert.equal((await h.request('/api/snapshots/'+id,{expectedRevision:1},'DELETE')).status,200);
    assert.equal((await h.request('/api/snapshots/'+id)).status,404);
    assert.equal((await(await h.request('/api/snapshots')).json() as any).snapshots.length,0);
    assert.equal((await(await h.request('/api/snapshots?deleted=1')).json() as any).snapshots[0].id,id);
    assert.equal((await h.request('/api/snapshots/'+id+'/restore',{expectedRevision:1},'POST','wordup:teacher-2')).status,404);
    assert.equal((await h.request('/api/snapshots/'+id+'/restore',{expectedRevision:1})).status,200);
    assert.equal((await h.request('/api/snapshots/'+id)).status,200);
    assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM teacher_snapshot_versions').get()!.n,1);
  }finally{h.close();}
});

test('snapshot publication is not implied by saving; invalid or foreign image references and active model work are rejected',async()=>{
  const h=sandbox();try{
    const foreign=await h.upload('wordup:teacher-2');assert.equal((await h.save(document(foreign.id))).status,400);
    const busy=document();busy.data.files[0].status='loading';const response=await h.save(busy);assert.equal(response.status,409);assert.equal((await response.json() as any).error.code,'snapshot_busy');
    const pending=document() as any;pending.data.files[0].cloudPendingJobId='synthetic-unreceived-job';assert.equal((await h.save(pending)).status,409);
    assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM teacher_snapshots').get()!.n,0);
  }finally{h.close();}
});

test('cloud listing paginates by stable metadata and storage failure leaves no successful document record',async()=>{
  const h=sandbox();try{
    h.storage(true);await assert.rejects(h.save(document()),/synthetic storage failure/);assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM teacher_snapshots').get()!.n,0);h.storage(false);
    for(let i=0;i<27;i++){const doc={...document(),id:'synthetic-history-'+i,name:'合成历史 '+i};assert.equal((await h.save(doc,0,'synthetic-operation-list-'+i)).status,201);}
    const first=await(await h.request('/api/snapshots')).json() as any;assert.equal(first.snapshots.length,25);assert(first.next);
    const second=await(await h.request('/api/snapshots?cursor='+encodeURIComponent(first.next))).json() as any;assert.equal(second.snapshots.length,2);assert.equal(new Set([...first.snapshots,...second.snapshots].map(s=>s.id)).size,27);
    assert.equal((await h.request('/api/snapshots?cursor=bad')).status,400);
    assert.equal((await(await h.request('/api/snapshots?q='+encodeURIComponent('合成历史 26'))).json() as any).snapshots.length,1);
  }finally{h.close();}
});
