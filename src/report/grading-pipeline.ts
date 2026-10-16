import {SYSTEM_PROMPT_TEMPLATE,OPTIMIZED_REPAIR_PROMPT_TEMPLATE,resolveEffectiveDifficultyProfile,normalizeBreakdownAgainstRubric,isOptimizedTooSimilarToReference,countEnglishWords,validateDifficultyForGrade} from './legacy-core';
import {parseJsonObject,extractContentFromApiResponse} from './legacy-model-parser';
export const GRADING_PIPELINE_VERSION='legacy-preserved-v1';
export type PipelineInput={assignment:any;rubric:any;languageDifficulty:any;grade:string;className:string;rosterText:string;images:string[]};
export type PipelineStage='grade'|'optimized'|'difficulty-1'|'difficulty-2';
export function gradeMessages(input:PipelineInput){
 return [{role:'system',content:SYSTEM_PROMPT_TEMPLATE(input.assignment,input.rubric,`Current Class: ${input.className}\nRoster:\n${input.rosterText}`,input.grade,input.languageDifficulty)},{role:'user',content:[{type:'text',text:`标准范文：${input.assignment.modelEssay}`},...input.images.map(url=>({type:'image_url',image_url:{url}}))]}];
}
export function repairJsonMessages(content:string){return [{role:'system',content:'你是一个 JSON 修复器。你的任务：把用户提供的文本修复为“严格可解析的 JSON 对象（RFC 8259）”。只输出 JSON，不要输出任何解释、Markdown 或代码块标记。必须使用双引号。字符串需要换行时请用\\n，不要输出原始换行符。'},{role:'user',content}];}
export function responseContent(body:any){
 const content=extractContentFromApiResponse(body,JSON.stringify(body));
 if(typeof content!=='string'||!content.trim())throw Error('模型返回为空，请核对模型设置。');return content;
}
export function parseGradingObject(content:string){
 const parsed=parseJsonObject(content);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error('模型结果必须为 JSON 对象。');return parsed as Record<string,any>;
}
export function optimizedMessages(input:PipelineInput,result:any){return [{role:'system',content:OPTIMIZED_REPAIR_PROMPT_TEMPLATE(input.assignment,input.rubric,input.grade,input.languageDifficulty)},{role:'user',content:[{type:'text',text:`standard_reference:\n${result.standard_reference||input.assignment.modelEssay||''}`},...input.images.map(url=>({type:'image_url',image_url:{url}}))]}];}
export function difficultyMessages(input:PipelineInput,result:any){
 const profile=resolveEffectiveDifficultyProfile(input.grade,input.languageDifficulty);
 const system=['你是一个英语难度控制器与改写器。',`目标：把用户提供的 JSON 批改结果中的所有英文表达改写为适合 ${input.grade} 学生理解的难度，且不超过难度系数 ${profile.coefficient}。`,'必须保持 JSON 结构与字段名不变，分数与数值字段不变，中文字段保持中文。','硬性规则：','- errors[].orig 必须原样保留，不要改写。','- errors[].corr 必须用更简单的英文表达同一意思，尽量短句，避免复杂从句。','- optimized_essay 必须保持至少 3 段（用双换行分段），但用更简单的词汇与句式。','- content_logic 中的英文示例必须更简单，连接词优先使用 First/Then/Next/Finally/Because/But/So/Also。','- 避免使用高阶词：moreover/furthermore/nevertheless/consequently/notwithstanding 等。','只输出严格 JSON 对象，不要输出任何解释、Markdown 或代码块标记。'].join('\n');
 return [{role:'system',content:system},{role:'user',content:JSON.stringify(result||{})}];
}
export function applyStage(input:PipelineInput,stage:PipelineStage,result:any,answer:any){
 if(stage==='grade'){
  if(typeof answer.original_essay!=='string'&&!['original_text','ocr_text','student_essay'].some(k=>typeof answer[k]==='string'))throw Error('批改结果缺少原稿识别字段，请核对模型输出。');
  const normalized=normalizeBreakdownAgainstRubric({...answer,standard_reference:input.assignment.modelEssay||answer.standard_reference},input.rubric);
  if(!normalized.original_essay.trim()&&answer.isBlank!==true)throw Error('原稿文字无法可靠识别，请核对照片或识别稿，不能将其直接记为零分。');
  return normalized;
 }
 if(stage==='optimized'){
  // Preserve the first transcription. A rewriting stage cannot replace the
  // student's original text, scores, observations or established identity.
  const next={...result};if(typeof answer.optimized_essay==='string')next.optimized_essay=answer.optimized_essay;
  next.word_count=countEnglishWords(next.original_essay)||next.word_count;return next;
 }
 const next={...result};
 if(typeof answer.optimized_essay==='string')next.optimized_essay=answer.optimized_essay;
 if(typeof answer.content_logic==='string')next.content_logic=answer.content_logic;
 if(Array.isArray(result.errors)&&Array.isArray(answer.errors))next.errors=result.errors.map((error:any,i:number)=>{
  const repair=answer.errors[i];return repair&&repair.orig===error.orig&&typeof repair.corr==='string'?{...error,corr:repair.corr}:error;
 });
 return next;
}
export function nextStage(input:PipelineInput,after:PipelineStage,result:any):PipelineStage|null{
 if(after==='grade'&&isOptimizedTooSimilarToReference(result.optimized_essay||'',result.standard_reference||input.assignment.modelEssay||''))return 'optimized';
 if(input.languageDifficulty?.enabled===false||input.languageDifficulty?.autoRewrite===false)return null;
 if(!validateDifficultyForGrade(result,input.grade,input.languageDifficulty).ok){if(after==='grade'||after==='optimized')return 'difficulty-1';if(after==='difficulty-1')return 'difficulty-2';}
 return null;
}
export function finalizeGrade(input:PipelineInput,result:any){
 const final={...result};if(input.languageDifficulty?.enabled!==false){const check=validateDifficultyForGrade(final,input.grade,input.languageDifficulty);final.difficulty_status=check.ok?'ok':'exceeded';final.difficulty_reasons=check.reasons||[];}return final;
}
