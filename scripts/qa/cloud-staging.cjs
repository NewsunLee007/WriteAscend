async rootPage=>{
 const browser=rootPage.context().browser(),contexts=[],errors=[],results=[];
 try{
  for(const [kind,origin,heading] of [['teacher','https://writeascend-staging.317792050.workers.dev','英语作文，一键批阅。'],['peer','https://newsun-writing-peer-staging.317792050.workers.dev','读懂同伴的表达，']]){
   const c=await browser.newContext({viewport:{width:390,height:844}});contexts.push(c);const p=await c.newPage();p.on('pageerror',e=>errors.push(kind+': '+e.message));const response=await p.goto(origin);await p.getByRole('heading',{level:1}).filter({hasText:heading}).waitFor();const health=await p.evaluate(async()=>{const r=await fetch('/api/health',{cache:'no-store'});return {status:r.status,body:await r.json()};});if(health.status!==200||!health.body.release?.id||health.body.loginConfigured!==false)throw Error(kind+' unexpected deployment or school login configuration');if(!response.headers()['content-security-policy']?.includes("frame-ancestors 'none'"))throw Error(kind+' missing deployed page CSP');
   for(const width of [375,390,768,1440]){await p.setViewportSize({width,height:900});await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));if(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error(kind+' cloud page overflow '+width);}
   await p.setViewportSize({width:390,height:844});await p.screenshot({path:'output/cloud-staging-'+kind+'-mobile.png',fullPage:false});await p.setViewportSize({width:1440,height:900});await p.screenshot({path:'output/cloud-staging-'+kind+'-desktop.png',fullPage:false});const status=await p.evaluate(async()=>{const r=await fetch('/api/me');return r.status;});if(status!==401)throw Error(kind+' anonymous school identity access '+status);results.push({kind,origin,release:health.body.release,anonymousMe:status,responsiveWidths:[375,390,768,1440],csp:true});
  }
  if(errors.length)throw Error(errors.join('\n'));return {passed:true,cloudPages:results,schoolLoginVerified:false,studentRecordsVerified:false};
 }finally{await Promise.all(contexts.map(c=>c.close().catch(()=>{})));}
}
