async page => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('http://127.0.0.1:8789/api/auth/start?next=%2F');
  await page.getByRole('button',{name:'继续进入作文批改',exact:true}).waitFor();
  await page.screenshot({path:'output/daily-writing-connect-mobile.png'});
  await page.getByRole('button',{name:'继续进入作文批改',exact:true}).click();
  await page.waitForURL('http://127.0.0.1:8789/');
  await page.getByRole('heading',{name:'英语作文，一键批阅。',exact:true}).waitFor();
  const identity=await page.evaluate(async()=>{
    const response=await fetch('/api/me');return {status:response.status,body:await response.json()};
  });
  if(identity.status!==200||identity.body.name!=='合成测试教师'||identity.body.role!=='teacher')throw Error('Actual Wrangler session did not survive the cross-origin return: '+JSON.stringify(identity));
  if(await page.evaluate(()=>document.cookie.includes('wa_session=')))throw Error('Cloud session cookie is readable from JavaScript.');
  const classes=await page.evaluate(async()=>await(await fetch('/api/classes')).json());
  if(classes.classes.length!==0)throw Error('A registered teacher received school classes without an explicit grant.');
  const logout=await page.evaluate(async()=>{
    const response=await fetch('/api/auth/logout',{method:'POST'});return response.status;
  });
  if(logout!==200)throw Error('Worker logout failed.');
  if(await page.evaluate(async()=>(await fetch('/api/me')).status)!==401)throw Error('Logged-out cloud session is still active.');
}
