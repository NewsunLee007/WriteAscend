import test from 'node:test';
import assert from 'node:assert/strict';
import {curatedModels,modelProtocol} from '../src/teacher/model-providers';
import {chooseOcrModel} from '../src/teacher/model-selection';
import {prepareProviderRequest,normalizeOcrResponse} from '../worker/ocr-adapters';
const image='data:image/png;base64,AAAA';
const payload=(system='WA_IDENTITY_OCR_V1.')=>({model:'ignored',messages:[{role:'system',content:system},{role:'user',content:[{type:'image_url',image_url:{url:image}}]}],response_format:{type:'json_object'},temperature:0.3,max_tokens:10000,stream:false});
const result=(text:string,task:'identity'|'topic'|'check'='identity')=>JSON.parse(JSON.parse(normalizeOcrResponse(JSON.stringify({pages:[{markdown:text}]}),task)).choices[0].message.content);
test('curated account lists exclude unrelated and unknown capabilities, deduplicate, cap choices and reserve OCR models for OCR',()=>{
 const ids=['qwen3.5-ocr','qwen3.8-flash','qwen3.8-flash','qwen-tts','qwen-image','unknown-model','qwen3.8-max','qwen-vl-ocr-latest'];
 assert.deepEqual(curatedModels('qwen','grading',ids).map(m=>m.id),['qwen3.8-flash','qwen3.8-max']);assert.equal(curatedModels('qwen','ocr',ids)[0].id,'qwen3.5-ocr');
 assert.equal(curatedModels('mistral','grading').length,0);assert.equal(curatedModels('openai','grading',['gpt-6-luna','gpt-6-luna-audio','gpt-6.1-sol','gpt-6.1-sol-codex']).length,2);
 assert.equal(curatedModels('qwen','grading',Array.from({length:20},(_,i)=>'qwen3.8-flash-2026-10-'+String(i+1).padStart(2,'0'))).length,8);
 const profiles=[{id:'grader',label:'Vision',model:'vision'},{id:'ocr',label:'OCR',model:'ocr',purposes:['ocr'] as 'ocr'[],ocrSpecialist:true}];assert.equal(chooseOcrModel(profiles,'grader',''),'ocr');assert.equal(chooseOcrModel(profiles,'grader','grader'),'grader');assert.equal(chooseOcrModel(profiles,'grader','personal_removed'),'');
});
test('professional OCR uses provider-specific wire formats and rejects grading or multi-image prompts before sending',()=>{
 const mistral=prepareProviderRequest('mistral','mistral-ocr-4-1','https://api.mistral.ai/v1/ocr',payload());assert.deepEqual(mistral.payload,{model:'mistral-ocr-4-1',document:{type:'image_url',image_url:image},include_image_base64:false});assert.equal(mistral.task,'identity');
 const qwen=prepareProviderRequest('qwen','qwen3.5-ocr','https://example.com/chat/completions',payload());assert.equal(qwen.payload.messages?.length,1);assert.equal(qwen.payload.messages?.[0].role,'user');assert(!('temperature'in qwen.payload));assert(!('response_format'in qwen.payload));
 assert.throws(()=>prepareProviderRequest('mistral','mistral-ocr-latest','https://example.com/ocr',payload('Give this essay a score.')));const multi=payload();multi.messages.push(multi.messages[1]);assert.throws(()=>prepareProviderRequest('qwen','qwen-vl-ocr-latest','https://example.com/chat/completions',multi));
 const chat=prepareProviderRequest('siliconflow','Qwen/Qwen3-VL-30B-A3B-Instruct','https://example.com/chat/completions',payload());assert(!('response_format'in chat.payload));assert('temperature'in chat.payload);assert.equal(modelProtocol('openai','gpt-6.1-sol'),'chat');
});
test('OCR transcript normalization keeps topic text, accepts only explicit identity fields and refuses ambiguous multiple students',()=>{
 assert.deepEqual(result('姓名：张三 班级：八（13）班 学号：013'),{name:'张三',className:'八（13）班',studentNumber:'013',multipleStudents:false});
 assert.deepEqual(result('| 姓名 | 张 三 | 班级 | 八（13）班 | 学号 | 013 |'),{name:'张三',className:'八（13）班',studentNumber:'013',multipleStudents:false});
 assert.equal(result('张三\n八（13）班').name,'');assert.equal(result('姓名：张三 姓名：李四').multipleStudents,true);assert.equal(result('姓名：张三\n姓名：李四').name,'');
 const text='Writing task\nWrite 80 words about your school.';assert.equal(result(text,'topic').topic,text);assert.equal(result('NEWSUN TEST','check').visible_text,'NEWSUNTEST');assert.throws(()=>result(''));
 const json={name:'张三',className:'八（13）班',studentNumber:'013',multipleStudents:false};assert.deepEqual(result(JSON.stringify(json)),json);
});
