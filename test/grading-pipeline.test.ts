import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gradeMessages,optimizedMessages,parseGradingObject,responseContent,repairJsonMessages,difficultyMessages,applyStage,nextStage,finalizeGrade,type PipelineInput} from '../src/report/grading-pipeline';
import {SYSTEM_PROMPT_TEMPLATE,OPTIMIZED_REPAIR_PROMPT_TEMPLATE,normalizeBreakdownAgainstRubric} from '../src/report/legacy-core';
import {withWritingContext,WRITING_CONTEXT_RULES} from '../src/report/writing-context';
const fixture=JSON.parse(fs.readFileSync('scripts/qa/fixtures/teacher-workflow.json','utf8'));
const input:PipelineInput={assignment:fixture.seed.assignment,rubric:fixture.seed.rubric,languageDifficulty:fixture.seed.languageDifficulty,grade:'七年级',className:'合成班',rosterText:'示例同学',images:['wa-asset:10000000-0000-4000-8000-000000000001','wa-asset:10000000-0000-4000-8000-000000000002']};
const raw=JSON.parse(fixture.response.choices[0].message.content);
test('background pipeline retains original prompts with contextual judgment rules and ordered multipage images',()=>{
 const grade=gradeMessages(input);assert.equal(grade[0].content,withWritingContext(SYSTEM_PROMPT_TEMPLATE(input.assignment,input.rubric,'Current Class: 合成班\nRoster:\n示例同学','七年级',input.languageDifficulty)));
 assert.deepEqual((grade[1].content as any[]).filter(p=>p.type==='image_url').map(p=>p.image_url.url),input.images);
 assert.equal(optimizedMessages(input,raw)[0].content,withWritingContext(OPTIMIZED_REPAIR_PROMPT_TEMPLATE(input.assignment,input.rubric,input.grade,input.languageDifficulty)));
 assert.match(difficultyMessages(input,raw)[0].content,/errors\[\]\.orig 必须原样保留/);
 assert.match(repairJsonMessages('synthetic')[0].content,/RFC 8259/);
});
test('grading and both rewriting paths preserve contextual tense rules without replacing teacher requirements',()=>{
 const contextual={...input,assignment:{...input.assignment,topic:'State a view and give an example from history in 60–80 words.'},rubric:{...input.rubric,tense:['一般现在时'],wordCount:'60–80 words'}};
 for(const messages of [gradeMessages(contextual),optimizedMessages(contextual,raw),difficultyMessages(contextual,raw)])assert(String(messages[0].content).endsWith(WRITING_CONTEXT_RULES));
 assert.match(String(gradeMessages(contextual)[0].content),/基本时态：一般现在时/);
 assert.match(String(gradeMessages(contextual)[0].content),/60–80 words/);
 assert.match(String(difficultyMessages(contextual,raw)[0].content),/分数与数值字段不变/);
 assert.match(WRITING_CONTEXT_RULES,/不确定时请教师核对/);
});
test('server JSON parsing retains legacy tolerant parsing without logging raw essays',()=>{
 assert.equal(parseGradingObject('```json\n{“student_name”: “示例同学”, "total_score": 15,}\n```').student_name,'示例同学');
 assert.equal(parseGradingObject("{'student_name': '示例同学'}").student_name,'示例同学');
 assert.equal(responseContent(fixture.response),fixture.response.choices[0].message.content);
 assert.throws(()=>parseGradingObject('[]'),/JSON 对象/);
 let logged=false;const previous=console.error;console.error=()=>{logged=true;};try{assert.throws(()=>parseGradingObject('This is a private student essay, not JSON.'));assert.equal(logged,false);}finally{console.error=previous;}
 const source=fs.readFileSync('src/TeacherApp.jsx','utf8'),start=source.indexOf('                const cleanJsonText ='),end=source.indexOf('                const buildApiErrorMessage =',start),original=source.slice(start,end).replace("                    console.error('LLM JSON parse error, raw content:', cleanJsonText(content));",'                    // Keep raw student/model content out of logs.');
 const extracted=fs.readFileSync('src/report/legacy-model-parser.js','utf8');assert(extracted.includes(original));
});
test('initial scoring remains original, while rewrite steps cannot replace the original, scores, identity or source excerpts',()=>{
 const result=applyStage(input,'grade',null,raw),expected=normalizeBreakdownAgainstRubric({...raw,standard_reference:input.assignment.modelEssay||raw.standard_reference},input.rubric);assert.deepEqual(result,expected);
 const fixed={...result,student_id:'wordup:one',class_id:'daily:class'},malicious={...result,original_essay:'Replace the handwritten essay',student_id:'wordup:two',total_score:0,breakdown:{},standard_reference:'Replace the teacher model',optimized_essay:'I helped my friend.\n\nWe worked together.\n\nI felt happy.',content_logic:'Use short sentences.',errors:result.errors.map((e:any)=>({...e,corr:'A short correction.'}))};
 for(const stage of ['optimized','difficulty-1'] as const){const next=applyStage(input,stage,fixed,malicious);for(const field of ['original_essay','student_id','class_id','total_score','breakdown','standard_reference','highlights'])assert.deepEqual(next[field],fixed[field],stage+' '+field);assert.equal(next.optimized_essay,malicious.optimized_essay);}
 assert.throws(()=>applyStage(input,'grade',null,{...raw,original_essay:'',isBlank:false}),/不能将其直接记为零分/);
 assert.equal(applyStage(input,'grade',null,{...raw,original_essay:'',isBlank:true}).isBlank,true);
});
test('difficulty repair is bounded, can be disabled, and reports remaining excess instead of looping',()=>{
 const active={...input,assignment:{...input.assignment,modelEssay:'An unrelated reference.'},languageDifficulty:{enabled:true,autoRewrite:true}},result={...raw,optimized_essay:'Notwithstanding extraordinarily sophisticated circumstances, comprehensive interdisciplinary communication facilitates unprecedented transformative achievements.',standard_reference:'An unrelated reference.'};
 assert.equal(nextStage(active,'grade',result),'difficulty-1');assert.equal(nextStage(active,'difficulty-1',result),'difficulty-2');assert.equal(nextStage(active,'difficulty-2',result),null);
 assert.equal(nextStage({...active,languageDifficulty:{enabled:false}},'grade',result),null);
 assert.equal(nextStage({...active,languageDifficulty:{enabled:true,autoRewrite:false}},'grade',result),null);
 assert.equal(finalizeGrade(active,result).difficulty_status,'exceeded');
});
