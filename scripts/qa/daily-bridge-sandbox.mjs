// Loopback-only synthetic authority for Wrangler/browser integration QA.
// Never import this fixture into Daily or deploy it with the Worker.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {EventEmitter} from 'node:events';
import {createWritingPeerBridge} from '../../integrations/daily/src/writing-peer-bridge.mjs';
import {createWritingBridge} from '../../integrations/daily/src/writing-bridge.mjs';
import {createWritingDirectory} from '../../integrations/daily/src/writing-directory.mjs';

const origin='http://127.0.0.1:8890',db=new DatabaseSync(':memory:');
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/teacher-workflow.json',import.meta.url),'utf8'));
let modelCalls=0;const credentialCalls={system:0,personalA:0,personalB:0};let forceExtraRewrite=false,holdWorkChecks=false,heldWorkChecks=0,failRevoke=false;const workWaiters=[];let feedbackUnavailable=false,dropNextFeedbackResponse=false,peerUnavailable=false;
const source=async req=>{
  const cookies=req.headers.cookie?.split(';').map(s=>s.trim()) || [];
  const mode=['guest','student0','student1','admin','other','teacher'].find(value=>cookies.includes('wordup_session=synthetic-browser-'+value));
  if(!mode)throw Object.assign(new Error('请登录合成测试账号。'),{status:401});
  if(mode==='teacher'&&!authorityTeachers.some(t=>t.id==='synthetic-teacher'&&t.status==='active'))throw Object.assign(Error('Synthetic teacher disabled'),{status:401});
  if(mode.startsWith('student')&&!authorityStudents.some(s=>s.id===(mode==='student0'?'synthetic-student-000':'synthetic-student-001')&&s.status==='active'))throw Object.assign(Error('Synthetic student disabled'),{status:401});
  if(mode==='guest')return {provider:'wordup',subject:'synthetic-guest',role:'student',name:'合成访客',accountType:'public',isGuest:true,expires:Date.now()+3600000,source:{cookie:'wordup_session=synthetic-browser-guest'}};
  if(mode.startsWith('student'))return {provider:'wordup',subject:mode==='student0'?'synthetic-student-000':'synthetic-student-001',role:'student',name:'合成同名',accountType:'school',isGuest:false,expires:Date.now()+3600000,source:{cookie:'wordup_session=synthetic-browser-'+mode}};
  return {provider:'wordup',subject:mode==='admin'?'synthetic-admin':mode==='other'?'synthetic-other':'synthetic-teacher',role:mode==='admin'?'admin':'teacher',name:mode==='admin'?'合成学校管理员':mode==='other'?'另一位合成教师':'合成测试教师',expires:Date.now()+3600000,source:{cookie:'wordup_session=synthetic-browser-'+mode}};
};
const students=Array.from({length:130},(_,i)=>({subject:'synthetic-student-'+String(i).padStart(3,'0'),name:i<2?'合成同名':i===2?'示例同学':'合成同学'+i,grade:'七年级'}));
const authorityStudents=[...students.map(s=>({id:s.subject,name:s.name,grade:s.grade,class_name:'合成学校班',status:'active'})),...Array.from({length:3},(_,i)=>({id:'synthetic-new-'+i,name:'新增合成同学'+i,grade:'八年级',class_name:'合成新增班',status:'active'}))];
const authorityTeachers=[{id:'synthetic-teacher',name:'合成测试教师',status:'active'},{id:'synthetic-other',name:'另一位合成教师',status:'active'}];
const directoryService=createWritingDirectory({db,defaults:{schoolName:'',academicYear:''},readAuthority:()=>structuredClone({students:authorityStudents,teachers:authorityTeachers})});
const rosterAdapter=({classId,after='',limit=100})=>{
  const classroom=db.prepare('SELECT * FROM writing_classes WHERE id=?').get(classId),members=new Set(db.prepare("SELECT subject FROM writing_memberships WHERE class_id=? AND status='active' AND ended IS NULL").all(classId).map(m=>m.subject));
  const all=authorityStudents.filter(s=>s.status==='active'&&s.class_name===classroom.source_name&&s.grade===classroom.grade&&members.has(s.id)).map(s=>({subject:s.id,name:s.name,grade:s.grade})).sort((a,b)=>a.subject<b.subject?-1:1);
  const remaining=all.filter(s=>s.subject>after),page=remaining.slice(0,limit);
  return {students:page,snapshotHash:crypto.createHash('sha256').update(JSON.stringify(all)).digest('hex'),next:remaining.length>limit?page.at(-1).subject:null};
};
const bridge=createWritingBridge({db,publicOrigin:origin,serviceToken:'synthetic-local-worker-bridge-service-token',storageKey:'synthetic-local-Daily-only-storage-key',callbacks:['http://127.0.0.1:8789/api/auth/callback'],resolveIdentity:source,verifySource:value=>source({headers:{cookie:value.cookie}}),directory:directoryService,readRoster:rosterAdapter});
const peerBridge=createWritingPeerBridge({db,publicOrigin:origin,serviceToken:'synthetic-local-peer-bridge-service-token',storageKey:'synthetic-local-peer-source-storage-key',gradingServiceToken:'synthetic-local-worker-bridge-service-token',callbacks:['http://127.0.0.1:8793/api/auth/callback'],resolveIdentity:source,verifySource:value=>source({headers:{cookie:value.cookie}}),readTeacher:subject=>authorityTeachers.find(t=>t.id===subject)||null,readRoster:rosterAdapter});
// Initialize and seed only this in-memory QA directory. Never targets Daily DB.
await bridge.handle({method:'GET',headers:{}},{writeHead(){},end(){}},new URL(origin+'/api/integrations/writeascend/synthetic-initialize'));
db.exec(`INSERT INTO writing_schools VALUES('synthetic-school','合成测试学校','active');
  INSERT INTO writing_classes VALUES('synthetic-school-class','synthetic-school','合成学年（仅测试）','合成学校班','合成学校班','七年级','active',1);
  INSERT INTO writing_teacher_class_grants VALUES('wordup','synthetic-teacher','synthetic-school-class','["roster.read","writing.manage","writing.grade","writing.publish"]',1,0);`);
