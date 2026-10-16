import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import path from 'node:path';
import os from 'node:os';

const fail = (status,message) => {throw Object.assign(new Error(message),{status});};
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const cookieValue = (req,name) => (req.headers.cookie || '').split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1) || '';

export function createDailyWritingIdentity({db,authenticateLegacy,verifyWordup,cookieForWordup,now=Date.now}) {
  async function resolveIdentity(req) {
    const legacy = cookieValue(req,'daily_admin');
    if (legacy) {
      try {
        authenticateLegacy(legacy);
        const session = db.prepare('SELECT expires FROM administrator_sessions WHERE hash=? AND expires>?').get(digest(legacy),now());
        if (session) return {provider:'daily_legacy_admin',subject:'admin',role:'admin',name:'Daily 管理员',expires:session.expires,source:{cookie:'daily_admin='+legacy}};
      } catch (error) {if (error.status !== 401) throw error;}
    }
    // verifyWordup must call the existing authenticated /auth/session endpoint.
    // Never decode a subject/role from an unverified cookie.
    const account = await verifyWordup(req), cookie = cookieForWordup(req);
    let payload;
    try {payload=JSON.parse(Buffer.from(cookie.slice('wordup_session='.length).split('.')[0],'base64url').toString('utf8'));}
    catch {fail(401,'登录已失效，请重新登录。');}
    const expires = Number(payload.exp)*1000;
    if (!Number.isFinite(expires) || expires <= now() || payload.sub !== account.subject || payload.role !== account.role) fail(401,'登录已失效，请重新登录。');
    return {provider:'wordup',subject:account.subject,role:account.role,name:account.student?.name || account.teacher?.name || '管理员',accountType:account.student?.accountType,isGuest:account.student?.isGuest === true,expires,source:{cookie}};
  }
  return {resolveIdentity,verifySource:source=>resolveIdentity({headers:{cookie:source.cookie}})};
}

export function createWritingRoster({db,sourceFile=process.env.WORDUP_REPORT_DB || path.join(os.homedir(),'Library/Application Support/WordUp/data/wordup.sqlite3')}) {
  return ({classId,after='',limit=100}) => {
    const classroom = db.prepare("SELECT c.* FROM writing_classes c JOIN writing_schools s ON s.id=c.school_id WHERE c.id=? AND c.status='active' AND s.status='active'").get(classId);
    if (!classroom) fail(403,'班级授权已失效。');
    let source;
    try {source=new DatabaseSync(sourceFile,{readOnly:true});}
    catch {fail(503,'学校名册暂时无法连接。');}
    try {
      // Only these five non-secret columns are read. Active authority ID,
      // confirmed source class and grade must all agree with the membership.
      const rows = source.prepare("SELECT id,name,grade,class_name,status FROM students WHERE status='active' AND is_guest=0 AND source_key NOT LIKE 'public:%' AND class_name=? AND grade=?").all(classroom.source_name,classroom.grade);
      const members = new Set(db.prepare("SELECT subject FROM writing_memberships WHERE class_id=? AND provider='wordup' AND status='active' AND ended IS NULL").all(classId).map(r=>r.subject));
      const ordered = rows.filter(r=>members.has(r.id) && r.id>after).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
      const page = ordered.slice(0,limit);
      return {students:page.map(r=>({subject:r.id,name:r.name,grade:r.grade})),next:ordered.length>limit?page.at(-1).id:null};
    } finally {source.close();}
  };
}
