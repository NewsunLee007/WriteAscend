async page=>{
  const context=await page.context().browser().newContext(),p=await context.newPage();
  try{await p.goto('http://127.0.0.1:5186/');await p.waitForLoadState('networkidle');return await p.evaluate(async()=>{
    const m=await import('/src/teacher/scan-outbox.ts'),a='synthetic-a'.repeat(6),b='synthetic-b'.repeat(6),ea=await m.scanWorkspaceEpoch(a),eb=await m.scanWorkspaceEpoch(b),item=(workspaceId,epoch)=>({id:crypto.randomUUID(),workspaceId,epoch,taskId:'synthetic-task',fileName:'synthetic.jpg',blob:new Blob(['synthetic-photo'],{type:'image/jpeg'}),created:Date.now(),stage:'identified',mode:'manual',draftNumber:1,pageNumber:1,pageCount:1,identityNote:'合成人工核对',confirmed:true,warnings:[]});
    const old=item(a,ea),other=item(b,eb);await Promise.all([m.saveScanItem(old),m.saveScanItem(other)]);
    if((await m.readScanItems(a)).length!==1||(await m.readScanItems(b)).length!==1)throw Error('Outbox accounts were mixed');
    await m.clearScanWorkspace(a);let rejected=false;try{await m.saveScanItem(old);}catch{rejected=true;}
    if(!rejected||(await m.readScanItems(a)).length||(await m.readScanItems(b)).length!==1)throw Error('A stale upload resurrected a cleared private photo');
    const newEpoch=await m.scanWorkspaceEpoch(a);if(newEpoch===ea)throw Error('Logout did not rotate the cache generation');
    const fresh=item(a,newEpoch);await m.saveScanItem(fresh);const read=await m.readScanItems(a,'synthetic-task');if(read.length!==1||await read[0].blob.text()!=='synthetic-photo')throw Error('A new session could not persist its original photo');
    await Promise.all([m.clearScanWorkspace(a),m.clearScanWorkspace(b)]);return {passed:true,workspaceIsolation:true,blobsPersisted:true,staleWritesAfterLogoutRejected:true,newSessionCanSave:true};
  });}finally{await context.close();}
}
