import type {AuthorityClass} from './task-contracts';
export const genres=[
 {id:'narrative',name:'叙事经历',hint:'一次活动、旅行或难忘的经历',tense:['一般过去时'],content:'交代人物、时间、地点与主要经过；用具体细节说明感受或收获。',organization:'按时间或事件发展安排段落，经过清楚，结尾自然。',purpose:'围绕一次经历表达真实感受，叙述视角和语气一致。'},
 {id:'description',name:'人物与地点介绍',hint:'介绍人物、校园、家乡或日常生活',tense:['一般现在时'],content:'覆盖题目要求的身份、特点和相关信息，用具体例子支持介绍。',organization:'按主题或空间顺序组织信息，避免无序罗列，开头与结尾完整。',purpose:'根据读者选择相关信息，使介绍清楚、有重点。'},
 {id:'opinion',name:'观点表达',hint:'表达看法、说明理由并举例',tense:['一般现在时'],content:'明确表达观点，给出与观点相关的理由和恰当例子，回应题目要求。',organization:'观点、理由、例子和结论相互衔接，不要求机械套用连接词。',purpose:'考虑读者，表达有依据的个人看法，语气恰当。'},
 {id:'practical',name:'书信、邮件与通知',hint:'邀请、感谢、求助、回复与告知',tense:['一般现在时','一般将来时'],content:'完成交际任务，准确交代题目要求的信息，如时间、地点、安排或请求。',organization:'按交际目的组织信息，开头、正文与结尾清楚。',purpose:'身份、对象、称呼、落款和语气符合题目；格式不作重复扣分。'},
 {id:'picture',name:'看图与情景写作',hint:'根据图片、提示或情境完成文章',tense:['一般过去时'],content:'准确理解图片或提示，覆盖关键信息；合理补充细节，不编造与情境冲突的内容。',organization:'按画面顺序或事件逻辑衔接信息，使文章连贯、完整。',purpose:'围绕指定情境完成写作目的，人物指代和叙述角度一致。'},
 {id:'advice',name:'建议与说明',hint:'提出建议、说明方法或介绍规则',tense:['一般现在时'],content:'回应实际问题，给出具体可行的建议或步骤，必要时解释理由。',organization:'按问题、方法或步骤组织内容，层次清楚，顺序合理。',purpose:'考虑接受建议的对象，语气友善，说明易于理解和执行。'},
] as const;
export type Genre=typeof genres[number]['id'];
export type RubricDocument={rubric:any;languageDifficulty:{enabled:boolean;capRatio:number;autoRewrite:boolean}};
export type RubricTemplate={id:string;name:string;genre:Genre;grade:string;revision:number;status:'active'|'archived';favorite:boolean;document:RubricDocument;created:number;updated:number};
export function gradeName(value:string){const text=String(value||'').trim();const match=text.match(/^(?:初([一二三])|([六七八九])年级|([6789])(?:年级|级)?)/);if(!match)return text;return match[1]?({一:'七年级',二:'八年级',三:'九年级'} as any)[match[1]]:match[2]?match[2]+'年级':({6:'六年级',7:'七年级',8:'八年级',9:'九年级'} as any)[match[3]];}
// Largest remainders keep every half point accounted for, even with tiny totals.
export function scaleRubricItems(items:any[],total:number){
 if(!Number.isFinite(total)||total<=0)return items;
 const units=Math.round(total*2),weights=items.map(c=>Math.max(0,Number(c.score)||0)),sum=weights.reduce((a,b)=>a+b,0),raw=weights.map(w=>units*(sum?w/sum:1/items.length)),scores=raw.map(Math.floor);
 const order=raw.map((v,i)=>({i,remainder:v-scores[i]})).sort((a,b)=>b.remainder-a.remainder||a.i-b.i);
 const remaining=units-scores.reduce((a,b)=>a+b,0);for(let n=0;n<remaining;n++)scores[order[n%order.length].i]++;
 return items.map((c,i)=>({...c,score:scores[i]/2}));
}
export function rubricPreset(genre:Genre,grade='八年级',total=20):RubricDocument{
 const g=genres.find(g=>g.id===genre)||genres[0],level=gradeName(grade),wordCount=level==='七年级'?'60–80 words':level==='九年级'?'80–120 words':'80–100 words';
 return {rubric:{gradeLevel:level,total,wordCount,wordCountStrict:false,strictness:'适中',strictnessLevel:45,tense:[...g.tense],modelDifficulty:'标准 (课标要求)',items:scaleRubricItems([
  {id:'c1',label:'内容与任务完成',score:8,desc:g.content+' 依据本篇题目逐项核对，不额外增加题外要求。'},
  {id:'c2',label:'语言表达',score:6,desc:'词汇和句式适合本年级，意思清楚；区分影响理解和不影响理解的错误。重在准确、恰当，不以生僻词或复杂句数量加分。同一错误避免重复扣分。'},
  {id:'c3',label:'组织与连贯',score:4,desc:g.organization},
  {id:'c_purpose',label:'交际目的与得体性',score:1,desc:g.purpose},
  {id:'c4',label:'书写与规范',score:1,desc:'以可辨读、标点和大小写规范为依据，不按书法美观程度评分。图像模糊先提示重新上传；词数仅按本篇已确认的要求处理，避免重复扣分。'},
 ],total)},languageDifficulty:{enabled:true,capRatio:1,autoRewrite:true}};
}
export function rubricProblem(r:any):string{
 if(!r||!Number.isFinite(r.total)||r.total<=0||r.total>1000||!Number.isInteger(r.total*2))return '作文满分须为 0.5–1000 分，使用整数或半分。';
 if(!Array.isArray(r.items)||!r.items.length||r.items.length>64)return '请设置 1–64 个评价维度。';
 const ids=new Set(),labels=new Set();let sum=0;
 for(const c of r.items){if(!c||typeof c.id!=='string'||!/^[-a-zA-Z0-9_]{1,128}$/.test(c.id)||ids.has(c.id))return '评价维度编号不能重复。';ids.add(c.id);if(typeof c.label!=='string'||!c.label.trim()||c.label.length>120||labels.has(c.label.trim()))return '请填写不重复的评价维度名称（最多120字）。';labels.add(c.label.trim());if(typeof c.desc!=='string'||!c.desc.trim()||c.desc.length>8000)return '每个评价维度都需要具体的评价要求（最多8000字）。';if(!Number.isFinite(c.score)||c.score<0||c.score>r.total||!Number.isInteger(c.score*2))return '维度分值须为非负整数或半分。';sum+=c.score;}
 if(Math.abs(sum-r.total)>.001)return '分项合计与作文满分不一致，请调整后继续。';
 return '';
}
export function suggestedWordCount(topic:string){const m=String(topic||'').match(/(\d{2,4})\s*[-–—~至到]\s*(\d{2,4})\s*(?:words?\b|个?(?:单)?词)/i)||String(topic||'').match(/(?:词数|字数)\s*[：:]?\s*(\d{2,4})\s*[-–—~至到]\s*(\d{2,4})/);if(!m)return '';const a=Number(m[1]),b=Number(m[2]);return a>0&&b>=a&&b<=2000?a+'–'+b+' words':'';}
export function wordCountDiffers(topic:string,current:string){const suggested=suggestedWordCount(topic),numbers=(v:string)=>(v.match(/\d+/g)||[]).join(',');return !!suggested&&numbers(suggested)!==numbers(current||'');}
export function wordCountConflict(topic:string,current:string){return wordCountDiffers(topic,current)?`题目字数要求为 ${suggestedWordCount(topic)}，评分标准为 ${current||'未设置'}。`:'';}
export function cleanRubricDocument(value:any):RubricDocument{
 const r=value?.rubric,problem=rubricProblem(r);if(problem)throw Error(problem);
 if(typeof r.gradeLevel!=='string'||!r.gradeLevel.trim()||r.gradeLevel.length>50)throw Error('请设置学生年级。');
 const text=(v:unknown,max:number)=>typeof v==='string'?v.slice(0,max):'';
 const d=value.languageDifficulty||{};
 const document={rubric:{total:r.total,gradeLevel:r.gradeLevel,wordCount:text(r.wordCount,500),wordCountStrict:r.wordCountStrict!==false,strictness:text(r.strictness,50)||'适中',strictnessLevel:Number.isFinite(r.strictnessLevel)?Math.max(0,Math.min(100,r.strictnessLevel)):45,tense:Array.isArray(r.tense)?r.tense.filter((x:any)=>typeof x==='string').slice(0,20).map((x:string)=>x.slice(0,120)):[],modelDifficulty:text(r.modelDifficulty,120),items:r.items.map((c:any)=>({id:c.id,label:c.label.trim(),score:c.score,desc:c.desc.trim()}))},languageDifficulty:{enabled:d.enabled!==false,capRatio:Number.isFinite(d.capRatio)?Math.max(.6,Math.min(1,d.capRatio)):1,autoRewrite:d.autoRewrite!==false}};
 if(new TextEncoder().encode(JSON.stringify(document)).length>60000)throw Error('这份评分标准过长，请缩短评价要求。');return document;
}
export function availableQuickClasses(classes:AuthorityClass[]){return classes.filter(c=>['roster.read','writing.manage','writing.grade'].every(s=>c.scopes.includes(s))).sort((a,b)=>b.academicYear.localeCompare(a.academicYear)||a.name.localeCompare(b.name,'zh',{numeric:true}));}
export function initialQuickClasses(classes:AuthorityClass[],remembered:string[]){const available=availableQuickClasses(classes),kept=available.filter(c=>remembered.includes(c.id));const first=kept[0]||available[0];return first?(kept.length?kept.filter(c=>c.academicYear===first.academicYear&&gradeName(c.grade)===gradeName(first.grade)).slice(0,20):[first]).map(c=>c.id):[];}
