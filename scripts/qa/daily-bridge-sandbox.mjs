// Loopback-only synthetic authority for Wrangler/browser integration QA.
// Never import this fixture into Daily or deploy it with the Worker.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {createWritingBridge} from '../../integrations/daily/src/writing-bridge.mjs';
import {createWritingDirectory} from '../../integrations/daily/src/writing-directory.mjs';

const origin='http://127.0.0.1:8890',db=new DatabaseSync(':memory:');
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/teacher-workflow.json',import.meta.url),'utf8'));
let modelCalls=0;
const source=async req=>{
  const cookies=req.headers.cookie?.split(';').map(s=>s.trim()) || [];
  const mode=['student0','student1','admin','other','teacher'].find(value=>cookies.includes('wordup_session=synthetic-browser-'+value));
  if(!mode)throw Object.assign(new Error('请登录合成测试账号。'),{status:401});
  if(mode.startsWith('student'))return {provider:'wordup',subject:mode==='student0'?'synthetic-student-000':'synthetic-student-001',role:'student',name:'合成同名',accountType:'school',isGuest:false,expires:Date.now()+3600000,source:{cookie:'wordup_session=synthetic-browser-'+mode}};
  return {provider:'wordup',subject:mode==='admin'?'synthetic-admin':mode==='other'?'synthetic-other':'synthetic-teacher',role:mode==='admin'?'admin':'teacher',name:mode==='admin'?'合成学校管理员':mode==='other'?'另一位合成教师':'合成测试教师',expires:Date.now()+3600000,source:{cookie:'wordup_session=synthetic-browser-'+mode}};
};
const students=Array.from({length:130},(_,i)=>({subject:'synthetic-student-'+String(i).padStart(3,'0'),name:i<2?'合成同名':i===2?'示例同学':'合成同学'+i,grade:'七年级'}));
const authorityStudents=[...students.map(s=>({id:s.subject,name:s.name,grade:s.grade,class_name:'合成学校班',status:'active'})),...Array.from({length:3},(_,i)=>({id:'synthetic-new-'+i,name:'新增合成同学'+i,grade:'八年级',class_name:'合成新增班',status:'active'}))];
const authorityTeachers=[{id:'synthetic-teacher',name:'合成测试教师',status:'active'},{id:'synthetic-other',name:'另一位合成教师',status:'active'}];
const directoryService=createWritingDirectory({db,defaults:{schoolName:'',academicYear:''},readAuthority:()=>structuredClone({students:authorityStudents,teachers:authorityTeachers})});
const bridge=createWritingBridge({db,publicOrigin:origin,serviceToken:'synthetic-local-worker-bridge-service-token',storageKey:'synthetic-local-Daily-only-storage-key',callbacks:['http://127.0.0.1:8789/api/auth/callback'],resolveIdentity:source,verifySource:value=>source({headers:{cookie:value.cookie}}),directory:directoryService,readRoster:({classId,after='',limit=100})=>{
  const classroom=db.prepare('SELECT * FROM writing_classes WHERE id=?').get(classId),members=new Set(db.prepare("SELECT subject FROM writing_memberships WHERE class_id=? AND status='active' AND ended IS NULL").all(classId).map(m=>m.subject));
  const all=authorityStudents.filter(s=>s.class_name===classroom.source_name&&s.grade===classroom.grade&&members.has(s.id)).map(s=>({subject:s.id,name:s.name,grade:s.grade})).sort((a,b)=>a.subject<b.subject?-1:1);
  const remaining=all.filter(s=>s.subject>after),page=remaining.slice(0,limit);
  return {students:page,snapshotHash:crypto.createHash('sha256').update(JSON.stringify(all)).digest('hex'),next:remaining.length>limit?page.at(-1).subject:null};
}});
// Initialize and seed only this in-memory QA directory. Never targets Daily DB.
await bridge.handle({method:'GET',headers:{}},{writeHead(){},end(){}},new URL(origin+'/api/integrations/writeascend/synthetic-initialize'));
db.exec(`INSERT INTO writing_schools VALUES('synthetic-school','合成测试学校','active');
  INSERT INTO writing_classes VALUES('synthetic-school-class','synthetic-school','合成学年（仅测试）','合成学校班','合成学校班','七年级','active',1);
  INSERT INTO writing_teacher_class_grants VALUES('wordup','synthetic-teacher','synthetic-school-class','["roster.read","writing.manage","writing.grade","writing.publish"]',1,0);`);
for(const s of students)db.prepare('INSERT INTO writing_memberships(class_id,provider,subject,started) VALUES(?,?,?,?)').run('synthetic-school-class','wordup',s.subject,'synthetic-initial');
const directory=path.resolve(import.meta.dirname,'../../integrations/daily/public');
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,origin);
  res.setHeader('X-Test-Sandbox','synthetic-only');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'");
  if(url.pathname==='/sandbox/metrics'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({modelCalls}));return;}
  if(['/sandbox/use-other','/sandbox/use-admin','/sandbox/use-teacher','/sandbox/use-student0','/sandbox/use-student1'].includes(url.pathname)){const mode=url.pathname.slice('/sandbox/use-'.length);res.setHeader('Set-Cookie','wordup_session=synthetic-browser-'+mode+'; Path=/; HttpOnly; SameSite=Lax');res.writeHead(200).end('Synthetic account switched.');return;}
  if(url.pathname==='/v1/chat/completions'&&req.method==='POST'){
    if(req.headers.authorization!=='Bearer synthetic-local-model-key'){res.writeHead(401).end();return;}
    let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>20*1024*1024){res.writeHead(413).end();return;}}
    const body=JSON.parse(raw);
    if(body.model!=='synthetic-server-model'){res.writeHead(400).end();return;}
    modelCalls++;
    await new Promise(resolve=>setTimeout(resolve,Number(process.env.SANDBOX_MODEL_DELAY_MS)||8000));
    if(body.messages?.some(m=>typeof m.content==='string'&&m.content.startsWith('WA_VISION_CHECK_V1.'))){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{message:{content:JSON.stringify({visible_text:'7M42'})}}]}));return;}
    if(body.messages?.some(m=>typeof m.content==='string'&&m.content.startsWith('WA_IDENTITY_OCR_V1.'))){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{message:{content:JSON.stringify({name:'示例同学',className:'合成学校班',studentNumber:'',multipleStudents:false})}}]}));return;}
    const response=structuredClone(fixture.response);
    if(process.env.SANDBOX_MODEL_STUDENT_NAME){const result=JSON.parse(response.choices[0].message.content);result.student_name=process.env.SANDBOX_MODEL_STUDENT_NAME;response.choices[0].message.content=JSON.stringify(result);}
    res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(response));return;
  }
  if(await bridge.handle(req,res,url))return;
  const assets={'/writing-connect.html':['writing-connect.html','text/html; charset=utf-8'],'/writing-connect.mjs':['writing-connect.mjs','text/javascript'],'/writing-connect.css':['writing-connect.css','text/css']};
  const asset=assets[url.pathname];
  if(!asset){res.writeHead(404).end();return;}
  if(url.pathname==='/writing-connect.html'&&!req.headers.cookie?.includes('wordup_session='))res.setHeader('Set-Cookie','wordup_session=synthetic-browser-teacher; Path=/; HttpOnly; SameSite=Lax');
  res.writeHead(200,{'Content-Type':asset[1]});res.end(fs.readFileSync(path.join(directory,asset[0])));
});
server.listen(8890,'127.0.0.1',()=>console.log('Synthetic Daily bridge sandbox: '+origin));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>{db.close();process.exit(0);}));
