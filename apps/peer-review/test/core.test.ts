import test from 'node:test';
import assert from 'node:assert/strict';
import {compileRubric,suggestedMapping,verifyRubric,type TeacherRubric,type Mapping} from '../src/core/rubric';
import {allocateRound} from '../src/core/allocation';
import {validateReview,validateAuthorResponse,studentRubric} from '../src/core/feedback';
import {PeerError,hash} from '../src/core/validation';
const source={taskId:'synthetic-task',taskVersion:3,rubricHash:'a'.repeat(64)},rubric:TeacherRubric={total:20,wordCount:'60-80 words',wordCountStrict:false,tense:['一般过去时'],gradeLevel:'七年级',items:[{id:'content',label:'内容完整度',score:8,desc:'包含题目所需内容与细节。'},{id:'language',label:'语言准确性',score:6,desc:'语法、拼写和标点。'},{id:'organisation',label:'篇章结构',score:4,desc:'顺序与衔接。'},{id:'length',label:'词数要求',score:1,desc:'按本篇要求核对字数。'},{id:'handwriting',label:'书写规范',score:1,desc:'原稿卷面与字迹。'}]};
const options={level:'foundation' as const,teacherConfirmed:true,actor:'wordup:synthetic-teacher',confirmedAt:1000,mode:'text' as const};
const mappings=()=>rubric.items.map(suggestedMapping);
const plan=()=>compileRubric(source,rubric,mappings(),options);
function code(value:string){return (e:unknown)=>e instanceof PeerError&&e.code===value;}
test('teacher confirmation freezes the exact task rubric, original points and text-observable criteria without turning peer bands into teacher marks',async()=>{
 const original=JSON.stringify(rubric),p=await plan();assert.equal(JSON.stringify(rubric),original);assert.equal(p.teacherTotal,20);assert.equal(p.purpose,'formative');assert.equal(p.scorePolicy,'teacher_only');assert.deepEqual(p.criteria.map(c=>c.teacherPoints),[8,6,4,1,1]);assert.equal(p.wordCount,'60-80 words');assert.equal(p.wordCountStrict,false);assert.deepEqual(p.tense,['一般过去时']);assert.equal(p.source.taskVersion,3);assert.equal(p.criteria.find(c=>c.id==='handwriting')!.peerEnabled,false);assert.equal(p.criteria.find(c=>c.id==='language')!.category,'language');assert(Object.isFrozen(p.criteria[0].descriptors));
 await verifyRubric(p);const altered=structuredClone(p);altered.criteria[0].teacherPoints=10;await assert.rejects(verifyRubric(altered),code('rubric_changed'));
 await assert.rejects(compileRubric(source,rubric,mappings(),{...options,teacherConfirmed:false}),code('teacher_confirmation_required'));
 const pub=studentRubric(p);assert(!JSON.stringify(pub).includes(options.actor));assert(!('confirmedBy' in pub));assert.equal(pub.criteria.find(c=>c.id==='handwriting')!.peerEnabled,false);
});
test('incomplete/custom mappings, altered teacher totals and invisible handwriting cannot silently become a new peer rubric',async()=>{
 await assert.rejects(compileRubric(source,rubric,mappings().slice(1),options),code('incomplete_mapping'));
 const bad=mappings();bad[4].peerEnabled=true;await assert.rejects(compileRubric(source,rubric,bad,options),code('unobservable_criterion'));
 await assert.rejects(compileRubric(source,{...rubric,total:15},mappings(),options),code('rubric_total_mismatch'));
 const custom=mappings();custom[0]={criterionId:'content',category:'custom',peerEnabled:true};await assert.rejects(compileRubric(source,rubric,custom,options),code('custom_descriptors_required'));
 custom[0]={...custom[0],prompt:'说明本篇要求的两条建议是否具体可行。',descriptors:{secure:'两条建议清楚具体，都有原因支持。',partial:'已经有建议，但其中一条原因需要补充。',needs_work:'仍缺少本篇要求的建议或解释。'}};const p=await compileRubric(source,rubric,custom,options);assert.equal(p.criteria[0].label,'内容完整度');assert.equal(p.criteria[0].teacherPoints,8);
 await assert.rejects(compileRubric(source,{...rubric,items:[null] as any},custom,options),code('invalid_rubric'));
 const teacherOnly=mappings();teacherOnly[0]={criterionId:'content',category:'custom',peerEnabled:false,prompt:'',descriptors:{secure:'',partial:'',needs_work:''}};const disabled=await compileRubric(source,rubric,teacherOnly,options);assert.equal(disabled.criteria[0].peerEnabled,false);assert.equal(disabled.criteria[0].teacherPoints,8);assert.equal(disabled.criteria[0].teacherDescription,rubric.items[0].desc);
 const old=await plan(),next=await compileRubric({...source,taskVersion:4,rubricHash:'b'.repeat(64)},rubric,mappings(),options);assert.notEqual(old.hash,next.hash);
});
test('allocation gives every eligible student and essay exactly the chosen workload, with no self-review, duplicate essay or blocked pair',async()=>{
 const people=Array.from({length:130},(_,i)=>({id:'student-'+String(i).padStart(3,'0'),materialId:'draft-'+i})),blocked=[{reviewerId:people[0].id,authorId:people[1].id},{reviewerId:people[1].id,authorId:people[0].id}];
 const a=await allocateRound(people,2,'synthetic-server-seed-with-at-least-32-chars',blocked);assert.equal(a.assignments.length,260);
 for(const p of people){const sent=a.assignments.filter(x=>x.reviewerId===p.id),received=a.assignments.filter(x=>x.authorId===p.id);assert.equal(sent.length,2);assert.equal(received.length,2);assert.equal(new Set(sent.map(x=>x.materialId)).size,2);assert(sent.every(x=>x.authorId!==p.id));assert(sent.every(x=>!blocked.some(b=>b.reviewerId===x.reviewerId&&b.authorId===x.authorId)));}
 const b=await allocateRound([...people].reverse(),2,'synthetic-server-seed-with-at-least-32-chars',blocked);assert.deepEqual(a,b);const other=await allocateRound(people,2,'another-synthetic-seed-with-at-least-32-chars',blocked);assert.notEqual(a.hash,other.hash);
});
test('infeasible exclusions or small cohorts fail as a whole, while tight feasible restrictions are fully matched',async()=>{
 const p=Array.from({length:4},(_,i)=>({id:'s'+i,materialId:'m'+i}));
 const onlyCycle=p.flatMap((r,i)=>p.filter((a,j)=>j!==i&&j!==(i+1)%p.length).map(a=>({reviewerId:r.id,authorId:a.id})));const a=await allocateRound(p,1,'synthetic-seed-for-a-restricted-round',onlyCycle);assert.deepEqual(a.assignments.map(x=>[x.reviewerId,x.authorId]),[['s0','s1'],['s1','s2'],['s2','s3'],['s3','s0']]);
 await assert.rejects(allocateRound(p,2,'synthetic-seed-for-a-restricted-round',onlyCycle),code('allocation_infeasible'));await assert.rejects(allocateRound(p.slice(0,2),2,'synthetic-seed-for-a-restricted-round'),code('invalid_number'));await assert.rejects(allocateRound([{id:'same',materialId:'a'},{id:'same',materialId:'b'}],1,'synthetic-seed-for-a-restricted-round'),code('duplicate_participant'));
});
async function reviewInput(){const p=await plan(),essay='We visited a farm. I enjoyed feeding the sheep. Then we went home.',material={text:essay,hash:await hash(essay)},start=essay.indexOf('I enjoyed');const content={rubricHash:p.hash,materialHash:material.hash,ratings:p.criteria.filter(c=>c.peerEnabled).map(c=>({criterionId:c.id,rating:c.id==='organisation'?'partial':'secure'})),comments:[{id:'c1',criterionId:'content',kind:'strength',anchor:{kind:'span',start,end:start+'I enjoyed feeding the sheep.'.length,quote:'I enjoyed feeding the sheep.'},explanation:'具体活动帮助我理解了这次农场经历。',suggestion:''},{id:'c2',criterionId:'organisation',kind:'improvement',anchor:{kind:'whole'},explanation:'活动结束与回家之间的联系还可以再说明。',suggestion:'在最后一句之前补充活动结束时的感受。'}]};return {p,material,content};}
test('feedback requires a real original-text strength and an actionable improvement tied to the exact published material and teacher rubric',async()=>{
 const {p,material,content}=await reviewInput(),r=await validateReview(content,p,material);assert.equal(r.comments[0].anchor.kind,'span');assert.equal(r.ratings.length,4);assert(!('total' in r));assert(!('score' in r));assert(Object.isFrozen(r.comments));
 await assert.rejects(validateReview({...content,teacherScore:100},p,material),code('invalid_fields'));
 await assert.rejects(validateReview({...content,materialHash:'f'.repeat(64)},p,material),code('review_version_changed'));
 const invalid=structuredClone(content);invalid.comments[0].anchor.quote='A made-up compliment';await assert.rejects(validateReview(invalid,p,material),code('invalid_quote'));
 const changed={text:material.text+' Changed.',hash:material.hash};await assert.rejects(validateReview(content,p,changed),code('material_changed'));
 const vague=structuredClone(content);vague.comments[1].suggestion='很好';await assert.rejects(validateReview(vague,p,material),code('invalid_text'));
});
test('uncertainty and negative judgements require an explicit question or matching improvement, and teacher-only criteria cannot be scored by peers',async()=>{
 const {p,material,content}=await reviewInput(),uncertain=structuredClone(content);uncertain.ratings.find(r=>r.criterionId==='language')!.rating='unsure';await assert.rejects(validateReview(uncertain,p,material),code('question_required'));uncertain.comments.push({id:'c3',criterionId:'language',kind:'question',anchor:{kind:'whole'},explanation:'不确定这里描述昨天的活动是否都需要过去时。',suggestion:'请老师帮助核对第一段动词的时态。'} as any);assert.equal((await validateReview(uncertain,p,material)).comments.length,3);
 const negative=structuredClone(content);negative.ratings.find(r=>r.criterionId==='language')!.rating='needs_work';await assert.rejects(validateReview(negative,p,material),code('action_required'));
 const hidden=structuredClone(content);hidden.ratings[0].criterionId='handwriting';await assert.rejects(validateReview(hidden,p,material),code('invalid_rating'));
});
test('authors respond to each suggestion with reasons; adoption requires an actual revision plan and cannot silently accept an outdated review',async()=>{
 const {p,material,content}=await reviewInput(),review=await validateReview(content,p,material),response={reviewHash:review.hash,responses:[{commentId:'c2',decision:'adopt',reason:'补充结尾感受能够让事情发展更连贯。',plannedChange:'回家之前加一句活动结束后的具体感受。'}]};const a=await validateAuthorResponse(response,review);assert.equal(a.responses[0].decision,'adopt');
 await assert.rejects(validateAuthorResponse({...response,reviewHash:'old'},review),code('review_changed'));await assert.rejects(validateAuthorResponse({...response,responses:[]},review),code('response_incomplete'));await assert.rejects(validateAuthorResponse({...response,responses:[{...response.responses[0],plannedChange:''}]},review),code('invalid_text'));
 const decline=await validateAuthorResponse({...response,responses:[{...response.responses[0],decision:'decline',reason:'这篇题目只要求介绍活动，结尾已经有感受。',plannedChange:''}]},review);assert.equal(decline.responses[0].decision,'decline');
});

