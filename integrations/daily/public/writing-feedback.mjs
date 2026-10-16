const reports=document.getElementById('reports'),status=document.getElementById('status'),refresh=document.getElementById('refresh'),more=document.getElementById('more'),gate=document.getElementById('gate'),empty=document.getElementById('empty');
let next=null,busy=false,generation=0;
const node=(tag,text,className)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;};
function render(item){
 const card=node('article'),header=node('header'),copy=node('div'),score=node('div',undefined,'writing-score');card.dataset.reportId=item.id;copy.append(node('h2',item.title));copy.append(node('p',item.className+' · '+item.academicYear+' · 第 '+item.draftNumber+' 稿','writing-meta'));score.append(node('strong',String(item.score)),node('small','/'+item.total));header.append(copy,score);card.append(header,node('p',item.teacherName+' · 反馈第 '+item.version+' 版','writing-meta'));
 const footer=node('footer'),time=node('time',new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(item.publishedAt)),link=node('a','查看完整反馈','writing-primary');time.dateTime=new Date(item.publishedAt).toISOString();link.href=item.link;footer.append(time,link);card.append(footer);reports.append(card);
}
async function load(append=false){if(busy)return;busy=true;refresh.disabled=true;more.disabled=true;status.textContent='正在读取作文反馈…';status.className='';const current=++generation;
 try{
  const response=await fetch('/api/integrations/writeascend/feedback'+(append&&next?'?cursor='+encodeURIComponent(next):''),{cache:'no-store'}),body=await response.json();if(current!==generation)return;
  if(!response.ok){reports.replaceChildren();empty.hidden=true;more.hidden=true;gate.hidden=false;
   document.getElementById('gate-title').textContent=response.status===401?'请使用学校账号登录':response.status===403?'请使用学校学生账号':'作文反馈暂时无法连接';document.getElementById('gate-message').textContent=body.error?.message||'请稍后重试。';
   document.getElementById('account-name').textContent='';const link=document.getElementById('gate-link');link.href='/login.html?role=student&account=school&next=%2Fwriting-feedback.html';link.textContent='登录并查看';link.hidden=![401,403].includes(response.status);
   if(response.status===403){try{const p=await(await fetch('/api/integrations/writeascend/portal',{cache:'no-store'})).json();if(['teacher','admin'].includes(p.role)){link.href=p.entryUrl;link.textContent='进入教师作文批阅';}}catch{}}
   status.textContent='';return;
  }
  gate.hidden=true;document.getElementById('account-name').textContent=body.name||'';if(!append)reports.replaceChildren();
  for(const item of body.reports){if(![...reports.children].some(card=>card.dataset.reportId===item.id))render(item);}next=body.next;more.hidden=!next;empty.hidden=reports.children.length>0;status.textContent=reports.children.length?'已显示 '+reports.children.length+' 份已发布反馈。完整报告以老师当前发布版本为准。':'';
 }catch{if(!append){reports.replaceChildren();more.hidden=true;}status.textContent='连接暂时中断，请恢复网络后刷新。';status.className='error';}
 finally{busy=false;refresh.disabled=false;more.disabled=false;}
}
refresh.addEventListener('click',()=>void load());more.addEventListener('click',()=>void load(true));document.addEventListener('visibilitychange',()=>{if(!document.hidden)void load();});window.addEventListener('pageshow',e=>{if(e.persisted)void load();});setInterval(()=>{if(!document.hidden)void load();},30000);void load();
