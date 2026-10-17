import test from 'node:test';
import assert from 'node:assert/strict';
import {canEnterTaskStage,type TaskStage} from '../src/teacher/task-stages';
const stages:TaskStage[]=['brief','sheets','collect','grade','publish','peer'];
test('draft task cannot bypass roster confirmation through next-step navigation',()=>{
 assert.deepEqual(stages.filter(s=>canEnterTaskStage(s,{status:'draft'},true,true)),['brief']);
});
test('collection-only teachers cannot enter grading or publishing through the footer',()=>{
 assert.deepEqual(stages.filter(s=>canEnterTaskStage(s,{status:'open'},false,true)),['brief','sheets','collect']);
});
test('closed task keeps existing work accessible while preventing new sheet issue',()=>{
 assert.deepEqual(stages.filter(s=>canEnterTaskStage(s,{status:'closed'},true,true)),['brief','collect','grade','publish']);
});
test('independent peer project configuration only gates the peer handoff',()=>{
 assert.equal(canEnterTaskStage('peer',{status:'open'},true,false),false);
 assert.equal(canEnterTaskStage('publish',{status:'open'},true,false),true);
});
