import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseGradingModel,chooseOcrModel,supportsPurpose,type TeacherModelProfile} from '../src/teacher/model-selection';
test('grading and OCR reuse an eligible model by default, retain explicit OCR choice, and exclude text-only models',()=>{
  const profiles:TeacherModelProfile[]=[{id:'text',label:'Text',model:'text',supportsImages:false},{id:'grading',label:'Grading',model:'vision',purposes:['grading']},{id:'both',label:'Both',model:'vision',purposes:['grading','ocr']},{id:'ocr',label:'OCR',model:'vision',purposes:['ocr']}];
  assert.equal(chooseGradingModel(profiles,'text'),'grading');
  assert.equal(chooseGradingModel(profiles,'ocr'),'grading');
  assert.equal(chooseOcrModel(profiles,'both',''),'both');
  assert.equal(chooseOcrModel(profiles,'both','ocr'),'ocr');
  assert.equal(chooseOcrModel(profiles,'grading','missing'),'both');
  assert.equal(chooseOcrModel([profiles[0]],'text',''),'');
  assert(supportsPurpose({id:'legacy',label:'Legacy',model:'legacy-vision'},'ocr'));
});

test('unavailable or removed personal selections never silently switch to a system billing account',()=>{
 const system={id:'default',label:'系统',model:'vision'},mine={id:'personal_123',label:'个人',model:'vision',available:false};assert.equal(chooseGradingModel([system,mine],mine.id),'');assert.equal(chooseGradingModel([system],mine.id),'');assert.equal(chooseOcrModel([system,mine],system.id,mine.id),'');assert.equal(chooseOcrModel([system],'',''),'');
});
