import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {sqlD1} from './helpers/sql-d1';
import {handleCollection} from '../worker/collection';
import {handleSheets} from '../worker/sheets';
import {HttpError} from '../worker/errors';
import type {Env} from '../worker/index';
import type {TaskSession} from '../worker/tasks';
const taskId='10000000-0000-4000-8000-000000000001',memberIds=['20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002'];
async function sandbox(){
  const db=new DatabaseSync(':memory:');for(const f of fs.readdirSync('migrations').filter(n=>n.endsWith('.sql')).sort())db.exec(fs.readFileSync('migrations/'+f,'utf8'));
  const objects=new Map<string,unknown>();let revoked=false,changed=false;
  const session:TaskSession={principal:'wordup:teacher',provider:'wordup',subject:'teacher',role:'teacher',grant_id:'grant',classes:[{id:'class',name:'合成班',grade:'八年级',academicYear:'2026-1',schoolId:'school',version:1,grantVersion:1,scopes:['roster.read','writing.manage','writing.grade']}]};
  const env={DB:sqlD1(db),FILES:{get:async(key:string)=>objects.has(key)?{body:objects.get(key)}:null}} as unknown as Env;
  const bridge=async()=>({active:true,provider:'wordup',subject:changed?'other':session.subject,role:'teacher',classes:revoked?[]:session.classes});
  db.prepare("INSERT INTO writing_tasks VALUES(?,?,?,'open',2,1,'hash','key','rubric-hash','[]',NULL,2,1,1)").run(taskId,session.principal,'合成作文');
  memberIds.forEach((id,i)=>db.prepare("INSERT INTO task_members VALUES(?,?,1,'wordup',?,?,'class','合成班','school','2026-1','八年级',1,'active',1)").run(id,taskId,'student-'+i,'合成同名'));
  async function request(path:string,body?:any,who=session){const req=new Request('https://write.test'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});try{const r=(await handleCollection(req,env,who,bridge,r=>r.json())||await handleSheets(req,env,who,bridge,r=>r.json()))!;return {status:r.status,body:await r.json() as any};}catch(e){if(e instanceof HttpError)return {status:e.status,body:{error:e.message,code:e.code}};throw e;}}
  const issueInput=(count=2,expected:any[]=[])=>({requestId:crypto.randomUUID(),expectedRevision:2,draftNumber:1,pageCount:count,schoolLabel:'合成学校',members:memberIds.map((memberId,i)=>({memberId,expectedSetId:expected[i]?.id||'',tokens:Array.from({length:count},()=> 'WA1:'+Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url'))}))});
  const issue=await request('/api/tasks/'+taskId+'/sheets',issueInput());assert.equal(issue.status,201,JSON.stringify(issue));
  function asset(owner=session.principal){const id=crypto.randomUUID(),hash=id.replaceAll('-','').repeat(2),key='synthetic/'+id;db.prepare('INSERT INTO private_assets VALUES(?,?,?,?,?,?,1,1)').run(id,owner,key,hash,'image/png',10);objects.set(key,new Uint8Array([1,2,3]));return id;}
  const payload=(student=0,page=0)=>({action:'collect',mode:'qr',requestId:crypto.randomUUID(),sheetId:issue.body.sets[student].sheets[page].id,assetId:asset(),identityConfirmed:true,expectedPageRevision:0,fileName:'合成照片.png'});
  return {db,env,session,objects,request,issue,issueInput,asset,payload,flags:(v:any)=>{revoked=!!v.revoked;changed=!!v.changed;},close:()=>db.close()};
}
const path='/api/tasks/'+taskId+'/collection';
test('out-of-order pages become one verified draft; repeated requests and rescans do not duplicate pages, and inputs remain immutable',async()=>{
  const h=await sandbox();try{
    const page2=h.payload(0,1),first=await h.request(path,page2);assert.equal(first.status,201,JSON.stringify(first));assert.equal(first.body.complete,false);assert.equal(first.body.receivedPages,1);
    const page1=h.payload(0,0),r=await Promise.all([h.request(path,page1),h.request(path,page1)]);assert(r.every(v=>[200,201].includes(v.status)));assert(r.every(v=>v.body.complete&&v.body.receivedPages===2));
    const read=await h.request(path+'?memberId='+memberIds[0]);assert.equal(read.body.draft.inputRevision,2);assert.deepEqual(read.body.draft.manifest.pages.map((p:any)=>p.pageNumber),[1,2]);assert.equal(read.body.draft.manifest.identity.subject,'student-0');assert.equal(read.body.draft.manifest.rubricHash,'rubric-hash');
    const old=await h.request(path+'?memberId='+memberIds[0]+'&revision=1');assert.equal(old.body.draft.manifest.pages.length,1);assert.equal(old.body.draft.manifest.pages[0].pageNumber,2);assert.notEqual(old.body.draft.inputHash,read.body.draft.inputHash);
    const duplicate=await h.request(path,{...page1,requestId:crypto.randomUUID()});assert.equal(duplicate.body.duplicate,true);assert.equal(duplicate.body.inputRevision,2);
    assert.equal(h.db.prepare('SELECT COUNT(*) n FROM writing_submissions').get()!.n,1);assert.equal(h.db.prepare('SELECT COUNT(*) n FROM submission_page_versions').get()!.n,2);assert.equal(h.db.prepare('SELECT COUNT(*) n FROM writing_draft_inputs').get()!.n,2);
    assert.equal((await h.request(path,{...page1,fileName:'different'})).status,409);
  }finally{h.close();}
});
test('concurrent pages cannot overwrite each other, and a photo cannot silently belong to a second student or page',async()=>{
  const h=await sandbox();try{
    // Both requests must build from the same pre-transaction snapshot. Without
    // this barrier Linux can legitimately serialize their reads and accept both.
    const batch=h.env.DB.batch.bind(h.env.DB);let arrived=0,release!:()=>void;
    const ready=new Promise<void>(resolve=>{release=resolve;});
    h.env.DB.batch=async statements=>{if(++arrived===2)release();await ready;return batch(statements);};
    const a=h.payload(0,0),b=h.payload(0,1),r=await Promise.all([h.request(path,a),h.request(path,b)]);h.env.DB.batch=batch;
    assert.deepEqual(r.map(v=>v.status).sort(),[201,409]);assert.equal((await h.request(path,r[0].status===409?a:b)).status,201);
    const wrong=h.payload(1,0);wrong.assetId=a.assetId;assert.equal((await h.request(path,wrong)).body.code,'photo_already_assigned');
    const replace=h.payload(0,0);assert.equal((await h.request(path,replace)).body.code,'page_changed');
    replace.expectedPageRevision=1;const updated=await h.request(path,replace);assert.equal(updated.status,201);assert.equal(updated.body.inputRevision,3);assert.equal(updated.body.pageRevision,2);
    const stale=h.payload(0,0);stale.expectedPageRevision=1;assert.equal((await h.request(path,stale)).status,409);
    assert.equal(h.db.prepare('SELECT COUNT(*) n FROM writing_submissions').get()!.n,1);
  }finally{h.close();}
});
test('removing a mistaken page preserves its previous inputs and releases its current photo claim for an explicitly reviewed correction',async()=>{
  const h=await sandbox();try{
    const input=h.payload();await h.request(path,input);
    const removal={action:'remove',requestId:crypto.randomUUID(),memberId:memberIds[0],draftNumber:1,pageNumber:1,expectedPageRevision:1,reason:'纸面姓名核对后发现归属有误'};
    const removed=await h.request(path,removal);assert.equal(removed.status,201);assert.equal(removed.body.receivedPages,0);assert.equal(removed.body.complete,false);assert.equal((await h.request(path,removal)).body.inputRevision,2);
    const old=await h.request(path+'?memberId='+memberIds[0]+'&revision=1');assert.equal(old.body.draft.manifest.pages.length,1);assert.equal(old.body.draft.manifest.pages[0].assetId,input.assetId);
    const manual={action:'collect',mode:'manual',requestId:crypto.randomUUID(),memberId:memberIds[1],draftNumber:1,pageNumber:1,pageCount:2,assetId:input.assetId,detectedSheetId:input.sheetId,identityConfirmed:true,expectedPageRevision:0,identityNote:'学生拿错了同名同学的写作单，已核对本人纸面签名'};
    assert.equal((await h.request(path,manual)).status,201);const read=await h.request(path+'?memberId='+memberIds[1]);assert.equal(read.body.draft.manifest.identity.subject,'student-1');assert.equal(read.body.draft.manifest.pages[0].detectedSheetId,input.sheetId);assert.equal(read.body.draft.manifest.pages[0].identityMethod,'manual');
    assert.equal(h.db.prepare('SELECT COUNT(*) n FROM submission_page_versions').get()!.n,2);assert.equal(h.db.prepare('SELECT COUNT(*) n FROM writing_draft_inputs').get()!.n,3);
    assert.equal((await h.request(path,{...removal,requestId:crypto.randomUUID(),expectedPageRevision:0})).status,404);
  }finally{h.close();}
});
test('photo ownership, explicit identity confirmation, live role and class grants, task state and actual object presence are enforced',async()=>{
  const h=await sandbox();try{
    const p=h.payload();assert.equal((await h.request(path,{...p,identityConfirmed:false})).status,400);
    assert.equal((await h.request(path,{...p,assetId:h.asset('wordup:other')})).status,404);
    assert.equal((await h.request(path,p,{...h.session,principal:'wordup:other'})).status,404);assert.equal((await h.request(path,p,{...h.session,role:'student'})).status,403);
    h.flags({revoked:true});assert.equal((await h.request(path,p)).status,403);h.flags({changed:true});assert.equal((await h.request(path,p)).status,401);h.flags({});
    const missing=h.payload();const row=h.db.prepare('SELECT object_key FROM private_assets WHERE id=?').get(missing.assetId)!;h.objects.delete(String(row.object_key));assert.equal((await h.request(path,missing)).status,503);
    assert.equal(h.db.prepare('SELECT COUNT(*) n FROM writing_submissions').get()!.n,0);
    assert.equal((await h.request(path,p)).status,201);h.db.prepare("UPDATE writing_tasks SET status='closed' WHERE id=?").run(taskId);
    assert.equal((await h.request(path,p)).status,200);assert.equal((await h.request(path,h.payload(0,1))).status,409);
    assert.equal((await h.request(path+'?memberId='+memberIds[0],undefined,{...h.session,classes:[]})).status,403);
  }finally{h.close();}
});
test('collected page counts cannot be changed by reprinting, and a late upload from a revoked sheet cannot alter the draft',async()=>{
  const h=await sandbox();try{
    const p=h.payload();await h.request(path,p);
    assert.equal((await h.request('/api/tasks/'+taskId+'/sheets',h.issueInput(1,h.issue.body.sets))).status,409);
    const reissued=await h.request('/api/tasks/'+taskId+'/sheets',h.issueInput(2,h.issue.body.sets));assert.equal(reissued.status,201);
    assert.equal((await h.request(path,h.payload(0,1))).status,410);assert.equal((await h.request(path,p)).status,200);
    const page=h.payload(0,1);page.sheetId=reissued.body.sets[0].sheets[1].id;assert.equal((await h.request(path,page)).body.complete,true);
    assert.equal((await h.request(path+'?memberId='+memberIds[0]+'&revision=1')).body.draft.manifest.pages[0].sheetId,p.sheetId);
  }finally{h.close();}
});
test('manual sheets require an explicit member and explanation; QR membership fields cannot be spoofed and list pagination retains same-name identities',async()=>{
  const h=await sandbox();try{
    const p=h.payload(),forged={...p,memberId:memberIds[1],draftNumber:2,pageNumber:4,pageCount:4};const result=await h.request(path,forged);assert.equal(result.status,201);assert.equal(result.body.memberId,memberIds[0]);assert.equal(result.body.pageNumber,1);assert.equal(result.body.draftNumber,1);
    const manual={action:'collect',mode:'manual',requestId:crypto.randomUUID(),memberId:memberIds[1],draftNumber:2,pageNumber:1,pageCount:1,assetId:h.asset(),identityConfirmed:true,expectedPageRevision:0};assert.equal((await h.request(path,manual)).status,400);
    assert.equal((await h.request(path,{...manual,identityNote:'无二维码空白写作纸，已对照任务名单核对学生本人'})).status,201);
    const insert=h.db.prepare("INSERT INTO task_members VALUES(?,?,1,'wordup',?,?,'class','合成班','school','2026-1','八年级',1,'active',1)");for(let i=2;i<130;i++)insert.run(crypto.randomUUID(),taskId,'extra-'+i,'合成同学'+i);
    const hiddenId=crypto.randomUUID();h.db.prepare("INSERT INTO task_members VALUES(?,?,1,'wordup','hidden-student','无权看到的合成同学','other-class','另一班','school','2026-1','八年级',1,'active',1)").run(hiddenId,taskId);
    assert.equal((await h.request(path+'?memberId='+hiddenId)).status,403);
    const first=await h.request(path),second=await h.request(path+'?after='+first.body.next);assert.equal(first.body.members.length,100);assert.equal(second.body.members.length,30);assert.equal(second.body.next,null);
    const all=[...first.body.members,...second.body.members];assert(!all.some((m:any)=>m.id===hiddenId));assert.equal(all.filter((m:any)=>m.name==='合成同名').length,2);assert.equal(all.find((m:any)=>m.id===memberIds[0]).receivedPages,1);
  }finally{h.close();}
});
