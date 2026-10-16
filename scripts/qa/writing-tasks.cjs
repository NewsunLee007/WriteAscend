async page => {
  const fixture=await(await page.request.get('http://127.0.0.1:5186/scripts/qa/fixtures/teacher-workflow.json')).json(),root='http://127.0.0.1:8789';
  const context=await page.context().browser().newContext({viewport:{width:390,height:844}}),p=await context.newPage(),errors=[];
  p.on('pageerror',e=>errors.push(e.message));const title='合成班任务 '+Date.now();
  async function api(path,body,method){return p.evaluate(async({path,body,method})=>{
    const me=await(await fetch('/api/me')).json(),response=await fetch(path,{method:method||(body?'POST':'GET'),headers:{'Content-Type':'application/json','X-Workspace-Id':me.workspaceId},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()};
  },{path,body,method});}
  try{
    await p.goto(root+'/');await p.getByRole('link',{name:'使用 Daily 登录',exact:true}).waitFor();
    await p.evaluate(seed=>localStorage.setItem('smart_grader_data_v5_0',JSON.stringify(seed)),fixture.seed);
    await p.goto(root+'/api/auth/start');await p.getByRole('button',{name:'继续进入作文批改',exact:true}).click();await p.getByRole('button',{name:'带入本机原有数据',exact:true}).click();
    await p.getByRole('button',{name:'写作任务',exact:true}).click();
    const dialog=p.getByRole('dialog',{name:'写作任务与学校名册',exact:true});
    await dialog.getByLabel('写作任务名称',{exact:true}).fill(title);await dialog.getByRole('checkbox',{name:/合成学校班/}).check();
    await dialog.getByRole('button',{name:'保存为新任务草稿',exact:true}).click();
    await dialog.getByText('已保存任务草稿。请预览并核对学校名单，再建立班级任务。',{exact:true}).waitFor();
    await p.getByRole('button',{name:'关闭写作任务',exact:true}).click();
    const topic=fixture.seed.assignment.topic+' Add a clear ending.';if(await p.getByRole('button',{name:'编辑本次写作',exact:true}).isVisible())await p.getByRole('button',{name:'编辑本次写作',exact:true}).click();await p.getByLabel(/写作要求/).fill(topic);
    await p.getByRole('button',{name:'写作任务',exact:true}).click();await dialog.getByLabel('写作任务名称',{exact:true}).fill(title);
    const row=dialog.locator('article').filter({hasText:title});await row.getByRole('button',{name:'用当前设置更新草稿',exact:true}).click();
    await row.getByText('草稿 · 标准第 2 版 · 0 人',{exact:true}).waitFor();
    await row.getByRole('button',{name:'预览学校名单',exact:true}).click();
    await dialog.getByRole('heading',{name:title+' · 130 名学生',exact:true}).waitFor();
    await dialog.getByLabel('搜索任务学生',{exact:true}).fill('合成同名');
    if(await dialog.locator('.task-member-list strong').filter({hasText:'合成同名'}).count()!==2)throw Error('Same-name authority students were merged');
    await dialog.getByRole('button',{name:'确认名单并建立任务',exact:true}).click();
    await dialog.getByText('班级任务已建立，名单与评分标准已固定。可载入原批改工作台。',{exact:true}).waitFor();
    const list=await api('/api/tasks'),task=list.body.tasks.find(t=>t.title===title);if(!task||task.memberCount!==130||task.version!==2)throw Error('Task creation did not persist the full roster and rubric version');
    const old=await api('/api/tasks/'+task.id+'?version=1');if(old.body.document.assignment.topic!==fixture.seed.assignment.topic)throw Error('Historical task topic was overwritten');
    const mutate=await api('/api/tasks/'+task.id,{requestId:crypto.randomUUID(),expectedRevision:task.revision,title,assignment:fixture.seed.assignment,rubric:fixture.seed.rubric,classIds:['synthetic-school-class']},'PUT');if(mutate.status!==409)throw Error('An established task rubric was overwritten');
    await row.getByRole('button',{name:'载入批改设置',exact:true}).click();await dialog.waitFor({state:'hidden'});
    if(await p.getByLabel(/写作要求/).inputValue()!==topic)throw Error('Loading task settings did not restore the original writing requirements');
    const workspace=(await api('/api/me')).body.workspaceId;
    const data=await p.evaluate(id=>JSON.parse(localStorage.getItem('wa_workspace:'+id+':smart_grader_data_v5_0')),workspace);
    const roster=data.classes.find(c=>c.id==='daily:synthetic-school-class');if(roster.students.length!==130||roster.students.some(s=>s.no))throw Error('Authority roster was truncated or school numbers were invented');
    const baseline=(await(await p.request.get('http://127.0.0.1:8890/sandbox/metrics')).json()).modelCalls;
    await p.locator('input[type="file"][multiple]').setInputFiles({name:'合成同名.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6b9sAAAAASUVORK5CYII=','base64')});
    await p.getByRole('button',{name:'一键批改（1份）',exact:true}).click();await p.getByRole('heading',{name:'保存批改结果',exact:true}).waitFor({timeout:40000});
    await p.getByRole('button',{name:'保存',exact:true}).click();await p.getByText('已保存到云端 · 第 1 版',{exact:true}).waitFor();
    const saved=await p.evaluate(id=>JSON.parse(localStorage.getItem('wa_workspace:'+id+':smart_grader_saved_results_v1'))[0],workspace),result=saved.data.files[0].result;
    if(result.student_id||result.identity_status!=='ambiguous'||result.identity_candidates.length!==2)throw Error('Same-name handwriting was silently linked to a single school student: '+JSON.stringify(result));
    if(saved.data.sourceTask.id!==task.id||saved.data.sourceTask.version!==2)throw Error('Saved original report lost its source task reference');
    if((await(await p.request.get('http://127.0.0.1:8890/sandbox/metrics')).json()).modelCalls-baseline!==1)throw Error('Task grading did not reuse one-click model flow');
    await p.getByLabel('报告学生姓名',{exact:true}).fill('示例同学');await p.getByLabel('报告学生姓名',{exact:true}).blur();
    await p.waitForFunction(id=>JSON.parse(localStorage.getItem('wa_workspace:'+id+':smart_grader_student_profiles_v1')||'{}')['wordup:synthetic-student-002']?.records.length===1,workspace);
    await p.getByLabel('报告学生姓名',{exact:true}).fill('合成同名');await p.getByLabel('报告学生姓名',{exact:true}).blur();
    await p.waitForFunction(id=>JSON.parse(localStorage.getItem('wa_workspace:'+id+':smart_grader_student_profiles_v1')||'{}')['wordup:synthetic-student-002']?.records.length===0,workspace);
    await p.getByRole('button',{name:'写作任务',exact:true}).click();await row.getByRole('button',{name:'载入批改设置',exact:true}).click();
    await dialog.getByText('当前批次已有作文。请先保存结果，再到完整工作台的“导入作文”中清空重选，然后载入任务，避免旧报告套用新标准。',{exact:true}).waitFor();
    await row.getByRole('button',{name:'查看任务名单',exact:true}).click();await dialog.getByRole('heading',{name:title+' · 130 名学生',exact:true}).waitFor();
    await dialog.getByLabel('搜索任务学生',{exact:true}).fill('合成同名');
    await p.screenshot({path:'output/writing-task-roster-mobile.png',fullPage:false});
    if(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Task mobile page overflows');
    await dialog.getByRole('button',{name:'返回任务列表',exact:true}).click();await row.getByRole('button',{name:'关闭任务',exact:true}).click();await row.getByText('已关闭 · 标准第 2 版 · 130 人',{exact:true}).waitFor();
    await p.getByRole('button',{name:'关闭写作任务',exact:true}).click();await p.getByRole('button',{name:'退出',exact:true}).click();await p.getByRole('link',{name:'使用 Daily 登录',exact:true}).waitFor();
    await p.goto('http://127.0.0.1:8890/sandbox/use-other');await p.goto(root+'/api/auth/start');await p.getByRole('button',{name:'继续进入作文批改',exact:true}).click();await p.getByRole('button',{name:'新建空工作区',exact:true}).click();
    await p.getByRole('button',{name:'写作任务',exact:true}).click();await dialog.getByText('当前没有学校班级管理权限。可先保存私人任务草稿，待管理员确认学校目录并授权后，再选择班级。',{exact:true}).waitFor();
    if((await api('/api/tasks/'+task.id)).status!==404)throw Error('Another teacher can read the school task');
    if(errors.length)throw Error(errors.join('; '));
  }catch(error){throw Error(error.message+'\nTask UI: '+await p.locator('.teacher-tasks-dialog').innerText().catch(()=>''));}finally{await context.close();}
}