test('asynchronous hashing uses fixed snapshots, so changing a browser draft cannot retarget feedback or author responses mid-validation',async()=>{
 const {p,material,content}=await reviewInput(),mutableRubric=structuredClone(p),mutableMaterial={...material},mutableContent=structuredClone(content);
 const pending=validateReview(mutableContent,mutableRubric,mutableMaterial);
 mutableRubric.criteria[0].label='changed while hashing';mutableMaterial.text='Another text';mutableContent.comments[0].anchor.quote='Changed quote';
 const reviewed=await pending;assert.equal(reviewed.materialHash,material.hash);assert.equal(reviewed.rubricHash,p.hash);assert.equal((reviewed.comments[0].anchor as any).quote,'I enjoyed feeding the sheep.');
 const bad=structuredClone(reviewed);bad.comments[1].suggestion='Tampered stored feedback';await assert.rejects(validateAuthorResponse({reviewHash:bad.hash,responses:[]},bad),code('review_changed'));
 const mutableReview=structuredClone(reviewed),answer={reviewHash:reviewed.hash,responses:[{commentId:'c2',decision:'adopt',reason:'补充结尾感受能让事情发展更连贯。',plannedChange:'回家之前写一句活动结束后的感受。'}]};const responding=validateAuthorResponse(answer,mutableReview);mutableReview.comments=[];answer.responses[0].plannedChange='Changed after submission';const result=await responding;assert.equal(result.responses[0].plannedChange,'回家之前写一句活动结束后的感受。');
});
test('all 64 original criteria can be retained and uncertain ratings each require a concrete question; handwriting cannot be relabelled into observable text',async()=>{const r={...rubric,total:64,items:Array.from({length:64},(_,i)=>({id:'criterion-'+i,label:'内容要点 '+i,score:1,desc:'按本篇具体要求核对内容。'}))},p=await compileRubric(source,r,r.items.map(suggestedMapping),options),material={text:'I helped a friend. We finished the poster together.',hash:await hash('I helped a friend. We finished the poster together.')},comments:any[]=r.items.map(i=>({id:crypto.randomUUID(),criterionId:i.id,kind:'question',anchor:{kind:'whole'},explanation:'这一项我还不能完全判断。',suggestion:'请老师核对这里是否符合本篇要求。'}));comments.push({id:'strength',criterionId:r.items[0].id,kind:'strength',anchor:{kind:'span',start:0,end:18,quote:material.text.slice(0,18)},explanation:'这句话直接说明了帮助同学的事情。',suggestion:''},{id:'action',criterionId:r.items[0].id,kind:'improvement',anchor:{kind:'whole'},explanation:'可以补充一个具体行动。',suggestion:'补充你怎样帮助同学完成海报。'});const result=await validateReview({rubricHash:p.hash,materialHash:material.hash,ratings:r.items.map(i=>({criterionId:i.id,rating:'unsure'})),comments},p,material);assert.equal(result.comments.length,66);const changed=mappings();changed.find(m=>m.criterionId==='handwriting')!.category='language';changed.find(m=>m.criterionId==='handwriting')!.peerEnabled=true;await assert.rejects(compileRubric(source,rubric,changed,options),code('unobservable_criterion'));});
