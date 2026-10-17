async rootPage=>{
 const context=await rootPage.context().browser().newContext({viewport:{width:390,height:844}}),page=await context.newPage();
 try{
  const fixture=await(await page.request.get('http://127.0.0.1:5186/scripts/qa/fixtures/teacher-workflow.json')).json();
  await page.addInitScript(seed=>{
   if(location.port!=='8789'||localStorage.getItem('synthetic-migration-seeded'))return;
   localStorage.setItem('smart_grader_data_v5_0',JSON.stringify({...seed,config:{...seed.config,apiKey:'synthetic-original-secret'}}));
   localStorage.setItem('smart_grader_saved_results_v1',JSON.stringify([{id:'original-batch',name:'合成原批次',data:{assignment:seed.assignment,rubric:seed.rubric,files:[]}}]));localStorage.setItem('synthetic-migration-seeded','yes');
  },fixture.seed);
  await page.goto('http://127.0.0.1:8890/sandbox/use-teacher');await page.goto('http://127.0.0.1:8789/api/auth/start');await page.getByRole('button',{name:'继续进入作文批改',exact:true}).click();await page.getByRole('heading',{name:'保留这台设备上的原有数据',exact:true}).waitFor();
  const workspace=await page.evaluate(async()=> (await(await fetch('/api/me')).json()).workspaceId);
  await page.evaluate(workspace=>{const original=Storage.prototype.setItem;let fail=true;Storage.prototype.setItem=function(key,value){if(fail&&key==='wa_workspace:'+workspace+':smart_grader_saved_results_v1'){fail=false;throw new DOMException('Synthetic quota failure','QuotaExceededError');}return original.call(this,key,value);};},workspace);
  await page.getByRole('button',{name:'带入本机原有数据',exact:true}).click();await page.getByRole('alert').waitFor();
  const failed=await page.evaluate(workspace=>({copied:localStorage.getItem('wa_workspace:'+workspace+':smart_grader_data_v5_0'),decision:localStorage.getItem('wa_workspace:'+workspace+':migration_decision'),source:localStorage.getItem('smart_grader_data_v5_0')}),workspace);
  if(failed.copied!==null||failed.decision!==null||!failed.source.includes('synthetic-original-secret'))throw Error('Partial migration overwrote source or survived failed rollback');
  await page.reload();await page.getByRole('heading',{name:'保留这台设备上的原有数据',exact:true}).waitFor();await page.getByRole('button',{name:'带入本机原有数据',exact:true}).click();await page.getByRole('button',{name:'一键批改',exact:true}).waitFor();
  const restored=await page.evaluate(workspace=>({copied:localStorage.getItem('wa_workspace:'+workspace+':smart_grader_data_v5_0'),decision:localStorage.getItem('wa_workspace:'+workspace+':migration_decision'),history:JSON.parse(localStorage.getItem('wa_workspace:'+workspace+':smart_grader_saved_results_v1')),source:localStorage.getItem('smart_grader_data_v5_0')}),workspace);
  if(restored.copied.includes('synthetic-original-secret')||restored.decision!=='imported'||restored.history[0].id!=='original-batch'||!restored.source.includes('synthetic-original-secret'))throw Error('Retried migration lost history or retained a credential');
  return {passed:true,quotaFailureRolledBack:true,sourceRetained:true,refreshShowsRetry:true,retryPreservesHistory:true,credentialsExcluded:true,realStudentData:false};
 }finally{await context.close();}
}
