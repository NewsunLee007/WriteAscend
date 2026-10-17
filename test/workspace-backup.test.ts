import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkspaceBackup,prepareWorkspaceBackup,persistWorkspaceRestore,migrateLocalWorkspace,needsLocalMigration} from '../src/teacher/workspace-backup';
import {sampleBackup} from '../src/report/fixtures';
import {importLegacy} from '../src/report/legacy-import';
class MemoryStorage{
 data=new Map<string,string>();writes=0;failAt=0;
 getItem(key:string){return this.data.get(key)??null;}
 setItem(key:string,value:string){if(++this.writes===this.failAt)throw Error('QuotaExceededError');this.data.set(key,value);}
 removeItem(key:string){this.data.delete(key);}
}
const histories={csvExportHistory:[{id:'csv',csv:'name,score\n合成学生,15'}],savedGradingResults:[{id:'batch',data:sampleBackup}],rubricHistory:[{id:'rubric',data:sampleBackup}],analysisHistory:[{id:'analysis',result:{summary:'保留班级分析'}}]};
test('portable workspace backup preserves all histories and original grading fields while removing credentials',async()=>{
 const backup=createWorkspaceBackup({...sampleBackup,studentProfiles:{local:{name:'合成学生',records:[]}},config:{apiKey:'private-key',headers:{Authorization:'private-bearer'},model:'original-model'}},histories);
 const text=JSON.stringify(backup);assert(!text.includes('private-key'));assert(!text.includes('private-bearer'));assert(text.includes('original-model'));
 const prepared=prepareWorkspaceBackup(backup);assert.equal(prepared.summary.history,4);assert.equal(prepared.summary.profiles,1);assert.deepEqual(prepared.histories,histories);
 const old=await importLegacy(sampleBackup),restored=await importLegacy(backup);assert.equal(restored.reports[0].result.total_score,old.reports[0].result.total_score);assert.deepEqual(restored.reports[0].result.errors,old.reports[0].result.errors);
});
test('old exported backups still restore without clearing absent histories or loading stale image links',()=>{
 const prepared=prepareWorkspaceBackup({...sampleBackup,config:{apiKey:'old-secret'},files:[{id:'a',status:'loading',cloudBoundRef:{taskId:'other-task'},result:{brief_comment:'原批语',original_image_url:'https://unrelated.test/image',original_image_urls:['blob:expired']}}]});
 assert.equal(prepared.removedCredentialFields,1);assert.deepEqual(prepared.histories,{});assert.equal(prepared.data.files[0].status,'success');assert(!prepared.data.files[0].result.original_image_url);assert(!prepared.data.files[0].result.original_image_urls);
});
test('storage-shaped backup reads serialized historical keys without treating local identity as school authority',()=>{
 const prepared=prepareWorkspaceBackup({smart_grader_data_v5_0:JSON.stringify({...sampleBackup,classes:[{id:'local-class',students:[{id:'old',name:'合成学生'}]}]}),smart_grader_student_profiles_v1:JSON.stringify({old:{records:[]}}),smart_grader_saved_results_v1:JSON.stringify(histories.savedGradingResults)});
 assert.equal(prepared.summary.classes,1);assert.equal(prepared.summary.profiles,1);assert.deepEqual(prepared.histories.savedGradingResults,histories.savedGradingResults);assert.equal(prepared.data.classes[0].students[0].id,'old');
});
test('embedded raster originals survive portable restore while SVG and remote links are not loaded',()=>{
 const raster='data:image/png;base64,aGVsbG8=';
 const prepared=prepareWorkspaceBackup({files:[{result:{total_score:15,original_image_url:raster,original_image_urls:[raster,'data:image/svg+xml;base64,aGVsbG8=','https://remote.test/image']}}]});
 assert.equal(prepared.data.files[0].result.original_image_url,raster);assert.deepEqual(prepared.data.files[0].result.original_image_urls,[raster]);
});
test('malformed backup is rejected in full before a restore can change teacher state',()=>{
 for(const input of [null,[],{schema:'unrelated',files:[]},{files:[{result:'broken'}]},{classes:[null]},{studentProfiles:{x:{records:'broken'}}},{files:[],savedGradingResults:[null]},{assignment:{},rubric:{total:15,items:[{label:'内容',score:-1}]}}])assert.throws(()=>prepareWorkspaceBackup(input));
});
test('same-origin migration validates every source record before any target write',()=>{
 const source=new MemoryStorage(),target=new MemoryStorage();source.setItem('smart_grader_data_v5_0',JSON.stringify(sampleBackup));source.setItem('smart_grader_rubric_history_v1','{broken');
 assert.throws(()=>migrateLocalWorkspace(source,target,true));assert.equal(target.writes,0);assert(needsLocalMigration(source,target));
});
test('portable restore rolls back settings and all earlier histories when a later storage write runs out of quota',()=>{
 const target=new MemoryStorage();target.setItem('smart_grader_data_v5_0','{"assignment":{"title":"before"}}');target.setItem('smart_grader_saved_results_v1','[{"id":"original-batch"}]');
 const previous=new Map(target.data),prepared=prepareWorkspaceBackup(createWorkspaceBackup({...sampleBackup,studentProfiles:{old:{records:[]}}},histories));target.failAt=target.writes+5;
 assert.throws(()=>persistWorkspaceRestore(target,prepared.data,prepared),/原工作区已保留/);assert.deepEqual(target.data,previous);
 target.failAt=0;persistWorkspaceRestore(target,prepared.data,prepared);assert.equal(JSON.parse(target.getItem('smart_grader_saved_results_v1')!)[0].id,'batch');assert.equal(JSON.parse(target.getItem('smart_grader_class_analysis_history_v1')!)[0].id,'analysis');
 const restored=new Map(target.data);persistWorkspaceRestore(target,prepared.data,prepared);assert.deepEqual(target.data,restored);
});
test('quota failure rolls back partial copies and remains retryable after reload; repeated migration is idempotent',()=>{
 const source=new MemoryStorage(),target=new MemoryStorage();source.setItem('smart_grader_data_v5_0',JSON.stringify({...sampleBackup,config:{apiKey:'secret'}}));source.setItem('smart_grader_saved_results_v1',JSON.stringify(histories.savedGradingResults));
 target.failAt=3;assert.throws(()=>migrateLocalWorkspace(source,target,true));assert.equal(target.data.size,0);assert(needsLocalMigration(source,target));assert(source.getItem('smart_grader_data_v5_0')!.includes('secret'));
 target.failAt=0;migrateLocalWorkspace(source,target,true);const snapshot=[...target.data];assert(!needsLocalMigration(source,target));assert(!target.getItem('smart_grader_data_v5_0')!.includes('secret'));migrateLocalWorkspace(source,target,true);assert.deepEqual([...target.data],snapshot);
});
test('interrupted migration stays visible and an explicit fresh workspace removes partial copies only',()=>{
 const source=new MemoryStorage(),target=new MemoryStorage();source.setItem('smart_grader_saved_results_v1','[]');target.setItem('migration_pending','pending');target.setItem('smart_grader_data_v5_0','{}');target.setItem('cloud_profile','keep-model-selection');
 assert(needsLocalMigration(source,target));migrateLocalWorkspace(source,target,false);assert(!needsLocalMigration(source,target));assert.equal(target.getItem('smart_grader_data_v5_0'),null);assert.equal(target.getItem('cloud_profile'),'keep-model-selection');assert.equal(source.getItem('smart_grader_saved_results_v1'),'[]');
});
