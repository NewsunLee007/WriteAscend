async rootPage => {
  const isolated=await rootPage.context().browser().newContext(),page=await isolated.newPage();
  try{
  const fixture=await (await page.request.get('http://127.0.0.1:5186/scripts/qa/fixtures/teacher-workflow.json')).json();
  await page.addInitScript(seed=>{
    localStorage.clear();
    localStorage.setItem('smart_grader_data_v5_0',JSON.stringify(seed));
  },fixture.seed);
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  let modelCalls=0;
  await page.route('https://model.invalid/**',async route=>{
    modelCalls++;
    const body=route.request().postDataJSON();
    if(!body.messages?.some(m=>m.role==='system'&&m.content.includes('九年级')))throw Error('Quick grade choice was not used by the original prompt.');
    await route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(fixture.response)});
  });
  await page.setViewportSize({width:390,height:844});
  await page.goto('http://127.0.0.1:5186/');
  await page.getByRole('heading',{name:'英语作文，一键批阅。',exact:true}).waitFor();
  if(!await page.getByRole('button',{name:'一键批改',exact:true}).isDisabled())throw Error('An empty upload must not start grading.');
  await page.getByLabel('本班年级').selectOption('九年级');
  await page.getByLabel('作文满分').fill('15');
  await page.locator('.quick-advanced summary').click();
  const rubric=await page.locator('.quick-rubric-summary>div>span').allTextContents();
  if(Math.abs(rubric.reduce((sum,x)=>sum+parseFloat(x),0)-15)>0.001)throw Error('Quick total and criterion scores diverged.');
  await page.getByRole('button',{name:'模型设置',exact:true}).click();
  await page.getByRole('heading',{name:'系统设置',exact:true}).waitFor();
  await page.getByRole('button',{name:'完成',exact:true}).click();
  await page.locator('.quick-advanced summary').click();
  await page.screenshot({path:'output/quick-grading-mobile.png',fullPage:true});
  const size=await page.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth}));
  if(size.scroll>size.viewport)throw Error('Quick mobile overflow: '+JSON.stringify(size));
  const image={name:'synthetic-essay.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6b9sAAAAASUVORK5CYII=','base64')};
  await page.locator('input[type="file"][multiple]').setInputFiles(image);
  await page.getByRole('button',{name:'一键批改（1份）',exact:true}).waitFor();
  await page.getByRole('button',{name:'一键批改（1份）',exact:true}).click();
  await page.getByRole('heading',{name:'保存批改结果',exact:true}).waitFor({timeout:20000});
  await page.getByRole('button',{name:'保存',exact:true}).click();
  await page.getByText('总体评价 (Overall Comment)',{exact:true}).first().waitFor();
  if(modelCalls!==1)throw Error('Expected one original grading call, got '+modelCalls);
  await page.getByRole('button',{name:'返回快速批改',exact:true}).click();
  if(!await page.getByRole('button',{name:'查看批改结果',exact:true}).isVisible())throw Error('Completed report cannot be reopened.');
  await page.getByRole('button',{name:'完整工作台',exact:true}).click();
  await page.getByRole('heading',{name:'1 评分标准',exact:true}).waitFor();
  if(errors.length)throw Error('Runtime errors: '+errors.join('; '));
  }finally{await isolated.close();}
}
