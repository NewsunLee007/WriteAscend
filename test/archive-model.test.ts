import test from 'node:test';
import assert from 'node:assert/strict';
import {archiveNumber,archiveRows,filterArchiveRows,type ArchiveFilter} from '../src/teacher/archive-model';

const all:ArchiveFilter={query:'',className:'',status:'all',days:'',sort:'original'};
test('archive distinguishes a recorded zero from an absent score and keeps unknown dates last',()=>{
  for(const value of [null,undefined,'','  ','invalid'])assert.equal(archiveNumber(value),null);
  const rows=archiveRows([
    {id:'unknown',status:'success',result:{total_score:null}},
    {id:'zero',status:'success',result:{total_score:0,graded_at:'2026-10-16T10:00:00Z'}},
    {id:'top',status:'success',result:{total_score:'18',graded_at:'2026-10-17T10:00:00Z'}},
  ],[]);
  assert.equal(rows[0].date,null);assert.equal(rows[1].score,0);
  assert.deepEqual(filterArchiveRows(rows,{...all,sort:'score'}).map(r=>r.file.id),['top','zero','unknown']);
  assert.deepEqual(filterArchiveRows(rows,{...all,sort:'date'}).map(r=>r.file.id),['top','zero','unknown']);
});
test('archive search supports initials while class and identity keep same-name students distinct',()=>{
  const rows=archiveRows([
    {id:'first',status:'success',result:{student_name:'李明',class_name:'八13班',bound_identity:{subject:'daily-000001'}}},
    {id:'second',status:'success',result:{student_name:'李明',class_name:'八14班',bound_identity:{subject:'daily-000002'}}},
  ],[]);
  assert.equal(filterArchiveRows(rows,{...all,query:'lm'}).length,2);
  assert.deepEqual(filterArchiveRows(rows,{...all,query:'lm',className:'八14班'}).map(r=>r.file.id),['second']);
  assert.deepEqual(filterArchiveRows(rows,{...all,query:'000001'}).map(r=>r.file.id),['first']);
});
test('archive only applies date windows to recorded dates and surfaces unresolved identity issues',()=>{
  const now=Date.parse('2026-10-17T12:00:00Z');
  const rows=archiveRows([
    {id:'old',status:'success',result:{graded_at:'2026-09-01T00:00:00Z'}},
    {id:'missing',status:'success',result:{}},
    {id:'recent',status:'success',result:{graded_at:now,identity_name_mismatch:true}},
    {id:'verified',status:'success',result:{identity_name_mismatch:true,identity_name_mismatch_verified:true}},
    {id:'failed',status:'error'},
  ],[]);
  assert.deepEqual(filterArchiveRows(rows,{...all,days:'7'},now).map(r=>r.file.id),['recent']);
  assert.deepEqual(filterArchiveRows(rows,{...all,status:'issues'},now).map(r=>r.file.id),['recent','failed']);
  assert.deepEqual(filterArchiveRows(rows,{...all,status:'pending'},now).map(r=>r.file.id),['failed']);
});
