async page=>{
 const context=await page.context().browser().newContext(),a=await context.newPage(),b=await context.newPage();
 try{
  await a.goto('http://127.0.0.1:8890/sandbox/use-teacher');await a.goto('http://127.0.0.1:8789/api/auth/start');await a.getByRole('button',{name:'继续进入作文批改',exact:true}).click();await a.getByRole('button',{name:'一键批改',exact:true}).waitFor();
  const fixture=await(await a.request.get('http://127.0.0.1:5186/scripts/qa/fixtures/teacher-workflow.json')).json();await a.waitForTimeout(500);
  await a.evaluate(seed=>{for(const key of Object.keys(localStorage))if(key.startsWith('wa_workspace:'))localStorage.removeItem(key);localStorage.setItem('smart_grader_data_v5_0',JSON.stringify(seed));},fixture.seed);
  await b.goto('http://127.0.0.1:8789/');await b.getByRole('heading',{name:'保留这台设备上的原有数据',exact:true}).waitFor();
  await a.getByRole('button',{name:'退出',exact:true}).click();await a.getByRole('link',{name:'使用 Daily 登录',exact:true}).waitFor();await b.getByRole('link',{name:'使用 Daily 登录',exact:true}).waitFor();
  if(await b.getByRole('button',{name:'带入本机原有数据',exact:true}).count())throw Error('A logged-out page still offers migration into an unverified workspace');return {passed:true,logoutClearsMigrationGateAcrossTabs:true};
 }catch(e){throw Error(e.message+'\nPage A: '+await a.locator('body').innerText().catch(()=>a.url())+'\nPage B: '+await b.locator('body').innerText().catch(()=>b.url()));}finally{await context.close();}
}
