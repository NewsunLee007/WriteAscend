async rootPage => {
  const isolated=await rootPage.context().browser().newContext(),page=await isolated.newPage();
  try{
  const fixture=await (await page.request.get('http://127.0.0.1:5186/scripts/qa/fixtures/teacher-workflow.json')).json();
  await page.addInitScript(seed=>{
    localStorage.clear();
    localStorage.setItem('smart_grader_data_v5_0',JSON.stringify(seed));
    localStorage.setItem('writeascend_teacher_mode','full');
  },fixture.seed);
  let modelCalls=0;
  await page.route('https://model.invalid/**',async route=>{
    modelCalls++;
    await route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(fixture.response)});
  });
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('http://127.0.0.1:5186/');
  await page.getByRole('heading',{name:'1 评分标准',exact:true}).waitFor();
  await page.getByRole('button',{name:'下一步',exact:true}).click();
  await page.getByRole('heading',{name:'2 导入学生作文',exact:true}).waitFor();
  await page.locator('input[type="file"][accept="image/*"]').setInputFiles({name:'synthetic-essay.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6b9sAAAAASUVORK5CYII=','base64')});
  await page.getByText('已选择 1 份文件',{exact:true}).waitFor();
  await page.getByRole('button',{name:'下一步',exact:true}).click();
  await page.getByRole('button',{name:'开始批改',exact:true}).click();
  await page.getByRole('heading',{name:'保存批改结果',exact:true}).waitFor({timeout:20000});
  if(modelCalls<1)throw Error('One-click grading did not call the configured model.');
  await page.getByRole('button',{name:'保存',exact:true}).click();
  await page.getByText('总体评价 (Overall Comment)',{exact:true}).first().waitFor();
  for(const label of ['优秀表达 (Excellent Expressions)','诊断与提升 (Correction)','内容优化建议 (Content Optimization Suggestions)','升级版习作 (Revised)','标准参考范文 (Model)']) {
    if(!await page.getByText(label,{exact:true}).first().isVisible())throw Error('Missing original report section: '+label);
  }
  const snapshot=await page.evaluate(()=>JSON.parse(localStorage.getItem('smart_grader_saved_results_v1')||'[]'));
  if(snapshot.length!==1||snapshot[0].gradedCount!==1)throw Error('Graded result snapshot was not saved.');
  await page.screenshot({path:'output/teacher-grading-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'output/teacher-grading-mobile.png',fullPage:true});
  const size=await page.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth}));
  if(size.scroll>size.viewport)throw Error('Teacher mobile screen overflows: '+JSON.stringify(size));
  const paper=await page.locator('.teacher-grading-detail .a4-wrapper').evaluate(e=>({width:e.getBoundingClientRect().width,parent:e.parentElement.getBoundingClientRect().width}));
  if(paper.width>paper.parent+1)throw Error('Report is clipped inside the mobile card.');
  return {passed:true,originalReportSections:6,modelCalled:true,snapshotSaved:true,mobileWidth:390};
  }finally{await isolated.close();}
}
