import test from 'node:test';
import assert from 'node:assert/strict';
import {importLegacy, sanitizeLegacy, reportCsv, exportReportBundle} from '../src/report/legacy-import';
import {sampleBackup, sampleResult, sampleRubric, sampleAssignment} from '../src/report/fixtures';
import {normalizeTeacherEditedScoresAgainstRubric, normalizeBreakdownAgainstRubric, countEnglishWordsForScoring} from '../src/report/legacy-core.js';

test('legacy backup preserves teacher scores, every report section and unknown business fields',async()=>{
  const input=structuredClone(sampleBackup);
  Object.assign(input.files[0].result,{total_score:13.5,word_count:222,extension:{teacherNote:'保留人工判断'}});
  const before=JSON.stringify(input),bundle=await importLegacy(input),r=bundle.reports[0];
  assert.equal(r.result.total_score,13.5);assert.equal(r.result.word_count,222);
  for(const key of ['breakdown','brief_comment','highlights','errors','content_logic','optimized_essay','standard_reference','original_essay','extension']) assert.deepEqual(r.result[key],input.files[0].result[key as keyof typeof input.files[0]['result']]);
  assert.equal(r.rubric?.total,20);assert.equal(r.identity.status,'unlinked');
  assert.equal(JSON.stringify(input),before);
});

test('each saved snapshot retains its own rubric; changed labels do not recalculate old scores',async()=>{
  const second=structuredClone(sampleBackup);second.rubric.total=15;second.rubric.items[0].label='本题要点';
  const bundle=await importLegacy([{data:sampleBackup},{data:second}]);
  assert.equal(bundle.reports.length,2);assert.deepEqual(bundle.reports.map(r=>r.rubric?.total),[20,15]);
  assert.equal(bundle.reports[1].result.breakdown['内容完整度'],6.5);
});

test('serialized browser storage credentials are stripped before hashing, storage or transmission',async()=>{
  const payload={smart_grader_data_v5_0:JSON.stringify({...sampleBackup,config:{apiKey:'do-not-transfer',model:'qwen',headers:{Authorization:'Bearer private'}}}),smart_grader_saved_results_v1:JSON.stringify([{data:sampleBackup}])};
  const bundle=await importLegacy(payload),raw=JSON.stringify(bundle);
  assert(!raw.includes('do-not-transfer'));assert(!raw.includes('Bearer private'));assert.equal(bundle.removedCredentialFields,2);
  assert.equal(bundle.reports.length,1);assert(raw.includes('qwen'));
  const equivalent=await importLegacy({...sampleBackup,config:{apiKey:'another',model:'qwen',headers:{}}});
  const one=await importLegacy({...sampleBackup,config:{apiKey:'first',model:'qwen',headers:{}}});
  assert.equal(one.fingerprint,equivalent.fingerprint);
});

test('missing historical rubric and images remain missing rather than taking the current default',async()=>{
  const bundle=await importLegacy({...sampleResult,original_image_url:'blob:expired-private-image',student_id:'local-1',class_id:'local-class'});
  const r=bundle.reports[0];assert.equal(r.rubric,null);assert.equal(r.identity.status,'unlinked');
  assert.equal(r.identity.legacyStudentId,'local-1');assert.equal(r.result.total_score,15.5);assert(!r.result.original_image_url);
  assert(r.warnings.some(x=>x.includes('评分标准')));assert(r.warnings.some(x=>x.includes('图片')));
});

test('aliases, student history and schema extensions remain usable',async()=>{
  const result={...sampleResult,highlights:[{excerpt:'Original phrase',why_good:'真实表达',extension:1}]};
  const bundle=await importLegacy({studentProfiles:{'old-1':{records:[{result,assignmentTitle:'旧标题',rubricTotal:20}]}}});
  assert.equal(bundle.reports.length,1);assert.equal(bundle.reports[0].result.highlights[0].text,'Original phrase');
  assert.equal(bundle.reports[0].result.highlights[0].comment,'真实表达');assert.equal(bundle.reports[0].result.highlights[0].extension,1);
  assert.equal(bundle.reports[0].rubric,null);
});

test('JSON round trip keeps rubric, sections, teacher changes and scores without duplicate reports',async()=>{
  const bundle=await importLegacy(sampleBackup);bundle.reports[0].result.brief_comment='教师改后的评语';
  bundle.reports[0].result.total_score=14.5;
  const again=await importLegacy(JSON.parse(JSON.stringify(exportReportBundle(bundle.reports))));
  assert.equal(again.reports.length,1);assert.equal(again.reports[0].rubric?.total,20);
  assert.equal(again.reports[0].result.total_score,14.5);assert.equal(again.reports[0].result.brief_comment,'教师改后的评语');
});

test('CSV retains the original seven headers, quotes multiline content and prevents formula execution',async()=>{
  const bundle=await importLegacy({...sampleBackup,files:[{result:{...sampleResult,student_name:'=SUM(A1:A2)',class_name:'示例,"班级"'}}]});
  const csv=reportCsv(bundle.reports);assert(csv.startsWith('\ufeff序号,班级名称,学生姓名,实际得分,题目满分值,写作任务名称,批改时间'));
  assert(csv.includes("'=SUM(A1:A2)"));assert(csv.includes('"示例,""班级"""'));
});

test('credential filtering does not pollute object prototypes and preserves unknown report metadata',()=>{
  const input=JSON.parse('{"__proto__":{"polluted":true},"config":{"api_key":"secret"},"notes":{"rubricVersion":"v1"}}');
  const safe=sanitizeLegacy(input);assert.equal(safe.removed,2);
  assert.equal(({} as Record<string,unknown>).polluted,undefined);assert.equal((safe.value as any).notes.rubricVersion,'v1');
});

test('original scoring helpers keep half marks and exclude crossed-out words',()=>{
  const r=normalizeTeacherEditedScoresAgainstRubric({...sampleResult,total_score:15.5},sampleRubric);
  assert.equal(r.total_score,15.5);assert.equal(r.breakdown['内容完整度'],6.5);
  assert.equal(countEnglishWordsForScoring("I ~~go home~~ went home. Don't worry."),5);
  const normalized=normalizeBreakdownAgainstRubric({...sampleResult,isBlank:true},sampleRubric);
  assert.equal(normalized.total_score,0);
  assert.equal(sampleAssignment.title,'A small act of kindness');
});
