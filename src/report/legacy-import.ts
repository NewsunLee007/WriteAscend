import {DEFAULT_PDF, type Assignment, type ImportBundle, type JsonObject, type LegacyResult, type PdfConfig, type ReportRecord, type Rubric} from './contracts';

export const isObject = (value: unknown): value is JsonObject => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown) => typeof value === 'string' ? value : value == null ? '' : String(value);
const blocked = /^(apikey|apisecret|authorization|proxyauthorization|password|passwordhash|pinhash|pincode|pin|secret|sessionsecret|clientsecret|accesstoken|refreshtoken|idtoken|cookie|setcookie|credential|credentials|xapikey|cfaccessclientid|cfaccessclientsecret)$/;
const storageKeys = /^smart_grader_(data_v5_0|data_v4_3|student_profiles_v1|csv_exports_v1|saved_results_v1|rubric_history_v1|class_analysis_history_v1)$/;

/** Call before network/storage. Unknown business fields survive, authentication material does not. */
export function sanitizeLegacy(input: unknown): {value: unknown; removed: number} {
  let removed = 0;
  function walk(value: unknown, depth: number): unknown {
    if (depth > 80) throw new Error('备份嵌套层级过多，请使用原系统导出的 JSON 文件。');
    if (Array.isArray(value)) return value.map(v => walk(v, depth + 1));
    if (!isObject(value)) return value;
    const out: JsonObject = {};
    for (const [key, child] of Object.entries(value)) {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (blocked.test(normalizedKey) || /(?:apikey|apisecret|passwordhash|sessionsecret|clientsecret|accesstoken|refreshtoken)$/.test(normalizedKey) || ['__proto__', 'prototype', 'constructor'].includes(key)) {removed++; continue;}
      if (storageKeys.test(key) && typeof child === 'string') {
        try {out[key] = walk(JSON.parse(child), depth + 1);} catch {throw new Error('备份中的历史存储内容损坏：' + key);}
      } else out[key] = walk(child, depth + 1);
    }
    return out;
  }
  return {value: walk(input, 0), removed};
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (isObject(value)) return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value) ?? 'null';
}
export async function digest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonical(value));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(n => n.toString(16).padStart(2, '0')).join('');
}

function resultLike(v: JsonObject) {
  return 'total_score' in v || 'brief_comment' in v || 'optimized_essay' in v || ('original_essay' in v && 'breakdown' in v);
}
function adaptResult(raw: JsonObject, assignment: Assignment): LegacyResult {
  const highlights = Array.isArray(raw.highlights) ? raw.highlights.filter(isObject).map(h => ({...h, text: text(h.text ?? h.excerpt), comment: text(h.comment ?? h.why_good)})) : [];
  const errors = Array.isArray(raw.errors) ? raw.errors.filter(isObject).map(e => ({...e, orig: text(e.orig ?? e.original), corr: text(e.corr ?? e.correct), note: text(e.note ?? e.reason)})) : [];
  const result = {
    ...raw, student_name: text(raw.student_name), class_name: text(raw.class_name),
    total_score: raw.total_score ?? raw.totalScore ?? null,
    breakdown: isObject(raw.breakdown) ? {...raw.breakdown} : {},
    brief_comment: text(raw.brief_comment), original_essay: text(raw.original_essay ?? raw.original_text),
    optimized_essay: text(raw.optimized_essay), standard_reference: text(raw.standard_reference ?? assignment.modelEssay),
    content_logic: text(raw.content_logic), word_count: raw.word_count ?? null, highlights, errors,
  } as LegacyResult;
  // Old blob URLs expire; arbitrary remote images must not be fetched during import.
  delete result.original_image_url;
  return result;
}

