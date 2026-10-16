import test from 'node:test';
import assert from 'node:assert/strict';
import {indexStudent,matchesStudent} from '../src/teacher/student-search';
import {availableCapturePages,captureConflict} from '../src/teacher/capture-identity';

test('student search supports Chinese, pinyin initials, full pinyin, compound surnames and class/number combinations',()=>{
  const student=indexStudent({name:'张小明',className:'八年级3班',subjectShort:'AB345678'});
  for(const query of ['张小','zxm','ZXM','zhangxiaoming','zxm 3班',' zxm AB345 '])assert(matchesStudent(student,query),query);
  assert(!matchesStudent(student,'zxm 4班'));
  assert(matchesStudent(indexStudent({name:'欧阳娜娜'}),'oynn'));
  assert(matchesStudent(indexStudent({name:'吕雨婷'}),'lv yuting'));
  assert(matchesStudent(indexStudent({name:'单乐'}),'sl'));
  assert(matchesStudent(indexStudent({name:'单乐'}),'dl'));
  assert(matchesStudent(indexStudent({name:'曾长乐'}),'zcl'));
  assert(matchesStudent(indexStudent({name:'李明',aliases:['李小明']}),'lxm'));
});
test('same-name search keeps every candidate and requires class or short ID to disambiguate',()=>{
  const students=[{id:'a',name:'张小明',className:'八年级1班',subjectShort:'00000001'},{id:'b',name:'张小明',className:'八年级2班',subjectShort:'00000002'}];
  const find=(query:string)=>students.filter(s=>matchesStudent(indexStudent(s),query)).map(s=>s.id);
  assert.deepEqual(find('zxm'),['a','b']);assert.deepEqual(find('zxm 2班'),['b']);assert.deepEqual(find('zxm 00000001'),['a']);
});
test('capture identity detects QR member, draft and page conflicts; page suggestions retain missing pages',()=>{
  const intent={memberId:'one',draftNumber:2,pageNumber:1,pageCount:2};
  assert.equal(captureConflict(intent,{...intent}),'');
  assert.match(captureConflict(intent,{...intent,memberId:'two'}),/学生/);
  assert.match(captureConflict(intent,{...intent,draftNumber:1}),/稿次/);
  assert.match(captureConflict(intent,{...intent,pageNumber:2}),/页码/);
  assert.match(captureConflict(intent,{...intent,pageCount:1}),/页码/);
  assert.deepEqual(availableCapturePages(4,[2],[1]),[3,4]);
  assert.deepEqual(availableCapturePages(2,[1,2]),[]);
});
