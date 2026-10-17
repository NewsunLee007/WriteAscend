async rootPage=>{
 const browser=rootPage.context().browser(),contexts=[],results=[];
 try{
  for(const [kind,origin,prefix,next,audience]of [
   ['teacher','https://writeascend-staging.317792050.workers.dev','writeascend','/','teacher'],
   ['student','https://writeascend-staging.317792050.workers.dev','writeascend','/student','student'],
   ['peer','https://newsun-writing-peer-staging.317792050.workers.dev','writing-peer','/','student'],
  ]){
   const context=await browser.newContext({viewport:{width:390,height:844}});contexts.push(context);const p=await context.newPage();
   await p.goto(origin+'/api/auth/start?next='+encodeURIComponent(next));
   const url=new URL(p.url());if(url.origin!=='https://daily.newsunenglish.com'||url.pathname!==(prefix==='writeascend'?'/writing-connect.html':'/writing-peer-connect.html'))throw Error(kind+' wrong school connect destination');
   if(url.searchParams.get('audience')!==audience||url.searchParams.get('redirect_uri')!==origin+'/api/auth/callback'||url.searchParams.get('code_challenge_method')!=='S256')throw Error(kind+' wrong school connect parameters');
   const contextStatus=await p.evaluate(async prefix=>{const params=new URLSearchParams(location.search);params.delete('audience');return (await fetch('/api/integrations/'+prefix+'/context?'+params,{cache:'no-store'})).status;},prefix);
   if(contextStatus!==401)throw Error(kind+' unauthenticated school context '+contextStatus);
   const login=p.locator('#login');await login.waitFor({state:'visible'});const loginUrl=new URL(await login.getAttribute('href'),url.origin);
   if(loginUrl.origin!==url.origin||loginUrl.pathname!=='/login.html'||loginUrl.searchParams.get('role')!==audience)throw Error(kind+' wrong school account selection');
   // Teacher forwards a malformed code (Daily 400); peer validates shape locally,
   // then forwards a nonexistent 43-character code (Daily 401).
   // It creates no account, grant, session, student record or real authorization.
   const callback=new URL('/api/auth/callback',origin);callback.searchParams.set('state',url.searchParams.get('state'));callback.searchParams.set('code',kind==='peer'?'x'.repeat(43):'activation-probe-invalid-code');
   const response=await p.goto(callback.href);if(response.status()!==(kind==='peer'?401:400))throw Error(kind+' machine callback transport returned '+response.status());
   const me=await p.evaluate(async()=> (await fetch('/api/me')).status);if(me!==401)throw Error(kind+' malformed code created a session');
   const logout=await p.evaluate(async()=> (await fetch('/api/auth/logout',{method:'POST'})).status);if(logout!==200)throw Error(kind+' probe cleanup failed');
   results.push({kind,configured:true,schoolContextAnonymous:contextStatus,accountRole:audience,invalidCodeCallbackStatus:response.status(),sessionCreated:false,transactionCleanup:logout});
  }
  return {passed:true,checkedAt:new Date().toISOString(),checks:results,realAccountLoginVerified:false,studentDirectoryChanged:false};
 }finally{await Promise.all(contexts.map(c=>c.close().catch(()=>{})));}
}
