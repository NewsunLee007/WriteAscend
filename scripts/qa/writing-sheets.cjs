async page=>{
  const root='http://127.0.0.1:8789',context=await page.context().browser().newContext({viewport:{width:390,height:844}}),p=await context.newPage(),errors=[];
  p.on('pageerror',e=>errors.push(e.message));const fixture=await(await p.request.get('http://127.0.0.1:5186/scripts/qa/fixtures/teacher-workflow.json')).json();
  const api=(path,body)=>p.evaluate(async({path,body})=>{const me=await(await fetch('/api/me')).json(),r=await fetch(path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Workspace-Id':me.workspaceId},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};},{path,body});
  try{
    await p.goto('http://127.0.0.1:8890/sandbox/use-teacher');await p.goto(root+'/api/auth/start');await p.getByRole('button',{name:'继续进入作文批改',exact:true}).click();
    if(await p.getByRole('button',{name:'新建空工作区',exact:true}).isVisible())await p.getByRole('button',{name:'新建空工作区',exact:true}).click();
    await p.getByRole('button',{name:'一键批改',exact:true}).waitFor();
    const title='合成写作单 '+Date.now(),created=await api('/api/tasks',{requestId:crypto.randomUUID(),title,assignment:fixture.seed.assignment,rubric:fixture.seed.rubric,classIds:['synthetic-school-class']}),task=created.body.task;if(created.status!==201)throw Error(JSON.stringify(created));
    const preview=await api('/api/tasks/'+task.id+'/preview');await api('/api/tasks/'+task.id+'/activate',{requestId:crypto.randomUUID(),expectedRevision:task.revision,rosterHash:preview.body.rosterHash});
    await p.getByRole('button',{name:'写作任务',exact:true}).click();await p.locator('.teacher-tasks-content article').filter({hasText:title}).getByRole('button',{name:'打印写作单',exact:true}).click();
    const dialog=p.getByRole('dialog',{name:'个性化写作单',exact:true});await dialog.getByText('已选 100/130 人',{exact:true}).waitFor();
    if(await dialog.getByLabel('打印学校页眉',{exact:true}).inputValue()!=='瑞安市新纪元实验学校')throw Error('Confirmed school print header was lost');
    await dialog.getByRole('button',{name:'清除选择',exact:true}).click();await dialog.getByLabel('搜索写作单学生',{exact:true}).fill('合成同名');
    for(const input of await dialog.locator('.sheet-members input[type="checkbox"]').all())await input.check();
    await dialog.getByLabel('每人写作单页数',{exact:true}).selectOption('2');
    let intercepted=false;await p.route('**/api/tasks/'+task.id+'/sheets',async route=>{if(!intercepted&&route.request().method()==='POST'){intercepted=true;await route.fetch();await route.abort();}else await route.continue();});
    await dialog.getByRole('button',{name:'生成写作单（2 人）',exact:true}).click();await dialog.getByRole('button',{name:'恢复上次写作单',exact:true}).waitFor();
    await dialog.getByRole('button',{name:'恢复上次写作单',exact:true}).click();await dialog.getByRole('heading',{name:'写作单已准备好',exact:true}).waitFor();
    const initial=(await api('/api/tasks/'+task.id+'/sheets')).body.sets;if(initial.length!==2)throw Error('Network recovery reissued sheets');
    const pending=await p.evaluate(id=>JSON.parse(sessionStorage.getItem(Object.keys(sessionStorage).find(k=>k.endsWith(':'+id)))) ,task.id);
    const oldCode=pending.members[0].tokens[0],resolved=await api('/api/tasks/'+task.id+'/sheets/resolve',{code:oldCode});if(resolved.status!==200||resolved.body.sheet.name!=='合成同名'||resolved.body.identityConfirmed!==false)throw Error('Sheet identity was not resolved safely');
    await p.screenshot({path:'output/writing-sheets-mobile.png',fullPage:false});if(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Sheet dialog overflows on mobile');
    const [popup]=await Promise.all([p.waitForEvent('popup'),dialog.getByRole('button',{name:'打开打印预览',exact:true}).click()]);await popup.waitForLoadState();await popup.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));});
    if(await popup.locator('.writing-page').count()!==4||await popup.locator('.instructions .criterion').count()!==fixture.seed.rubric.items.length)throw Error('Printed pages or original criteria are missing');
    const codes=await popup.locator('.check-code').allTextContents();if(new Set(codes).size!==4)throw Error('Printed page codes were duplicated');
    await popup.pdf({path:'output/pdf/writing-sheets-synthetic.pdf',format:'A4',preferCSSPageSize:true,printBackground:true});
    await popup.setViewportSize({width:1000,height:1300});await popup.screenshot({path:'output/writing-sheets-preview.png',fullPage:false});await popup.close();
    await dialog.getByRole('button',{name:'重新选择并生成',exact:true}).click();if(await dialog.getByRole('button',{name:'生成写作单（2 人）',exact:true}).isEnabled())throw Error('Reissue silently invalidated old codes');
    await dialog.getByRole('checkbox',{name:/我确认重新签发并作废旧码/}).check();await dialog.getByRole('button',{name:'生成写作单（2 人）',exact:true}).click();await dialog.getByRole('heading',{name:'写作单已准备好',exact:true}).waitFor();
    if((await api('/api/tasks/'+task.id+'/sheets/resolve',{code:oldCode})).status!==410)throw Error('Old printed codes still work after reissue');
    const sets=(await api('/api/tasks/'+task.id+'/sheets')).body.sets;if(sets.filter(s=>s.status==='active').length!==2||sets.filter(s=>s.status==='revoked').length!==2)throw Error('Reissue lost previous sheet records');
    await dialog.getByRole('button',{name:'关闭写作单',exact:true}).click();await p.getByRole('button',{name:'关闭写作任务',exact:true}).click();await p.getByRole('button',{name:'退出',exact:true}).click();await p.getByRole('link',{name:'使用 Daily 登录',exact:true}).waitFor();
    if(await p.evaluate(()=>Object.keys(sessionStorage).some(k=>k.startsWith('wa_sheet_pending:'))))throw Error('Print tokens remained after explicit logout');
    if(errors.length)throw Error(errors.join('; '));return {passed:true,members:2,writingPages:4,networkRecovery:'same operation',reissueRevokesOldCodes:true,logoutClearsPrintTokens:true};
  }finally{await context.close();}
}