for(const s of students)db.prepare('INSERT INTO writing_memberships(class_id,provider,subject,started) VALUES(?,?,?,?)').run('synthetic-school-class','wordup',s.subject,'synthetic-initial');
// Optional empty synthetic classes for checking a full-school mobile selector.
const extraClasses=Number(process.env.SANDBOX_EXTRA_CLASSES||0);
if(!Number.isInteger(extraClasses)||extraClasses<0||extraClasses>100)throw Error('SANDBOX_EXTRA_CLASSES must be 0–100.');
for(let i=0;i<extraClasses;i++){
  const id='synthetic-selector-'+i,name='合成'+(701+i)+'班';
  db.prepare("INSERT INTO writing_classes VALUES(?,'synthetic-school','2026-1',?,?,'七年级','active',1)").run(id,name,name);
  db.prepare("INSERT INTO writing_teacher_class_grants VALUES('wordup','synthetic-teacher',?,'[\"roster.read\",\"writing.manage\",\"writing.grade\",\"writing.publish\"]',1,0)").run(id);
}
const directory=path.resolve(import.meta.dirname,'../../integrations/daily/public');
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,origin);
  res.setHeader('X-Test-Sandbox','synthetic-only');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'");
  if(url.pathname==='/sandbox/peer-control'&&req.method==='POST'){let raw='';for await(const chunk of req)raw+=chunk;const v=JSON.parse(raw||'{}');if(v.teacherActive!==undefined)authorityTeachers.find(t=>t.id==='synthetic-teacher').status=v.teacherActive?'active':'inactive';if(v.studentOneActive!==undefined)authorityStudents.find(s=>s.id==='synthetic-student-001').status=v.studentOneActive?'active':'inactive';if(v.unavailable!==undefined)peerUnavailable=v.unavailable===true;if(v.expireInteractive&&db.prepare("SELECT 1 FROM sqlite_schema WHERE name='writing_peer_grants'").get())db.exec('UPDATE writing_peer_grants SET expires=0');res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({ok:true}));return;}
  if(url.pathname.startsWith('/api/integrations/writing-peer/')&&peerUnavailable){res.writeHead(503,{'Content-Type':'application/json'}).end(JSON.stringify({error:{message:'Synthetic peer identity check unavailable'}}));return;}
  if(url.pathname==='/sandbox/peer-source-logout'&&req.method==='POST'){const response=Object.assign(new EventEmitter(),{statusCode:200}),request={method:'POST',headers:{cookie:req.headers.cookie||'',origin}};peerBridge.observeAuthChange(request,response,new URL(origin+'/api/v1/auth/logout'));bridge.observeAuthChange(request,response,new URL(origin+'/api/v1/auth/logout'));response.emit('finish');res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({ok:true}));return;}
  if(url.pathname==='/sandbox/work-control'&&req.method==='POST'){
    let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>2048){res.writeHead(413).end();return;}}const value=JSON.parse(raw||'{}');
    if(value.holdWorkChecks!==undefined){holdWorkChecks=value.holdWorkChecks===true;if(!holdWorkChecks)for(const release of workWaiters.splice(0))release();}
    if(value.failRevoke!==undefined)failRevoke=value.failRevoke===true;
    if(value.expireInteractive)db.exec('UPDATE writing_bridge_grants SET expires=0');
    if(value.forceExtraRewrite!==undefined)forceExtraRewrite=value.forceExtraRewrite===true;
    if(value.revokeTeacherClass)db.exec("UPDATE writing_teacher_class_grants SET revoked=1,version=version+1 WHERE subject='synthetic-teacher'");
    if(value.restoreTeacherClass)db.exec("UPDATE writing_teacher_class_grants SET revoked=0,version=version+1 WHERE subject='synthetic-teacher'");
    if(value.releaseWork){holdWorkChecks=false;for(const release of workWaiters.splice(0))release();}
    res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({ok:true}));return;
  }
  if(url.pathname==='/sandbox/feedback-control'&&req.method==='POST'){
    let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>2048){res.writeHead(413).end();return;}}
    const value=JSON.parse(raw||'{}');feedbackUnavailable=value.unavailable===true;dropNextFeedbackResponse=value.dropNextResponse===true;
    if(value.resetFeedback)for(const table of ['writing_feedback_heads','writing_feedback_events'])if(db.prepare("SELECT 1 FROM sqlite_schema WHERE name=?").get(table))db.exec('DELETE FROM '+table);
    res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({ok:true}));return;
  }
  if(url.pathname==='/sandbox/home'){res.writeHead(200,{'Content-Type':'text/html'}).end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script type="module" src="/writing-entry.mjs"></script></head><body><h1>既有 Daily 页面</h1><a data-writing-entry hidden style="display:none" href="/writing-feedback.html">作文反馈</a></body></html>');return;}
  if(['/api/integrations/writeascend/revoke','/api/integrations/writing-peer/revoke'].includes(url.pathname)&&failRevoke){res.writeHead(503,{'Content-Type':'application/json'}).end(JSON.stringify({error:{message:'Synthetic revoke connection unavailable'}}));return;}
  if(url.pathname==='/api/integrations/writeascend/work/introspect'&&holdWorkChecks){heldWorkChecks++;await new Promise(resolve=>workWaiters.push(resolve));}
  if(url.pathname.startsWith('/api/integrations/writeascend/report-events')&&feedbackUnavailable){res.writeHead(503,{'Content-Type':'application/json'}).end(JSON.stringify({error:{message:'合成同步中断'}}));return;}
  if(url.pathname==='/api/integrations/writeascend/report-events'&&dropNextFeedbackResponse){dropNextFeedbackResponse=false;await bridge.handle(req,{writeHead(){},end(){res.destroy();}},url);return;}
  if(url.pathname==='/sandbox/metrics'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({modelCalls,credentialCalls,heldWorkChecks,workPermits:db.prepare("SELECT 1 FROM sqlite_schema WHERE name='writing_work_permits'").get()?db.prepare('SELECT COUNT(*) n FROM writing_work_permits').get().n:0,interactiveGrants:db.prepare('SELECT COUNT(*) n FROM writing_bridge_grants WHERE expires>? AND revoked=0').get(Date.now()).n,feedbackEvents:db.prepare("SELECT 1 FROM sqlite_schema WHERE name='writing_feedback_events'").get()?db.prepare('SELECT COUNT(*) n FROM writing_feedback_events WHERE (? IS NULL OR draft_id=?)').get(url.searchParams.get('draftId'),url.searchParams.get('draftId')).n:0}));return;}
  if(['/sandbox/use-other','/sandbox/use-admin','/sandbox/use-teacher','/sandbox/use-student0','/sandbox/use-student1','/sandbox/use-guest'].includes(url.pathname)){const mode=url.pathname.slice('/sandbox/use-'.length);res.setHeader('Set-Cookie','wordup_session=synthetic-browser-'+mode+'; Path=/; HttpOnly; SameSite=Lax');res.writeHead(200).end('Synthetic account switched.');return;}
  if(url.pathname==='/v1/chat/completions'&&req.method==='POST'){
    if(!['Bearer synthetic-local-model-key','Bearer synthetic-personal-model-key-A','Bearer synthetic-personal-model-key-B'].includes(req.headers.authorization)){res.writeHead(401).end();return;}
    let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>20*1024*1024){res.writeHead(413).end();return;}}
    const body=JSON.parse(raw);
    if(body.model!=='synthetic-server-model'){res.writeHead(400).end();return;}
    modelCalls++;credentialCalls[req.headers.authorization==='Bearer synthetic-local-model-key'?'system':req.headers.authorization==='Bearer synthetic-personal-model-key-A'?'personalA':'personalB']++;
    await new Promise(resolve=>setTimeout(resolve,Number(process.env.SANDBOX_MODEL_DELAY_MS)||8000));
    if(body.messages?.some(m=>typeof m.content==='string'&&m.content.startsWith('WA_VISION_CHECK_V1.'))){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{message:{content:JSON.stringify({visible_text:'7M42'})}}]}));return;}
    if(body.messages?.some(m=>typeof m.content==='string'&&m.content.startsWith('WA_IDENTITY_OCR_V1.'))){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{message:{content:JSON.stringify({name:'示例同学',className:'合成学校班',studentNumber:'',multipleStudents:false})}}]}));return;}
    const response=structuredClone(fixture.response);if(forceExtraRewrite){forceExtraRewrite=false;const result=JSON.parse(response.choices[0].message.content);result.optimized_essay=fixture.seed.assignment.modelEssay;response.choices[0].message.content=JSON.stringify(result);}
    if(process.env.SANDBOX_MODEL_STUDENT_NAME){const result=JSON.parse(response.choices[0].message.content);result.student_name=process.env.SANDBOX_MODEL_STUDENT_NAME;response.choices[0].message.content=JSON.stringify(result);}
    res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(response));return;
  }
  if(await peerBridge.handle(req,res,url))return;
  if(await bridge.handle(req,res,url))return;
  const assets={'/writing-peer-connect.html':['writing-peer-connect.html','text/html; charset=utf-8'],'/writing-peer-connect.mjs':['writing-peer-connect.mjs','text/javascript'],'/writing-feedback.html':['writing-feedback.html','text/html; charset=utf-8'],'/writing-feedback.mjs':['writing-feedback.mjs','text/javascript'],'/writing-feedback.css':['writing-feedback.css','text/css'],'/writing-entry.mjs':['writing-entry.mjs','text/javascript'],'/writing-connect.html':['writing-connect.html','text/html; charset=utf-8'],'/writing-connect.mjs':['writing-connect.mjs','text/javascript'],'/writing-connect.css':['writing-connect.css','text/css']};
  const asset=assets[url.pathname];
  if(!asset){res.writeHead(404).end();return;}
  if(url.pathname==='/writing-connect.html'&&!req.headers.cookie?.includes('wordup_session='))res.setHeader('Set-Cookie','wordup_session=synthetic-browser-teacher; Path=/; HttpOnly; SameSite=Lax');
  res.writeHead(200,{'Content-Type':asset[1]});res.end(fs.readFileSync(path.join(directory,asset[0])));
});
server.listen(8890,'127.0.0.1',()=>console.log('Synthetic Daily bridge sandbox: '+origin));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>{db.close();process.exit(0);}));
