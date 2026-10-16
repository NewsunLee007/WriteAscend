import {requireThat,record,text,id,integer,hash,freeze} from './validation';
export type Category='content'|'organisation'|'language'|'communicative'|'length'|'presentation'|'custom';
export type Level='foundation'|'developing';
export type TeacherRubric={total:number;wordCount:string;wordCountStrict?:boolean;tense?:string[];gradeLevel:string;items:{id:string;label:string;score:number;desc:string}[]};
export type SourceReference={taskId:string;taskVersion:number;rubricHash:string};
export type Mapping={criterionId:string;category:Category;peerEnabled:boolean;prompt?:string;descriptors?:{secure:string;partial:string;needs_work:string}};
export type PeerCriterion={id:string;label:string;teacherPoints:number;teacherDescription:string;category:Category;peerEnabled:boolean;prompt:string;descriptors:{secure:string;partial:string;needs_work:string}};
export type PeerRubric={schema:'newsun-peer-rubric-v1';purpose:'formative';scorePolicy:'teacher_only';scaleVersion:'classroom-feedback-v1';source:SourceReference;teacherTotal:number;wordCount:string;wordCountStrict:boolean|null;tense:string[];gradeLevel:string;level:Level;criteria:PeerCriterion[];confirmedBy:string;confirmedAt:number;hash:string};
const categories:Category[]=['content','organisation','language','communicative','length','presentation','custom'];
// Original classroom scaffolds informed by official A2/B1 criteria. These are
// neither copied exam band descriptors nor a validated Chinese peer-score scale.
const scaffolds:Record<Category,{prompt:string;descriptors:PeerCriterion['descriptors']}>= {
 content:{prompt:'对照本篇题目，指出已经说清的要点和仍需补充的信息。',descriptors:{secure:'题目要求的信息都能找到，例子或细节帮助我理解。',partial:'主要信息能找到，但有一处需要补充或说明。',needs_work:'有重要要点没有写清，请指出缺少的内容。'}},
 organisation:{prompt:'按读者的顺序检查句子和段落，指出衔接顺畅或读起来跳跃的位置。',descriptors:{secure:'顺着文字能理解事情或观点的先后，基本连接自然。',partial:'大体能跟上，但有一处句子顺序或连接需要调整。',needs_work:'有几处信息跳跃，我需要重新排列或补充连接才能理解。'}},
 language:{prompt:'先看意思能否读懂，再指出自己能判断的词句；拿不准时请老师核对。',descriptors:{secure:'本篇要求的常用词句总体用得合适，意思能读懂。',partial:'大体可以理解，但有一处词句需要核对或修正。',needs_work:'有几处词句让我难以理解，请引用位置并说明疑问。'}},
 communicative:{prompt:'想一想这篇文章写给谁、要完成什么事情，说明语气和格式是否合适。',descriptors:{secure:'写法和语气适合本篇读者，也能完成题目要求的沟通。',partial:'基本适合读者，但有一处表达或格式需要调整。',needs_work:'有重要表达或格式不适合本篇读者，需要重新考虑写法。'}},
 length:{prompt:'按老师本篇要求核对字数，并指出是否需要补充内容或删去重复。',descriptors:{secure:'符合老师对本篇字数的要求。',partial:'接近本篇要求，需要按老师的设置再核对。',needs_work:'与本篇字数要求有差距，需要补充或精简。'}},
 presentation:{prompt:'书写与卷面需要老师依据原图核对，文字互评不评价这一项。',descriptors:{secure:'由老师依据手写原稿核对。',partial:'由老师依据手写原稿核对。',needs_work:'由老师依据手写原稿核对。'}},
 custom:{prompt:'按老师对这一项的具体要求，引用原文说明表现和下一步修改。',descriptors:{secure:'已经达到老师对这一项的要求，请给出具体依据。',partial:'部分达到老师要求，请指出还需补充的位置。',needs_work:'还需要按老师要求修改，请说明具体问题和做法。'}}
};
export function suggestedMapping(item:{id:string;label:string}):Mapping{
 const label=item.label;const category:Category=/书写|卷面|字迹/.test(label)?'presentation':/字数|词数/.test(label)?'length':/语法|语言|词汇|拼写/.test(label)?'language':/结构|组织|衔接|连贯|逻辑/.test(label)?'organisation':/得体|语气|交际|读者/.test(label)?'communicative':/内容|要点|任务/.test(label)?'content':'custom';
 return {criterionId:item.id,category,peerEnabled:category!=='presentation'};
}
export function scaffold(category:Category,level:Level){const value=structuredClone(scaffolds[category]);if(level==='developing'&&category==='organisation')value.prompt='检查本篇段落和观点的联系，引用一处顺畅的衔接，并指出需要补充原因或调整顺序的位置。';if(level==='developing'&&category==='language'){value.prompt='在意思清楚的基础上，看看常用词句是否准确、有适当变化；拿不准时请老师核对。';value.descriptors={secure:'常用表达准确，词句有适当变化，意思清楚。',partial:'意思基本清楚，但有重复表达或一处词句需要调整。',needs_work:'多处词句让我难以理解，请指出位置和修改方向。'};}return value;}
export async function compileRubric(source:SourceReference,rubric:TeacherRubric,mappings:Mapping[],options:{level:Level;teacherConfirmed:boolean;actor:string;confirmedAt:number;mode:'text'}):Promise<PeerRubric>{
 requireThat(options.teacherConfirmed===true,'teacher_confirmation_required','请由当前有权限的老师核对本篇标准后确认。');
 requireThat(['foundation','developing'].includes(options.level)&&options.mode==='text','invalid_level','请选择本轮能力支持方式与材料形式。');
 requireThat(source&&/^[a-f0-9]{64}$/.test(source.rubricHash),'invalid_source','缺少本篇教师标准版本。');const reference={taskId:id(source.taskId),taskVersion:integer(source.taskVersion,1,100000,'标准版本'),rubricHash:source.rubricHash};
 requireThat(rubric&&Array.isArray(rubric.items)&&rubric.items.length>0&&rubric.items.length<=30&&Number.isFinite(rubric.total)&&rubric.total>0&&rubric.total<=1000,'invalid_rubric','本篇教师评分标准不完整。');
 requireThat(rubric.items.every(i=>i&&typeof i==='object'&&!Array.isArray(i)),'invalid_rubric','教师评价维度不完整。');
 requireThat(new Set(rubric.items.map(i=>i.id)).size===rubric.items.length,'duplicate_criterion','教师评价维度编号不能重复。');
 requireThat(Array.isArray(mappings)&&mappings.every(m=>m&&typeof m==='object'&&!Array.isArray(m))&&mappings.length===rubric.items.length&&new Set(mappings.map(m=>m.criterionId)).size===mappings.length,'incomplete_mapping','请逐项核对本篇所有教师评价维度。');
 const criteria=rubric.items.map(item=>{
  const criterionId=id(item.id),mapping=mappings.find(m=>m.criterionId===criterionId);requireThat(mapping&&categories.includes(mapping.category)&&typeof mapping.peerEnabled==='boolean','incomplete_mapping','请核对每一项维度的映射与可评价范围。');
  requireThat(Number.isFinite(item.score)&&item.score>=0,'invalid_rubric','教师分项分值不正确。');
  requireThat(!(options.mode==='text'&&mapping.category==='presentation'&&mapping.peerEnabled),'unobservable_criterion','文字材料无法核对书写卷面，请将这一项保留给老师。');
  const defaults=scaffold(mapping.category,options.level),d=mapping.descriptors?record(mapping.descriptors,['secure','partial','needs_work']):defaults.descriptors;
  if(mapping.category==='custom'&&mapping.peerEnabled)requireThat(!!mapping.prompt&&!!mapping.descriptors,'custom_descriptors_required','自定义维度需要老师填写学生可理解的提示与分档描述。');
  return {id:criterionId,label:text(item.label,'教师维度名称',1,120),teacherPoints:item.score,teacherDescription:text(item.desc||'','教师标准说明',0,6000),category:mapping.category,peerEnabled:mapping.peerEnabled,prompt:text(mapping.prompt||defaults.prompt,'学生评价提示',5,1500),descriptors:{secure:text(d.secure,'达到要求的描述',5,1500),partial:text(d.partial,'部分达到的描述',5,1500),needs_work:text(d.needs_work,'待改进的描述',5,1500)}};
 });
 requireThat(criteria.some(c=>c.peerEnabled),'no_peer_criteria','本轮至少需要一个学生可以评价的维度。');
 requireThat(Math.abs(criteria.reduce((n,c)=>n+c.teacherPoints,0)-rubric.total)<0.000001,'rubric_total_mismatch','教师分项合计与总分不同，请先核对原评分标准。');
 requireThat(rubric.wordCountStrict===undefined||typeof rubric.wordCountStrict==='boolean','invalid_rubric','本篇字数严格设置不正确。');requireThat(rubric.tense===undefined||Array.isArray(rubric.tense)&&rubric.tense.length<=20&&rubric.tense.every(t=>typeof t==='string'&&t.trim().length>0&&t.length<=100),'invalid_rubric','本篇时态要求不正确。');
 const content={schema:'newsun-peer-rubric-v1' as const,purpose:'formative' as const,scorePolicy:'teacher_only' as const,scaleVersion:'classroom-feedback-v1' as const,source:reference,teacherTotal:rubric.total,wordCount:text(rubric.wordCount||'按本篇要求','字数要求',1,240),wordCountStrict:rubric.wordCountStrict??null,tense:rubric.tense?.map(t=>t.trim())||[],gradeLevel:text(rubric.gradeLevel,'年级',1,80),level:options.level,criteria,confirmedBy:id(options.actor),confirmedAt:integer(options.confirmedAt,1,Number.MAX_SAFE_INTEGER,'确认时间')};
 return freeze({...content,hash:await hash(content)});
}
export async function verifyRubric(value:PeerRubric){requireThat(value&&typeof value==='object'&&!Array.isArray(value),'rubric_changed','本轮评价标准无法读取。');const snapshot=structuredClone(value),{hash:expected,...content}=snapshot;requireThat(/^[a-f0-9]{64}$/.test(expected)&&await hash(content)===expected,'rubric_changed','本轮评价标准已变化，请重新读取老师确认的版本。');return freeze(snapshot);}
