export type JsonObject = Record<string, unknown>;
export interface Criterion extends JsonObject {id: string; label: string; score: number; desc: string}
export interface Rubric extends JsonObject {
  total: number; wordCount: string; gradeLevel: string; items: Criterion[];
}
export interface Assignment extends JsonObject {title?: string; examName?: string; topic?: string; modelEssay?: string}
export interface LegacyResult extends JsonObject {
  student_name: string; class_name: string; student_no?: string;
  total_score: number | string | null; breakdown: Record<string, number | string>;
  brief_comment: string; original_essay: string; optimized_essay: string;
  standard_reference: string; content_logic: string; word_count: number | null;
  highlights: Array<{text: string; comment: string; [key: string]: unknown}>;
  errors: Array<{orig: string; corr: string; note: string; type?: string; [key: string]: unknown}>;
  isBlank?: boolean;
}
export interface PdfConfig extends JsonObject {
  padding: number; lineHeight: number; fontSizeScale: number;
  sectionGapPt: number; paragraphGapPt: number; showPrompt: boolean; showOriginal: boolean;
}
export interface ReportRecord {
  id: string; schema: 'legacy-report-v1'; fingerprint: string; sourcePath: string;
  result: LegacyResult; originalResult: JsonObject; assignment: Assignment;
  rubric: Rubric | null; pdfConfig: PdfConfig;
  identity: {status: 'unlinked' | 'confirmed'; legacyStudentId: string; legacyClassId: string};
  warnings: string[]; modified: boolean;
}
export interface ImportBundle {
  schema: 'legacy-import-v1'; fingerprint: string; reports: ReportRecord[];
  sanitizedPayload: unknown; removedCredentialFields: number; warnings: string[];
}
export const DEFAULT_PDF: PdfConfig = {
  padding: 15, lineHeight: 1.3, fontSizeScale: 1, sectionGapPt: 8,
  paragraphGapPt: 2, showPrompt: false, showOriginal: false,
};
