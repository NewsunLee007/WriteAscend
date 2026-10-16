async page=>{
 const context=await page.context().browser().newContext({viewport:{width:390,height:844}}),p=await context.newPage();
 try{
  await p.goto('http://127.0.0.1:8890/sandbox/use-teacher');await p.goto('http://127.0.0.1:8789/api/auth/start');await p.getByRole('button',{name:'继续进入作文批改',exact:true}).click();if(await p.getByRole('button',{name:'新建空工作区',exact:true}).isVisible())await p.getByRole('button',{name:'新建空工作区',exact:true}).click();await p.getByRole('button',{name:'一键批改',exact:true}).waitFor();
  const tasks=await p.evaluate(async()=>await(await fetch('/api/tasks')).json()),task=tasks.tasks.find(t=>t.title.startsWith('合成收作业')&&t.status==='open');if(!task)throw Error('No verified synthetic task available');
  await p.getByRole('button',{name:'写作任务',exact:true}).click();await p.locator('.teacher-tasks-content article').filter({hasText:task.title}).getByRole('button',{name:'载入批改设置',exact:true}).click();
  await p.locator('.teacher-task-actions').getByRole('button',{name:'扫码收作业',exact:true}).click();await p.getByRole('dialog',{name:'扫码收作业',exact:true}).waitFor();await p.getByRole('button',{name:'收取情况',exact:true}).click();await p.getByText('已收齐 2 人 · 缺页 1 人 · 未收 127 人',{exact:true}).waitFor();
  const fullSize=await p.evaluate(async taskId=>{const list=await(await fetch('/api/tasks/'+taskId+'/collection')).json(),student=list.members.find(m=>m.receivedPages>0),state=await(await fetch('/api/tasks/'+taskId+'/collection?memberId='+student.id)).json(),id=state.draft.manifest.pages[0].assetId,image=new Image();image.src='/api/assets/'+id;await image.decode();return {width:image.naturalWidth,height:image.naturalHeight};},task.id);if(fullSize.width!==1400||fullSize.height!==1980)throw Error('Collection stored a thumbnail instead of the full-page original');
  await p.screenshot({path:'output/writing-collection-roster-mobile.png',fullPage:false});
  await p.getByRole('button',{name:'关闭扫码收作业',exact:true}).click();if(await p.getByRole('dialog',{name:'写作任务与学校名册',exact:true}).count())throw Error('Shortcut returned to the task list instead of the teacher workbench');
  if(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Active-task shortcut overflows on mobile');return {passed:true,loadedTaskOpensCollectionDirectly:true,currentReceiptsPreserved:true,originalPhotoDimensionsPreserved:true};
 }finally{await context.close();}
}
