import {INITIAL_RUBRIC} from './legacy-core.js';
import type {Rubric} from './contracts';

// All names and compositions below are synthetic. Never drawn from the student roster.
export const sampleAssignment = {examName:'课堂写作',title:'A small act of kindness',topic:'Describe a time when you helped someone. Explain what happened and what you learned.',modelEssay:'Last Friday, I saw a new classmate standing alone. I asked him to join our group.\n\nWe worked together on a poster. I explained our plan and listened to his ideas. Soon, he began to smile.\n\nI learned that a small act of kindness can make a big difference.'};
export const sampleRubric = structuredClone(INITIAL_RUBRIC) as Rubric;
export const sampleResult = {
  student_name:'示例同学',class_name:'示例班',student_no:'01',total_score:15.5,
  breakdown:{'内容完整度':6.5,'语言准确性':4.5,'篇章结构':3,'词数要求':1,'书写规范':0.5},
  word_count:66, brief_comment:'你把帮助同学的过程写清楚了，也表达了自己的收获。可以补充一个具体行动，并检查过去时。',
  highlights:[{text:'A little help can make a big difference.',comment:'结尾回应了帮助他人的主题。'}],
  errors:[{orig:'I help him last Friday.',corr:'I helped him last Friday.',type:'时态',note:'last Friday 表示过去的时间，动词应使用过去式。'}],
  content_logic:'1. 内容拓展建议\n- 写清楚你怎样帮助同学。\n2. 句式升级示例\n原句：He was happy.\n升级句：He smiled and thanked me.\n3. 结尾优化\n说明你以后会怎样帮助别人。',
  original_essay:'Last Friday, I saw a new classmate standing alone. I help him last Friday.\n\nWe worked on a poster together. I told him our plan and asked him for ideas. He was happy and we became friends.\n\nFrom this experience, I learned to care about others. A little help can make a big difference.',
  optimized_essay:'Last Friday, I saw a new classmate standing alone. I invited him to join our group.\n\nWe worked on a poster together. I explained our plan and asked for his ideas. He smiled and thanked me.\n\nFrom this experience, I learned that a little help can make a big difference.',
  standard_reference:sampleAssignment.modelEssay,graded_at:'2026-10-16T09:00:00+08:00',
};
export const sampleBackup = {assignment:sampleAssignment,rubric:sampleRubric,files:[{id:'synthetic-1',status:'success',result:sampleResult}]};
