async page => {
  const fixture=await(await page.request.get('http://127.0.0.1:5186/scripts/qa/fixtures/teacher-workflow.json')).json();
  const browser=page.context().browser(),contexts=[],errors=[];
  const root='http://127.0.0.1:8789',name='跨设备合成存档 '+Date.now();
  async function device(){
    const context=await browser.newContext({viewport:{width:390,height:844}});contexts.push(context);
    const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
    await p.goto(root+'/api/auth/start');await p.getByRole('button',{name:'继续进入作文批改',exact:true}).click();
    await p.getByRole('button',{name:'一键批改',exact:true}).waitFor();return p;
  }
  async function api(p,path,body,method){return p.evaluate(async({path,body,method})=>{
    const me=await(await fetch('/api/me')).json();
    const response=await fetch(path,{method:method||(body?'POST':'GET'),headers:{'Content-Type':'application/json','X-Workspace-Id':me.workspaceId},...(body?{body:JSON.stringify(body)}:{})});
    return {status:response.status,body:await response.json()};
  },{path,body,method});}
  async function restore(p){
    await p.getByRole('button',{name:'云端存档',exact:true}).click();
    const dialog=p.getByRole('dialog',{name:'云端批改存档',exact:true});
    await dialog.getByLabel('搜索云端存档').fill(name);await dialog.getByRole('button',{name:'搜索',exact:true}).click();
    await dialog.locator('article').filter({hasText:name}).filter({hasNotText:'（副本）'}).getByRole('button',{name:'恢复',exact:true}).click();
    await dialog.waitFor({state:'hidden'});
    await p.getByLabel('总体评价',{exact:true}).waitFor();
  }
  async function save(p,update=true){
    await p.getByRole('button',{name:'保存批改结果',exact:true}).click();
    if(update)await p.getByRole('checkbox',{name:/更新当前云端存档/}).check();
    await p.getByLabel('批改存档名称',{exact:true}).fill(name);
    await p.getByRole('button',{name:'保存',exact:true}).click();
  }
  try{
    const a=await device();
    const asset=await a.evaluate(async()=>{
      const me=await(await fetch('/api/me')).json(),bytes=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6b9sAAAAASUVORK5CYII='),c=>c.charCodeAt(0));
      const r=await fetch('/api/assets',{method:'POST',headers:{'Content-Type':'image/png','X-Workspace-Id':me.workspaceId},body:bytes});if(!r.ok)throw Error('Asset upload failed');return r.json();
    });
    const snapshot={id:'qa-'+Date.now(),name,savedAt:new Date().toISOString(),className:'示例班',data:{...fixture.seed,studentProfiles:{},files:[{id:'synthetic-cloud-file',name:'示例同学.png',status:'success',cloudAssetIds:[asset.id],result:JSON.parse(fixture.response.choices[0].message.content)}]}};
    delete snapshot.data.config;
    const initial=await api(a,'/api/snapshots',{requestId:'qa-initial-'+Date.now(),expectedRevision:0,snapshot});
    if(initial.status!==201)throw Error('Initial save failed: '+JSON.stringify(initial));
    const id=initial.body.cloud.id;
    await restore(a);
    if(await a.getByLabel('作文总分',{exact:true}).inputValue()!=='15.5')throw Error('Restored score changed');
    const photo=await a.evaluate(async id=>{const r=await fetch('/api/assets/'+id);return {status:r.status,bytes:(await r.arrayBuffer()).byteLength};},asset.id);
    if(photo.status!==200||photo.bytes!==asset.bytes)throw Error('Cross-device original image was lost');
    const b=await device();await restore(b);
    await a.getByLabel('总体评价',{exact:true}).fill('设备 A 的人工核对意见');await a.getByLabel('总体评价',{exact:true}).blur();
    await a.getByLabel('作文总分',{exact:true}).fill('14.5');await a.getByLabel('作文总分',{exact:true}).blur();
    await save(a);await a.getByText('已保存到云端 · 第 2 版',{exact:true}).waitFor();
    const second=await api(a,'/api/snapshots/'+id),first=await api(a,'/api/snapshots/'+id+'?revision=1');
    if(second.body.snapshot.data.files[0].result.brief_comment!=='设备 A 的人工核对意见'||second.body.snapshot.data.files[0].result.total_score!==14.5)throw Error('Manual edits were not synchronized');
    if(first.body.snapshot.data.files[0].result.total_score!==15.5||JSON.stringify(first.body.snapshot.data.rubric)!==JSON.stringify(snapshot.data.rubric))throw Error('Historical score or rubric changed');
    await b.getByLabel('总体评价',{exact:true}).fill('设备 B 的独立修改');await b.getByLabel('总体评价',{exact:true}).blur();
    await save(b);await b.getByRole('button',{name:'另存云端副本',exact:true}).waitFor();
    if((await api(a,'/api/snapshots/'+id)).body.cloud.revision!==2)throw Error('Stale device overwrote current report');
    await b.getByRole('button',{name:'另存云端副本',exact:true}).click();
    await b.getByText('已保存到云端 · 第 1 版',{exact:true}).waitFor();
    const copies=await api(b,'/api/snapshots?q='+encodeURIComponent('副本'));
    const copy=copies.body.snapshots.find(s=>s.name.includes('副本')&&s.localId!==snapshot.id);
    if(!copy||(await api(b,'/api/snapshots/'+copy.id)).body.snapshot.data.files[0].result.brief_comment!=='设备 B 的独立修改')throw Error('Conflict copy lost teacher edits');
    await restore(a);
    await a.getByLabel('总体评价',{exact:true}).fill('断网后待同步的教师意见');await a.getByLabel('总体评价',{exact:true}).blur();
    await a.route(root+'/api/snapshots',route=>route.request().method()==='POST'?route.abort('internetdisconnected'):route.continue());
    await save(a);await a.getByRole('button',{name:'重试同步',exact:true}).waitFor();
    await a.unroute(root+'/api/snapshots');await a.reload();
    await a.getByText('已保存到云端 · 第 3 版',{exact:true}).waitFor();
    const final=await api(a,'/api/snapshots/'+id),versions=await api(a,'/api/snapshots/'+id+'/versions');
    if(final.body.snapshot.data.files[0].result.brief_comment!=='断网后待同步的教师意见'||versions.body.versions.length!==3)throw Error('Reload did not resume exactly one pending save: '+JSON.stringify({comment:final.body.snapshot?.data.files[0].result.brief_comment,versions:versions.body}));
    await a.getByRole('button',{name:'云端存档',exact:true}).click();
    const dialog=a.getByRole('dialog',{name:'云端批改存档',exact:true});await dialog.getByLabel('搜索云端存档').fill(name);await dialog.getByRole('button',{name:'搜索',exact:true}).click();
    await dialog.locator('article').filter({hasText:name}).filter({hasNotText:'（副本）'}).getByRole('button',{name:'版本',exact:true}).click();
    await dialog.locator('article').filter({hasText:'第 1 版'}).getByRole('button',{name:'恢复此版本',exact:true}).click();
    await dialog.waitFor({state:'hidden'});
    if(await a.getByLabel('作文总分',{exact:true}).inputValue()!=='15.5')throw Error('Historical version restore changed original score');
    await a.getByRole('button',{name:'云端存档',exact:true}).click();await a.screenshot({path:'output/cloud-snapshots-mobile.png',fullPage:false});
    if(await a.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Cloud history overflows mobile screen');
    await a.route(root+'/api/snapshots?*',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{message:'合成存档列表暂不可用。'}})}));
    await dialog.getByRole('button',{name:'搜索',exact:true}).click();
    await dialog.getByText('合成存档列表暂不可用。',{exact:true}).waitFor();
    await a.unroute(root+'/api/snapshots?*');await dialog.getByRole('button',{name:'搜索',exact:true}).click();
    await dialog.getByText('合成存档列表暂不可用。',{exact:true}).waitFor({state:'hidden'});
    await a.getByRole('button',{name:'关闭云端存档',exact:true}).click();
    await a.getByRole('button',{name:'退出',exact:true}).click();await a.getByRole('link',{name:'使用 Daily 登录',exact:true}).waitFor();
    await a.goto('http://127.0.0.1:8890/sandbox/use-other');await a.goto(root+'/api/auth/start');await a.getByRole('button',{name:'继续进入作文批改',exact:true}).click();
    await a.getByText('另一位合成教师 · 云端工作区',{exact:true}).waitFor();
    if((await api(a,'/api/snapshots/'+id)).status!==404||(await api(a,'/api/assets/'+asset.id+'/meta')).status!==404)throw Error('Another teacher accessed a report or image');
    const wrong=await a.evaluate(async()=>({status:(await fetch('/api/snapshots',{method:'POST',headers:{'Content-Type':'application/json','X-Workspace-Id':'previous-account'},body:'{}'})).status}));
    if(wrong.status!==403)throw Error('Cross-account pending mutation was accepted');
    if(errors.length)throw Error('Browser errors: '+errors.join('; '));
  }finally{await Promise.all(contexts.map(context=>context.close()));}
}
