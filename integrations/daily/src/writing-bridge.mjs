import crypto from 'node:crypto';
import {createWritingDirectory} from './writing-directory.mjs';

const prefix = '/api/integrations/writeascend/';
const permissions = ['roster.read', 'writing.manage', 'writing.grade', 'writing.publish'];
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const random = () => crypto.randomBytes(32).toString('base64url');
const fail = (status, message) => { throw Object.assign(new Error(message), {status}); };
const send = (res, status, value) => {
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer', 'X-Content-Type-Options':'nosniff'});
  res.end(JSON.stringify(value));
};
async function input(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) fail(415, '请提交 JSON。');
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16384) fail(413, '请求内容过长。');
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error();
    return value;
  } catch { fail(400, '请求格式不正确。'); }
}

// No WordUp signing key is copied here. Identity verification stays in Daily's
// existing session verifier; only the resulting source reference is sealed locally.
export function createWritingBridge({db, publicOrigin, serviceToken = '', storageKey = '', callbacks = /** @type {string[]} */ ([]), resolveIdentity, verifySource, readRoster = /** @type {Function | null} */ (null), directory=createWritingDirectory({db}), now = Date.now}) {
  const allowed = new Set(callbacks);
  const enabled = serviceToken.length >= 32 && storageKey.length >= 32 && allowed.size > 0;
  const key = crypto.createHash('sha256').update('writing-bridge-source-v1:' + storageKey).digest();
  let initialized = false;
  function initialize() {
    if (initialized) return;
    db.exec(`
      CREATE TABLE IF NOT EXISTS writing_schools(id TEXT PRIMARY KEY,name TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'active');
      CREATE TABLE IF NOT EXISTS writing_classes(id TEXT PRIMARY KEY,school_id TEXT NOT NULL REFERENCES writing_schools(id),academic_year TEXT NOT NULL,name TEXT NOT NULL,source_name TEXT NOT NULL,grade TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'active',version INTEGER NOT NULL DEFAULT 1,UNIQUE(school_id,academic_year,source_name));
      CREATE TABLE IF NOT EXISTS writing_memberships(id INTEGER PRIMARY KEY,class_id TEXT NOT NULL REFERENCES writing_classes(id),provider TEXT NOT NULL,subject TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'active',started TEXT NOT NULL,ended TEXT,UNIQUE(class_id,provider,subject));
      CREATE TABLE IF NOT EXISTS writing_teacher_class_grants(provider TEXT NOT NULL,subject TEXT NOT NULL,class_id TEXT NOT NULL REFERENCES writing_classes(id),scopes TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,revoked INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(provider,subject,class_id));
      CREATE TABLE IF NOT EXISTS writing_bridge_grants(id TEXT PRIMARY KEY,client_id TEXT NOT NULL,provider TEXT NOT NULL,subject TEXT NOT NULL,role TEXT NOT NULL,source_hash TEXT NOT NULL,source_sealed TEXT NOT NULL,expires INTEGER NOT NULL,revoked INTEGER NOT NULL DEFAULT 0,created INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS writing_bridge_source ON writing_bridge_grants(source_hash,revoked);
      CREATE TABLE IF NOT EXISTS writing_bridge_codes(code_hash TEXT PRIMARY KEY,grant_id TEXT NOT NULL REFERENCES writing_bridge_grants(id) ON DELETE CASCADE,client_id TEXT NOT NULL,redirect_uri TEXT NOT NULL,challenge TEXT NOT NULL,expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS writing_bridge_audit(id INTEGER PRIMARY KEY,provider TEXT NOT NULL,subject TEXT NOT NULL,action TEXT NOT NULL,grant_id TEXT NOT NULL,created INTEGER NOT NULL);
    `);
    initialized = true;
  }
  function seal(source) {
    const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(source), 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
  }
  function unseal(value) {
    try {
      const bytes = Buffer.from(value, 'base64url'), decipher = crypto.createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
      decipher.setAuthTag(bytes.subarray(12, 28));
      return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'));
    } catch { fail(401, '授权已失效，请重新登录。'); }
  }
  function audit(identity, action, grantId) {
    db.prepare('INSERT INTO writing_bridge_audit(provider,subject,action,grant_id,created) VALUES(?,?,?,?,?)').run(identity.provider, identity.subject, action, grantId, now());
  }
  function validateIdentity(identity) {
    if (!identity || !['wordup','daily_legacy_admin'].includes(identity.provider) || typeof identity.subject !== 'string' || !identity.subject || !['admin','teacher','student'].includes(identity.role) || !Number.isFinite(identity.expires) || identity.expires <= now()) fail(401, '请先登录 Daily。');
    if (identity.role === 'student' && (identity.accountType !== 'school' || identity.isGuest)) fail(403, '当前账号尚未绑定学校班级，请联系教师。');
    return identity;
  }
  function authorizeParameters(body) {
    if (body.client_id !== 'writeascend' || !allowed.has(body.redirect_uri) || typeof body.code_challenge !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(body.code_challenge) || body.code_challenge_method !== 'S256' || typeof body.state !== 'string' || !/^[A-Za-z0-9_-]{32,256}$/.test(body.state)) fail(400, '登录请求无效，请从作文系统重新进入。');
    return body;
  }
  function sameOrigin(req) {
    if (req.headers.origin !== publicOrigin || req.headers['sec-fetch-site'] === 'cross-site') fail(403, '请从 Daily 页面进行操作。');
  }
  function machine(req) {
    const value = req.headers.authorization || '';
    if (!crypto.timingSafeEqual(Buffer.from(hash(value)), Buffer.from(hash('Bearer ' + serviceToken)))) fail(401, '服务认证失败。');
  }
  function classesFor(identity) {
    if (identity.role === 'admin') return db.prepare("SELECT c.*,1 AS grant_version FROM writing_classes c JOIN writing_schools s ON s.id=c.school_id WHERE c.status='active' AND s.status='active'").all().map(c => ({...c,scopes:permissions}));
    if (identity.role === 'teacher') return db.prepare("SELECT c.*,g.scopes,g.version AS grant_version FROM writing_teacher_class_grants g JOIN writing_classes c ON c.id=g.class_id JOIN writing_schools s ON s.id=c.school_id WHERE g.provider=? AND g.subject=? AND g.revoked=0 AND c.status='active' AND s.status='active'").all(identity.provider,identity.subject).map(c => {
      let scopes; try {scopes=JSON.parse(c.scopes);} catch {scopes=[];}
      return {...c,scopes:Array.isArray(scopes)?scopes.filter(s=>permissions.includes(s)):[]};
    });
    return db.prepare("SELECT c.*,1 AS grant_version FROM writing_memberships m JOIN writing_classes c ON c.id=m.class_id JOIN writing_schools s ON s.id=c.school_id WHERE m.provider=? AND m.subject=? AND m.status='active' AND m.ended IS NULL AND c.status='active' AND s.status='active'").all(identity.provider,identity.subject).map(c=>({...c,scopes:['writing.own']}));
  }
  function projection(row, identity) {
    const classes = classesFor(identity).map(c=>({id:c.id,schoolId:c.school_id,academicYear:c.academic_year,name:c.name,grade:c.grade,version:c.version,grantVersion:c.grant_version,scopes:c.scopes}));
    const scopes = [...new Set([...(identity.role === 'student' ? ['writing.own'] : ['writing.personal']),...classes.flatMap(c=>c.scopes)])];
    return {active:true,provider:identity.provider,subject:identity.subject,role:identity.role,name:identity.name || '',grantId:row.id,expires:Math.min(row.expires,identity.expires),scopes,classes};
  }
  async function inspect(grantId) {
    if (typeof grantId !== 'string') fail(401, '授权已失效，请重新登录。');
    const row = db.prepare('SELECT * FROM writing_bridge_grants WHERE id=? AND client_id=? AND revoked=0 AND expires>?').get(grantId,'writeascend',now());
    if (!row) fail(401, '授权已失效，请重新登录。');
    let identity;
    try {identity=validateIdentity(await verifySource(unseal(row.source_sealed)));}
    catch (error) {
      if (error.status === 401 || error.status === 403) db.prepare('UPDATE writing_bridge_grants SET revoked=1 WHERE id=?').run(row.id);
      throw error;
    }
    if (row.provider !== identity.provider || row.subject !== identity.subject || row.role !== identity.role) {
      db.prepare('UPDATE writing_bridge_grants SET revoked=1 WHERE id=?').run(row.id);
      fail(401, '账号身份已变化，请重新登录。');
    }
    // A logout may finish while the upstream session verifier is in flight.
    if (!db.prepare('SELECT 1 FROM writing_bridge_grants WHERE id=? AND revoked=0 AND expires>?').get(row.id,now())) fail(401, '授权已失效，请重新登录。');
    return {row,identity,access:projection(row,identity)};
  }
  function sourceCookies(req) {
    return (req.headers.cookie || '').split(';').map(s=>s.trim()).filter(s=>s.startsWith('wordup_session=') || s.startsWith('daily_admin='));
  }
  function observeAuthChange(req,res,url) {
    if (!enabled || req.method !== 'POST' || req.headers.origin !== publicOrigin || req.headers['sec-fetch-site'] === 'cross-site' || !/^\/api\/(?:v1\/auth\/(?:logout|student-login|teacher-login|admin-login|public-login|register|teacher-register)|teacher\/(?:logout|login|password))$/.test(url.pathname)) return;
    const cookies = sourceCookies(req);
    if (!cookies.length) return;
    res.once('finish',()=>{
      if (res.statusCode < 200 || res.statusCode >= 300) return;
      initialize();
      for (const cookie of cookies) db.prepare('UPDATE writing_bridge_grants SET revoked=1 WHERE source_hash=? AND revoked=0').run(hash(cookie));
    });
  }
  async function handle(req,res,url) {
    if (!url.pathname.startsWith(prefix)) return false;
    try {
      if (!enabled) fail(503, '作文统一登录正在接入，请稍后重试。');
      initialize();
      const endpoint = url.pathname.slice(prefix.length);
      if (endpoint === 'context' && req.method === 'GET') {
        authorizeParameters(Object.fromEntries(url.searchParams));
        const identity = validateIdentity(await resolveIdentity(req));
        send(res,200,{authenticated:true,name:identity.name || '',role:identity.role}); return true;
      }
      if (req.method !== 'POST') fail(405, '请求方式不支持。');
      if (endpoint === 'authorize') sameOrigin(req); else machine(req);
      const body = await input(req);
      if (endpoint === 'authorize') {
        const parameters = authorizeParameters(body), identity = validateIdentity(await resolveIdentity(req));
        if (!identity.source?.cookie) fail(401, '无法建立登录来源，请重新登录。');
        db.prepare('DELETE FROM writing_bridge_codes WHERE expires<=?').run(now());
        db.prepare('DELETE FROM writing_bridge_grants WHERE expires<=?').run(now());
        const recent = db.prepare('SELECT COUNT(*) AS n FROM writing_bridge_grants WHERE source_hash=? AND created>?').get(hash(identity.source.cookie),now()-60000);
        if (recent.n >= 15) fail(429, '登录较频繁，请稍后重试。');
        const grantId = random(), code = random(), expires = Math.min(now()+15*60000,identity.expires);
        db.exec('BEGIN IMMEDIATE');
        try {
          db.prepare('INSERT INTO writing_bridge_grants VALUES(?,?,?,?,?,?,?,?,0,?)').run(grantId,'writeascend',identity.provider,identity.subject,identity.role,hash(identity.source.cookie),seal(identity.source),expires,now());
          db.prepare('INSERT INTO writing_bridge_codes VALUES(?,?,?,?,?,?)').run(hash(code),grantId,'writeascend',parameters.redirect_uri,parameters.code_challenge,Math.min(now()+60000,expires));
          audit(identity,'authorize',grantId);db.exec('COMMIT');
        } catch (error) {db.exec('ROLLBACK');throw error;}
        const redirect = new URL(parameters.redirect_uri);redirect.search = new URLSearchParams({code,state:parameters.state}).toString();
        send(res,200,{redirect:redirect.href}); return true;
      }
      if (endpoint === 'token') {
        if (body.clientId !== 'writeascend' || !allowed.has(body.redirectUri) || typeof body.verifier !== 'string' || !/^[A-Za-z0-9._~-]{43,128}$/.test(body.verifier) || typeof body.code !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(body.code)) fail(400, '授权码请求无效。');
        const code = db.prepare('DELETE FROM writing_bridge_codes WHERE code_hash=? RETURNING *').get(hash(body.code));
        const challenge = crypto.createHash('sha256').update(body.verifier).digest('base64url');
        if (!code || code.expires <= now() || code.client_id !== body.clientId || code.redirect_uri !== body.redirectUri || code.challenge !== challenge) fail(401, '授权码已失效，请重新登录。');
        const {row,identity,access} = await inspect(code.grant_id);
        audit(identity,'token',row.id);send(res,200,access);return true;
      }
      if(endpoint.startsWith('directory/')){
        const {identity}=await inspect(body.grantId);
        if(identity.role!=='admin')fail(403,'此操作需要学校管理员账号。');
        send(res,200,await directory.handle(endpoint.slice('directory/'.length),body,identity));return true;
      }
      if (endpoint === 'introspect') {
        send(res,200,(await inspect(body.grantId)).access);return true;
      }
      if (endpoint === 'revoke') {
        if (typeof body.grantId !== 'string') fail(400, '授权编号无效。');
        const row = db.prepare('SELECT * FROM writing_bridge_grants WHERE id=?').get(body.grantId);
        if (row) {db.prepare('UPDATE writing_bridge_grants SET revoked=1 WHERE id=?').run(row.id);audit(row,'revoke',row.id);}
        send(res,200,{ok:true});return true;
      }
      if (endpoint === 'roster') {
        const {access} = await inspect(body.grantId);
        const classroom = access.classes.find(c=>c.id===body.classId && c.scopes.includes('roster.read'));
        if (!classroom) fail(403, '没有此班级的名册权限。');
        if (typeof readRoster !== 'function') fail(503, '名册同步正在接入。');
        if (body.after !== undefined && (typeof body.after !== 'string' || body.after.length > 200)) fail(400, '分页位置无效。');
        const result = await readRoster({classId:classroom.id,after:body.after || '',limit:100});
        // The adapter supplies authority-filtered rows; no client-chosen columns.
        send(res,200,{classId:classroom.id,version:classroom.version,snapshotHash:typeof result.snapshotHash==='string'?result.snapshotHash:null,students:result.students.map(s=>({provider:'wordup',subject:s.subject,name:s.name,grade:s.grade,classId:classroom.id,status:'active'})),next:result.next || null});return true;
      }
      fail(404, '接口不存在。');
    } catch (error) {send(res,error.status || 500,{error:{message:error.status?error.message:'作文登录服务暂时不可用。'}});}
    return true;
  }
  return {handle,observeAuthChange,enabled};
}
