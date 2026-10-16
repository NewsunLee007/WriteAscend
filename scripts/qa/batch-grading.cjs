async rootPage => {
  const isolated=await rootPage.context().browser().newContext(),page=await isolated.newPage();
  try{
  const fixture=await (await page.request.get('http://127.0.0.1:5186/scripts/qa/fixtures/teacher-workflow.json')).json();
  await page.addInitScript(seed=>{localStorage.clear();localStorage.setItem('smart_grader_data_v5_0',JSON.stringify(seed));},fixture.seed);
  let modelCalls=0,releaseFirst,firstStarted;
  const firstRequest=new Promise(resolve=>firstStarted=resolve);
  const firstGate=new Promise(resolve=>releaseFirst=resolve);
  await page.route('https://model.invalid/**',async route=>{
    modelCalls++;
    if(modelCalls===1){firstStarted();await firstGate;}
    if(modelCalls===2){await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:{message:'Synthetic image rejected'}})});return;}
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(fixture.response)});
  });
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('http://127.0.0.1:5186/');
  await page.getByRole('heading',{name:'英语作文，一键批阅。',exact:true}).waitFor();
  const image={name:'synthetic-essay.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6b9sAAAAASUVORK5CYII=','base64')};
  await page.locator('input[type="file"][multiple]').setInputFiles([image,{...image,name:'synthetic-essay-2.png'}]);
  await page.getByRole('button',{name:'一键批改（2份）',exact:true}).click();
  await firstRequest;
  await page.getByRole('button',{name:'暂停批改',exact:true}).click();
  releaseFirst();
  await page.getByRole('button',{name:'继续批改',exact:true}).waitFor();
  if(modelCalls!==1)throw Error('Pause started another essay instead of stopping after the current one.');
  await page.getByRole('button',{name:'继续批改',exact:true}).click();
  await page.getByText(/Synthetic image rejected/).waitFor();
  await page.getByRole('button',{name:'返回快速批改',exact:true}).click();
  await page.getByRole('button',{name:'重试失败作文',exact:true}).click();
  await page.getByRole('button',{name:'一键批改（1份）',exact:true}).click();
  await page.getByRole('heading',{name:'保存批改结果',exact:true}).waitFor({timeout:20000});
  await page.getByRole('button',{name:'保存',exact:true}).click();
  if(modelCalls!==3)throw Error('Retry regraded an already successful essay.');
  const detail=page.locator('.teacher-grading-detail');
  await detail.getByLabel('总体评价',{exact:true}).fill('教师核对：请补充一个具体行动，保留自己的表达。');
  await detail.getByLabel('总体评价',{exact:true}).press('Tab');
  await detail.getByLabel('作文总分',{exact:true}).fill('14.5');
  await detail.getByLabel('作文总分',{exact:true}).press('Tab');
  await page.getByRole('button',{name:'保存批改结果',exact:true}).click();
  await page.getByRole('button',{name:'保存',exact:true}).click();
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('smart_grader_saved_results_v1')||'[]'));
  const reports=saved[0]?.data.files.filter(f=>f.status==='success').map(f=>f.result);
  if(reports?.length!==2||!reports.some(r=>r.brief_comment.startsWith('教师核对：')&&r.total_score===14.5))throw Error('Teacher edits did not persist in the saved batch.');
  for(const r of reports)if(Math.abs(Object.values(r.breakdown).reduce((sum,x)=>sum+Number(x),0)-r.total_score)>0.001)throw Error('Edited total and criterion scores differ.');
  await page.getByRole('button',{name:'班级分析',exact:true}).click();
  page.once('dialog',d=>d.accept());
  const csvEvent=page.waitForEvent('download');
  await page.getByRole('button',{name:'导出 CSV',exact:true}).click();
  const csv=await csvEvent;
  await csv.saveAs('output/teacher-batch-export.csv');
  const stream=await csv.createReadStream();let text='';for await(const chunk of stream)text+=chunk.toString('utf8');
  if(!text.includes('序号,班级名称,学生姓名,实际得分,题目满分值,写作任务名称,批改时间')||!text.includes('14.5'))throw Error('Original CSV columns or teacher score missing.');
  await page.getByRole('button',{name:'设置',exact:true}).click();
  const backupEvent=page.waitForEvent('download');
  await page.getByRole('button',{name:'备份数据',exact:true}).click();
  const backup=await backupEvent;
  const backupStream=await backup.createReadStream();let backupText='';for await(const chunk of backupStream)backupText+=chunk.toString('utf8');
  const data=JSON.parse(backupText);
  if(data.files?.filter(f=>f.status==='success').length!==2||!data.rubric||!data.studentProfiles)throw Error('Original full JSON backup was reduced.');
  }finally{await isolated.close();}
}
