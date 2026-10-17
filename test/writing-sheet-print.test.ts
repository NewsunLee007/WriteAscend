import test from 'node:test';
import assert from 'node:assert/strict';
import {buildWritingSheetHtml,newSheetToken} from '../src/teacher/writing-sheet-print';
test('print sheets include full teacher requirements and rubric without exposing model essays or interpreting user text as markup',async()=>{
  const input:any={members:[{memberId:'member',tokens:[newSheetToken()]}]};
  const packet:any={taskId:'task',taskVersion:2,schoolLabel:'学校 <img src=x onerror=evil()>',draftNumber:1,pageCount:1,sets:[{id:'set',memberId:'member',name:'同名 <script>evil()</script>',className:'八1',academicYear:'2026-1',subjectShort:'1234',sheets:[{id:'page',pageNumber:1,checkCode:'123456789ABC'}]}]};
  const topic='完整写作要求。'.repeat(250),document={assignment:{title:'题目 </title><script>evil()</script>',topic,modelEssay:'教师范文不得进入学生写作单'},rubric:{total:20,wordCount:'80 words',items:[{label:'内容',score:20,desc:'依据全部要点'}]}};
  const html=await buildWritingSheetHtml(packet,input,document);
  assert(html.includes(topic));assert(html.includes('依据全部要点'));assert(html.includes('评分标准第 2 版'));assert(html.includes('2026-1'));
  assert(!html.includes('<script>'));assert(!html.includes('<img src=x'));assert(!html.includes('教师范文不得进入学生写作单'));assert(html.includes('&lt;script&gt;'));
  assert.equal((html.match(/class="writing-line"/g)||[]).length,18);assert(html.includes('1234-5678-9ABC'));
  const tokens=Array.from({length:100},newSheetToken);assert.equal(new Set(tokens).size,100);assert(tokens.every(t=>/^WA1:[a-zA-Z0-9_-]{43}$/.test(t)));
});
