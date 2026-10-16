async page => {
  let schoolName='合成管理学校 '+Date.now();
  const root='http://127.0.0.1:8789',academicYear='2098-1',contexts=[],errors=[];
  async function login(mode){
    const context=await page.context().browser().newContext({viewport:{width:390,height:844}});contexts.push(context);const p=await context.newPage(),adminScripts=[];
    p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(/SchoolDirectoryPanel.*\.js/.test(r.url()))adminScripts.push(r.url());});
    await p.goto('http://127.0.0.1:8890/sandbox/use-'+mode);await p.goto(root+'/api/auth/start');await p.getByRole('button',{name:'继续进入作文批改',exact:true}).click();await p.getByRole('button',{name:'一键批改',exact:true}).waitFor();return {p,adminScripts};
  }
  async function api(p,path,body){return p.evaluate(async({path,body})=>{const me=await(await fetch('/api/me')).json(),r=await fetch(path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Workspace-Id':me.workspaceId},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};},{path,body});}
  try{
    const {p:admin}=await login('admin');await admin.getByRole('button',{name:'学校目录与教师授权',exact:true}).click();
    const dialog=admin.getByRole('dialog',{name:'学校目录与教师授权',exact:true});await dialog.getByText('当前在用学校学生 133 人 · 2 个源班级',{exact:true}).waitFor();
    if(await dialog.getByLabel('目录学期',{exact:true}).inputValue()!=='')throw Error('School year was guessed from the current date');
    const initial=(await api(admin,'/api/admin/writing-directory/overview')).body;
    const existing=initial.schools.find(s=>s.name.startsWith('合成管理学校')&&initial.classes.some(c=>c.school_id===s.id&&c.academic_year===academicYear));
    if(existing){schoolName=existing.name;await dialog.getByLabel('所属学校',{exact:true}).selectOption(existing.id);}else await dialog.getByLabel('学校名称',{exact:true}).fill(schoolName);
    await dialog.getByRole('button',{name:'全选源班级',exact:true}).click();
    if(await dialog.getByRole('button',{name:'预检目录变更',exact:true}).isEnabled())throw Error('Directory preview accepted a missing confirmed school year');
    await dialog.getByLabel('目录学期',{exact:true}).fill(academicYear);await dialog.getByRole('button',{name:'预检目录变更',exact:true}).click();
    await dialog.getByRole('heading',{name:'待确认：'+schoolName+' · '+academicYear,exact:true}).waitFor();
    if(await dialog.getByRole('button',{name:'确认同步目录',exact:true}).isEnabled())throw Error('Directory sync did not require review of concrete changes');
    await dialog.getByRole('checkbox',{name:'我已核对学校、学期与名册变更',exact:true}).check();await dialog.getByRole('button',{name:'确认同步目录',exact:true}).click();
    await dialog.getByText('目录已同步：2 个班级，133 名学生。请继续设置教师权限。',{exact:true}).waitFor();
    const overview=(await api(admin,'/api/admin/writing-directory/overview')).body,school=overview.schools.find(s=>s.name===schoolName),classroom=overview.classes.find(c=>c.school_id===school.id&&c.source_name==='合成学校班');
    if(!classroom||classroom.memberCount!==130)throw Error('Directory member count was not persisted');
    await dialog.getByRole('button',{name:'教师授权',exact:true}).click();await dialog.getByLabel('授权教师账号',{exact:true}).selectOption('synthetic-other');await dialog.getByLabel('授权班级',{exact:true}).selectOption(classroom.id);
    await dialog.getByRole('checkbox',{name:'发布批改结果',exact:true}).uncheck();
    await dialog.getByRole('checkbox',{name:'发布批改结果',exact:true}).check();await dialog.getByRole('button',{name:'保存教师权限',exact:true}).click();await dialog.getByText('教师权限已保存，新请求将使用当前授权。',{exact:true}).waitFor();
    await admin.screenshot({path:'output/school-directory-grants-mobile.png',fullPage:false});
    const {p:teacher,adminScripts}=await login('other');if(await teacher.getByRole('button',{name:'学校目录与教师授权',exact:true}).count())throw Error('A teacher was shown admin controls');if(adminScripts.length)throw Error('Admin-only UI was downloaded for a regular teacher');
    if((await api(teacher,'/api/admin/writing-directory/overview')).status!==403)throw Error('A teacher accessed directory administration');
    const classes=(await api(teacher,'/api/classes')).body.classes;if(!classes.some(c=>c.id===classroom.id&&c.scopes.includes('writing.publish')))throw Error('Grant did not reach the live teacher session');
    const fixture=await(await teacher.request.get('http://127.0.0.1:5186/scripts/qa/fixtures/teacher-workflow.json')).json();
    const created=await api(teacher,'/api/tasks',{requestId:crypto.randomUUID(),title:'授权后合成任务',assignment:fixture.seed.assignment,rubric:fixture.seed.rubric,classIds:[classroom.id]});if(created.status!==201)throw Error('Authorized teacher could not create a task');
    const task=created.body.task,preview=(await api(teacher,'/api/tasks/'+task.id+'/preview')).body;if(preview.members.length!==130)throw Error('Fresh authority roster is incomplete');
    if((await api(teacher,'/api/tasks/'+task.id+'/activate',{requestId:crypto.randomUUID(),expectedRevision:task.revision,rosterHash:preview.rosterHash})).status!==200)throw Error('Reviewed class task could not be established');
    const grantRow=dialog.locator('article').filter({hasText:'另一位合成教师'}).filter({hasText:schoolName});await grantRow.getByRole('button',{name:'撤销本班权限',exact:true}).click();await dialog.getByText('教师班级权限已撤销。',{exact:true}).waitFor();
    if((await api(teacher,'/api/classes')).body.classes.some(c=>c.id===classroom.id)||(await api(teacher,'/api/tasks/'+task.id+'/members')).status!==403)throw Error('Revocation did not take effect on the existing teacher session');
    await dialog.getByRole('button',{name:'保存教师权限',exact:true}).click();await dialog.getByText('教师权限已保存，新请求将使用当前授权。',{exact:true}).waitFor();
    await dialog.getByRole('button',{name:'目录班级',exact:true}).click();await dialog.locator('article').filter({hasText:schoolName}).filter({hasText:'合成学校班'}).getByRole('button',{name:'停用此班级',exact:true}).click();
    await dialog.getByRole('checkbox',{name:'我已核对要停用的班级',exact:true}).check();await dialog.getByRole('button',{name:'确认停用班级',exact:true}).click();await dialog.getByText('班级已停用，任教权限已撤销，历史记录保留。',{exact:true}).waitFor();
    if((await api(teacher,'/api/classes')).body.classes.some(c=>c.id===classroom.id))throw Error('Inactive class still grants teacher access');
    await dialog.getByRole('button',{name:'名册预检',exact:true}).click();await dialog.getByRole('button',{name:'预检目录变更',exact:true}).click();await dialog.getByRole('heading',{name:'待确认：'+schoolName+' · '+academicYear,exact:true}).waitFor();
    await dialog.getByRole('checkbox',{name:'我已核对学校、学期与名册变更',exact:true}).check();await dialog.getByRole('button',{name:'确认同步目录',exact:true}).click();await dialog.getByText('目录已同步：2 个班级，133 名学生。请继续设置教师权限。',{exact:true}).waitFor();
    const after=(await api(admin,'/api/admin/writing-directory/overview')).body;if(after.classes.find(c=>c.id===classroom.id)?.memberCount!==130)throw Error('Class reactivation lost membership or stable class ID');
    if((await api(teacher,'/api/classes')).body.classes.some(c=>c.id===classroom.id))throw Error('Class reactivation silently restored old teacher permissions');
    if(await admin.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Admin mobile screen overflows');if(errors.length)throw Error(errors.join('; '));
    return {passed:true,sourceStudents:133,sourceClasses:2,taskMembers:130,liveRevocation:true,reactivationKeepsGrantsRevoked:true,mobileWidth:390};
  }finally{await Promise.all(contexts.map(c=>c.close()));}
}