export async function importLegacy(input: unknown): Promise<ImportBundle> {
  const {value, removed} = sanitizeLegacy(input);
  if (!isObject(value) && !Array.isArray(value)) throw new Error('请选择作文结果、完整备份或已保存结果的 JSON 文件。');
  const reports: ReportRecord[] = [], seen = new Set<string>();
  interface Context {assignment: Assignment; rubric: Rubric | null; pdfConfig: PdfConfig}
  const empty: Context = {assignment: {}, rubric: null, pdfConfig: {...DEFAULT_PDF}};
  async function visit(v: unknown, path: string, parent: Context, depth = 0): Promise<void> {
    if (depth > 40) throw new Error('历史记录嵌套过深。');
    if (Array.isArray(v)) {for (let i = 0; i < v.length; i++) await visit(v[i], path + '/' + i, parent, depth + 1); return;}
    if (!isObject(v)) return;
    const ownRubric = isObject(v.rubric) && Array.isArray(v.rubric.items) && typeof v.rubric.total === 'number' ? v.rubric as unknown as Rubric : null;
    const ctx: Context = {
      assignment: isObject(v.assignment) ? v.assignment : parent.assignment,
      rubric: ownRubric ?? parent.rubric,
      pdfConfig: isObject(v.pdfConfig) ? {...DEFAULT_PDF, ...v.pdfConfig} as PdfConfig : parent.pdfConfig,
    };
    if (resultLike(v)) {
      const fingerprint = await digest({result: v, assignment: ctx.assignment, rubric: ctx.rubric});
      if (seen.has(fingerprint)) return;
      seen.add(fingerprint);
      const warnings: string[] = [];
      if (!ctx.rubric) warnings.push('缺少当时的完整评分标准；可查看原分数，暂不可修改评分。');
      if (v.original_image_url) warnings.push('原稿图片链接需要重新关联文件，导入时未加载该链接。');
      if (!v.original_essay && !v.original_text) warnings.push('原稿文字未提供。');
      reports.push({id: 'legacy-' + fingerprint, schema: 'legacy-report-v1', fingerprint, sourcePath: path,
        result: adaptResult(v, ctx.assignment), originalResult: structuredClone(v),
        assignment: structuredClone(ctx.assignment), rubric: ctx.rubric ? structuredClone(ctx.rubric) : null,
        pdfConfig: structuredClone(ctx.pdfConfig), identity: {status: 'unlinked', legacyStudentId: text(v.student_id), legacyClassId: text(v.class_id)},
        warnings, modified: false});
      return;
    }
    // Follow only documented containers, with each snapshot's own rubric and assignment.
    for (const key of ['data', 'files', 'result', 'records', 'savedGradingResults', 'reports']) {
      if (key in v) await visit(v[key], path + '/' + key, ctx, depth + 1);
    }
    if (isObject(v.studentProfiles)) for (const [id, profile] of Object.entries(v.studentProfiles)) await visit(profile, path + '/studentProfiles/' + id, {...ctx, rubric: null, assignment: {}}, depth + 1);
    for (const [key, child] of Object.entries(v)) {
      if (storageKeys.test(key)) {
        if (key === 'smart_grader_student_profiles_v1' && isObject(child)) {
          for (const [id, profile] of Object.entries(child)) await visit(profile, path + '/' + key + '/' + id, empty, depth + 1);
        } else await visit(child, path + '/' + key, empty, depth + 1);
      }
    }
  }
  await visit(value, '$', empty);
  const warnings = reports.length ? [] : ['文件中没有批改结果；已保留配置及历史数据，尚未向云端提交。'];
  if (removed) warnings.push(`已在本机排除 ${removed} 个认证字段。`);
  return {schema: 'legacy-import-v1', fingerprint: await digest(value), reports, sanitizedPayload: value, removedCredentialFields: removed, warnings};
}

export function reportCsv(reports: ReportRecord[], includeBom = true): string {
  const rows: unknown[][] = [['序号','班级名称','学生姓名','实际得分','题目满分值','写作任务名称','批改时间']];
  for (const r of reports) rows.push([r.result.student_no ?? '', r.result.class_name, r.result.student_name, r.result.total_score ?? '', r.rubric?.total ?? '', r.assignment.title ?? '', r.result.graded_at ?? '']);
  // CSV files can be opened by spreadsheet applications; neutralize formula cells.
  const cell = (v: unknown) => {
    let s = text(v); if (/^[\s]*[=+@-]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return (includeBom ? '\ufeff' : '') + rows.map(row => row.map(cell).join(',')).join('\r\n');
}

export function exportReportBundle(reports: ReportRecord[]) {
  return sanitizeLegacy({schema: 'writeascend-export-v2',
    reports: reports.map(r => ({data:{assignment:r.assignment,rubric:r.rubric,pdfConfig:r.pdfConfig,files:[{result:r.result}]}}))}).value;
}
