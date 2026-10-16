async page=>{
  const context=await page.context().browser().newContext(),p=await context.newPage();
  try{
    await p.goto('http://127.0.0.1:5186/');await p.waitForLoadState('networkidle');
    const html=await p.evaluate(async()=>{
      const {buildWritingSheetHtml,newSheetToken}=await import('/src/teacher/writing-sheet-print.ts');
      const topic=Array.from({length:45},(_,i)=>`Requirement ${i+1}: Describe a specific action and explain what happened, why you chose to help, and what you learned. Include an example and a clear ending.`).join('\n\n');
      const input={members:[{memberId:'synthetic-member',tokens:[newSheetToken()]}]};
      const packet={taskId:'synthetic-task',taskVersion:1,schoolLabel:'瑞安市新纪元实验学校',draftNumber:1,pageCount:1,sets:[{id:'synthetic-set',memberId:'synthetic-member',name:'合成长姓名同学',className:'合成八年级测试班',academicYear:'2098-1',subjectShort:'test0001',sheets:[{id:'synthetic-page',pageNumber:1,checkCode:'ABCDEF123456'}]}]};
      return buildWritingSheetHtml(packet,input,{assignment:{title:'Long instructions - full content preservation',topic},rubric:{gradeLevel:'八年级',total:20,wordCount:'100 words',items:[{label:'内容与组织',score:20,desc:'所有原要求与评价说明完整保留。'}]}});
    });
    await p.setContent(html);await p.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));});
    const clipped=await p.locator('.writing-page').evaluate(el=>el.querySelector('.sheet-footer').getBoundingClientRect().bottom>el.getBoundingClientRect().bottom-20);if(clipped)throw Error('Long instruction template clipped writing footer');
    await p.pdf({path:'tmp/pdfs/writing-sheets-long.pdf',format:'A4',preferCSSPageSize:true,printBackground:true});return {passed:true,requirements:45};
  }finally{await context.close();}
}
