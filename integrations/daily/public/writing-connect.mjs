const params = new URLSearchParams(location.search);
const fields = ['client_id','redirect_uri','state','code_challenge','code_challenge_method'];
const request = Object.fromEntries(fields.map(key=>[key,params.get(key) || '']));
const status = document.getElementById('status'), connect = document.getElementById('connect'), login = document.getElementById('login');
// Login can return only to this same-origin page; the backend owns the external callback.
login.href = '/login.html?' + new URLSearchParams({role:params.get('audience')==='student'?'student':'teacher',next:location.pathname+'?'+new URLSearchParams(request)});
login.textContent = '使用其他账号登录';
async function parse(response) {
  const body = await response.json();
  if (!response.ok) throw Object.assign(new Error(body.error?.message || '暂时无法连接，请重试。'),{status:response.status});
  return body;
}
try {
  const identity = await parse(await fetch('/api/integrations/writeascend/context?'+new URLSearchParams(request),{cache:'no-store'}));
  status.textContent = `${identity.name} · ${{teacher:'教师',admin:'管理员',student:'学生'}[identity.role] || '学习账号'}`;
  if (identity.role === 'student') {
    document.querySelector('h1').textContent='查看我的作文反馈';connect.textContent='继续查看我的作文';
  }
  connect.hidden=false;
  login.hidden=false;
} catch (error) {
  status.textContent=error.message;
  if (error.status === 401 || error.status === 403) {login.textContent=params.get('audience')==='student'?'登录学生账号':'登录学校账号';login.hidden=false;}
}
connect.addEventListener('click',async()=>{
  connect.disabled=true;status.textContent='正在连接作文工作区…';
  try {
    const body = await parse(await fetch('/api/integrations/writeascend/authorize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request)}));
    location.replace(body.redirect);
  } catch (error) {status.textContent=error.message;connect.disabled=false;}
});
