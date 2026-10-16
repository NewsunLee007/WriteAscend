import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const baseline=fs.readFileSync(new URL('../legacy/index.html',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const teacher=fs.readFileSync(new URL('../src/TeacherApp.jsx',import.meta.url),'utf8');
const core=fs.readFileSync(new URL('../src/report/legacy-core.js',import.meta.url),'utf8');

test('original scoring and model prompt block is retained exactly',()=>{
  const original=baseline.slice(baseline.indexOf('        const estimatePageCount'),baseline.indexOf('        // --- Components ---'));
  assert(core.includes(original));
});

test('all original teacher data and grading operations remain present after UI redesign',()=>{
  // The user explicitly authorized replacing the old visual components. Keep
  // business operations as the baseline, without pinning presentation helpers.
  const original=baseline.slice(baseline.indexOf('        const App ='),baseline.indexOf("        const root = ReactDOM.createRoot"));
  const names=[...original.matchAll(/const (\w+) = (?:async )?\(/g)].map(m=>m[1]);
  for(const name of names)assert(teacher.includes(`const ${name} = `),`Missing teacher operation: ${name}`);
  for(const operation of ['startBatchGrading','callAI','handleStudentUpload','generateTopicAnalysis','generateRubricDesign','generateModelEssay','handlePauseBatch','exportCsvForClass','saveCurrentGradingSnapshot','generateClassAnalysis','importData','exportData'])assert(teacher.includes(`const ${operation} = `),operation);
});

test('the teacher workbench and class review use the same complete report presentation',()=>{
  const report=fs.readFileSync(new URL('../src/report/LegacyPaper.jsx',import.meta.url),'utf8');
  const review=fs.readFileSync(new URL('../src/teacher/BoundGradingPanel.tsx',import.meta.url),'utf8');
  assert(teacher.includes("import EditablePaper from './report/LegacyPaper.jsx'"));
  assert(review.includes("from '../report/LegacyPaper.jsx'"));
  for(const field of ['total_score','breakdown','brief_comment','highlights','errors','content_logic','optimized_essay','standard_reference','original_image_urls'])assert(report.includes(field),field);
  for(const heading of ['Overall Comment','Excellent Expressions','Correction','Content Optimization Suggestions','Revised','Model'])assert(report.includes(heading),heading);
});

test('main entry is the complete teacher app and does not use the report-import experiment',()=>{
  const entry=fs.readFileSync(new URL('../src/main.tsx',import.meta.url),'utf8');
  assert(entry.includes('<TeacherApp />'));assert(!entry.includes("from './App'"));
  for(const label of ['评分标准','导入作文','批改导出','班级分析','开始批改','暂停批改','生成范文','学生管理'])assert(teacher.includes(label),label);
});
