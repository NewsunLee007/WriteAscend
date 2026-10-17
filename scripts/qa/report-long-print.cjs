async rootPage=>{
 const context=await rootPage.context().browser().newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
 try{
  const fixture=await(await page.request.get('http://127.0.0.1:5186/scripts/qa/fixtures/teacher-workflow.json')).json(),result=JSON.parse(fixture.response.choices[0].message.content);
  const paragraph='We worked together on a class poster. I listened to my classmates and shared my ideas. A small act of kindness can help us become better friends.';
  fixture.seed.languageDifficulty={enabled:false,autoRewrite:false};fixture.seed.assignment.modelEssay=Array.from({length:12},(_,i)=>paragraph+' MODEL-PARAGRAPH-'+(i+1)).join('\n\n')+' MODEL-END';
  result.standard_reference=fixture.seed.assignment.modelEssay;result.optimized_essay=Array.from({length:10},(_,i)=>paragraph+' REVISED-PARAGRAPH-'+(i+1)).join('\n\n')+' REVISED-END';
  result.errors=Array.from({length:24},(_,i)=>({orig:'I help my classmate yesterday. ORIGINAL-'+(i+1),corr:'I helped my classmate yesterday. CORRECTION-'+(i+1),type:'合成时态检查',note:'这是排版压力测试。过去时间需使用过去式，同时检查主谓一致、词形和标点。NOTE-'+(i+1)}));
  result.highlights=Array.from({length:5},(_,i)=>({text:paragraph+' HIGHLIGHT-'+(i+1),comment:'合成测试中的完整亮点说明。'}));result.content_logic=Array.from({length:8},(_,i)=>(i+1)+'. 内容拓展建议\n请写清楚一个行动、同学的回应和自己的收获。CONTENT-'+(i+1)).join('\n\n');
  fixture.response.choices[0].message.content=JSON.stringify(result);
  await page.addInitScript(seed=>{localStorage.clear();localStorage.setItem('smart_grader_data_v5_0',JSON.stringify(seed));},fixture.seed);
  await page.route('https://model.invalid/**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(fixture.response)}));
  await page.goto('http://127.0.0.1:5186/');await page.getByRole('heading',{name:'英语作文，一键批阅。',exact:true}).waitFor();await page.locator('input[type=file][multiple]').setInputFiles({name:'synthetic-long-report.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6b9sAAAAASUVORK5CYII=','base64')});await page.getByRole('button',{name:'一键批改（1份）',exact:true}).click();await page.getByRole('heading',{name:'保存批改结果',exact:true}).waitFor({timeout:20000});await page.getByRole('button',{name:'保存',exact:true}).click();
  await page.evaluate(()=>window.print=()=>{window.__qaPrint=true;});await page.getByRole('button',{name:'打印/导出所有PDF',exact:true}).click();await page.waitForFunction(()=>window.__qaPrint);await page.pdf({path:'output/report-long-redesign.pdf',format:'A4',preferCSSPageSize:true,printBackground:true});
  const corrections=await page.locator('.teacher-grading-detail .feedback-correction').count(),highlights=await page.locator('.teacher-grading-detail .feedback-highlight').count();if(corrections!==20||highlights!==3)throw Error('Legacy normalization limits changed unexpectedly');return {passed:true,pdfRendered:true,inputCorrections:24,storedCorrections:corrections,inputHighlights:5,storedHighlights:highlights,revisedParagraphs:10,modelParagraphs:12,syntheticOnly:true};
 }finally{await context.close();}
}
