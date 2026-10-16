// Optional entry: existing Daily pages remain unchanged while the bridge is off.
let generation=0;
async function mount(){const elements=[...document.querySelectorAll('[data-writing-entry]')];if(!elements.length)return;const current=++generation;for(const el of elements){el.hidden=true;el.style.display='none';}
 try{const response=await fetch('/api/integrations/writeascend/portal',{cache:'no-store'});if(!response.ok)return;const value=await response.json();if(current!==generation||!value.authenticated||!['student','teacher','admin'].includes(value.role))return;
  for(const el of elements){el.href=value.entryUrl;const title=el.querySelector('[data-writing-label]');if(title)title.textContent=value.role==='student'?'我的作文反馈':'教师作文批阅';else el.textContent=value.role==='student'?'作文反馈 →':'作文批阅 →';el.style.minHeight='44px';if(!title){el.style.alignItems='center';el.style.marginLeft='12px';el.style.marginRight='12px';}el.hidden=false;el.style.display=title?'':'inline-flex';}
 }catch{/* Keep the existing learning page usable when writing is unavailable. */}}
window.addEventListener('pageshow',e=>{if(e.persisted)void mount();});document.addEventListener('daily-account',()=>void mount());void mount();
