// Full teacher workflow retained from original GitHub baseline 2def1d2.
import React from "react";
import EditablePaper from './report/LegacyPaper.jsx';
import QuickGrading from './teacher/QuickGrading.jsx';
import {useTeacherCloud,CloudConnection,CloudModelSettings} from './teacher/TeacherCloud';
import {createCloudModelTransport} from './teacher/cloud-model';
import {useWorkspaceDraft} from './teacher/useWorkspaceDraft';
import {useCloudSnapshots} from './teacher/useCloudSnapshots';
import {CloudSnapshotsPanel} from './teacher/CloudSnapshotsPanel';
import {TeacherTasksPanel} from './teacher/TeacherTasksPanel';
import {taskClasses,uniqueStudent} from './teacher/task-roster';
const SchoolDirectoryPanel=React.lazy(()=>import('./teacher/SchoolDirectoryPanel'));
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { estimatePageCount, indentParagraphs, getEffectivePdfConfigForPages, INITIAL_RUBRIC, GRADE_LEVELS, TENSES, STRICTNESS_LEVELS, DIFFICULTY_LEVELS, GRADE_DIFFICULTY_TABLE, resolveGradeDifficultyProfile, clampRatio, resolveEffectiveDifficultyProfile, tokenizeEnglishWords, splitEnglishSentences, countSyllables, computeFleschKincaidGradeLevel, computeEnglishDifficultyStats, collectEnglishFieldsForDifficultyCheck, validateDifficultyForGrade, SYSTEM_PROMPT_TEMPLATE, OPTIMIZED_REPAIR_PROMPT_TEMPLATE, clampNumber, roundToHalf, sumItemMax, redistributeItemScoresToTotal, normalizeHighlights, normalizeErrorsForRubric, normalizeForWordCount, countEnglishWords, countEnglishWordsForScoring, normalizeForSimilarity, diceSimilarity, isOptimizedTooSimilarToReference, parseWordCountRequirement, clampStrictnessLevel, strictnessLabelFromLevel, strictnessLevelFromLabel, strictnessFactorFromLevel, strictnessFactor, strictnessScoreShift, buildScoreAnchorText, classifyErrorWeight, estimateParagraphCount, countConnectors, pickRubricLabels, addPointsToBreakdown, subtractPointsFromBreakdown, calibrateResultScoresAgainstEvidence, normalizeBreakdownAgainstRubric, didTeacherEditScores, normalizeTeacherEditedScoresAgainstRubric, RUBRIC_PARSE_PROMPT_SYSTEM, RUBRIC_DESIGN_PROMPT_SYSTEM, EXTRACT_PROMPT_TEXT_SYSTEM, ANALYZE_TOPIC_TEXT_SYSTEM } from "./report/legacy-core.js";

        const { useState, useEffect, useRef, useMemo } = React;

        // --- Icons ---
        const IconBase = ({ children, size = 20, className = "", ...props }) => (
            <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>{children}</svg>
        );
        const Icons = {
            Layout: (p) => <IconBase {...p}><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></IconBase>,
            Settings: (p) => <IconBase {...p}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></IconBase>,
            Upload: (p) => <IconBase {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></IconBase>,
            Check: (p) => <IconBase {...p}><path d="M20 6 9 17l-5-5"/></IconBase>,
            Printer: (p) => <IconBase {...p}><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></IconBase>,
            Edit: (p) => <IconBase {...p}><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></IconBase>,
            Refresh: (p) => <IconBase {...p}><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></IconBase>,
            Trash: (p) => <IconBase {...p}><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></IconBase>,
            Plus: (p) => <IconBase {...p}><path d="M5 12h14"/><path d="M12 5v14"/></IconBase>,
            X: (p) => <IconBase {...p}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></IconBase>,
            Image: (p) => <IconBase {...p}><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></IconBase>,
            ArrowLeft: (p) => <IconBase {...p}><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></IconBase>,
            ArrowRight: (p) => <IconBase {...p}><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></IconBase>,
            Star: (p) => <IconBase {...p}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></IconBase>,
            FilePlus: (p) => <IconBase {...p}><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="12" x2="12" y1="11" y2="17"/><line x1="9" x2="15" y1="14" y2="14"/></IconBase>,
            Users: (p) => <IconBase {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></IconBase>,
            Help: (p) => <IconBase {...p}><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></IconBase>,
            Sparkles: (p) => <IconBase {...p}><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M9 5h4"/></IconBase>,
            Sliders: (p) => <IconBase {...p}><line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/><line x1="1" x2="7" y1="14" y2="14"/><line x1="9" x2="15" y1="8" y2="8"/><line x1="17" x2="23" y1="16" y2="16"/></IconBase>,
            Download: (p) => <IconBase {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></IconBase>,
            UploadCloud: (p) => <IconBase {...p}><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M12 12v9"/><path d="m16 16-4-4-4 4"/></IconBase>,
            PieChart: (p) => <IconBase {...p}><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></IconBase>,
            Grid: (p) => <IconBase {...p}><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></IconBase>,
            Square: (p) => <IconBase {...p}><rect width="18" height="18" x="3" y="3" rx="2"/></IconBase>,
            ZoomIn: (p) => <IconBase {...p}><circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/><line x1="11" x2="11" y1="8" y2="14"/><line x1="8" x2="14" y1="11" y2="11"/></IconBase>
        };
        const { Layout, Settings, Upload, Check, Printer, Edit, Refresh, Trash, Plus, X, Image: ImageIcon, ArrowLeft, ArrowRight, Star, FilePlus, Users, Help, Sparkles, Sliders, Download, UploadCloud, PieChart, Grid, Square, ZoomIn } = Icons;

        // --- Components ---

        const Loader = () => (
            <div className="flex flex-col items-center justify-center p-8">
                <div className="ai-pulse-clean mb-4"></div>
                <p className="text-indigo-600 font-medium animate-pulse tracking-wide text-sm">AI 正在深度思考中...</p>
            </div>
        );

        const Lightbox = ({ src, onClose }) => {
            if (!src) return null;
            return (
                <div className="lightbox-overlay" onClick={onClose}>
                    <img src={src} className="lightbox-img" alt="Zoomed" />
                </div>
            );
        };

        const Stepper = ({ currentStep, maxStep, steps, onStepClick, onHelp, onConfig, onHome }) => (
            <header className="teacher-stepper no-print">
                <div className="teacher-brand"><img src="/favicon.svg" alt=""/><strong>智能英语作文批改</strong></div>
                <nav aria-label="完整批阅流程">{steps.map((label,index)=><button key={label} aria-label={label} aria-current={index===currentStep?'step':undefined} className={index===currentStep?'is-current':''} onClick={()=>onStepClick(index)}><span>{index+1}</span>{label}</button>)}</nav>
                <div className="teacher-header-actions"><button onClick={onHome}>快速批改</button><button onClick={onHelp} aria-label="帮助"><Help size={18}/></button><button onClick={onConfig} aria-label="设置"><Settings size={18}/></button></div>
            </header>
        );

        const Modal = ({ isOpen, onClose, title, children, footer, large }) => {
            if (!isOpen) return null;
            return (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-md fade-in" style={{zIndex: 100}}>
                    <div className={`bg-white/95 glass-panel rounded-3xl shadow-2xl w-full ${large ? 'max-w-4xl' : 'max-w-md'} p-6 max-h-[90vh] flex flex-col`}>
                        <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
                            <h2 className="text-xl font-bold flex items-center gap-2 text-slate-900">{title}</h2>
                            <button onClick={onClose} className="text-slate-400 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 rounded-full p-1.5 transition"><X size={20}/></button>
                        </div>
                        <div className="overflow-y-auto flex-1 pr-2">{children}</div>
                        {footer && <div className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-4">{footer}</div>}
                    </div>
                </div>
            );
        };

        const ClassAnalysisReport = ({ data, assignment, currentClass, dateOverride }) => {
            if (!data) return null;
            const reportDate = dateOverride || data.date || new Date().toLocaleDateString();
            const title = data.title || '英语教学质量分析报告';
            const subtitle = data.subtitle || `${(assignment.examName ? assignment.examName + ' - ' : '')}${assignment.title || '本次作业'} - 班级学情概览`;
            let classNameText = (data.class_name || '').trim();
            if (!classNameText || classNameText.includes('暂无')) classNameText = currentClass || '';
            const metrics = data.summaryMetrics || {};
            const sections = data.sections || [];

            return (
                <div className="a4-wrapper text-slate-800">
                    <div className="px-10 pt-10 pb-6 border-b border-slate-200">
                        <div className="flex justify-between items-baseline">
                            <div>
                                <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight mb-2">{title}</h1>
                                <p className="text-sm text-slate-500">{subtitle}</p>
                            </div>
                            <div className="text-right text-xs text-slate-500 space-y-1">
                                {classNameText && <div>班级：<span className="font-semibold text-slate-700">{classNameText}</span></div>}
                                <div>日期：<span className="font-semibold text-slate-700">{reportDate}</span></div>
                            </div>
                        </div>
                        <div className="mt-4 h-px bg-gradient-to-r from-indigo-400 via-sky-400 to-transparent rounded-full" />
                    </div>

                    {metrics && Object.keys(metrics).length > 0 && (
                        <div className="px-10 py-6 grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50/70 border-b border-slate-200 text-xs text-slate-600">
                            {metrics.sample_size && (
                                <div className="px-3 py-2 rounded-xl bg-white border border-slate-100 shadow-sm">
                                    <div className="text-[11px] text-slate-400 mb-1">样本数量</div>
                                    <div className="font-semibold text-slate-800 leading-snug">{metrics.sample_size}</div>
                                </div>
                            )}
                            {metrics.average_score && (
                                <div className="px-3 py-2 rounded-xl bg-white border border-slate-100 shadow-sm">
                                    <div className="text-[11px] text-slate-400 mb-1">平均分概览</div>
                                    <div className="font-semibold text-slate-800 leading-snug">{metrics.average_score}</div>
                                </div>
                            )}
                            {metrics.score_range && (
                                <div className="px-3 py-2 rounded-xl bg-white border border-slate-100 shadow-sm">
                                    <div className="text-[11px] text-slate-400 mb-1">分数区间</div>
                                    <div className="font-semibold text-slate-800 leading-snug">{metrics.score_range}</div>
                                </div>
                            )}
                            {metrics.key_focus && (
                                <div className="px-3 py-2 rounded-xl bg-white border border-slate-100 shadow-sm md:col-span-3">
                                    <div className="text-[11px] text-slate-400 mb-1">本次分析重点</div>
                                    <div className="font-semibold text-slate-800 leading-snug">{metrics.key_focus}</div>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="px-10 py-8 space-y-8 text-sm leading-7 text-slate-700">
                        {sections.map((sec, index) => (
                            <section key={sec.id || index} className="space-y-3">
                                <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                                    <span className="w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs font-bold border border-indigo-100">
                                        {index + 1}
                                    </span>
                                    <span>{sec.title}</span>
                                </h2>
                                {(sec.paragraphs || []).map((p, i) => (
                                    <p key={i}>{p}</p>
                                ))}
                                {sec.bullets && sec.bullets.length > 0 && (
                                    <ul className="list-disc pl-5 space-y-1">
                                        {sec.bullets.map((b, i) => (
                                            <li key={i}>{b}</li>
                                        ))}
                                    </ul>
                                )}
                            </section>
                        ))}

                        {data.conclusion && (
                            <section className="pt-4 border-t border-dashed border-slate-200">
                                <h2 className="text-base font-semibold text-slate-900 mb-3">总结与后续行动</h2>
                                <p>{data.conclusion}</p>
                            </section>
                        )}
                    </div>
                </div>
            );
        };

        // --- Paper Component ---
        const App = () => {
            const cloud = useTeacherCloud();
            const teacherStorage = cloud.storage;
            const modelReady = cloud.mode === 'cloud' ? cloud.status === 'ready' && !!cloud.profileId : null;
            const [workflowMode, setWorkflowMode] = useState(() => {
                try { return teacherStorage.getItem('writeascend_teacher_mode') === 'full' ? 'full' : 'quick'; }
                catch { return 'quick'; }
            });
            useEffect(() => { try { teacherStorage.setItem('writeascend_teacher_mode', workflowMode); } catch {} }, [workflowMode]);
            const [step, setStep] = useState(0);
            const [maxStep, setMaxStep] = useState(0);
            const [config, setConfig] = useState({ apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', apiKey: '', model: 'qwen3-omni-flash', temperature: 0.3, preset: 'aliyun-dashscope' });
            
            // UI State
            const [showConfig, setShowConfig] = useState(false);
            const [showStudentMgmt, setShowStudentMgmt] = useState(false);
            const [showStudentProfiles, setShowStudentProfiles] = useState(false);
            const [showHelp, setShowHelp] = useState(false);
            const [showPDFSettings, setShowPDFSettings] = useState(false);
            const [showAnalysis, setShowAnalysis] = useState(false);
            const [lightboxSrc, setLightboxSrc] = useState(null);
            const [viewMode, setViewMode] = useState('grid');
            const [previewFileId, setPreviewFileId] = useState(null);
            const [previewScale, setPreviewScale] = useState(1);
            const [controlsOpen, setControlsOpen] = useState(false);
            const controlsRef = useRef(null);
            const isPausedRef = useRef(false);
            const savedResultsStorageWarnedRef = useRef(false);
            const studentProfilesStorageWarnedRef = useRef(false);
            const studentProfilesShrinkStageRef = useRef(0);
            const coreDataStorageWarnedRef = useRef(false);
            const coreDataStorageSkipUntilRef = useRef(0);
            const [pauseRequested, setPauseRequested] = useState(false);
            const pauseRequestedRef = useRef(false);
            const [pauseBanner, setPauseBanner] = useState('');
            const [overallPreviewOpen, setOverallPreviewOpen] = useState(false);
            const [archivedPreview, setArchivedPreview] = useState({ open: false, record: null });
            const [profilesQuery, setProfilesQuery] = useState('');
            const [profilesSelectedStudentId, setProfilesSelectedStudentId] = useState('');
            const [profilesMultiSelect, setProfilesMultiSelect] = useState(false);
            const [profilesSelectedRecordIds, setProfilesSelectedRecordIds] = useState(new Set());

            // Core Data
            const [classes, setClasses] = useState([]);
            const [currentClassId, setCurrentClassId] = useState('');
            const [activeClassIds, setActiveClassIds] = useState([]);
            const [studentProfiles, setStudentProfiles] = useState({});
            const [classPage, setClassPage] = useState(0);
            const [studentImportText, setStudentImportText] = useState('');
            const [bulkStudentImportText, setBulkStudentImportText] = useState('');
            const [assignment, setAssignment] = useState({ examName: '', title: '', topic: '', analysis: '', modelEssay: '', promptImageBase64: '', promptImageName: '', isExtractingText: false, isGeneratingAnalysis: false, isGeneratingModel: false });
            const [rubric, setRubric] = useState(INITIAL_RUBRIC);
            const [files, setFiles] = useState([]);
            
            const [selectedFileId, setSelectedFileId] = useState(null);
            const [isBatchProcessing, setIsBatchProcessing] = useState(false);
            const [isPaused, setIsPaused] = useState(false);
            const [printMode, setPrintMode] = useState('batch');
            const [analysisData, setAnalysisData] = useState(null);
            const [isAnalyzingClass, setIsAnalyzingClass] = useState(false);
            const [analysisHistory, setAnalysisHistory] = useState([]);
            const [analysisPreview, setAnalysisPreview] = useState({ open: false, item: null });
            const [showAnalysisGenerateDialog, setShowAnalysisGenerateDialog] = useState(false);
            const [analysisGenerateMode, setAnalysisGenerateMode] = useState('current');
            const [analysisGenerateSnapshotId, setAnalysisGenerateSnapshotId] = useState('');
            const [analysisConfig, setAnalysisConfig] = useState({ focus: '全面分析', focusCustom: '', tone: '专业客观', toneCustom: '' });
            const [historyStudentId, setHistoryStudentId] = useState('');
            const [historyStudentQuery, setHistoryStudentQuery] = useState('');
            const [pdfConfig, setPdfConfig] = useState({ padding: 15, lineHeight: 1.3, fontSizeScale: 1.0, sectionGapPt: 8, paragraphGapPt: 2, showPrompt: false, showOriginal: false });

            const [rubricParseState, setRubricParseState] = useState({ status: 'idle', fileName: '', file: null, extractedText: '', result: null, error: '' });
            const [rubricPasteText, setRubricPasteText] = useState('');
            const [rubricDesignState, setRubricDesignState] = useState({ status: 'idle', result: null, error: '' });
            const [showRubricImportModal, setShowRubricImportModal] = useState(false);
            const [rubricHistory, setRubricHistory] = useState([]);
            const [showRubricHistory, setShowRubricHistory] = useState(false);
            const [rubricHistoryName, setRubricHistoryName] = useState('');
            const [showRubricBackupDialog, setShowRubricBackupDialog] = useState(false);
            const [rubricBackupName, setRubricBackupName] = useState('');
            const [showRubricBackupSuccess, setShowRubricBackupSuccess] = useState(false);
            const [rubricBackupSuccessName, setRubricBackupSuccessName] = useState('');
            const [csvExportConfig, setCsvExportConfig] = useState({ includeUtf8Bom: true });
            const [csvExportHistory, setCsvExportHistory] = useState([]);
            const [showCsvHistory, setShowCsvHistory] = useState(false);
            const [csvHistoryQuery, setCsvHistoryQuery] = useState('');
            const [savedGradingResults, setSavedGradingResults] = useState([]);
            const [showSaveDialog, setShowSaveDialog] = useState(false);
            const [saveDraftName, setSaveDraftName] = useState('');
            const [rubricDesignAppliedAt, setRubricDesignAppliedAt] = useState('');
            const [languageDifficulty, setLanguageDifficulty] = useState({ enabled: true, capRatio: 1.0, autoRewrite: true });
            const [activeCloudSnapshot, setActiveCloudSnapshot] = useState(null);
            const [sourceTask,setSourceTask] = useState(null);
            const [saveToCurrentCloud, setSaveToCurrentCloud] = useState(false);
            const lastSavedLocalIdRef = useRef('');
            const lastSavedAtRef = useRef('');
            const cloudSnapshots = useCloudSnapshots({
                workspaceId: cloud.mode === 'cloud' ? cloud.identity.workspaceId : null,
                onExpired: cloud.expired,
                onSynced: ({snapshot,cloud:reference}) => {
                    const item = {...snapshot,cloud:reference};
                    setSavedGradingResults(previous => {
                        const found = previous.find(p => p.id === item.id);
                        if (!found) return [item,...previous].slice(0,120);
                        return previous.map(p => p.id !== item.id ? p : (!p.savedAt || p.savedAt <= item.savedAt ? item : {...p,cloud:reference,cloudPending:true}));
                    });
                    if (lastSavedLocalIdRef.current === item.id && lastSavedAtRef.current === item.savedAt) setActiveCloudSnapshot({...reference,localSavedAt:item.savedAt});
                }
            });
            const draftError = useWorkspaceDraft({
                workspaceId: cloud.mode === 'cloud' ? cloud.identity.workspaceId : null,
                draft: { files, selectedFileId, step, activeCloudSnapshot, sourceTask },
                restore: saved => {
                    setActiveCloudSnapshot(saved.activeCloudSnapshot || null);
                    setSourceTask(saved.sourceTask || null);
                    if(saved.activeCloudSnapshot){lastSavedLocalIdRef.current=saved.activeCloudSnapshot.localId||'';lastSavedAtRef.current=saved.activeCloudSnapshot.localSavedAt||'';}
                    setFiles(saved.files);
                    setSelectedFileId(saved.files.some(f => f.id === saved.selectedFileId) ? saved.selectedFileId : saved.files[0]?.id || null);
                    if (saved.files.length) {
                        const targetStep = saved.step === 0 ? 0 : 2;
                        setStep(targetStep); setMaxStep(prev => Math.max(prev, targetStep));
                        if (saved.files.some(f => f.status === 'idle')) { setIsPaused(true); setPauseBanner('已恢复上次作文。点击“继续批改”可核对并接收已有云端任务的结果。'); }
                    }
                }
            });

            const normalizeRubricForSystem = (loadedRubric) => {
                if (!loadedRubric) return null;
                const loaded = loadedRubric;
                const loadedStrictnessLevelRaw = clampStrictnessLevel(loaded && loaded.strictnessLevel);
                const loadedStrictnessLevel = loadedStrictnessLevelRaw !== null ? loadedStrictnessLevelRaw : strictnessLevelFromLabel(loaded && loaded.strictness);
                const loadedStrictnessLabel = (loaded && loaded.strictness) ? String(loaded.strictness) : strictnessLabelFromLevel(loadedStrictnessLevel);
                const normalizedLoaded = { ...loaded, strictness: loadedStrictnessLabel, strictnessLevel: loadedStrictnessLevel, wordCountStrict: loaded && loaded.wordCountStrict === false ? false : true };
                const loadedTotal = Number(loaded && loaded.total);
                const loadedItems = Array.isArray(loaded && loaded.items) ? loaded.items : [];
                const ensureWordCountItem = (items) => {
                    const list = Array.isArray(items) ? items.slice() : [];
                    const has = list.some(it => it && it.label && /词数|字数/.test(String(it.label)));
                    if (has) return list;
                    const idx = Math.min(3, list.length);
                    const wcItem = { id: `c_wc_${Date.now()}`, label: '词数要求', score: 0, desc: '是否满足字数要求；可设置严格/宽松模式' };
                    return [...list.slice(0, idx), wcItem, ...list.slice(idx)];
                };
                if (Number.isFinite(loadedTotal) && loadedItems.length > 0) {
                    return { ...normalizedLoaded, items: redistributeItemScoresToTotal(ensureWordCountItem(loadedItems), loadedTotal) };
                }
                return { ...normalizedLoaded, items: ensureWordCountItem(loadedItems) };
            };

            useEffect(() => {
                const STORAGE_KEY_V5 = 'smart_grader_data_v5_0';
                const STORAGE_KEY_V4 = 'smart_grader_data_v4_3';
                const STORAGE_KEY_PROFILES = 'smart_grader_student_profiles_v1';

                const createId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

                const migrateLegacyToClasses = (d, loadedRubric) => {
                    const out = { classes: [], currentClassId: '' };
                    const gradeLevel = (loadedRubric && loadedRubric.gradeLevel) ? String(loadedRubric.gradeLevel) : INITIAL_RUBRIC.gradeLevel;
                    const legacyMode = (d && d.rosterMode) ? String(d.rosterMode) : 'single';
                    const legacyCurrentClass = (d && d.currentClass) ? String(d.currentClass).trim() : '701班';
                    const legacyRoster = (d && d.roster) ? String(d.roster) : '';
                    const legacyRosterByClass = (d && d.rosterByClass && typeof d.rosterByClass === 'object') ? d.rosterByClass : {};
                    const legacySavedClasses = Array.isArray(d && d.savedClasses) ? d.savedClasses.filter(Boolean).map(x => String(x)) : [];

                    const buildClass = (name, rosterText) => {
                        const students = parseRosterNames(rosterText || '').map(n => ({ id: createId(), name: n, aliases: [] }));
                        const id = createId();
                        return { id, name: String(name || '').trim() || '未命名班级', gradeLevel, students };
                    };

                    if (legacyMode === 'multi') {
                        const classNames = legacySavedClasses.length > 0 ? legacySavedClasses : Object.keys(legacyRosterByClass || {});
                        out.classes = (classNames || []).filter(Boolean).map(cn => buildClass(cn, legacyRosterByClass[cn] || ''));
                        const hit = out.classes.find(c => c.name === legacyCurrentClass) || out.classes[0] || null;
                        out.currentClassId = hit ? hit.id : '';
                        return out;
                    }

                    const cls = buildClass(legacyCurrentClass || '701班', legacyRoster || '');
                    out.classes = [cls];
                    out.currentClassId = cls.id;
                    return out;
                };

                const loadV5 = () => {
                    const saved = teacherStorage.getItem(STORAGE_KEY_V5);
                    if (!saved) return null;
                    try { return JSON.parse(saved); } catch (e) { return null; }
                };
                const loadV4 = () => {
                    const saved = teacherStorage.getItem(STORAGE_KEY_V4);
                    if (!saved) return null;
                    try { return JSON.parse(saved); } catch (e) { return null; }
                };

                const v5 = loadV5();
                if (v5) {
                    if (v5.config) setConfig(v5.config);
                    if (v5.assignment) setAssignment(v5.assignment);
                    const loadedRubric = normalizeRubricForSystem(v5.rubric);
                    if (loadedRubric) setRubric(loadedRubric);
                    if (Array.isArray(v5.classes)) setClasses(v5.classes);
                    if (v5.currentClassId) setCurrentClassId(String(v5.currentClassId));
                    if (Array.isArray(v5.activeClassIds)) setActiveClassIds(v5.activeClassIds);
                    if (v5.languageDifficulty && typeof v5.languageDifficulty === 'object') setLanguageDifficulty(p => ({ ...p, ...v5.languageDifficulty }));
                    if (v5.pdfConfig) {
                        const lh = Number(v5.pdfConfig.lineHeight);
                        const pg = Number(v5.pdfConfig.paragraphGapPt);
                        setPdfConfig({ ...v5.pdfConfig, lineHeight: Number.isFinite(lh) ? Math.max(lh, 1.3) : 1.3, paragraphGapPt: Number.isFinite(pg) ? pg : 2 });
                    }
                    if (v5.csvExportConfig) setCsvExportConfig(v5.csvExportConfig);
                } else {
                    const v4 = loadV4();
                    if (v4) {
                        if (v4.config) setConfig(v4.config);
                        if (v4.assignment) setAssignment(v4.assignment);
                        const loadedRubric = normalizeRubricForSystem(v4.rubric);
                        if (loadedRubric) setRubric(loadedRubric);
                        if (v4.pdfConfig) {
                            const lh = Number(v4.pdfConfig.lineHeight);
                            const pg = Number(v4.pdfConfig.paragraphGapPt);
                            setPdfConfig({ ...v4.pdfConfig, lineHeight: Number.isFinite(lh) ? Math.max(lh, 1.3) : 1.3, paragraphGapPt: Number.isFinite(pg) ? pg : 2 });
                        }
                        if (v4.csvExportConfig) setCsvExportConfig(v4.csvExportConfig);

                        const migrated = migrateLegacyToClasses(v4, loadedRubric || v4.rubric);
                        if (Array.isArray(migrated.classes)) setClasses(migrated.classes);
                        if (migrated.currentClassId) setCurrentClassId(migrated.currentClassId);
                    } else {
                        const id = createId();
                        setClasses([{ id, name: '701班', gradeLevel: INITIAL_RUBRIC.gradeLevel, students: [] }]);
                        setCurrentClassId(id);
                    }
                }

                const profilesSaved = teacherStorage.getItem(STORAGE_KEY_PROFILES);
                if (profilesSaved) {
                    try { setStudentProfiles(JSON.parse(profilesSaved) || {}); } catch (e) { setStudentProfiles({}); }
                }

                const csvSaved = teacherStorage.getItem('smart_grader_csv_exports_v1');
                if (csvSaved) {
                    try { setCsvExportHistory(JSON.parse(csvSaved) || []); } catch (e) { setCsvExportHistory([]); }
                }

                const savedResults = teacherStorage.getItem('smart_grader_saved_results_v1');
                if (savedResults) {
                    try { setSavedGradingResults(JSON.parse(savedResults) || []); } catch (e) { setSavedGradingResults([]); }
                }

                const rubricHistorySaved = teacherStorage.getItem('smart_grader_rubric_history_v1');
                if (rubricHistorySaved) {
                    try { setRubricHistory(JSON.parse(rubricHistorySaved) || []); } catch (e) { setRubricHistory([]); }
                }

                const analysisHistorySaved = teacherStorage.getItem('smart_grader_class_analysis_history_v1');
                if (analysisHistorySaved) {
                    try { setAnalysisHistory(JSON.parse(analysisHistorySaved) || []); } catch (e) { setAnalysisHistory([]); }
                }
            }, []);

            useEffect(() => {
                const now = Date.now();
                if (coreDataStorageSkipUntilRef.current && now < coreDataStorageSkipUntilRef.current) return;
                const data = { config, assignment, rubric, classes, currentClassId, activeClassIds, languageDifficulty, pdfConfig, csvExportConfig };
                try {
                    teacherStorage.setItem('smart_grader_data_v5_0', JSON.stringify(data));
                    coreDataStorageWarnedRef.current = false;
                    coreDataStorageSkipUntilRef.current = 0;
                } catch (e) {
                    coreDataStorageSkipUntilRef.current = Date.now() + 15000;
                    if (!coreDataStorageWarnedRef.current) {
                        coreDataStorageWarnedRef.current = true;
                        alert('本地浏览器存储空间不足：部分设置无法持久化保存。建议在“已保存结果/导出历史/学生档案”中删除不需要的记录或下载备份。');
                    }
                }
            }, [config, assignment, rubric, classes, currentClassId, activeClassIds, languageDifficulty, pdfConfig, csvExportConfig]);

            useEffect(() => {
                const stripProfileResult = (r, aggressive) => {
                    const out = { ...(r && typeof r === 'object' ? r : {}) };
                    delete out.original_image_url;
                    if (aggressive) {
                        delete out.original_essay;
                        delete out.optimized_essay;
                        delete out.standard_reference;
                        delete out.highlights;
                        delete out.errors;
                    }
                    return out;
                };
                const shrinkProfiles = (profiles, stage) => {
                    const base = profiles && typeof profiles === 'object' ? profiles : {};
                    const maxRecords = stage <= 0 ? 120 : stage === 1 ? 60 : stage === 2 ? 30 : stage === 3 ? 15 : 8;
                    const keepFull = stage <= 1 ? 20 : stage === 2 ? 12 : stage === 3 ? 8 : 5;
                    const aggressiveFrom = stage <= 1 ? 60 : stage === 2 ? 20 : stage === 3 ? 10 : 5;
                    const maxStudents = stage <= 2 ? Infinity : (stage === 3 ? 120 : 60);
                    const latestTs = (p) => {
                        const records0 = p && Array.isArray(p.records) ? p.records : [];
                        const t = records0[0] && (records0[0].gradedAt || records0[0].createdAt);
                        const n = t ? Date.parse(t) : NaN;
                        return Number.isFinite(n) ? n : 0;
                    };
                    const next = {};
                    const keys = Object.keys(base).sort((a, b) => latestTs(base[b]) - latestTs(base[a]));
                    keys.slice(0, maxStudents).forEach(k => {
                        const p = base[k] && typeof base[k] === 'object' ? base[k] : null;
                        if (!p) return;
                        const records0 = Array.isArray(p.records) ? p.records : [];
                        const records = records0.slice(0, maxRecords).map((rec, idx) => {
                            const r = rec && typeof rec === 'object' ? { ...rec } : {};
                            const aggressive = idx >= aggressiveFrom;
                            if (r && typeof r.result === 'object' && r.result) {
                                r.result = stripProfileResult(r.result, aggressive);
                            }
                            if (idx >= keepFull) delete r.result;
                            return r;
                        });
                        next[k] = { ...p, records };
                    });
                    return next;
                };
                try {
                    teacherStorage.setItem('smart_grader_student_profiles_v1', JSON.stringify(studentProfiles || {}));
                    studentProfilesStorageWarnedRef.current = false;
                    studentProfilesShrinkStageRef.current = 0;
                } catch (e) {
                    const stage = Math.min(4, Math.max(0, Number(studentProfilesShrinkStageRef.current) || 0));
                    studentProfilesShrinkStageRef.current = Math.min(4, stage + 1);
                    setStudentProfiles(prev => shrinkProfiles(prev, stage + 1));
                    if (!studentProfilesStorageWarnedRef.current) {
                        studentProfilesStorageWarnedRef.current = true;
                        alert('学生档案数据过大导致本地存储超限：已自动压缩/减少保存的历史记录以防止页面报错。建议定期在“学生档案”中清理旧记录，或保存批改结果到本地 JSON 备份。');
                    }
                }
            }, [studentProfiles]);

            useEffect(() => {
                if (!showStudentProfiles) {
                    setProfilesMultiSelect(false);
                    setProfilesSelectedRecordIds(new Set());
                }
            }, [showStudentProfiles]);

            useEffect(() => {
                setProfilesSelectedRecordIds(new Set());
            }, [profilesSelectedStudentId]);

            const getActiveClassesList = () => {
                const list = Array.isArray(classes) ? classes : [];
                const act = Array.isArray(activeClassIds) ? activeClassIds.filter(Boolean).map(String) : [];
                if (act.length === 0) return list;
                const hit = list.filter(c => c && act.includes(String(c.id)));
                return hit.length > 0 ? hit : list;
            };

            const getClassById = (id) => {
                const cid = (id || '').toString();
                return (Array.isArray(classes) ? classes : []).find(c => c && String(c.id) === cid) || null;
            };

            const getClassNameById = (id) => {
                const c = getClassById(id);
                return c ? String(c.name || '').trim() : '';
            };

            useEffect(() => {
                const c = getClassById(currentClassId);
                const roster = c && Array.isArray(c.students) ? c.students : [];
                const ids = roster.map(s => (s && s.id !== undefined && s.id !== null) ? String(s.id) : '').filter(Boolean);
                if (ids.length === 0) {
                    if (historyStudentId) setHistoryStudentId('');
                    return;
                }
                if (historyStudentId && ids.includes(String(historyStudentId))) return;
                const preferred = ids.find(id => {
                    const p = studentProfiles && studentProfiles[id];
                    return p && Array.isArray(p.records) && p.records.length > 0;
                }) || ids[0];
                setHistoryStudentId(preferred);
            }, [currentClassId, classes, studentProfiles]);

            const getRosterNamesForClassId = (classId) => {
                const c = getClassById(classId);
                const students = c && Array.isArray(c.students) ? c.students : [];
                const names = students.map(s => (s && s.name) ? String(s.name).trim() : '').filter(Boolean);
                return Array.from(new Set(names));
            };

            const getRosterTextForClassId = (classId) => getRosterNamesForClassId(classId).join('\n');

            const getRosterNamesForInference = () => {
                const list = getActiveClassesList();
                const allNames = list.flatMap(c => {
                    const students = c && Array.isArray(c.students) ? c.students : [];
                    return students.map(s => (s && s.name) ? String(s.name).trim() : '').filter(Boolean);
                });
                return Array.from(new Set(allNames));
            };

            useEffect(() => {
                try { teacherStorage.setItem('smart_grader_csv_exports_v1', JSON.stringify(csvExportHistory)); } catch (e) {}
            }, [csvExportHistory]);

            useEffect(() => {
                try {
                    teacherStorage.setItem('smart_grader_saved_results_v1', JSON.stringify(savedGradingResults));
                    savedResultsStorageWarnedRef.current = false;
                } catch (e) {
                    const list = Array.isArray(savedGradingResults) ? savedGradingResults : [];
                    if (list.length > 1) {
                        setSavedGradingResults(list.slice(0, Math.max(1, list.length - 1)));
                    }
                    if (!savedResultsStorageWarnedRef.current) {
                        savedResultsStorageWarnedRef.current = true;
                        alert('本地浏览器存储空间不足：已自动删除最旧的部分保存记录以便继续保存。建议在“已保存结果”中删除不需要的记录，或下载 JSON 备份到本地。');
                    }
                }
            }, [savedGradingResults]);

            useEffect(() => {
                try { teacherStorage.setItem('smart_grader_rubric_history_v1', JSON.stringify(rubricHistory)); } catch (e) {}
            }, [rubricHistory]);

            useEffect(() => {
                try { teacherStorage.setItem('smart_grader_class_analysis_history_v1', JSON.stringify(analysisHistory)); } catch (e) {}
            }, [analysisHistory]);

            useEffect(() => {
                document.body.classList.remove('print-mode-batch', 'print-mode-single', 'print-mode-analysis');
                document.body.classList.add(`print-mode-${printMode}`, 'teacher-workspace');
            }, [printMode]);

            useEffect(() => {
                const handler = (e) => {
                    if (!controlsRef.current) return;
                    if (!controlsRef.current.contains(e.target)) {
                        setControlsOpen(false);
                    }
                };
                document.addEventListener('mousedown', handler);
                return () => document.removeEventListener('mousedown', handler);
            }, []);

            useEffect(() => { if (step > maxStep) setMaxStep(step); }, [step]);

            useEffect(() => {
                const sectionNames = ['评分标准', '导入作文', '批改导出', '班级综合分析'];
                const section = sectionNames[step] || '';
                const cls = getClassNameById(currentClassId) || '未分班级';
                document.title = `智能英语作文批改 - ${cls} - ${section}`;
            }, [step, currentClassId, classes]);

            useEffect(() => {
                const list = Array.isArray(classes) ? classes : [];
                const canBeEmpty = step === 1;
                if (!currentClassId && list.length > 0 && !canBeEmpty) {
                    setCurrentClassId(String(list[0].id));
                }
                if (currentClassId && list.length > 0 && !list.some(c => c && String(c.id) === String(currentClassId))) {
                    setCurrentClassId(String(list[0].id));
                }
            }, [classes, currentClassId, step]);

            const navigateTo = (newStep) => { setStep(newStep); };
            const advanceStep = () => { const next = step + 1; setMaxStep(Math.max(maxStep, next)); setStep(next); };

            const callAI = async (messages, responseJson = true, options) => {
                const opts = options && typeof options === 'object' ? options : {};
                const selectedCloudProfileId = opts.purpose === 'ocr' ? cloud.ocrProfileId : cloud.profileId;
                const cloudTransport = cloud.mode === 'cloud' ? createCloudModelTransport({ profileId: selectedCloudProfileId, workspaceId: cloud.identity.workspaceId, onUnauthorized: cloud.expired, onAssets: ids => {
                    if(opts.cloudFileId)setFiles(previous => previous.map(file => file.id === opts.cloudFileId ? {...file,cloudAssetIds:ids} : file));
                }, onJob: id => {if(opts.cloudFileId)setFiles(previous => previous.map(file => file.id === opts.cloudFileId ? {...file,cloudPendingJobId:id} : file));}, onSettled: id => {if(opts.cloudFileId)setFiles(previous => previous.map(file => file.id === opts.cloudFileId && file.cloudPendingJobId === id ? {...file,cloudPendingJobId:null} : file));} }) : null;
                const apiHeaders = cloudTransport ? { 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` };
                const classifyErrorKind = (msg) => {
                    const m = (msg || '').toString();
                    if (/Failed to fetch/i.test(m) || /请求超时/.test(m) || /被浏览器拦截/.test(m) || /跨域|CORS/i.test(m) || /opaqueredirect/i.test(m) || /NETWORK_CHANGED/i.test(m) || /net::/i.test(m)) return 'network';
                    if (/HTTP\s*429/.test(m) || /\b429\b/.test(m)) return 'rate_limit';
                    if (/HTTP\s*5\d\d/.test(m)) return 'server';
                    if (/HTTP\s*4\d\d/.test(m)) return 'client';
                    return 'other';
                };
                if (cloud.mode === 'cloud' ? cloud.status !== 'ready' || !selectedCloudProfileId : !config.apiKey) {
                    const msg = cloud.mode === 'cloud' ? (cloud.status === 'expired' ? '请先重新使用 Daily 登录。' : '请先在设置中选择已配置的云端模型。') : '请先点击右上角设置 API Key';
                    if (opts.returnMeta) return { ok: false, error: { kind: 'config', message: msg } };
                    alert(msg);
                    return null;
                }
                const temperature = typeof config.temperature === 'number' && !Number.isNaN(config.temperature) ? config.temperature : 0.3;
                const sleep = (ms) => new Promise(r => setTimeout(r, ms));
                const DEFAULT_API_URL = 'https://gemini.newsunenglish.com/v1/chat/completions';
                const resolveApiUrl = (rawUrl) => {
                    let raw = (rawUrl || '').toString().trim();
                    if (!raw) return DEFAULT_API_URL;
                    if (raw.startsWith('//')) raw = `https:${raw}`;
                    else if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;

                    try {
                        const u = new URL(raw);
                        if ((u.hostname || '').toLowerCase().includes('generativelanguage.googleapis.com')) {
                            return DEFAULT_API_URL;
                        }
                        if (/\/v1beta\//i.test(u.pathname || '') || /\/models\/?$/i.test(u.pathname || '')) {
                            return DEFAULT_API_URL;
                        }
                        const p = (u.pathname || '').trim();
                        if (!p || p === '/' || p === '') {
                            u.pathname = '/v1/chat/completions';
                        } else if (/\/v1\/?$/i.test(p)) {
                            u.pathname = p.replace(/\/v1\/?$/i, '/v1/chat/completions');
                        }
                        return u.toString();
                    } catch (e) {
                        return raw;
                    }
                };

                const apiUrl = cloudTransport ? '/api/model/jobs' : resolveApiUrl(config.apiUrl);
                const shouldFallbackToDefault = (url) => {
                    if (cloudTransport) return false;
                    try {
                        const host = new URL(url).hostname.toLowerCase();
                        if (/generativelanguage\.googleapis\.com/i.test(host)) return true;
                        if (/gemini/i.test(host)) return true;
                        return false;
                    } catch (e) {
                        return false;
                    }
                };
                const getTimeoutMsForUrl = (url) => {
                    if (cloudTransport) return 600000;
                    try {
                        const host = new URL(url).hostname.toLowerCase();
                        if (/dashscope\.aliyuncs\.com/i.test(host)) return 300000;
                    } catch (e) {}
                    return 120000;
                };
                const fetchJsonWithTimeout = async (url, options) => {
                    const controller = new AbortController();
                    const timeoutMs = getTimeoutMsForUrl(url);
                    const id = setTimeout(() => controller.abort(), timeoutMs);
                    try {
                        const res = cloudTransport ? await cloudTransport(options.body, controller.signal) : await fetch(url, { ...(options || {}), signal: controller.signal, redirect: 'manual' });
                        const rawText = await res.text().catch(() => '');
                        let data = null;
                        try {
                            data = rawText ? JSON.parse(rawText) : null;
                        } catch (e) {
                            data = null;
                        }
                        return { res, data, rawText };
                    } finally {
                        clearTimeout(id);
                    }
                };

                const buildFailedToFetchHint = (url) => {
                    if (cloudTransport) return '请检查网络后点击继续，系统会核对已有云端任务，避免重复提交。';
                    const tips = [];
                    if (typeof location !== 'undefined' && location && location.protocol === 'file:') {
                        tips.push('当前页面从本地文件(file://)打开，浏览器可能会拦截跨域请求；建议用本地服务器方式打开（http://localhost/...）。');
                    }
                    if (typeof location !== 'undefined' && location && location.protocol === 'https:' && /^http:\/\//i.test(url)) {
                        tips.push('当前页面是 https，但 API URL 是 http，可能触发混合内容拦截；请把 API URL 改为 https。');
                    }
                    if (/generativelanguage\.googleapis\.com/i.test(url)) {
                        tips.push('当前 API URL 指向 Gemini 原生接口（generativelanguage.googleapis.com），不兼容本工具使用的 OpenAI Chat Completions 协议；请使用 OpenAI 兼容的中转地址（例如 https://gemini.newsunenglish.com/v1/chat/completions）。');
                    }
                    if (/dashscope\.aliyuncs\.com/i.test(url)) {
                        tips.push('当前 API URL 指向 DashScope（dashscope.aliyuncs.com）。如果使用官方非兼容接口，浏览器可能无法跨域；建议优先使用其 OpenAI 兼容地址（如 https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions），或确保已通过网关放行浏览器跨域访问。');
                    }
                    tips.push('请检查 API URL 是否可访问、网络是否正常、以及接口是否支持浏览器跨域(CORS)。');
                    return tips.join('\n');
                };
                const cleanJsonText = (raw) => {
                    let text = (raw || '').toString();
                    text = text.replace(/^\uFEFF/, '');
                    text = text.replace(/\u0000/g, '');
                    if (text.includes('```')) {
                        text = text.replace(/```[a-zA-Z]*\s*/g, '').replace(/```/g, '');
                    }
                    text = text.replace(/^\s*(json|JSON)\s*/g, '');
                    text = text.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
                    text = text.replace(/,\s*([}\]])/g, '$1');
                    return text.trim();
                };

                const escapeInvalidJsonInStrings = (raw) => {
                    const s = (raw || '').toString();
                    let out = '';
                    let inDouble = false;
                    let esc = false;
                    for (let i = 0; i < s.length; i++) {
                        const ch = s[i];
                        if (esc) {
                            out += ch;
                            esc = false;
                            continue;
                        }
                        if (inDouble) {
                            if (ch === '\\') {
                                const next = s[i + 1];
                                if (next && !/["\\\/bfnrtu]/.test(next)) {
                                    out += '\\\\';
                                    continue;
                                }
                                out += '\\';
                                esc = true;
                                continue;
                            }
                            if (ch === '"') {
                                out += '"';
                                inDouble = false;
                                continue;
                            }
                            if (ch === '\n') { out += '\\n'; continue; }
                            if (ch === '\r') { out += '\\r'; continue; }
                            if (ch === '\t') { out += '\\t'; continue; }
                            out += ch;
                            continue;
                        }
                        if (ch === '"') {
                            out += '"';
                            inDouble = true;
                            continue;
                        }
                        out += ch;
                    }
                    return out;
                };

                const escapeUnescapedDoubleQuotesInStrings = (raw) => {
                    const s = (raw || '').toString();
                    const isAllowedAfterStringClose = (ch) => {
                        if (!ch) return true;
                        return ch === ',' || ch === '}' || ch === ']' || ch === ':';
                    };
                    const nextNonWs = (str, from) => {
                        for (let i = from; i < str.length; i++) {
                            const c = str[i];
                            if (c === ' ' || c === '\n' || c === '\r' || c === '\t') continue;
                            return c;
                        }
                        return '';
                    };

                    let out = '';
                    let inDouble = false;
                    let esc = false;
                    for (let i = 0; i < s.length; i++) {
                        const ch = s[i];
                        if (esc) {
                            out += ch;
                            esc = false;
                            continue;
                        }
                        if (!inDouble) {
                            if (ch === '"') {
                                inDouble = true;
                            }
                            out += ch;
                            continue;
                        }

                        if (ch === '\\') {
                            out += ch;
                            esc = true;
                            continue;
                        }

                        if (ch === '"') {
                            const after = nextNonWs(s, i + 1);
                            if (isAllowedAfterStringClose(after)) {
                                out += '"';
                                inDouble = false;
                            } else {
                                out += '\\"';
                            }
                            continue;
                        }

                        out += ch;
                    }
                    return out;
                };

                const convertSingleQuotedJsonToDouble = (raw) => {
                    const s = (raw || '').toString();
                    let out = '';
                    let inSingle = false;
                    let inDouble = false;
                    let esc = false;
                    for (let i = 0; i < s.length; i++) {
                        const ch = s[i];
                        if (esc) {
                            out += ch;
                            esc = false;
                            continue;
                        }
                        if (ch === '\\') {
                            out += ch;
                            esc = true;
                            continue;
                        }
                        if (inSingle) {
                            if (ch === "'") {
                                out += '"';
                                inSingle = false;
                                continue;
                            }
                            if (ch === '"') {
                                out += '\\"';
                                continue;
                            }
                            if (ch === '\n') { out += '\\n'; continue; }
                            if (ch === '\r') { out += '\\r'; continue; }
                            if (ch === '\t') { out += '\\t'; continue; }
                            out += ch;
                            continue;
                        }
                        if (inDouble) {
                            if (ch === '"') {
                                out += '"';
                                inDouble = false;
                                continue;
                            }
                            out += ch;
                            continue;
                        }
                        if (ch === "'") {
                            out += '"';
                            inSingle = true;
                            continue;
                        }
                        if (ch === '"') {
                            out += '"';
                            inDouble = true;
                            continue;
                        }
                        out += ch;
                    }
                    return out;
                };

                const extractTopLevelJsonObjects = (raw) => {
                    const text = cleanJsonText(raw);
                    const out = [];
                    let start = -1;
                    let depth = 0;
                    let inString = false;
                    let esc = false;
                    for (let i = 0; i < text.length; i++) {
                        const ch = text[i];
                        if (inString) {
                            if (esc) {
                                esc = false;
                                continue;
                            }
                            if (ch === '\\') {
                                esc = true;
                                continue;
                            }
                            if (ch === '"') {
                                inString = false;
                                continue;
                            }
                            continue;
                        }
                        if (ch === '"') {
                            inString = true;
                            continue;
                        }
                        if (ch === '{') {
                            if (depth === 0) start = i;
                            depth += 1;
                            continue;
                        }
                        if (ch === '}') {
                            if (depth > 0) depth -= 1;
                            if (depth === 0 && start >= 0) {
                                out.push(text.slice(start, i + 1));
                                start = -1;
                            }
                        }
                    }
                    return out;
                };

                const extractJsonCandidates = (raw) => {
                    const base = cleanJsonText(raw);
                    const candidates = [];
                    const push = (s) => {
                        const v = (s || '').toString().trim();
                        if (!v) return;
                        if (!candidates.includes(v)) candidates.push(v);
                    };

                    push(base);
                    extractTopLevelJsonObjects(base).forEach(push);

                    const baseQuoteFixed = escapeUnescapedDoubleQuotesInStrings(base);
                    if (baseQuoteFixed !== base) {
                        push(baseQuoteFixed);
                        extractTopLevelJsonObjects(baseQuoteFixed).forEach(push);
                    }

                    const baseQuoteFixedEscaped = escapeInvalidJsonInStrings(baseQuoteFixed);
                    if (baseQuoteFixedEscaped !== baseQuoteFixed) {
                        push(baseQuoteFixedEscaped);
                        extractTopLevelJsonObjects(baseQuoteFixedEscaped).forEach(push);
                    }

                    const transformed = escapeInvalidJsonInStrings(base);
                    if (transformed !== base) {
                        push(transformed);
                        extractTopLevelJsonObjects(transformed).forEach(push);
                    }

                    const quoteFixed = escapeUnescapedDoubleQuotesInStrings(transformed);
                    if (quoteFixed !== transformed) {
                        push(quoteFixed);
                        extractTopLevelJsonObjects(quoteFixed).forEach(push);
                    }

                    const maybeSingleQuoted = /'\s*:|:\s*'/.test(base);
                    if (maybeSingleQuoted) {
                        const converted = convertSingleQuotedJsonToDouble(base);
                        if (converted !== base) {
                            const converted2 = escapeUnescapedDoubleQuotesInStrings(escapeInvalidJsonInStrings(converted));
                            push(converted2);
                            extractTopLevelJsonObjects(converted2).forEach(push);
                        }
                    }

                    return candidates;
                };

                const parseJsonObject = (content) => {
                    if (typeof content !== 'string') return content;
                    if (!content) throw new Error('模型返回为空');
                    const candidates = extractJsonCandidates(content);
                    let lastErr = null;
                    for (const text of candidates) {
                        try {
                            return JSON.parse(text);
                        } catch (err) {
                            lastErr = err;
                        }
                    }
                    // Student content is not written to the browser console.
                    const msg = (lastErr && lastErr.message) ? String(lastErr.message) : '';
                    throw new Error(msg.includes('Unexpected') ? msg : '模型返回的 JSON 格式有误，请稍后重试或调低温度');
                };

                const extractContentFromApiResponse = (data, rawText) => {
                    const content = data && data.choices && data.choices[0]
                        ? (data.choices[0].message && typeof data.choices[0].message.content === 'string' ? data.choices[0].message.content
                            : (typeof data.choices[0].text === 'string' ? data.choices[0].text : null))
                        : null;
                    if (typeof content === 'string') return content;

                    const geminiText = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0]
                        ? data.candidates[0].content.parts[0].text
                        : null;
                    if (typeof geminiText === 'string') return geminiText;

                        if (typeof rawText === 'string') {
                            const t = rawText.trim();
                            if (t) return t;
                        }
                        return null;
                    };

                const buildApiErrorMessage = (status, data, rawText) => {
                    const parts = [];
                    parts.push(`HTTP ${status}`);
                    if (data && typeof data === 'object') {
                        const errObj = data.error && typeof data.error === 'object' ? data.error : data;
                        const code = errObj.error_code || errObj.code || errObj.status || errObj.type;
                        const msg = errObj.error_message || errObj.message || errObj.errmsg || errObj.detail;
                        if (code) parts.push(`代码: ${code}`);
                        if (msg) parts.push(`信息: ${msg}`);
                    }
                    const text = (rawText || '').toString().trim();
                    if (parts.length === 1 && text && text.length < 500) parts.push(text);
                    return parts.join(' - ');
                };

                const repairJsonObjectOnce = async (rawContent) => {
                    const repairMessages = [
                        {
                            role: 'system',
                            content: '你是一个 JSON 修复器。你的任务：把用户提供的文本修复为“严格可解析的 JSON 对象（RFC 8259）”。只输出 JSON，不要输出任何解释、Markdown 或代码块标记。必须使用双引号。字符串需要换行时请用\\n，不要输出原始换行符。'
                        },
                        {
                            role: 'user',
                            content: (rawContent || '').toString()
                        }
                    ];

                    const payload = { model: config.model, messages: repairMessages, response_format: { type: 'json_object' }, temperature: 0 };
                    let res;
                    let data;
                    let rawText = '';
                    let usedUrl = apiUrl;
                    try {
                        const r = await fetchJsonWithTimeout(apiUrl, {
                            method: 'POST',
                            headers: apiHeaders,
                            body: JSON.stringify(payload)
                        });
                        res = r.res;
                        data = r.data;
                        rawText = r.rawText || '';
                        if (res && (res.type === 'opaqueredirect' || res.status === 0)) {
                            throw new Error(`API Error: 请求被重定向或被浏览器拦截\n${buildFailedToFetchHint(apiUrl)}`);
                        }
                    } catch (e) {
                        if (apiUrl !== DEFAULT_API_URL && shouldFallbackToDefault(apiUrl)) {
                            try {
                                usedUrl = DEFAULT_API_URL;
                                const r2 = await fetchJsonWithTimeout(DEFAULT_API_URL, {
                                    method: 'POST',
                                    headers: apiHeaders,
                                    body: JSON.stringify(payload)
                                });
                                res = r2.res;
                                data = r2.data;
                                rawText = r2.rawText || '';
                                if (res && (res.type === 'opaqueredirect' || res.status === 0)) {
                                    throw new Error(`API Error: 请求被重定向或被浏览器拦截\n${buildFailedToFetchHint(DEFAULT_API_URL)}`);
                                }
                            } catch (e2) {
                                const msg = (e2 && e2.name === 'AbortError') ? '请求超时' : 'Failed to fetch';
                                throw new Error(`API Error: ${msg}\n${buildFailedToFetchHint(DEFAULT_API_URL)}`);
                            }
                        } else {
                            const msg = (e && e.name === 'AbortError') ? '请求超时' : 'Failed to fetch';
                            throw new Error(`API Error: ${msg}\n${buildFailedToFetchHint(apiUrl)}`);
                        }
                    }
                    if (!res.ok) {
                        const errMsg = buildApiErrorMessage(res.status, data, rawText) || `HTTP ${res.status}`;
                        throw new Error(errMsg);
                    }
                    const content = extractContentFromApiResponse(data, rawText);
                    if (typeof content !== 'string') {
                        const t = (rawText || '').toString().trim();
                        if (t && /^</.test(t)) {
                            throw new Error(`API Error: 返回了非 JSON 内容（可能是网关/鉴权/跨域问题）\n${buildFailedToFetchHint(usedUrl)}`);
                        }
                        throw new Error(`API Error: 返回结构不兼容（需要 OpenAI Chat Completions 协议）\n${buildFailedToFetchHint(usedUrl)}`);
                    }
                    return parseJsonObject(content);
                };

                const maxAttempts = 3;
                let lastError = null;
                for (let attempt = 0; attempt < maxAttempts; attempt++) {
                    try {
                        const payload = { model: config.model, messages };
                        if (responseJson) payload.response_format = { type: "json_object" };
                        payload.temperature = responseJson ? Math.min(temperature, 0.25) : temperature;

                        let res;
                        let data;
                        let rawText = '';
                        let usedUrl = apiUrl;
                        try {
                            const r = await fetchJsonWithTimeout(apiUrl, {
                                method: 'POST',
                                headers: apiHeaders,
                                body: JSON.stringify(payload)
                            });
                            res = r.res;
                            data = r.data;
                            rawText = r.rawText || '';
                            if (res && (res.type === 'opaqueredirect' || res.status === 0)) {
                                throw new Error(`API Error: 请求被重定向或被浏览器拦截\n${buildFailedToFetchHint(apiUrl)}`);
                            }
                        } catch (e) {
                            if (apiUrl !== DEFAULT_API_URL && shouldFallbackToDefault(apiUrl)) {
                                try {
                                    usedUrl = DEFAULT_API_URL;
                                    const r2 = await fetchJsonWithTimeout(DEFAULT_API_URL, {
                                        method: 'POST',
                                        headers: apiHeaders,
                                        body: JSON.stringify(payload)
                                    });
                                    res = r2.res;
                                    data = r2.data;
                                    rawText = r2.rawText || '';
                                    if (res && (res.type === 'opaqueredirect' || res.status === 0)) {
                                        throw new Error(`API Error: 请求被重定向或被浏览器拦截\n${buildFailedToFetchHint(DEFAULT_API_URL)}`);
                                    }
                                } catch (e2) {
                                    const msg = (e2 && e2.name === 'AbortError') ? '请求超时' : 'Failed to fetch';
                                    throw new Error(`API Error: ${msg}\n${buildFailedToFetchHint(DEFAULT_API_URL)}`);
                                }
                            } else {
                                const msg = (e && e.name === 'AbortError') ? '请求超时' : 'Failed to fetch';
                                throw new Error(`API Error: ${msg}\n${buildFailedToFetchHint(apiUrl)}`);
                            }
                        }
                        if (!res.ok) {
                            const retryable = res.status === 429 || res.status >= 500;
                            if (retryable && attempt < maxAttempts - 1) {
                                await sleep(800 * (attempt + 1));
                                continue;
                            }
                            const errMsg = buildApiErrorMessage(res.status, data, rawText) || `HTTP ${res.status}`;
                            throw new Error(errMsg);
                        }
                        const content = extractContentFromApiResponse(data, rawText);
                        if (typeof content !== 'string') {
                            const t = (rawText || '').toString().trim();
                            if (t && /^</.test(t)) {
                                throw new Error(`API Error: 返回了非 JSON 内容（可能是网关/鉴权/跨域问题）\n${buildFailedToFetchHint(usedUrl)}`);
                            }
                            throw new Error(`API Error: 返回结构不兼容（需要 OpenAI Chat Completions 协议）\n${buildFailedToFetchHint(usedUrl)}`);
                        }
                        if (!responseJson) return opts.returnMeta ? { ok: true, data: content } : content;
                        try {
                            const parsed = parseJsonObject(content);
                            return opts.returnMeta ? { ok: true, data: parsed } : parsed;
                        } catch (parseErr) {
                            const msg = (parseErr && parseErr.message) ? String(parseErr.message) : '';
                            const retryable = /JSON/.test(msg) || /格式有误/.test(msg) || /Unexpected/.test(msg) || /Unterminated string/.test(msg) || /Bad control character/.test(msg);
                            if (retryable) {
                                const repaired = await repairJsonObjectOnce(content);
                                return opts.returnMeta ? { ok: true, data: repaired } : repaired;
                            }
                            throw parseErr;
                        }
                    } catch (e) {
                        lastError = e;
                        const msg = (e && e.message) ? String(e.message) : '';
                        const isTimeout = /请求超时/.test(msg);
                        const retryable = isTimeout || /JSON/.test(msg) || /格式有误/.test(msg) || /Unexpected/.test(msg) || /Unterminated string/.test(msg) || /Bad control character/.test(msg);
                        if (retryable && attempt < maxAttempts - 1) {
                            await sleep(800 * (attempt + 1));
                            continue;
                        }
                        break;
                    }
                }

                console.error(lastError);
                const finalMsg = (lastError && lastError.message) ? String(lastError.message) : 'Unknown error';
                if (opts.returnMeta) return { ok: false, error: { kind: classifyErrorKind(finalMsg), message: `API Error: ${finalMsg}` } };
                if (!opts.silent) alert("API Error: " + finalMsg);
                return null;
            };
            
            const convertFileToBase64 = (file) => new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onload = () => resolve(reader.result);
                reader.onerror = error => reject(error);
            });

            const readStudentImage = async (fileItem) => {
                if (fileItem.file) return convertFileToBase64(fileItem.file);
                const assetId = fileItem.cloudAssetIds?.[0];
                if (cloud.mode === 'cloud' && typeof assetId === 'string' && /^[a-f0-9-]{36}$/.test(assetId)) return 'wa-asset:' + assetId;
                throw new Error('原稿不可用，请重新上传图片。');
            };

            const parseRosterNames = (rosterText) => {
                const text = (rosterText || '').toString();
                const candidates = [];
                const lines = text.split(/\r?\n/g);
                for (const line of lines) {
                    const names = extractChineseNames(line);
                    if (names.length > 0) candidates.push(...names);
                    else {
                        const tokens = line.split(/[\s,，;；、/\\|]+/g).map(s => s.trim()).filter(Boolean);
                        for (const t of tokens) {
                            if (isChineseName(t)) candidates.push(t);
                        }
                    }
                }
                return Array.from(new Set(candidates.map(n => n.trim()).filter(Boolean)));
            };

            const parseRosterImportText = (rawText) => {
                const text = (rawText || '').toString().replace(/\u00A0/g, ' ');
                const lines = text.split(/\r?\n/g).map(l => l.trim()).filter(Boolean);
                const out = { classes: [], rosterByClass: {} };
                if (lines.length === 0) return out;

                const isHeader = (line) => /班级/.test(line) && /姓名/.test(line);
                const cleaned = lines.filter(l => !isHeader(l));

                for (const line of cleaned) {
                    const parts = line.split(/[\t,，;；]+/g).flatMap(p => p.split(/\s+/g)).map(s => s.trim()).filter(Boolean);
                    if (parts.length < 2) continue;
                    const cls = parts[0];
                    const name = parts[1];
                    if (!cls || !name) continue;
                    if (!/班/.test(cls) && !/\d/.test(cls)) continue;
                    const names = extractChineseNames(name);
                    const finalName = names[0] || name;
                    if (!finalName) continue;
                    if (!out.rosterByClass[cls]) out.rosterByClass[cls] = [];
                    out.rosterByClass[cls].push(finalName);
                }

                out.classes = Object.keys(out.rosterByClass);
                for (const cls of out.classes) {
                    const uniq = Array.from(new Set(out.rosterByClass[cls].map(s => String(s).trim()).filter(Boolean)));
                    out.rosterByClass[cls] = uniq.join('\n');
                }
                return out;
            };

            const isEmptyIdentity = (s) => {
                const v = (s || '').toString().trim();
                if (!v) return true;
                if (v === '_______' || v === '_____' || v === '___') return true;
                if (v.includes('识别')) return true;
                return false;
            };

            const normalizeClassText = (s) => (s || '').toString().trim()
                .replace(/^[Cc]lass\s*[:：]?/g, '')
                .replace(/^班级\s*[:：]?/g, '')
                .replace(/[:：]/g, '')
                .replace(/[\s_\-]+/g, '');

            const parseStudentNoWithSuffix = (raw) => {
                const s0 = raw === undefined || raw === null ? '' : String(raw);
                const s = s0.replace(/\u00A0/g, ' ').trim();
                if (!s) return { studentNo: '', suffix: '', raw: '' };
                const m = s.match(/(\d{1,4})\s*[:：]\s*(\d{2})/);
                if (m) return { studentNo: String(m[1] || '').trim(), suffix: String(m[2] || '').trim(), raw: String(m[0] || '').trim() };
                const m2 = s.match(/\b\d{1,4}\b/);
                if (m2) return { studentNo: String(m2[0] || '').trim(), suffix: '', raw: s };
                return { studentNo: '', suffix: '', raw: s };
            };

            const extractClassDigits = (s) => {
                const t = normalizeClassText(s);
                const m = t.match(/\d+/g);
                return m ? m.join('') : '';
            };

            const bestMatchNameWithScore = (candidate, rosterNames) => {
                const c = normalizeName(candidate);
                if (!c) return { name: '', score: 1 };
                let best = { name: '', score: 1 };
                for (const rn of (rosterNames || [])) {
                    const d = levenshtein(c, rn);
                    const denom = Math.max(normalizeName(rn).length, c.length, 1);
                    const ratio = d / denom;
                    if (ratio < best.score) best = { name: rn, score: ratio };
                }
                return best;
            };

            const pickCanonicalClass = (rawClass, candidates) => {
                const raw = normalizeClassText(rawClass);
                if (!raw) return '';
                const digits = extractClassDigits(raw);
                const meta = (candidates || []).map(cls => {
                    const norm = normalizeClassText(cls);
                    return { cls, norm, digits: extractClassDigits(norm) };
                });
                if (digits) {
                    const hit = meta.find(x => x.digits && x.digits === digits);
                    if (hit) return hit.cls;
                }
                for (const m of meta) {
                    if (!m.norm) continue;
                    if (raw.includes(m.norm) || m.norm.includes(raw)) return m.cls;
                }
                return '';
            };

            const reconcileIdentityWithRoster = (result, fileItem) => {
                const r = result && typeof result === 'object' ? result : {};
                const manual = !!r.identity_manual_override;
                const name = (r.student_name || '').toString().trim();
                if (manual && name) {
                    const cleaned = { ...r, student_no: '', student_no_suffix: '', student_no_raw: '' };
                    return attachIdentityWithStudentSystem(cleaned, fileItem);
                }
                return attachIdentityWithStudentSystem(r, fileItem);
            };

            const reconcileIdentityAfterTeacherEdit = (prevResult, nextDraft, fileItem) => {
                const prev = prevResult && typeof prevResult === 'object' ? prevResult : {};
                const draft = nextDraft && typeof nextDraft === 'object' ? nextDraft : {};

                const prevName = normalizeName(prev.student_name || '');
                const nextName = normalizeName(draft.student_name || '');
                const nameChanged = !!nextName && prevName !== nextName;

                const normalizeNo = (v) => {
                    const s = (v === undefined || v === null) ? '' : String(v).trim();
                    if (!s) return '';
                    const m = s.match(/\d{1,4}/);
                    return m ? String(m[0]) : '';
                };
                const prevNo = normalizeNo(prev.student_no);
                const nextNo = normalizeNo(draft.student_no);
                const noChanged = !!nextNo && prevNo !== nextNo;

                let prepared = { ...draft };
                if (nameChanged) {
                    prepared.identity_manual_override = true;
                    prepared.identity_manual_override_at = new Date().toISOString();
                    prepared.identity_name_mismatch = false;
                    prepared.identity_name_mismatch_verified = true;
                    prepared.student_id = '';
                    prepared.class_id = prepared.class_id || '';
                    prepared.student_no = '';
                    prepared.student_no_suffix = '';
                    prepared.student_no_raw = '';
                } else if (noChanged) {
                    prepared.identity_manual_override = true;
                    prepared.identity_manual_override_at = new Date().toISOString();
                    prepared.student_id = '';
                    prepared.class_id = prepared.class_id || '';
                }

                return reconcileIdentityWithRoster(prepared, fileItem);
            };

            const applyInferredIdentityToResult = (result, fileItem) => {
                const next = attachIdentityWithStudentSystem(result, fileItem);
                next.graded_at = new Date().toISOString();
                return next;
            };

            const buildCsvContent = (rows, includeUtf8Bom) => {
                const escapeCell = (v) => {
                    const s = v === undefined || v === null ? '' : String(v);
                    const needsQuote = /[",\n\r]/.test(s);
                    const safe = s.replace(/"/g, '""');
                    return needsQuote ? `"${safe}"` : safe;
                };
                const lines = rows.map(r => r.map(escapeCell).join(','));
                const body = lines.join('\r\n');
                return (includeUtf8Bom ? '\ufeff' : '') + body;
            };

            const downloadCsvFile = (content, fileName) => {
                const safeName = (fileName || 'SmartGrader.csv').toString();
                const blob = new Blob([content || ''], { type: 'text/csv;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = safeName;
                a.click();
                URL.revokeObjectURL(url);
            };

            const exportCsvForClass = () => {
                const successful = files.filter(f => f.status === 'success' && f.result);
                if (successful.length === 0) return alert('暂无可导出的批改结果');

                const issues = [];
                successful.forEach((f, idx) => {
                    const r0 = f.result || {};
                    const r = reconcileIdentityWithRoster(r0, f);
                    const mismatch = !!(r && r.identity_name_mismatch) && !(r && r.identity_name_mismatch_verified);
                    const status = (r && r.identity_status) ? String(r.identity_status) : '';
                    const matched = status ? status === 'matched' : (!!(r && r.student_id) && !!(r && r.class_id));
                    if (mismatch || !matched) {
                        const className = (r && r.class_name) || r0.class_name || f.inferredClassName || getClassNameById(currentClassId) || '';
                        const studentName = (r && r.student_name) || r0.student_name || f.inferredStudentName || '';
                        const tag = mismatch ? '待确认(姓名不一致)' : (status ? `待确认(${status})` : '待确认(未匹配)');
                        const studentNo = (r && r.student_no !== undefined && r.student_no !== null && String(r.student_no).trim()) ? String(r.student_no).trim() : '';
                        issues.push({ idx: idx + 1, studentNo, className, studentName, tag });
                    }
                });
                const preview = issues.slice(0, 10).map(it => `${it.idx}. ${it.studentNo ? `#${it.studentNo} ` : ''}${it.className} - ${it.studentName} ${it.tag}`).join('\n');
                const msg = issues.length > 0
                    ? `导出前请核对姓名/班级信息：\n当前有 ${issues.length} 份记录存在“待确认/不确定”匹配。\n\n${preview}${issues.length > 10 ? '\n...' : ''}\n\n仍要继续导出 CSV 吗？`
                    : '导出前请确认：已完成姓名核对，避免批改结果归属错误。\n\n点击“取消”返回继续核对；点击“确定”继续导出 CSV。';
                if (!window.confirm(msg)) return;

                const examName = (assignment && assignment.examName) ? String(assignment.examName).trim() : '';
                const taskName = (assignment && assignment.title) ? String(assignment.title).trim() : '';
                const taskLabel = taskName || '未命名任务';
                const header = ['序号', '班级名称', '学生姓名', '实际得分', '题目满分值', '写作任务名称', '批改时间'];
                const rows = [header];
                successful.forEach((f, idx) => {
                    const r0 = f.result || {};
                    const r = reconcileIdentityWithRoster(r0, f);
                    const className = r.class_name || r0.class_name || f.inferredClassName || getClassNameById(currentClassId) || '';
                    const studentName = r.student_name || r0.student_name || f.inferredStudentName || '';
                    const studentNo = (r.student_no !== undefined && r.student_no !== null && String(r.student_no).trim()) ? String(r.student_no).trim() : String(idx + 1);
                    const score = (r0.total_score === undefined || r0.total_score === null) ? '' : r0.total_score;
                    const total = (rubric.total === undefined || rubric.total === null) ? '' : rubric.total;
                    const time = formatDateTime(r0.graded_at || Date.now());
                    rows.push([studentNo, className, studentName, score, total, taskLabel, time]);
                });
                const content = buildCsvContent(rows, !!csvExportConfig.includeUtf8Bom);
                const cls = (getClassNameById(currentClassId) || '未分班级').toString().trim();
                const dateStr = new Date().toISOString().slice(0, 10);
                const nameParts = [examName, taskLabel, cls].map(s => (s || '').toString().trim()).filter(Boolean);
                const safeBase = (nameParts.length > 0 ? nameParts.join('_') : `SmartGrader_${cls}`).replace(/[\\/:*?"<>|]+/g, '_');
                const fileName = `${safeBase}_${dateStr}.csv`;
                downloadCsvFile(content, fileName);
                setCsvExportHistory(prev => {
                    const next = [{
                    id: Math.random().toString(36).slice(2),
                    className: cls,
                    taskName: taskLabel,
                    count: successful.length,
                    fileName,
                    includeUtf8Bom: !!csvExportConfig.includeUtf8Bom,
                    exportedAt: new Date().toISOString(),
                    csvContent: content
                    }, ...(prev || [])];
                    return next.slice(0, 50);
                });
            };

            const buildDefaultSaveName = () => {
                const cls = (getClassNameById(currentClassId) || '未分班级').toString().trim();
                const exam = (assignment && assignment.examName) ? String(assignment.examName).trim() : '';
                const task = (assignment && assignment.title) ? String(assignment.title).trim() : '';
                const dateStr = new Date().toISOString().slice(0, 10);
                const prefix = [exam, task].filter(Boolean).join('_');
                const base = prefix ? `${prefix}_${cls}_${dateStr}` : `${cls}_${dateStr}`;
                return base || `批改结果_${dateStr}`;
            };

            const openSaveDialogWithDefaultName = () => {
                setSaveDraftName(buildDefaultSaveName());
                setSaveToCurrentCloud(false);
                setShowSaveDialog(true);
            };

            const saveCurrentGradingSnapshot = (nameOverride) => {
                const defaultName = buildDefaultSaveName();
                const name = (nameOverride || '').toString().trim() || defaultName;
                const safeAssignment = { ...(assignment || {}) };
                safeAssignment.promptImageBase64 = '';
                safeAssignment.promptImageName = '';
                const payload = {
                    id: cloud.mode === 'cloud' && saveToCurrentCloud && activeCloudSnapshot ? activeCloudSnapshot.localId : createId(),
                    name,
                    savedAt: new Date().toISOString(),
                    classId: String(currentClassId || ''),
                    className: getClassNameById(currentClassId) || '',
                    gradedCount: files.filter(f => f && f.status === 'success' && f.result).length,
                    data: {
                        assignment: safeAssignment,
                        rubric,
                        classes,
                        currentClassId,
                        activeClassIds,
                        languageDifficulty,
                        pdfConfig,
                        csvExportConfig,
                        studentProfiles,
                        sourceTask,
                        files: (Array.isArray(files) ? files : []).map(f => ({ ...(f || {}), file: null, url: null }))
                    }
                };
                setSavedGradingResults(prev => {
                    const list = Array.isArray(prev) ? prev : [];
                    const next = [payload, ...list.filter(item => item.id !== payload.id)];
                    return next.slice(0, 120);
                });
                setShowSaveDialog(false);
                lastSavedLocalIdRef.current = payload.id;lastSavedAtRef.current = payload.savedAt;
                if (cloud.mode === 'cloud') void cloudSnapshots.save(JSON.parse(JSON.stringify(payload)),files,saveToCurrentCloud ? activeCloudSnapshot : null);
            };

            const deleteSavedGradingSnapshot = (id) => {
                setSavedGradingResults(prev => (prev || []).filter(x => String(x && x.id) !== String(id)));
            };

            const downloadSavedGradingSnapshot = (item) => {
                if (!item) return;
                const name = (item.name || '批改结果').toString().trim() || '批改结果';
                const dateStr = (item.savedAt || new Date().toISOString()).toString().slice(0, 10);
                const fileName = `${name}_${dateStr}.json`;
                const blob = new Blob([JSON.stringify(item, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = fileName;
                a.click();
                URL.revokeObjectURL(url);
            };

            const applySavedGradingSnapshot = (item) => {
                if (!item || !item.data) return;
                if (isBatchProcessing) return alert('请先暂停当前批改，再恢复历史结果。');
                const d = item.data || {};
                setSourceTask(d.sourceTask || null);
                if (d.assignment) setAssignment(d.assignment);
                if (item.cloud && d.rubric) {
                    setRubric(JSON.parse(JSON.stringify(d.rubric)));
                } else if (d.rubric) {
                    const loaded = d.rubric;
                    const loadedStrictnessLevelRaw = clampStrictnessLevel(loaded && loaded.strictnessLevel);
                    const loadedStrictnessLevel = loadedStrictnessLevelRaw !== null ? loadedStrictnessLevelRaw : strictnessLevelFromLabel(loaded && loaded.strictness);
                    const loadedStrictnessLabel = (loaded && loaded.strictness) ? String(loaded.strictness) : strictnessLabelFromLevel(loadedStrictnessLevel);
                    const normalizedLoaded = { ...loaded, strictness: loadedStrictnessLabel, strictnessLevel: loadedStrictnessLevel, wordCountStrict: loaded && loaded.wordCountStrict === false ? false : true };
                    const loadedTotal = Number(loaded && loaded.total);
                    const loadedItems = Array.isArray(loaded && loaded.items) ? loaded.items : [];
                    const ensureWordCountItem = (items) => {
                        const list = Array.isArray(items) ? items.slice() : [];
                        const has = list.some(it => it && it.label && /词数|字数/.test(String(it.label)));
                        if (has) return list;
                        const idx = Math.min(3, list.length);
                        const wcItem = { id: `c_wc_${Date.now()}`, label: '词数要求', score: 0, desc: '是否满足字数要求；可设置严格/宽松模式' };
                        return [...list.slice(0, idx), wcItem, ...list.slice(idx)];
                    };
                    if (Number.isFinite(loadedTotal) && loadedItems.length > 0) {
                        setRubric({ ...normalizedLoaded, items: redistributeItemScoresToTotal(ensureWordCountItem(loadedItems), loadedTotal) });
                    } else {
                        setRubric({ ...normalizedLoaded, items: ensureWordCountItem(loadedItems) });
                    }
                }
                if (Array.isArray(d.classes)) setClasses(d.classes);
                if (d.currentClassId) setCurrentClassId(String(d.currentClassId));
                if (Array.isArray(d.activeClassIds)) setActiveClassIds(d.activeClassIds);
                if (d.languageDifficulty && typeof d.languageDifficulty === 'object') setLanguageDifficulty(p => ({ ...p, ...d.languageDifficulty }));
                if (d.pdfConfig) setPdfConfig(d.pdfConfig);
                if (d.csvExportConfig) setCsvExportConfig(d.csvExportConfig);
                if (d.studentProfiles && typeof d.studentProfiles === 'object') setStudentProfiles(d.studentProfiles);
                if (Array.isArray(d.files)) {
                    const restored = d.files.map((f, idx) => ({
                        ...(f || {}),
                        id: (f && f.id) ? f.id : Math.random().toString(36).slice(2, 9),
                        file: null,
                        url: cloud.mode === 'cloud' && /^[a-f0-9-]{36}$/.test(f?.cloudAssetIds?.[0] || '') ? '/api/assets/' + f.cloudAssetIds[0] : '',
                        name: (f && f.name) ? String(f.name) : `导入文件${idx + 1}`,
                        status: f?.status === 'loading' ? 'idle' : (f && f.status) ? String(f.status) : (f && f.result ? 'success' : 'idle'),
                        index: Number(f && f.index) || (idx + 1),
                        inferredStudentRawName: (f && f.inferredStudentRawName) ? String(f.inferredStudentRawName) : '',
                        inferredStudentName: (f && f.inferredStudentName) ? String(f.inferredStudentName) : '',
                        inferredClassName: (f && f.inferredClassName) ? String(f.inferredClassName) : '',
                        inferredClassId: (f && f.inferredClassId) ? String(f.inferredClassId) : '',
                        result: (f && f.result) ? {...f.result,original_image_url:cloud.mode === 'cloud' && /^[a-f0-9-]{36}$/.test(f?.cloudAssetIds?.[0] || '') ? '/api/assets/' + f.cloudAssetIds[0] : ''} : null
                    }));
                    setFiles(restored);
                    setSelectedFileId(restored[0]?.id || null);
                    if (restored.some(file => file.status === 'idle')) {setIsPaused(true);setPauseBanner('已恢复存档，未批改的作文可继续处理。');}
                }
                setActiveCloudSnapshot(item.cloud ? {...item.cloud,revision:item.cloud.latestRevision || item.cloud.revision,localSavedAt:item.savedAt || ''} : null);
                lastSavedLocalIdRef.current = item.id;lastSavedAtRef.current = item.savedAt || '';
            };

            const exportCsvHistoryFiltered = () => {
                const q = (csvHistoryQuery || '').toString().trim().toLowerCase();
                const list = Array.isArray(csvExportHistory) ? csvExportHistory : [];
                if (!q) return list;
                return list.filter(it => {
                    const hay = [it.className, it.taskName, it.fileName, it.exportedAt, it.count].map(v => (v === undefined || v === null) ? '' : String(v)).join(' ').toLowerCase();
                    return hay.includes(q);
                });
            };

            const downloadCsvHistoryItem = (item) => {
                if (!item) return;
                if (!item.csvContent) return alert('该条历史记录未保存 CSV 内容，无法直接下载');
                downloadCsvFile(item.csvContent, item.fileName || 'SmartGrader.csv');
            };

            const deleteCsvHistoryItem = (id) => {
                setCsvExportHistory(prev => (prev || []).filter(it => it.id !== id));
            };

            const clearCsvHistory = () => {
                if (!confirm('确定清空全部 CSV 导出历史？')) return;
                setCsvExportHistory([]);
            };

            const handleRubricDocSelected = (e) => {
                const file = e.target.files && e.target.files[0];
                if (!file) return;
                setRubricParseState({ status: 'ready', fileName: file.name, file, extractedText: '', result: null, error: '' });
            };

            const mapParsedRubricToSystemRubric = (parsed) => {
                const safe = parsed || {};
                const dims = Array.isArray(safe.dimensions) ? safe.dimensions : [];
                const items = (dims.length > 0 ? dims : [{ name: '内容完整度', points: 4, description: '请补充评分要求', levels: [] }]).map((d, i) => {
                    const name = (d && d.name) ? String(d.name).trim() : `维度${i + 1}`;
                    const points = (d && typeof d.points !== 'undefined') ? Number(d.points) : 1;
                    const desc = (d && d.description) ? String(d.description).trim() : '';
                    const levels = Array.isArray(d && d.levels) ? d.levels : [];
                    const levelText = levels
                        .filter(l => l && (l.name || l.criteria))
                        .map(l => `${(l.name || '').toString().trim()}：${(l.criteria || '').toString().trim()}`)
                        .filter(Boolean)
                        .join('；');
                    const finalDesc = [desc, levelText].filter(Boolean).join('；');
                    return { id: `ai_${Date.now()}_${i}`, label: name, score: Number.isFinite(points) ? points : 1, desc: finalDesc || '请补充评分要求' };
                });
                const parsedTotal = Number(safe.total);
                const sumPoints = items.reduce((acc, it) => acc + (Number(it && it.score) || 0), 0);
                const finalTotal = (sumPoints > 0 ? sumPoints : (Number.isFinite(parsedTotal) ? parsedTotal : rubric.total));
                const strictnessLabel = safe.strictness ? String(safe.strictness) : rubric.strictness;
                const strictnessLevel = clampStrictnessLevel(safe.strictnessLevel);
                const finalStrictnessLevel = strictnessLevel !== null ? strictnessLevel : strictnessLevelFromLabel(strictnessLabel);
                return {
                    total: finalTotal,
                    wordCount: safe.wordCount ? String(safe.wordCount) : rubric.wordCount,
                    wordCountStrict: (safe.wordCountStrict === undefined || safe.wordCountStrict === null) ? (rubric.wordCountStrict !== false) : !!safe.wordCountStrict,
                    gradeLevel: safe.gradeLevel ? String(safe.gradeLevel) : rubric.gradeLevel,
                    tense: Array.isArray(safe.tense) && safe.tense.length > 0 ? safe.tense.filter(Boolean) : rubric.tense,
                    strictness: strictnessLabel,
                    strictnessLevel: finalStrictnessLevel,
                    modelDifficulty: rubric.modelDifficulty,
                    items
                };
            };

            const applyRubricObjectToSystem = (rubricObj, successMessage) => {
                if (!rubricObj) return;
                const mapped = mapParsedRubricToSystemRubric(rubricObj);
                const mappedItems = Array.isArray(mapped && mapped.items) ? mapped.items : [];
                const mappedTotal = Number(mapped && mapped.total);
                const finalRubric = (Number.isFinite(mappedTotal) && mappedItems.length > 0)
                    ? { ...mapped, items: redistributeItemScoresToTotal(mappedItems, mappedTotal) }
                    : mapped;
                setRubric(finalRubric);
                setRubricHistory(prev => {
                    const list = Array.isArray(prev) ? prev : [];
                    const name = `${buildDefaultRubricHistoryName()}_自动保存`;
                    const payload = {
                        id: createId(),
                        name,
                        createdAt: new Date().toISOString(),
                        examName: (assignment && assignment.examName) ? String(assignment.examName).trim() : '',
                        assignmentTitle: (assignment && assignment.title) ? String(assignment.title).trim() : '',
                        classId: String(currentClassId || ''),
                        className: getClassNameById(currentClassId) || '',
                        snapshot: JSON.parse(JSON.stringify({
                            rubric: finalRubric || {},
                            assignment: {
                                examName: (assignment && assignment.examName) ? String(assignment.examName) : '',
                                title: (assignment && assignment.title) ? String(assignment.title) : '',
                                topic: (assignment && assignment.topic) ? String(assignment.topic) : '',
                                analysis: (assignment && assignment.analysis) ? String(assignment.analysis) : '',
                                modelEssay: (assignment && assignment.modelEssay) ? String(assignment.modelEssay) : ''
                            }
                        }))
                    };
                    const next = [payload, ...list];
                    const deduped = [];
                    const seen = new Set();
                    for (const item of next) {
                        const key = JSON.stringify(item && item.snapshot ? item.snapshot : {});
                        if (seen.has(key)) continue;
                        seen.add(key);
                        deduped.push(item);
                        if (deduped.length >= 50) break;
                    }
                    return deduped;
                });
                alert(successMessage || '已应用到评分模板');
            };

            const applyGeneratedRubricToSystem = () => {
                if (!rubricDesignState || !rubricDesignState.result) return;
                applyRubricObjectToSystem(rubricDesignState.result, '已将生成的评分标准应用到评分模板');
                setRubricDesignAppliedAt(new Date().toISOString());
            };

            const buildDefaultRubricHistoryName = () => {
                const exam = (assignment && assignment.examName) ? String(assignment.examName).trim() : '';
                const task = (assignment && assignment.title) ? String(assignment.title).trim() : '';
                const cls = (getClassNameById(currentClassId) || '').toString().trim();
                const dt = new Date();
                const pad = (n) => String(n).padStart(2, '0');
                const dateStr = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}_${pad(dt.getHours())}${pad(dt.getMinutes())}`;
                const parts = [exam, task, cls].filter(Boolean);
                const base = parts.join('_');
                return (base ? `${base}_${dateStr}` : `全局备份_${dateStr}`);
            };

            const addRubricHistoryEntry = (snapshot, nameOverride) => {
                if (!snapshot) return;
                const name = (nameOverride || '').toString().trim() || buildDefaultRubricHistoryName();
                const payload = {
                    id: createId(),
                    name,
                    createdAt: new Date().toISOString(),
                    examName: (assignment && assignment.examName) ? String(assignment.examName).trim() : '',
                    assignmentTitle: (assignment && assignment.title) ? String(assignment.title).trim() : '',
                    classId: String(currentClassId || ''),
                    className: getClassNameById(currentClassId) || '',
                    snapshot: JSON.parse(JSON.stringify(snapshot || {}))
                };
                setRubricHistory(prev => {
                    const list = Array.isArray(prev) ? prev : [];
                    const next = [payload, ...list];
                    const deduped = [];
                    const seen = new Set();
                    for (const item of next) {
                        const key = JSON.stringify(item && item.snapshot ? item.snapshot : {});
                        if (seen.has(key)) continue;
                        seen.add(key);
                        deduped.push(item);
                        if (deduped.length >= 50) break;
                    }
                    return deduped;
                });
                setShowRubricHistory(false);
                setRubricHistoryName('');
                return name;
            };

            const saveCurrentRubricToHistory = (nameOverride) => {
                const snapshot = {
                    rubric: rubric || {},
                    assignment: {
                        examName: (assignment && assignment.examName) ? String(assignment.examName) : '',
                        title: (assignment && assignment.title) ? String(assignment.title) : '',
                        topic: (assignment && assignment.topic) ? String(assignment.topic) : '',
                        analysis: (assignment && assignment.analysis) ? String(assignment.analysis) : '',
                        modelEssay: (assignment && assignment.modelEssay) ? String(assignment.modelEssay) : ''
                    }
                };
                return addRubricHistoryEntry(snapshot, nameOverride);
            };

            const openRubricBackupDialog = () => {
                const defaultName = buildDefaultRubricHistoryName();
                setRubricBackupName(defaultName);
                setShowRubricBackupDialog(true);
            };

            const confirmRubricBackup = () => {
                const fallback = buildDefaultRubricHistoryName();
                const name = (rubricBackupName || '').toString().trim() || fallback;
                const savedName = saveCurrentRubricToHistory(name) || name;
                setShowRubricBackupDialog(false);
                setRubricBackupSuccessName(savedName);
                setShowRubricBackupSuccess(true);
            };

            const restoreRubricFromHistory = (item) => {
                if (!item) return;
                const snap = item.snapshot || null;
                const legacyRubric = item.rubric || null;
                const payload = snap && typeof snap === 'object' ? snap : { rubric: legacyRubric || {} };
                const normalized = normalizeRubricForSystem(payload.rubric);
                if (normalized) setRubric(normalized);
                if (payload.assignment && typeof payload.assignment === 'object') {
                    setAssignment(p => ({
                        ...p,
                        examName: payload.assignment.examName ? String(payload.assignment.examName) : (p.examName || ''),
                        title: payload.assignment.title ? String(payload.assignment.title) : (p.title || ''),
                        topic: payload.assignment.topic ? String(payload.assignment.topic) : (p.topic || ''),
                        analysis: payload.assignment.analysis ? String(payload.assignment.analysis) : (p.analysis || ''),
                        modelEssay: payload.assignment.modelEssay ? String(payload.assignment.modelEssay) : (p.modelEssay || '')
                    }));
                } else if (item.assignmentTitle || item.examName) {
                    setAssignment(p => ({
                        ...p,
                        title: p.title || (item.assignmentTitle || ''),
                        examName: p.examName || (item.examName || '')
                    }));
                }
                setShowRubricHistory(false);
            };

            const deleteRubricHistoryItem = (id) => {
                setRubricHistory(prev => (Array.isArray(prev) ? prev : []).filter(x => String(x && x.id) !== String(id)));
            };

            const deleteStudentArchivedRecord = (studentId, recordId) => {
                const sid = String(studentId || '');
                const rid = String(recordId || '');
                if (!sid || !rid) return;
                setStudentProfiles(prev => {
                    const base = prev && typeof prev === 'object' ? prev : {};
                    const profile = base[sid];
                    if (!profile || !Array.isArray(profile.records)) return prev;
                    const nextRecords = profile.records.filter(r => String(r && r.id) !== rid);
                    return { ...base, [sid]: { ...profile, records: nextRecords } };
                });
                setArchivedPreview(p => (p && p.open && p.record && String(p.record.id) === rid) ? { open: false, record: null } : p);
            };

            const deleteStudentArchivedRecordsBulk = (studentId, recordIds) => {
                const sid = String(studentId || '');
                const ids = Array.isArray(recordIds) ? recordIds.map(x => String(x || '')).filter(Boolean) : [];
                if (!sid || ids.length === 0) return;
                const idSet = new Set(ids);
                setStudentProfiles(prev => {
                    const base = prev && typeof prev === 'object' ? prev : {};
                    const profile = base[sid];
                    if (!profile || !Array.isArray(profile.records)) return prev;
                    const nextRecords = profile.records.filter(r => !idSet.has(String(r && r.id)));
                    if (nextRecords.length === 0) {
                        const next = { ...base };
                        delete next[sid];
                        return next;
                    }
                    return { ...base, [sid]: { ...profile, records: nextRecords } };
                });
                setArchivedPreview(p => (p && p.open && p.record && idSet.has(String(p.record.id))) ? { open: false, record: null } : p);
            };

            const clearArchivedRecordsForClass = (classId) => {
                const cid = String(classId || '');
                if (!cid) return;
                const cls = getClassById(cid);
                const roster = cls && Array.isArray(cls.students) ? cls.students : [];
                const ids = roster.map(s => (s && s.id !== undefined && s.id !== null) ? String(s.id) : '').filter(Boolean);
                if (ids.length === 0) return;
                const idSet = new Set(ids);
                setStudentProfiles(prev => {
                    const base = prev && typeof prev === 'object' ? prev : {};
                    const next = { ...base };
                    for (const sid of ids) {
                        if (next[sid]) delete next[sid];
                    }
                    return next;
                });
                setArchivedPreview(p => {
                    const sid = p && p.open && p.record && p.record.result && p.record.result.student_id ? String(p.record.result.student_id) : '';
                    if (sid && idSet.has(sid)) return { open: false, record: null };
                    return p;
                });
            };

            const startRubricParse = async () => {
                const file = rubricParseState.file;
                if (!file) return alert('请先选择评分标准文件');
                setRubricParseState(p => ({ ...p, status: 'extracting', error: '', extractedText: '', result: null }));
                try {
                    const extractedText = await extractTextFromRubricDoc(file);
                    const trimmed = (extractedText || '').toString().trim();
                    if (!trimmed) {
                        setRubricParseState(p => ({ ...p, status: 'error', error: '未能从文档中提取到有效文本，请更换文件或检查内容格式。', extractedText: extractedText || '' }));
                        return;
                    }
                    setRubricParseState(p => ({ ...p, status: 'analyzing', extractedText }));
                    const result = await callAI([
                        { role: 'system', content: RUBRIC_PARSE_PROMPT_SYSTEM(rubric) },
                        { role: 'user', content: trimmed }
                    ], true);
                    if (!result) {
                        setRubricParseState(p => ({ ...p, status: 'error', error: 'AI 解析失败，请稍后重试。' }));
                        return;
                    }
                    setRubricParseState(p => ({ ...p, status: 'success', result, error: '' }));
                } catch (err) {
                    setRubricParseState(p => ({ ...p, status: 'error', error: err && err.message ? err.message : '解析失败' }));
                }
            };

            const startRubricParseFromText = async () => {
                const raw = (rubricPasteText || '').toString().trim();
                if (!raw) return alert('请先粘贴评分标准文本');
                setRubricParseState(p => ({ ...p, status: 'analyzing', error: '', extractedText: raw, result: null }));
                try {
                    const result = await callAI([
                        { role: 'system', content: RUBRIC_PARSE_PROMPT_SYSTEM(rubric) },
                        { role: 'user', content: raw }
                    ], true);
                    if (!result) {
                        setRubricParseState(p => ({ ...p, status: 'error', error: 'AI 解析失败，请稍后重试。' }));
                        return;
                    }
                    setRubricParseState(p => ({ ...p, status: 'success', result, error: '' }));
                } catch (err) {
                    setRubricParseState(p => ({ ...p, status: 'error', error: err && err.message ? err.message : '解析失败' }));
                }
            };

            const generateRubricDesign = async () => {
                const analysis = (assignment.analysis || '').toString().trim();
                if (!analysis) return alert('请先生成或填写“题目要点分析”');
                setRubricDesignState({ status: 'analyzing', result: null, error: '' });
                try {
                    const result = await callAI([
                        { role: 'system', content: RUBRIC_DESIGN_PROMPT_SYSTEM(rubric, assignment) },
                        { role: 'user', content: '请生成评分标准 JSON。' }
                    ], true);
                    if (!result) {
                        setRubricDesignState({ status: 'error', result: null, error: '生成失败，请稍后重试。' });
                        return;
                    }
                    const dims = Array.isArray(result && result.dimensions) ? result.dimensions : [];
                    const sumPoints = dims.reduce((acc, d) => acc + (Number(d && d.points) || 0), 0);
                    const normalizedTotal = sumPoints > 0 ? sumPoints : (Number(result && result.total) || (Number(rubric && rubric.total) || 0));
                    setRubricDesignState({ status: 'success', result: { ...(result || {}), total: normalizedTotal }, error: '' });
                } catch (err) {
                    setRubricDesignState({ status: 'error', result: null, error: err && err.message ? err.message : '生成失败' });
                }
            };

            const applyParsedRubricToSystem = () => {
                if (!rubricParseState.result) return;
                applyRubricObjectToSystem(rubricParseState.result, '已将导入的评分标准应用到评分模板');
                setShowRubricImportModal(false);
            };

            const readFileAsText = (file) => new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.readAsText(file, 'UTF-8');
                reader.onload = () => resolve(reader.result || '');
                reader.onerror = error => reject(error);
            });

            const readFileAsArrayBuffer = (file) => new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.readAsArrayBuffer(file);
                reader.onload = () => resolve(reader.result);
                reader.onerror = error => reject(error);
            });

            const extractTextFromRubricDoc = async (file) => {
                const name = (file && file.name) ? file.name : '';
                const ext = name.split('.').pop().toLowerCase();
                if (ext === 'txt') {
                    return await readFileAsText(file);
                }
                if (ext === 'docx') {
                    if (!window.mammoth) window.mammoth = (await import('mammoth/mammoth.browser')).default;
                    const arrayBuffer = await readFileAsArrayBuffer(file);
                    const result = await window.mammoth.extractRawText({ arrayBuffer });
                    return (result && result.value) ? result.value : '';
                }
                if (ext === 'pdf') {
                    if (!window.pdfjsLib) {
                        const pdfjsLib = await import('pdfjs-dist');
                        pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
                        window.pdfjsLib = pdfjsLib;
                    }
                    const arrayBuffer = await readFileAsArrayBuffer(file);
                    const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer });
                    const pdf = await loadingTask.promise;
                    const pages = [];
                    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                        const page = await pdf.getPage(pageNum);
                        const content = await page.getTextContent();
                        const text = (content.items || []).map(it => it.str).join(' ');
                        pages.push(text);
                    }
                    return pages.join('\n\n');
                }
                throw new Error('不支持的文件类型，请上传 PDF/DOCX/TXT');
            };

            const normalizeName = (s) => (s || '').toString().trim().replace(/[\s_\-]+/g, '');
            const isChineseName = (s) => /[\u4e00-\u9fa5]{2,4}/.test(s || '');
            const extractChineseNames = (s) => {
                const m = (s || '').match(/[\u4e00-\u9fa5]{2,4}/g);
                return m ? Array.from(new Set(m)) : [];
            };

            const levenshtein = (a, b) => {
                const s = normalizeName(a);
                const t = normalizeName(b);
                if (!s && !t) return 0;
                if (!s) return t.length;
                if (!t) return s.length;
                const dp = Array.from({ length: s.length + 1 }, () => new Array(t.length + 1).fill(0));
                for (let i = 0; i <= s.length; i++) dp[i][0] = i;
                for (let j = 0; j <= t.length; j++) dp[0][j] = j;
                for (let i = 1; i <= s.length; i++) {
                    for (let j = 1; j <= t.length; j++) {
                        const cost = s[i - 1] === t[j - 1] ? 0 : 1;
                        dp[i][j] = Math.min(
                            dp[i - 1][j] + 1,
                            dp[i][j - 1] + 1,
                            dp[i - 1][j - 1] + cost
                        );
                    }
                }
                return dp[s.length][t.length];
            };

            const bestMatchName = (candidate, rosterNames) => {
                const c = normalizeName(candidate);
                if (!c) return '';
                let best = { name: '', score: Number.POSITIVE_INFINITY };
                for (const rn of rosterNames) {
                    const d = levenshtein(c, rn);
                    const denom = Math.max(normalizeName(rn).length, c.length, 1);
                    const ratio = d / denom;
                    if (ratio < best.score) best = { name: rn, score: ratio };
                }
                if (best.name && best.score <= 0.34) return best.name;
                return '';
            };

            const inferStudentFromFilename = (filename, rosterNames, classCandidates) => {
                const base = (filename || '').replace(/\.[^.]+$/, '');
                const tokens = base.split(/[\s_\-]+/g).filter(Boolean);
                const candidates = [];
                for (const t of tokens) {
                    if (isChineseName(t)) candidates.push(...extractChineseNames(t));
                }
                if (candidates.length === 0) candidates.push(...extractChineseNames(base));
                let raw = candidates[0] || '';
                const allRosterNames = Array.isArray(rosterNames) ? rosterNames : [];
                let matched = raw ? bestMatchName(raw, allRosterNames) : '';
                if (!raw && !matched && allRosterNames.length > 0) {
                    matched = bestMatchName(base, allRosterNames);
                    if (matched) raw = matched;
                }

                const classes = Array.isArray(classCandidates) ? classCandidates.filter(Boolean).map(c => String(c)) : [];
                const baseNoSpace = normalizeName(base);
                let matchedClass = '';
                const byLength = classes.slice().sort((a, b) => String(b).length - String(a).length);
                for (const cls of byLength) {
                    const c0 = normalizeName(cls);
                    if (c0 && baseNoSpace.includes(c0)) { matchedClass = cls; break; }
                    const short = c0.replace(/班$/, '');
                    if (short && baseNoSpace.includes(short)) { matchedClass = cls; break; }
                }
                return { rawName: raw, matchedName: matched, matchedClass };
            };

            const createId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

            const getClassCandidatesForInference = () => {
                const list = getActiveClassesList();
                return list.map(c => (c && c.name) ? String(c.name) : '').filter(Boolean);
            };

            const formatDateTime = (d) => {
                const dt = (d instanceof Date) ? d : new Date(d);
                const pad = (n) => String(n).padStart(2, '0');
                return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
            };

            const inferTopicTitleFromTopicText = (topicText) => {
                const s = (topicText || '').toString().replace(/\r\n/g, '\n').trim();
                if (!s) return '';
                const firstLine = (s.split('\n').map(x => String(x || '').trim()).filter(Boolean)[0] || '').trim();
                const cleaned = firstLine
                    .replace(/^\s*(题目|写作题目|作文题目|题干|要求|Task|Topic|Title)\s*[:：\-]\s*/i, '')
                    .replace(/^\s*【.*?】\s*/g, '')
                    .trim();
                const title = cleaned || firstLine;
                return title.length > 80 ? `${title.slice(0, 80).trim()}…` : title;
            };

            const handlePromptImageUpload = async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const base64 = await convertFileToBase64(file);
                setAssignment(p => ({
                    ...p,
                    promptImageBase64: base64,
                    promptImageName: file.name || '',
                    isExtractingText: false,
                    isGeneratingAnalysis: false
                }));
            };

            const extractPromptTextFromImage = async () => {
                if (!assignment.promptImageBase64) return alert('请先上传题目图片');
                setAssignment(p => ({ ...p, isExtractingText: true }));
                const result = await callAI([
                    { role: "system", content: EXTRACT_PROMPT_TEXT_SYSTEM() },
                    { role: "user", content: [{ type: "image_url", image_url: { url: assignment.promptImageBase64 } }] }
                ], true, {purpose:'ocr'});
                if (result) {
                    setAssignment(p => ({
                        ...p,
                        title: (() => {
                            const t0 = (result && result.title) ? String(result.title).trim() : '';
                            const topic0 = (result && result.topic) ? String(result.topic) : '';
                            const inferred = inferTopicTitleFromTopicText(topic0);
                            return (t0 || inferred || p.title || '').toString();
                        })(),
                        topic: (result && result.topic ? String(result.topic) : '').toString(),
                        analysis: '',
                        modelEssay: '',
                        isExtractingText: false
                    }));
                } else {
                    setAssignment(p => ({ ...p, isExtractingText: false }));
                }
            };

            const generateTopicAnalysis = async () => {
                const topicText = (assignment.topic || '').toString().trim();
                if (!topicText) return alert('请先在“题目文字稿”中确认或补全题目内容');
                setAssignment(p => ({ ...p, isGeneratingAnalysis: true }));
                const result = await callAI([
                    { role: "system", content: ANALYZE_TOPIC_TEXT_SYSTEM(rubric) },
                    { role: "user", content: topicText }
                ]);
                if (result) {
                    setAssignment(p => ({
                        ...p,
                        title: (() => {
                            const t0 = (result && result.title) ? String(result.title).trim() : '';
                            const inferred = inferTopicTitleFromTopicText(p.topic || '');
                            return (t0 || inferred || p.title || '').toString();
                        })(),
                        analysis: (result.analysis || '').toString(),
                        modelEssay: '',
                        isGeneratingAnalysis: false
                    }));
                } else {
                    setAssignment(p => ({ ...p, isGeneratingAnalysis: false }));
                }
            };

            const generateModelEssay = async () => {
                if(!assignment.topic) return alert("请先输入题目要求文字稿");
                setAssignment(p => ({ ...p, isGeneratingModel: true }));

                const difficultyLabel = (rubric.modelDifficulty || '').toString();
                const difficultyKey = difficultyLabel.includes('简单') ? 'simple' : (difficultyLabel.includes('进阶') ? 'advanced' : 'standard');
                const difficultyRequirement = (() => {
                    if (difficultyKey === 'simple') {
                        return [
                            '- 用词：基础词汇为主，尽量不使用生僻词。',
                            '- 句式：以简单句为主，少量并列句（and/but/so）。',
                            '- 语法：清晰正确，避免复杂从句。',
                            '- 衔接：使用 3-6 个基础连接词（First/Then/Finally/Because/But/So）。'
                        ].join('\n');
                    }
                    if (difficultyKey === 'advanced') {
                        return [
                            '- 用词：较丰富但自然，不堆砌生僻词。',
                            '- 句式：至少 2 句包含从句/非谓语/定语从句等较复杂结构。',
                            '- 衔接：使用多样连接与指代（However/Therefore/In addition/For example/As a result）。',
                            '- 表达：有观点、有例子、有总结，逻辑更强。'
                        ].join('\n');
                    }
                    return [
                        '- 用词：符合课标常用词汇，表达清晰。',
                        '- 句式：简单句+少量复合句混合，句型有变化。',
                        '- 衔接：使用常见连接词与过渡（First/Next/Finally/However/Because）。',
                        '- 内容：围绕要点展开，细节适度。'
                    ].join('\n');
                })();

                const rubricDims = (Array.isArray(rubric && rubric.items) ? rubric.items : []).map(it => `${it.label || ''}:${Number(it.score) || 0}`).filter(s => s && !s.startsWith(':'));
                const systemPrompt = `你是一名英语写作范文生成器。\n请基于“题目文字稿 + 题目要点分析 + 难度设置（以及可选的评分标准）”生成一篇优秀英语范文。\n要求：只输出纯文本（不要输出 JSON，不要输出 Markdown/代码块）。\n\n固定输出格式（必须严格一致）：\nTITLE: <简短英文标题>\nESSAY:\n<英文正文>\n\n格式硬性要求：\n- 英文正文必须分成 3 段或以上。\n- 段落之间必须使用一个空行分隔（即连续两个换行）。\n- 严禁把全文写成一个段落。\n- 每段建议 2-4 句。\n\n生成依据（必须同时参考）：\n- 题目文字稿（Prompt）\n- 题目要点分析（Key Points）\n- 难度设置：${difficultyLabel || '标准'}\n- 字数要求：${rubric.wordCount}\n- 主要时态：${(rubric.tense || []).join(', ')}\n- 评分标准维度（如有）：${rubricDims.length > 0 ? rubricDims.join('；') : '未提供'}\n\n内容硬性要求：\n- 必须覆盖题目要求中的所有写作要点，并与“题目要点分析”一致。\n- 若评分标准包含“词数/字数要求”维度，正文必须尽量满足字数范围。\n\n难度层次约束（必须严格遵守本档，不要混用其它档的要求）：\n${difficultyRequirement}\n\n禁止事项：\n- 不要在正文里使用英文引号（例如 \"...\" 或 '...'）。\n- 正文不要出现 “TITLE:” 或 “ESSAY:” 之外的额外标签行。\n`;

                const parseModelEssayText = (raw) => {
                    const text = (raw || '').toString().replace(/\r\n/g, '\n').trim();
                    const titleMatch = text.match(/^\s*TITLE\s*:\s*(.+)\s*$/im);
                    const essayMatch = text.match(/^\s*ESSAY\s*:\s*\n([\s\S]*)$/im);
                    const title = titleMatch ? String(titleMatch[1]).trim() : '';
                    const modelEssay = essayMatch ? String(essayMatch[1]).trim() : text;
                    return { title, modelEssay };
                };

                const normalizeModelEssayParagraphs = (rawEssay) => {
                    const s = (rawEssay || '').toString().replace(/\r\n/g, '\n').trim();
                    if (!s) return '';
                    const paras = s.split(/\n\s*\n+/g).map(t => t.trim()).filter(Boolean);
                    if (paras.length >= 3) return paras.join('\n\n');

                    const one = s.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
                    if (!one) return s;
                    const sentenceMatches = one.match(/[^.!?]+[.!?]+|[^.!?]+$/g);
                    const sentences = (sentenceMatches || []).map(t => t.trim()).filter(Boolean);

                    const splitByWords = (text, parts) => {
                        const words = (text || '').split(/\s+/g).filter(Boolean);
                        if (words.length === 0) return Array(parts).fill('').map(() => '').filter(Boolean);
                        const size = Math.max(1, Math.ceil(words.length / parts));
                        const out = [];
                        for (let i = 0; i < parts; i++) {
                            const chunk = words.slice(i * size, (i + 1) * size).join(' ').trim();
                            if (chunk) out.push(chunk);
                        }
                        return out;
                    };

                    const ensureAtLeastThree = (groups) => {
                        const g = (groups || []).map(x => (x || '').toString().trim()).filter(Boolean);
                        if (g.length >= 3) return g;
                        while (g.length < 3) {
                            const idx = g.reduce((best, cur, i, arr) => (arr[i].length > arr[best].length ? i : best), 0);
                            const t = g[idx];
                            const m = t.match(/[^.!?]+[.!?]+|[^.!?]+$/g);
                            const ss = (m || []).map(x => x.trim()).filter(Boolean);
                            if (ss.length >= 2) {
                                const mid = Math.max(1, Math.floor(ss.length / 2));
                                const a = ss.slice(0, mid).join(' ').trim();
                                const b = ss.slice(mid).join(' ').trim();
                                g.splice(idx, 1, a, b);
                                continue;
                            }
                            const byWords = splitByWords(t, 2);
                            if (byWords.length >= 2) {
                                g.splice(idx, 1, ...byWords);
                                continue;
                            }
                            break;
                        }
                        return g.slice(0, 3);
                    };

                    if (sentences.length >= 3) {
                        const introCount = Math.min(2, Math.max(1, Math.floor(sentences.length * 0.3)));
                        const conclCount = Math.min(2, Math.max(1, Math.floor(sentences.length * 0.25)));
                        const intro = sentences.slice(0, introCount);
                        const concl = sentences.slice(Math.max(introCount, sentences.length - conclCount));
                        const mid = sentences.slice(introCount, Math.max(introCount, sentences.length - conclCount));
                        const groups = [intro, mid, concl].filter(arr => Array.isArray(arr) && arr.length > 0).map(arr => arr.join(' '));
                        return ensureAtLeastThree(groups).join('\n\n');
                    }

                    return ensureAtLeastThree(splitByWords(one, 3)).join('\n\n');
                };

                const messages = [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: `题目文字稿（Prompt）：\n${assignment.topic}\n\n题目要点分析（Key Points）：\n${assignment.analysis || ''}\n\n难度设置：${difficultyLabel || '标准'}\n字数：${rubric.wordCount}\n时态：${(rubric.tense || []).join(', ')}` }
                ];

                const content = await callAI(messages, false);
                if (content) {
                    const parsed = parseModelEssayText(content);
                    setAssignment(p => ({
                        ...p,
                        modelEssay: normalizeModelEssayParagraphs(parsed.modelEssay) || p.modelEssay,
                        isGeneratingModel: false
                    }));
                } else {
                    setAssignment(p => ({ ...p, isGeneratingModel: false }));
                }
            };

            const repairOptimizedEssayIfNeeded = async (result, base64Url) => {
                const ref = (result && result.standard_reference) ? result.standard_reference : assignment.modelEssay;
                const opt = result && result.optimized_essay;
                if (!isOptimizedTooSimilarToReference(opt, ref)) return result;

                const gradeLevel = (result && result.class_id) ? ((getClassById(result.class_id) || {}).gradeLevel) : '';
                const repaired = await callAI([
                    { role: 'system', content: OPTIMIZED_REPAIR_PROMPT_TEMPLATE(assignment, rubric, gradeLevel || rubric.gradeLevel, languageDifficulty) },
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: `standard_reference:\n${ref}` },
                            { type: 'image_url', image_url: { url: base64Url } }
                        ]
                    }
                ], true);
                if (!repaired || typeof repaired !== 'object') return result;

                const next = { ...result };
                if (typeof repaired.original_essay === 'string') next.original_essay = repaired.original_essay;
                if (typeof repaired.optimized_essay === 'string') next.optimized_essay = repaired.optimized_essay;

                const wc = countEnglishWords(next.original_essay);
                if (wc > 0) next.word_count = wc;
                else if (Number.isFinite(Number(repaired.word_count))) next.word_count = Math.max(0, Math.floor(Number(repaired.word_count)));

                return next;
            };

            const simplifyResultEnglishToGrade = async (result, gradeLevel, languageDifficulty) => {
                const gradeText = (gradeLevel || rubric.gradeLevel || '').toString().trim();
                const profile = resolveEffectiveDifficultyProfile(gradeText, languageDifficulty);
                const system = [
                    '你是一个英语难度控制器与改写器。',
                    `目标：把用户提供的 JSON 批改结果中的所有英文表达改写为适合 ${gradeText} 学生理解的难度，且不超过难度系数 ${profile.coefficient}。`,
                    '必须保持 JSON 结构与字段名不变，分数与数值字段不变，中文字段保持中文。',
                    '硬性规则：',
                    '- errors[].orig 必须原样保留，不要改写。',
                    '- errors[].corr 必须用更简单的英文表达同一意思，尽量短句，避免复杂从句。',
                    '- optimized_essay 必须保持至少 3 段（用双换行分段），但用更简单的词汇与句式。',
                    '- content_logic 中的英文示例必须更简单，连接词优先使用 First/Then/Next/Finally/Because/But/So/Also。',
                    '- 避免使用高阶词：moreover/furthermore/nevertheless/consequently/notwithstanding 等。',
                    '只输出严格 JSON 对象，不要输出任何解释、Markdown 或代码块标记。'
                ].join('\n');
                const repaired = await callAI([
                    { role: 'system', content: system },
                    { role: 'user', content: JSON.stringify(result || {}) }
                ], true);
                if (!repaired || typeof repaired !== 'object') return result;
                return { ...(result || {}), ...repaired };
            };

            const attachIdentityWithStudentSystem = (result, fileItem) => {
                const next = { ...(result || {}) };
                if(fileItem?.cloudBoundRef && next.bound_identity?.taskId===fileItem.cloudBoundRef.taskId && next.bound_identity?.inputHash===fileItem.cloudBoundRef.inputHash)return next;

                const inferredName = (fileItem && fileItem.inferredStudentName) ? String(fileItem.inferredStudentName) : '';
                const inferredRawName = (fileItem && fileItem.inferredStudentRawName) ? String(fileItem.inferredStudentRawName) : '';
                const inferredClass = (fileItem && fileItem.inferredClassName) ? String(fileItem.inferredClassName) : '';

                const candidates = getClassCandidatesForInference();
                const aiClassRaw = isEmptyIdentity(next.class_name) ? '' : String(next.class_name);
                const aiNameRaw = isEmptyIdentity(next.student_name) ? '' : String(next.student_name);
                const aiNoRaw = (next.student_no === undefined || next.student_no === null) ? '' : String(next.student_no);
                const parsedNo = parseStudentNoWithSuffix(aiNoRaw);
                const scannedStudentNo = parsedNo && parsedNo.studentNo ? String(parsedNo.studentNo).trim() : '';
                const scannedSuffix = parsedNo && parsedNo.suffix ? String(parsedNo.suffix).trim() : '';
                if (scannedStudentNo) {
                    next.student_no = scannedStudentNo;
                    next.student_no_suffix = scannedSuffix;
                    next.student_no_raw = aiNoRaw;
                }
                const nameCandidate = aiNameRaw || inferredName || inferredRawName;

                const classFromAi = aiClassRaw ? (pickCanonicalClass(aiClassRaw, candidates) || '') : '';
                const classFromInferred = inferredClass ? (pickCanonicalClass(inferredClass, candidates) || inferredClass) : '';

                let best = { className: '', studentName: '', score: 1 };
                let second = { className: '', studentName: '', score: 1 };
                if (nameCandidate && candidates.length > 0) {
                    for (const clsName of candidates) {
                        const clsObj = (Array.isArray(classes) ? classes : []).find(c => c && pickCanonicalClass(clsName, [String(c.name)]) === String(c.name)) || (Array.isArray(classes) ? classes : []).find(c => c && String(c.name) === String(clsName));
                        if (!clsObj) continue;
                        const rosterNames = (clsObj.students || []).map(s => (s && s.name) ? String(s.name).trim() : '').filter(Boolean);
                        if (rosterNames.length === 0) continue;
                        const m = bestMatchNameWithScore(nameCandidate, rosterNames);
                        if (!m.name) continue;
                        const cand = { className: clsObj.name, studentName: m.name, score: m.score };
                        if (cand.score < best.score) {
                            second = best;
                            best = cand;
                        } else if (cand.score < second.score) {
                            second = cand;
                        }
                    }
                }

                const isStrong = best.className && best.studentName && best.score <= 0.25 && (second.score - best.score >= 0.08);
                const isWeakButUnique = best.className && best.studentName && best.score <= 0.34 && (second.score - best.score >= 0.12);

                let finalClassName = classFromAi || '';
                if (isStrong || isWeakButUnique) finalClassName = best.className;
                if (!finalClassName) finalClassName = classFromInferred;
                if (!finalClassName && aiClassRaw) finalClassName = aiClassRaw;
                if (!finalClassName) finalClassName = getClassNameById(currentClassId) || '';
                if (finalClassName) next.class_name = finalClassName;

                let finalStudentName = aiNameRaw || '';
                if (!finalStudentName) finalStudentName = inferredName || inferredRawName;

                const canonicalClass = pickCanonicalClass(finalClassName, candidates) || finalClassName;
                let classObj = (Array.isArray(classes) ? classes : []).find(c => c && pickCanonicalClass(canonicalClass, [String(c.name)]) === String(c.name)) || (Array.isArray(classes) ? classes : []).find(c => c && String(c.name) === String(canonicalClass)) || null;

                const normalizeNo = (v) => {
                    const s = (v === undefined || v === null) ? '' : String(v).trim();
                    if (!s) return '';
                    const m = s.match(/\d{1,4}/);
                    return m ? String(m[0]) : '';
                };
                const findStudentByNoInClass = (clsObj, noStr) => {
                    if (!clsObj || !noStr) return null;
                    const students = Array.isArray(clsObj.students) ? clsObj.students : [];
                    const hit = uniqueStudent(students,s => normalizeNo(s && s.no) === normalizeNo(noStr));
                    return hit ? { classObj: clsObj, studentObj: hit } : null;
                };
                const findUniqueStudentByNoAcrossClasses = (noStr) => {
                    if (!noStr) return null;
                    const list = Array.isArray(classes) ? classes : [];
                    const hits = [];
                    for (const c of list) {
                        const students=Array.isArray(c?.students)?c.students:[];
                        for(const studentObj of students){
                            if(normalizeNo(studentObj?.no)===normalizeNo(noStr))hits.push({classObj:c,studentObj});
                            if(hits.length>1)return null;
                        }
                    }
                    return hits.length === 1 ? hits[0] : null;
                };

                if (!classObj && scannedStudentNo) {
                    const matchedByNo = findUniqueStudentByNoAcrossClasses(scannedStudentNo);
                    if (matchedByNo && matchedByNo.studentObj && matchedByNo.classObj) {
                        const rosterName = String(matchedByNo.studentObj.name || '').trim();
                        const rosterNo = normalizeNo(matchedByNo.studentObj.no);
                        if (rosterNo) next.student_no = rosterNo;
                        next.student_id = String(matchedByNo.studentObj.id);
                        next.class_id = String(matchedByNo.classObj.id);
                        next.class_name = String(matchedByNo.classObj.name || '').trim();
                        if (aiNameRaw && rosterName && normalizeName(aiNameRaw) !== normalizeName(rosterName)) {
                            next.identity_name_mismatch = true;
                            next.identity_name_from_ai = aiNameRaw;
                            next.identity_name_from_no = rosterName;
                            next.identity_name_mismatch_verified = false;
                        } else {
                            next.identity_name_mismatch = false;
                            next.identity_name_mismatch_verified = true;
                        }
                        if (rosterName) next.student_name = rosterName;
                        next.identity_status = 'matched';
                        next.identity_score = 0;
                        next.identity_method = 'no';
                        return next;
                    }
                }

                if (classObj) {
                    next.class_id = String(classObj.id);
                    const rosterNames = (classObj.students || []).map(s => (s && s.name) ? String(s.name).trim() : '').filter(Boolean);
                    if (rosterNames.length > 0 && finalStudentName) {
                        const m = bestMatchNameWithScore(finalStudentName, rosterNames);
                        if (m.name && m.score <= 0.34) finalStudentName = m.name;
                    }
                    let matchedByNo = scannedStudentNo ? findStudentByNoInClass(classObj, scannedStudentNo) : null;
                    if (!matchedByNo && scannedStudentNo) matchedByNo = findUniqueStudentByNoAcrossClasses(scannedStudentNo);
                    if (matchedByNo && matchedByNo.studentObj) {
                        const rosterName = String(matchedByNo.studentObj.name || '').trim();
                        const rosterNo = normalizeNo(matchedByNo.studentObj.no);
                        if (rosterNo) next.student_no = rosterNo;
                        next.student_id = String(matchedByNo.studentObj.id);
                        if (matchedByNo.classObj && matchedByNo.classObj.id && String(matchedByNo.classObj.id) !== String(classObj.id)) {
                            next.class_id = String(matchedByNo.classObj.id);
                            next.class_name = String(matchedByNo.classObj.name || '').trim();
                        }
                        if (aiNameRaw && rosterName && normalizeName(aiNameRaw) !== normalizeName(rosterName)) {
                            next.identity_name_mismatch = true;
                            next.identity_name_from_ai = aiNameRaw;
                            next.identity_name_from_no = rosterName;
                            next.identity_name_mismatch_verified = false;
                        } else {
                            next.identity_name_mismatch = false;
                            next.identity_name_mismatch_verified = true;
                        }
                        finalStudentName = rosterName || finalStudentName;
                        if (rosterName) next.student_name = rosterName;
                        next.identity_status = 'matched';
                        next.identity_score = 0;
                        next.identity_method = 'no';
                    } else {
                        const nameMatches=(classObj.students || []).filter(s => s && normalizeName(s.name) === normalizeName(finalStudentName));
                        if(nameMatches.length>1){
                            next.student_id='';next.student_name=finalStudentName;next.identity_status='ambiguous';next.identity_method='name';
                            next.identity_candidates=nameMatches.map(s=>({class_name:classObj.name,student_name:s.name,student_id:s.id,short_id:String(s.authority?.subject||s.id).slice(-8),score:0}));
                            return next;
                        }
                        const studentObj = nameMatches[0] || null;
                        if (studentObj) {
                            next.student_id = String(studentObj.id);
                            const no = (studentObj && studentObj.no !== undefined && studentObj.no !== null) ? String(studentObj.no).trim() : '';
                            if (no) next.student_no = no;
                        }
                    }
                }

                if (finalStudentName && !isEmptyIdentity(finalStudentName)) {
                    next.student_name = finalStudentName;
                }

                if (next.identity_method === 'no') {
                    return next;
                }

                if (best.className && best.studentName && (isStrong || isWeakButUnique) && classObj && normalizeName(best.studentName) === normalizeName(finalStudentName)) {
                    next.identity_status = 'matched';
                    next.identity_score = Number(best.score);
                } else if (best.className && best.studentName && best.score <= 0.34) {
                    next.identity_status = 'ambiguous';
                    next.identity_score = Number(best.score);
                    next.identity_candidates = [
                        { class_name: best.className, student_name: best.studentName, score: best.score },
                        ...(second.className && second.studentName ? [{ class_name: second.className, student_name: second.studentName, score: second.score }] : [])
                    ];
                } else {
                    next.identity_status = 'unmatched';
                    next.identity_score = 1;
                }

                return next;
            };

            const ensureArchivedToStudentProfile = (fileItem, result) => {
                const r = result && typeof result === 'object' ? result : {};
                const studentId = (r.student_id || '').toString();
                const classId = (r.class_id || '').toString();
                if (!studentId || !classId) return r;
                const archiveId = (r.archive_id || '').toString() || createId();
                const classObj = getClassById(classId);
                const studentObj = classObj && Array.isArray(classObj.students) ? classObj.students.find(s => s && String(s.id) === studentId) : null;
                const studentName = studentObj ? String(studentObj.name || '').trim() : (r.student_name || '');
                const className = classObj ? String(classObj.name || '').trim() : (r.class_name || '');
                const gradeLevel = (classObj && classObj.gradeLevel) ? String(classObj.gradeLevel) : (rubric.gradeLevel || '');
                const gradedAt = (r.graded_at || new Date().toISOString()).toString();
                const totalScore = (r.total_score ?? r.totalScore ?? null);
                const record = {
                    id: archiveId,
                    fileId: (fileItem && fileItem.id) ? String(fileItem.id) : '',
                    fileName: (fileItem && fileItem.name) ? String(fileItem.name) : '',
                    assignmentTitle: (assignment && assignment.title) ? String(assignment.title) : '',
                    rubricTotal: (rubric && rubric.total) ? Number(rubric.total) : null,
                    gradedAt,
                    totalScore: (totalScore === undefined || totalScore === null) ? null : Number(totalScore),
                    result: r
                };
                setStudentProfiles(prev => {
                    const next = { ...(prev || {}) };
                    const existing = next[studentId] && typeof next[studentId] === 'object' ? next[studentId] : null;
                    const baseRecords = existing && Array.isArray(existing.records) ? existing.records : [];
                    const replaced = baseRecords.some(x => x && x.id === archiveId);
                    const records = replaced ? baseRecords.map(x => (x && x.id === archiveId ? record : x)) : [record, ...baseRecords];
                    next[studentId] = {
                        studentId,
                        studentName,
                        classId,
                        className,
                        gradeLevel,
                        records: records.slice(0, 200)
                    };
                    return next;
                });
                return { ...r, archive_id: archiveId };
            };

            const upsertArchivedRecordForEditedResult = (fileItem, prevResult, nextResult) => {
                const prev = prevResult && typeof prevResult === 'object' ? prevResult : {};
                const r0 = nextResult && typeof nextResult === 'object' ? nextResult : {};
                const oldStudentId = (prev.student_id || '').toString();
                const studentId = (r0.student_id || '').toString();
                const classId = (r0.class_id || '').toString();
                if (!studentId || !classId) {
                    const oldArchiveId=String(prev.archive_id||'');
                    if(oldStudentId&&oldArchiveId)setStudentProfiles(previous=>{
                        const profile=previous?.[oldStudentId];
                        if(!profile||!Array.isArray(profile.records))return previous;
                        return {...previous,[oldStudentId]:{...profile,records:profile.records.filter(record=>String(record?.id)!==oldArchiveId)}};
                    });
                    return {...r0,archive_id:''};
                }

                const archiveId = (r0.archive_id || prev.archive_id || '').toString() || createId();
                const r = { ...r0, archive_id: archiveId };

                const classObj = getClassById(classId);
                const studentObj = classObj && Array.isArray(classObj.students) ? classObj.students.find(s => s && String(s.id) === studentId) : null;
                const studentName = studentObj ? String(studentObj.name || '').trim() : (r.student_name || '');
                const className = classObj ? String(classObj.name || '').trim() : (r.class_name || '');
                const gradeLevel = (classObj && classObj.gradeLevel) ? String(classObj.gradeLevel) : (rubric.gradeLevel || '');
                const gradedAt = (r.graded_at || new Date().toISOString()).toString();
                const totalScore = (r.total_score ?? r.totalScore ?? null);
                const record = {
                    id: archiveId,
                    fileId: (fileItem && fileItem.id) ? String(fileItem.id) : '',
                    fileName: (fileItem && fileItem.name) ? String(fileItem.name) : '',
                    assignmentTitle: (assignment && assignment.title) ? String(assignment.title) : '',
                    rubricTotal: (rubric && rubric.total) ? Number(rubric.total) : null,
                    gradedAt,
                    totalScore: (totalScore === undefined || totalScore === null) ? null : Number(totalScore),
                    result: r
                };

                setStudentProfiles(prevProfiles => {
                    const base = prevProfiles && typeof prevProfiles === 'object' ? prevProfiles : {};
                    const nextProfiles = { ...base };

                    if (oldStudentId && oldStudentId !== studentId) {
                        const oldProfile = nextProfiles[oldStudentId];
                        if (oldProfile && Array.isArray(oldProfile.records)) {
                            nextProfiles[oldStudentId] = {
                                ...oldProfile,
                                records: oldProfile.records.filter(x => String(x && x.id) !== String(archiveId))
                            };
                        }
                    }

                    const existing = nextProfiles[studentId] && typeof nextProfiles[studentId] === 'object' ? nextProfiles[studentId] : null;
                    const baseRecords = existing && Array.isArray(existing.records) ? existing.records : [];
                    const replaced = baseRecords.some(x => x && String(x.id) === String(archiveId));
                    const records = replaced ? baseRecords.map(x => (x && String(x.id) === String(archiveId) ? record : x)) : [record, ...baseRecords];
                    nextProfiles[studentId] = {
                        studentId,
                        studentName,
                        classId,
                        className,
                        gradeLevel,
                        records: records.slice(0, 200)
                    };

                    return nextProfiles;
                });

                return r;
            };

            const handleStudentUpload = (e) => {
                const picked = Array.from(e.target.files || []);
                e.target.value = '';
                if (picked.length === 0) return;
                const rosterNames = getRosterNamesForInference();
                const classCandidates = getClassCandidatesForInference();
                const newFiles = picked.map((f, i) => {
                    const inferred = inferStudentFromFilename(f.name, rosterNames, classCandidates);
                    const inferredStudentName = inferred.matchedName || inferred.rawName || '';
                    const inferredClassName = inferred.matchedClass || (classCandidates[0] || getClassNameById(currentClassId) || '');
                    const inferredClassObj = inferredClassName ? (Array.isArray(classes) ? classes : []).find(c => c && pickCanonicalClass(inferredClassName, [String(c.name)]) === String(c.name)) || (Array.isArray(classes) ? classes : []).find(c => c && String(c.name) === String(inferredClassName)) : null;
                    const inferredClassId = inferredClassObj ? String(inferredClassObj.id) : '';
                    return {
                        id: Math.random().toString(36).substr(2, 9),
                        file: f,
                        url: URL.createObjectURL(f),
                        name: f.name,
                        status: 'idle',
                        index: files.length + i + 1,
                        inferredStudentRawName: inferred.rawName || '',
                        inferredStudentName,
                        inferredClassName,
                        inferredClassId,
                        result: null
                    };
                });
                setFiles(prev => [...prev, ...newFiles]);
                if (!selectedFileId && newFiles.length > 0) setSelectedFileId(newFiles[0].id);
            };

            const resolveTargetClassIdForFile = (fileItem) => {
                const inferred = (fileItem && fileItem.inferredClassId) ? String(fileItem.inferredClassId) : '';
                if (inferred) return inferred;
                if (currentClassId) return String(currentClassId);
                const act = Array.isArray(activeClassIds) ? activeClassIds.filter(Boolean).map(String) : [];
                if (act.length === 1) return act[0];
                const list = getActiveClassesList();
                if (list.length > 0) return String(list[0].id);
                const all = Array.isArray(classes) ? classes : [];
                if (all.length > 0) return String(all[0].id);
                return '';
            };

            const handleFileClick = async (fileItem) => {
                const isSameSelection = selectedFileId === fileItem.id;
                setSelectedFileId(fileItem.id);
                if (!isSameSelection) return;
                if (fileItem.cloudBoundRef) return;
                if (isBatchProcessing) return;
                if (fileItem.status !== 'success' && fileItem.status !== 'error') return;
                if (!confirm('该作文已批改，是否重新批改？')) return;

                setIsBatchProcessing(true);
                setIsPaused(false);
                isPausedRef.current = false;
                setFiles(prev => prev.map(f => f.id === fileItem.id ? { ...f, status: 'loading' } : f));

                let base64Url = "";
                try {
                    base64Url = await readStudentImage(fileItem);
                } catch (err) {
                    setFiles(prev => prev.map(f => f.id === fileItem.id ? { ...f, status: 'error' } : f));
                    setIsBatchProcessing(false);
                    alert('重新批改失败：图片读取出错');
                    return;
                }

                if (!base64Url.startsWith('data:') && !(cloud.mode === 'cloud' && /^wa-asset:[a-f0-9-]{36}$/.test(base64Url))) {
                    setFiles(prev => prev.map(f => f.id === fileItem.id ? { ...f, status: 'error' } : f));
                    setIsBatchProcessing(false);
                    alert('重新批改失败：图片数据无效');
                    return;
                }

                const targetClassId = resolveTargetClassIdForFile(fileItem);
                const targetClassName = getClassNameById(targetClassId) || (fileItem.inferredClassName || '');
                const targetGradeLevel = (getClassById(targetClassId) && getClassById(targetClassId).gradeLevel) ? getClassById(targetClassId).gradeLevel : rubric.gradeLevel;

                const result = await callAI([
                    { role: "system", content: SYSTEM_PROMPT_TEMPLATE(assignment, rubric, `Current Class: ${targetClassName}\nRoster:\n${getRosterTextForClassId(targetClassId)}`, targetGradeLevel, languageDifficulty) },
                    { role: "user", content: [{ type: "text", text: `标准范文：${assignment.modelEssay}` }, { type: "image_url", image_url: { url: base64Url } }] }
                ], true, {cloudFileId:fileItem.id});

                if (result) {
                    if (!result.standard_reference) result.standard_reference = assignment.modelEssay;
                    result.original_image_url = fileItem.url || result.original_image_url || '';
                    let repaired = await repairOptimizedEssayIfNeeded(result, base64Url);
                    repaired = attachIdentityWithStudentSystem(repaired, fileItem);
                    repaired.graded_at = new Date().toISOString();
                    let merged = normalizeBreakdownAgainstRubric(repaired, rubric);
                    merged = ensureArchivedToStudentProfile(fileItem, merged);

                    if (languageDifficulty && languageDifficulty.enabled !== false) {
                        if (languageDifficulty.autoRewrite !== false) {
                            for (let pass = 0; pass < 2; pass++) {
                                const check = validateDifficultyForGrade(merged, targetGradeLevel, languageDifficulty);
                                if (check.ok) break;
                                merged = await simplifyResultEnglishToGrade(merged, targetGradeLevel, languageDifficulty);
                                merged = normalizeBreakdownAgainstRubric(merged, rubric);
                                merged = ensureArchivedToStudentProfile(fileItem, merged);
                            }
                        } else {
                            const check = validateDifficultyForGrade(merged, targetGradeLevel, languageDifficulty);
                            if (!check.ok) {
                                merged.difficulty_status = 'exceeded';
                                merged.difficulty_reasons = check.reasons;
                            } else {
                                merged.difficulty_status = 'ok';
                            }
                        }
                    }

                    setFiles(prev => prev.map(f => f.id === fileItem.id ? { ...f, status: 'success', result: merged } : f));
                } else {
                    setFiles(prev => prev.map(f => f.id === fileItem.id ? { ...f, status: 'error' } : f));
                }

                setIsBatchProcessing(false);
            };

            const startBatchGrading = async () => {
                if (files.length === 0) return;
                setIsBatchProcessing(true);
                setIsPaused(false);
                isPausedRef.current = false;
                setPauseBanner('');
                setPauseRequested(false);
                pauseRequestedRef.current = false;
                const pending = files.filter(f => f.status === 'idle' && !f.cloudBoundRef);
                let completedAll = true;
                for (let i = 0; i < pending.length; i++) {
                    if (pauseRequestedRef.current) {
                        setIsPaused(true);
                        completedAll = false;
                        setPauseBanner('已暂停：点击“继续批改”可从中断处继续。');
                        setPauseRequested(false);
                        pauseRequestedRef.current = false;
                        break;
                    }
                    const fileItem = pending[i];
                    setFiles(prev => prev.map(f => f.id === fileItem.id ? { ...f, status: 'loading' } : f));
                    let base64Url = "";
                    try { base64Url = await readStudentImage(fileItem); } catch (err) {
                        setFiles(prev => prev.map(f => f.id === fileItem.id ? { ...f, status: 'error' } : f));
                        continue;
                    }
                    
                    await new Promise(r => setTimeout(r, 1000));
                    
                    if (!base64Url.startsWith('data:') && !(cloud.mode === 'cloud' && /^wa-asset:[a-f0-9-]{36}$/.test(base64Url))) {
                         setFiles(prev => prev.map(f => f.id === fileItem.id ? { ...f, status: 'error' } : f));
                         continue;
                    }

                    const targetClassId = resolveTargetClassIdForFile(fileItem);
                    const targetClassName = getClassNameById(targetClassId) || (fileItem.inferredClassName || '');
                    const targetGradeLevel = (getClassById(targetClassId) && getClassById(targetClassId).gradeLevel) ? getClassById(targetClassId).gradeLevel : rubric.gradeLevel;

                    const ai = await callAI([
                        { role: "system", content: SYSTEM_PROMPT_TEMPLATE(assignment, rubric, `Current Class: ${targetClassName}\nRoster:\n${getRosterTextForClassId(targetClassId)}`, targetGradeLevel, languageDifficulty) },
                        { role: "user", content: [{ type: "text", text: `标准范文：${assignment.modelEssay}` }, { type: "image_url", image_url: { url: base64Url } }] }
                    ], true, { returnMeta: true, silent: true, cloudFileId:fileItem.id });
                    if (ai && ai.ok && ai.data) {
                        const result = ai.data;
                        if (!result.standard_reference) result.standard_reference = assignment.modelEssay;
                        result.original_image_url = fileItem.url || result.original_image_url || '';
                        let repaired = await repairOptimizedEssayIfNeeded(result, base64Url);
                        repaired = attachIdentityWithStudentSystem(repaired, fileItem);
                        repaired.graded_at = new Date().toISOString();
                        let merged = normalizeBreakdownAgainstRubric(repaired, rubric);
                        merged = ensureArchivedToStudentProfile(fileItem, merged);

                        if (languageDifficulty && languageDifficulty.enabled !== false) {
                            if (languageDifficulty.autoRewrite !== false) {
                                for (let pass = 0; pass < 2; pass++) {
                                    const check = validateDifficultyForGrade(merged, targetGradeLevel, languageDifficulty);
                                    if (check.ok) break;
                                    merged = await simplifyResultEnglishToGrade(merged, targetGradeLevel, languageDifficulty);
                                    merged = normalizeBreakdownAgainstRubric(merged, rubric);
                                    merged = ensureArchivedToStudentProfile(fileItem, merged);
                                }
                            } else {
                                const check = validateDifficultyForGrade(merged, targetGradeLevel, languageDifficulty);
                                if (!check.ok) {
                                    merged.difficulty_status = 'exceeded';
                                    merged.difficulty_reasons = check.reasons;
                                } else {
                                    merged.difficulty_status = 'ok';
                                }
                            }
                        }

                        setFiles(prev => prev.map(f => f.id === fileItem.id ? { ...f, status: 'success', result: merged } : f));
                    } else {
                        const kind = ai && ai.error ? ai.error.kind : 'other';
                        const msg = ai && ai.error ? ai.error.message : 'API Error: Unknown error';
                        if (kind === 'network') {
                            setFiles(prev => prev.map(f => f.id === fileItem.id ? { ...f, status: 'idle' } : f));
                            setPauseBanner('网络连接异常或被浏览器拦截：已自动暂停批改。恢复网络后点击“继续批改”可从中断处继续。');
                        } else {
                            setFiles(prev => prev.map(f => f.id === fileItem.id ? { ...f, status: 'error' } : f));
                            setPauseBanner(msg);
                        }
                        setIsPaused(true);
                        setPauseRequested(false);
                        pauseRequestedRef.current = false;
                        completedAll = false;
                        break;
                    }
                    if (pauseRequestedRef.current) {
                        setIsPaused(true);
                        completedAll = false;
                        setPauseBanner('已暂停：点击“继续批改”可从中断处继续。');
                        setPauseRequested(false);
                        pauseRequestedRef.current = false;
                        break;
                    }
                }
                setIsBatchProcessing(false);
                if (completedAll) {
                    openSaveDialogWithDefaultName();
                }
            };

            const handlePauseBatch = () => {
                if (!isBatchProcessing) return;
                if (pauseRequestedRef.current) return;
                setPauseRequested(true);
                pauseRequestedRef.current = true;
                setPauseBanner('已请求暂停：将于当前批改完成后自动暂停。');
            };

            const handleQuickStart = () => {
                if (files.length === 0 || isBatchProcessing) return;
                if (!files.some(f => f.status === 'idle')) {
                    setStep(2);
                    setMaxStep(prev => Math.max(prev, 2));
                    return;
                }
                if (!String(assignment.topic || '').trim()) return alert('请先填写或识别写作要求。');
                if (!Number.isFinite(Number(rubric.total)) || Number(rubric.total) <= 0) return alert('请设置有效的作文满分。');
                if (cloud.mode === 'cloud' ? !modelReady : !config.apiKey) { setShowConfig(true); return; }
                setStep(2);
                setMaxStep(prev => Math.max(prev, 2));
                void startBatchGrading();
            };

            const openAnalysisGenerateDialog = () => {
                const cls = getClassNameById(currentClassId) || '';
                const list = Array.isArray(savedGradingResults) ? savedGradingResults : [];
                const eligible = list.filter(x => {
                    if (!x) return false;
                    const cid = (x.classId || '').toString();
                    if (currentClassId && cid && String(currentClassId) === cid) return true;
                    const cn = (x.className || '').toString().trim();
                    return cls && cn === cls;
                });
                const currentGradedCount = (Array.isArray(files) ? files : []).filter(f => f && f.status === 'success' && f.result).length;
                const mode = currentGradedCount > 0 ? 'current' : (eligible.length > 0 ? 'history' : 'current');
                setAnalysisGenerateMode(mode);
                setAnalysisGenerateSnapshotId(eligible.length > 0 ? String(eligible[0].id) : '');
                setShowAnalysisGenerateDialog(true);
            };

            const confirmGenerateClassAnalysis = () => {
                const cls = getClassNameById(currentClassId) || '';
                const list = Array.isArray(savedGradingResults) ? savedGradingResults : [];
                const eligible = list.filter(x => {
                    if (!x) return false;
                    const cid = (x.classId || '').toString();
                    if (currentClassId && cid && String(currentClassId) === cid) return true;
                    const cn = (x.className || '').toString().trim();
                    return cls && cn === cls;
                });
                if (analysisGenerateMode === 'history') {
                    const item = eligible.find(x => String(x && x.id) === String(analysisGenerateSnapshotId));
                    if (!item || !item.data || !Array.isArray(item.data.files)) return alert('未找到可用的历史批改记录，请先在“已保存结果”里保存一次批改结果。');
                    setShowAnalysisGenerateDialog(false);
                    generateClassAnalysis({ mode: 'history', snapshot: item });
                    return;
                }
                setShowAnalysisGenerateDialog(false);
                generateClassAnalysis({ mode: 'current' });
            };

            const generateClassAnalysis = async (options) => {
                const mode = options && options.mode ? String(options.mode) : 'current';
                const snapshotItem = options && options.snapshot ? options.snapshot : null;
                const normalizeClassText = (v) => (v === undefined || v === null) ? '' : String(v).trim().replace(/[\s_\-]+/g, '').replace(/[()（）\[\]【】]/g, '');
                const classDigits = (v) => {
                    const t = normalizeClassText(v);
                    const d = (t.match(/\d+/g) || []).join('');
                    return d || '';
                };
                const isSameClass = (a, b) => {
                    const ta = normalizeClassText(a);
                    const tb = normalizeClassText(b);
                    if (!ta || !tb) return false;
                    if (ta === tb) return true;
                    const da = classDigits(ta);
                    const db = classDigits(tb);
                    return Boolean(da && db && da === db);
                };
                const deriveIdentityResult = (fileItem) => {
                    const r0 = fileItem && fileItem.result && typeof fileItem.result === 'object' ? fileItem.result : null;
                    if (!r0) return null;
                    return reconcileIdentityWithRoster(r0, fileItem);
                };

                const cls = getClassNameById(currentClassId) || '未分班级';
                const analysisRubric = (mode === 'history' && snapshotItem && snapshotItem.data && snapshotItem.data.rubric) ? snapshotItem.data.rubric : rubric;
                const analysisAssignment = (mode === 'history' && snapshotItem && snapshotItem.data && snapshotItem.data.assignment) ? snapshotItem.data.assignment : assignment;
                const analysisClasses = (mode === 'history' && snapshotItem && snapshotItem.data && Array.isArray(snapshotItem.data.classes)) ? snapshotItem.data.classes : classes;
                const getClassNameByIdInAnalysis = (id) => {
                    const list = Array.isArray(analysisClasses) ? analysisClasses : [];
                    const c = list.find(x => x && String(x.id) === String(id));
                    return c ? String(c.name || '').trim() : '';
                };

                const extractScoreFromResult = (r) => {
                    const max = Number(analysisRubric && analysisRubric.total);
                    const raw = r && (r.total_score ?? r.totalScore ?? r.score);
                    const n = Number(raw);
                    if (Number.isFinite(n)) return Number.isFinite(max) && max > 0 ? clampNumber(n, 0, max) : n;

                    const s = raw === undefined || raw === null ? '' : String(raw);
                    const m = s.match(/-?\d+(?:\.\d+)?/);
                    if (m) {
                        const v = Number(m[0]);
                        if (Number.isFinite(v)) return Number.isFinite(max) && max > 0 ? clampNumber(v, 0, max) : v;
                    }

                    const breakdown = r && r.breakdown && typeof r.breakdown === 'object' ? r.breakdown : null;
                    if (breakdown) {
                        const sum = Object.values(breakdown).reduce((acc, v0) => {
                            const x = Number(v0);
                            return Number.isFinite(x) ? acc + x : acc;
                        }, 0);
                        if (Number.isFinite(sum) && sum > 0) {
                            const rounded = roundToHalf(sum);
                            return Number.isFinite(max) && max > 0 ? clampNumber(rounded, 0, max) : rounded;
                        }
                    }

                    return null;
                };
                const resolveClassName = (fileItem) => {
                    const inferred = (fileItem && fileItem.inferredClassId) ? (getClassNameById(fileItem.inferredClassId) || getClassNameByIdInAnalysis(fileItem.inferredClassId)) : ((fileItem && fileItem.inferredClassName) ? String(fileItem.inferredClassName).trim() : '');
                    if (inferred) return inferred;
                    const r = deriveIdentityResult(fileItem);
                    const cls = (r && r.class_name) ? String(r.class_name).trim() : '';
                    if (cls) return cls;
                    return getClassNameById(currentClassId) || getClassNameByIdInAnalysis(currentClassId) || '';
                };
                const currentClassText = getClassNameById(currentClassId) || getClassNameByIdInAnalysis(currentClassId) || '';
                const baseFiles = (mode === 'history' && snapshotItem && snapshotItem.data && Array.isArray(snapshotItem.data.files))
                    ? snapshotItem.data.files
                    : (Array.isArray(files) ? files : []);
                let inScopeFiles = currentClassText ? baseFiles.filter(f => isSameClass(resolveClassName(f), currentClassText)) : baseFiles;

                const toGradedItem = (f) => {
                    if (!f || f.status !== 'success') return null;
                    const r = deriveIdentityResult(f);
                    if (!r) return null;
                    const score = extractScoreFromResult(r);
                    if (score === null) return null;
                    return { file: f, result: { ...r, total_score: score } };
                };

                let gradedItems = inScopeFiles.map(toGradedItem).filter(Boolean);
                if (gradedItems.length === 0) {
                    const allGradedItems = baseFiles.map(toGradedItem).filter(Boolean);
                    if (allGradedItems.length > 0) {
                        inScopeFiles = baseFiles;
                        gradedItems = allGradedItems;
                    }
                }
                if (gradedItems.length === 0) return alert("暂无可用于统计的批改数据");
                setIsAnalyzingClass(true);
                const effectiveAnalysisConfig = {
                    focus: analysisConfig.focus === '自定义' ? (String(analysisConfig.focusCustom || '').trim() || '自定义') : analysisConfig.focus,
                    tone: analysisConfig.tone === '自定义' ? (String(analysisConfig.toneCustom || '').trim() || '自定义') : analysisConfig.tone
                };
                const gradedSamples = gradedItems.map(it => {
                    const r = it.result || {};
                    return {
                        score: r.total_score,
                        errors: (r.errors || []).slice(0, 5).map(e => ({ orig: e.orig, corr: e.corr, type: e.type, note: e.note })),
                        highlights: (r.highlights || []).slice(0, 5).map(h => ({
                            text: (h && (h.excerpt ?? h.text)) || '',
                            comment: (h && (h.why_good ?? h.comment)) || '',
                            dimension: (h && (h.dimension || h.dim)) || '',
                            location: (h && (h.location || h.pos)) || ''
                        }))
                    };
                });
                const gradedIdSet = new Set(gradedItems.map(it => it.file && it.file.id).filter(Boolean));
                const missingFiles = inScopeFiles
                    .filter(f => !(f && gradedIdSet.has(f.id)))
                    .map(f => {
                        const r = f && f.result && typeof f.result === 'object' ? f.result : null;
                        const msg = (r && (r.error_message || r.message)) ? String(r.error_message || r.message) : '';
                        return {
                            name: (f && f.name) ? String(f.name) : '',
                            status: (f && f.status) ? String(f.status) : '',
                            reason: msg
                        };
                    });
                const currentDate = new Date().toLocaleDateString();
                const result = await callAI([
                    { role: "system", content: CLASS_ANALYSIS_PROMPT(effectiveAnalysisConfig, analysisAssignment, currentDate) },
                    {
                        role: "user",
                        content: JSON.stringify({
                            className: currentClassText || cls,
                            rubricTotal: analysisRubric.total,
                            uploadedCount: inScopeFiles.length,
                            gradedCount: gradedSamples.length,
                            missingCount: missingFiles.length,
                            missingFiles,
                            gradedSamples
                        })
                    }
                ], true);
                if (result) {
                    setAnalysisData(result);
                    setShowAnalysis(true);
                    const entry = {
                        id: createId(),
                        createdAt: new Date().toISOString(),
                        classId: String(currentClassId || ''),
                        className: currentClassText || cls,
                        examName: (analysisAssignment && analysisAssignment.examName) ? String(analysisAssignment.examName).trim() : '',
                        assignmentTitle: (analysisAssignment && analysisAssignment.title) ? String(analysisAssignment.title).trim() : '',
                        config: { ...effectiveAnalysisConfig },
                        data: result
                    };
                    setAnalysisHistory(prev => {
                        const list = Array.isArray(prev) ? prev : [];
                        const next = [entry, ...list];
                        return next.slice(0, 100);
                    });
                    setAnalysisPreview({ open: true, item: entry });
                }
                setIsAnalyzingClass(false);
            };

            const handlePrint = (mode) => { setPrintMode(mode); setTimeout(() => window.print(), 200); };
            const exportData = () => { 
                const data = { config, assignment, rubric, classes, currentClassId, activeClassIds, languageDifficulty, pdfConfig, studentProfiles, files: files.map(f => ({...f, file: null, url: null})) };
                const blob = new Blob([JSON.stringify(data)], {type: "application/json"});
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url; a.download = `SmartGrader_Backup_${new Date().toISOString().slice(0,10)}.json`;
                a.click();
            }; 
            const importData = (e) => { 
                const file = e.target.files[0];
                if(!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    try {
                        const d = JSON.parse(ev.target.result);
                        if(d.config) setConfig(d.config);
                        if(d.assignment) setAssignment(d.assignment);
                        if (d.rubric) {
                            const loaded = d.rubric;
                            const loadedStrictnessLevelRaw = clampStrictnessLevel(loaded && loaded.strictnessLevel);
                            const loadedStrictnessLevel = loadedStrictnessLevelRaw !== null ? loadedStrictnessLevelRaw : strictnessLevelFromLabel(loaded && loaded.strictness);
                            const loadedStrictnessLabel = (loaded && loaded.strictness) ? String(loaded.strictness) : strictnessLabelFromLevel(loadedStrictnessLevel);
                            const normalizedLoaded = { ...loaded, strictness: loadedStrictnessLabel, strictnessLevel: loadedStrictnessLevel };
                            const loadedTotal = Number(loaded && loaded.total);
                            const loadedItems = Array.isArray(loaded && loaded.items) ? loaded.items : [];
                            if (Number.isFinite(loadedTotal) && loadedItems.length > 0) {
                                setRubric({ ...normalizedLoaded, items: redistributeItemScoresToTotal(loadedItems, loadedTotal) });
                            } else {
                                setRubric(normalizedLoaded);
                            }
                        }
                        if (Array.isArray(d.classes)) setClasses(d.classes);
                        if (d.currentClassId) setCurrentClassId(String(d.currentClassId));
                        if (Array.isArray(d.activeClassIds)) setActiveClassIds(d.activeClassIds);
                        if (d.languageDifficulty && typeof d.languageDifficulty === 'object') setLanguageDifficulty(p => ({ ...p, ...d.languageDifficulty }));
                        if (d.studentProfiles && typeof d.studentProfiles === 'object') setStudentProfiles(d.studentProfiles);
                        if(d.pdfConfig) setPdfConfig(d.pdfConfig);
                        if (Array.isArray(d.files)) {
                            const restored = d.files.map((f, idx) => ({
                                id: (f && f.id) ? f.id : Math.random().toString(36).slice(2, 9),
                                file: null,
                                url: '',
                                name: (f && f.name) ? String(f.name) : `导入文件${idx + 1}`,
                                status: (f && f.status) ? String(f.status) : (f && f.result ? 'success' : 'idle'),
                                index: Number(f && f.index) || (idx + 1),
                                inferredStudentRawName: (f && f.inferredStudentRawName) ? String(f.inferredStudentRawName) : '',
                                inferredStudentName: (f && f.inferredStudentName) ? String(f.inferredStudentName) : '',
                                inferredClassName: (f && f.inferredClassName) ? String(f.inferredClassName) : '',
                                inferredClassId: (f && f.inferredClassId) ? String(f.inferredClassId) : '',
                                result: (f && f.result) ? f.result : null
                            }));
                            setFiles(restored);
                        }
                        alert("数据还原成功！");
                    } catch(err) { alert("文件格式错误"); }
                };
                reader.readAsText(file);
            };
            const addClass = (name) => {
                const n = (name || '').toString().trim();
                if (!n) return;
                setClasses(prev => {
                    const p = Array.isArray(prev) ? prev : [];
                    if (p.some(c => c && String(c.name).trim() === n)) return p;
                    const id = createId();
                    setCurrentClassId(String(id));
                    return [...p, { id, name: n, gradeLevel: rubric.gradeLevel, students: [] }];
                });
            };

            const parseStudentEntries = (rawText) => {
                const text = (rawText || '').toString().replace(/\u00A0/g, ' ');
                const lines = text.split(/\r?\n/g).map(s => s.trim()).filter(Boolean);
                const out = [];
                for (const line of lines) {
                    const tokens = line
                        .split(/[\t,，;；]+/g)
                        .flatMap(p => p.split(/\s+/g))
                        .map(s => s.trim())
                        .filter(Boolean);
                    if (tokens.length === 0) continue;
                    const noToken = tokens.find(t => /^\d{1,4}$/.test(t)) || '';
                    const no = noToken ? Number(noToken) : null;
                    const nameFromTokens = (() => {
                        for (const t of tokens) {
                            const names = extractChineseNames(t);
                            if (names && names.length > 0) return names[0];
                        }
                        return '';
                    })();
                    const name = nameFromTokens || (isChineseName(line) ? (extractChineseNames(line)[0] || '') : '');
                    if (!name) continue;
                    out.push({ name, no: Number.isFinite(no) ? no : null });
                }
                const merged = new Map();
                for (const it of out) {
                    const key = normalizeName(it.name);
                    if (!key) continue;
                    const existing = merged.get(key);
                    if (!existing) merged.set(key, it);
                    else {
                        const nextNo = (existing.no === null || existing.no === undefined) ? it.no : existing.no;
                        merged.set(key, { name: existing.name, no: nextNo });
                    }
                }
                return Array.from(merged.values());
            };

            const parseClassStudentImportText = (rawText) => {
                const text = (rawText || '').toString().replace(/\u00A0/g, ' ');
                const lines = text.split(/\r?\n/g).map(s => s.trim()).filter(Boolean);
                const out = { classes: [], studentsByClass: {} };
                if (lines.length === 0) return out;

                const isHeader = (line) => /班级/.test(line) && /姓名/.test(line);
                const cleaned = lines.filter(l => !isHeader(l));

                for (const line of cleaned) {
                    const tokens = line
                        .split(/[\t,，;；]+/g)
                        .flatMap(p => p.split(/\s+/g))
                        .map(s => s.trim())
                        .filter(Boolean);
                    if (tokens.length < 2) continue;

                    const noToken = tokens.find(t => /^\d{1,4}$/.test(t)) || '';
                    const no = noToken ? Number(noToken) : null;

                    const classToken = tokens.find(t => /班/.test(t) || /\d{2,4}/.test(t)) || '';
                    const cls = (classToken || '').toString().trim();
                    if (!cls) continue;

                    const nameFromTokens = (() => {
                        for (const t of tokens) {
                            const names = extractChineseNames(t);
                            if (names && names.length > 0) return names[0];
                        }
                        return '';
                    })();
                    const name = nameFromTokens || (isChineseName(line) ? (extractChineseNames(line)[0] || '') : '');
                    if (!name) continue;

                    if (!out.studentsByClass[cls]) out.studentsByClass[cls] = [];
                    out.studentsByClass[cls].push({ name, no: Number.isFinite(no) ? no : null });
                }

                out.classes = Object.keys(out.studentsByClass);
                for (const cls of out.classes) {
                    const merged = new Map();
                    for (const it of out.studentsByClass[cls]) {
                        const key = normalizeName(it.name);
                        if (!key) continue;
                        const existing = merged.get(key);
                        if (!existing) merged.set(key, it);
                        else {
                            const nextNo = (existing.no === null || existing.no === undefined) ? it.no : existing.no;
                            merged.set(key, { name: existing.name, no: nextNo });
                        }
                    }
                    out.studentsByClass[cls] = Array.from(merged.values());
                }
                return out;
            };

            const updateStudentInClass = (classId, studentId, patch) => {
                const cid = (classId || '').toString();
                const sid = (studentId || '').toString();
                setClasses(prev => {
                    const list = Array.isArray(prev) ? prev : [];
                    return list.map(c => {
                        if (!c || String(c.id) !== cid) return c;
                        const students = Array.isArray(c.students) ? c.students : [];
                        const nextStudents = students.map(s => (s && String(s.id) === sid ? { ...s, ...(patch || {}) } : s));
                        const sorted = nextStudents.slice().sort((a, b) => {
                            const an = Number(a && a.no);
                            const bn = Number(b && b.no);
                            const aHas = Number.isFinite(an);
                            const bHas = Number.isFinite(bn);
                            if (aHas && bHas) return an - bn;
                            if (aHas) return -1;
                            if (bHas) return 1;
                            return String(a && a.name || '').localeCompare(String(b && b.name || ''), 'zh');
                        });
                        return { ...c, students: sorted };
                    });
                });
            };

            const deleteClassById = (id) => {
                const cid = (id || '').toString();
                const c = getClassById(cid);
                if (!c) return;
                if (!confirm(`确定要删除 ${c.name} 吗？此操作不会删除已归档的学生历史记录。`)) return;
                setClasses(prev => (prev || []).filter(x => x && String(x.id) !== cid));
                setActiveClassIds(prev => (prev || []).filter(x => String(x) !== cid));
                if (String(currentClassId) === cid) {
                    const remaining = (Array.isArray(classes) ? classes : []).filter(x => x && String(x.id) !== cid);
                    setCurrentClassId(remaining[0] ? String(remaining[0].id) : '');
                }
            };

            const upsertStudentsFromText = (classId, rawText) => {
                const cid = (classId || '').toString();
                const entries = parseStudentEntries(rawText || '');
                if (entries.length === 0) return;
                setClasses(prev => {
                    const list = Array.isArray(prev) ? prev : [];
                    return list.map(c => {
                        if (!c || String(c.id) !== cid) return c;
                        const students = Array.isArray(c.students) ? c.students : [];
                        const byNorm = new Map();
                        students.forEach((s, idx) => {
                            const key = s && s.name ? normalizeName(s.name) : '';
                            if (key) byNorm.set(key, idx);
                        });
                        const merged = students.slice();
                        for (const it of entries) {
                            const key = normalizeName(it.name);
                            if (!key) continue;
                            const hit = byNorm.get(key);
                            if (hit === undefined) {
                                merged.push({ id: createId(), name: it.name, no: (it.no === null ? null : it.no), aliases: [] });
                                byNorm.set(key, merged.length - 1);
                            } else {
                                const cur = merged[hit] || {};
                                const nextNo = (it.no === null || it.no === undefined) ? cur.no : it.no;
                                merged[hit] = { ...cur, name: cur.name || it.name, no: nextNo };
                            }
                        }
                        const sorted = merged.slice().sort((a, b) => {
                            const an = Number(a && a.no);
                            const bn = Number(b && b.no);
                            const aHas = Number.isFinite(an);
                            const bHas = Number.isFinite(bn);
                            if (aHas && bHas) return an - bn;
                            if (aHas) return -1;
                            if (bHas) return 1;
                            return String(a && a.name || '').localeCompare(String(b && b.name || ''), 'zh');
                        });
                        return { ...c, students: sorted };
                    });
                });
            };

            const removeStudentFromClass = (classId, studentId) => {
                const cid = (classId || '').toString();
                const sid = (studentId || '').toString();
                setClasses(prev => {
                    const list = Array.isArray(prev) ? prev : [];
                    return list.map(c => {
                        if (!c || String(c.id) !== cid) return c;
                        const students = Array.isArray(c.students) ? c.students : [];
                        return { ...c, students: students.filter(s => s && String(s.id) !== sid) };
                    });
                });
            };

            // Render Steps - Defined INSIDE App to access state
            const renderStep0 = () => null;

                const renderStep1 = () => {
                 const addRubricItem = () => {
                    const id = 'c' + Date.now();
                    const nextRaw = [{ id, label: '新评分项', score: 1, desc: '请编辑描述...' }, ...(rubric.items || [])];
                    const next = redistributeItemScoresToTotal(nextRaw, rubric.total);
                    setRubric({ ...rubric, items: next });
                    setTimeout(() => {
                        const el = document.getElementById(`rubric-item-${id}`);
                        if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 60);
                 };
                 const removeRubricItem = (id) => {
                    if (rubric.items.length <= 1) return;
                    const nextRaw = rubric.items.filter(item => item.id !== id);
                    const next = redistributeItemScoresToTotal(nextRaw, rubric.total);
                    setRubric({ ...rubric, items: next });
                 };
                 const updateRubricItem = (index, f, v) => { const n = [...rubric.items]; n[index][f] = v; setRubric({ ...rubric, items: n }); };
                const toggleTense = (t) => {
                   const current = rubric.tense || [];
                   if (current.includes(t)) setRubric({...rubric, tense: current.filter(x => x !== t)});
                   else setRubric({...rubric, tense: [...current, t]});
                };

                const handleRubricTotalChange = (e) => {
                    const nextTotal = parseFloat(e.target.value);
                    const safeTotal = Number.isFinite(nextTotal) ? nextTotal : 0;
                    const nextItems = redistributeItemScoresToTotal(rubric.items, safeTotal);
                    setRubric({ ...rubric, total: safeTotal, items: nextItems });
                };

                const strictnessLevelUiRaw = clampStrictnessLevel(rubric && rubric.strictnessLevel);
                const strictnessLevelUi = strictnessLevelUiRaw !== null ? strictnessLevelUiRaw : strictnessLevelFromLabel(rubric && rubric.strictness);
                const strictnessLabelUi = strictnessLabelFromLevel(strictnessLevelUi);
                
                return (
                 <div className="max-w-4xl mx-auto mt-8 p-10 bg-white/70 glass-pure rounded-3xl fade-in">
                     <div className="flex items-center justify-between mb-8">
                        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-3"><span className="bg-indigo-600 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm shadow-md">1</span> 评分标准</h2>
                        <div className="flex items-center gap-2 no-print">
                            <button onClick={openRubricBackupDialog} className="btn-pure px-4 py-2 rounded-full text-xs font-bold">标准备份</button>
                            <button onClick={() => { setShowRubricHistory(true); }} className="btn-pure px-4 py-2 rounded-full text-xs font-bold">标准恢复</button>
                        </div>
                     </div>

                    <div className="bg-white/50 p-6 rounded-3xl border border-white/60 shadow-sm mb-8">
                        <div className="flex items-start justify-between gap-4 mb-4">
                            <div>
                                <div className="text-sm font-bold text-slate-800">题目识别与题目要点</div>
                                <div className="text-xs text-slate-400 mt-1">先识别题目文字并核对，再生成题目要点分析。</div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 justify-end">
                                {(() => {
                                    const done1 = !!String(assignment.topic || '').trim() && !assignment.isExtractingText;
                                    const cls1 = `btn-pure px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 disabled:opacity-50 ${done1 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'active'}`;
                                    return (
                                        <button
                                            onClick={extractPromptTextFromImage}
                                            disabled={!assignment.promptImageBase64 || assignment.isExtractingText}
                                            className={cls1}
                                        >
                                            {assignment.isExtractingText ? <Refresh size={14} className="spin"/> : (done1 ? <Check size={14}/> : <Sparkles size={14} />)}
                                            {assignment.isExtractingText ? '识别中...' : '① 识别题目文字'}
                                        </button>
                                    );
                                })()}
                                {(() => {
                                    const done2 = !!String(assignment.analysis || '').trim() && !assignment.isGeneratingAnalysis;
                                    const cls2 = `btn-pure px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 disabled:opacity-50 ${done2 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'active'}`;
                                    return (
                                        <button
                                            onClick={generateTopicAnalysis}
                                            disabled={!String(assignment.topic || '').trim() || assignment.isGeneratingAnalysis}
                                            className={cls2}
                                        >
                                            {assignment.isGeneratingAnalysis ? <Refresh size={14} className="spin"/> : (done2 ? <Check size={14}/> : <Sparkles size={14} />)}
                                            {assignment.isGeneratingAnalysis ? '生成中...' : '② 生成题目要点'}
                                        </button>
                                    );
                                })()}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <div className="border-2 border-dashed border-slate-200 rounded-2xl p-6 text-center hover:bg-white/50 transition relative group cursor-pointer bg-white/30">
                                    <input type="file" onChange={handlePromptImageUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" accept="image/*" />
                                    <div className="flex flex-col items-center gap-3 text-slate-400">
                                        <ImageIcon size={28} />
                                        <div className="font-medium text-slate-600">上传题目图片</div>
                                        <div className="text-xs text-slate-400">上传后点击“识别题目文字”</div>
                                    </div>
                                </div>
                                <div className="text-xs text-slate-500 flex flex-wrap gap-2 items-center">
                                    <div className="bg-white/70 border border-slate-100 rounded-full px-3 py-1">文件：<span className="font-semibold text-slate-700">{assignment.promptImageName || '未选择'}</span></div>
                                    <button onClick={() => setAssignment(p => ({ ...p, promptImageBase64: '', promptImageName: '', topic: p.topic, analysis: p.analysis }))} disabled={!assignment.promptImageBase64} className="btn-pure px-3 py-1 rounded-full text-[11px] font-bold disabled:opacity-50">清除图片</button>
                                </div>
                                {assignment.promptImageBase64 && (
                                    <div className="bg-white/60 rounded-2xl border border-white/60 p-3">
                                        <img src={assignment.promptImageBase64} className="w-full max-h-56 object-contain rounded-xl bg-white" />
                                    </div>
                                )}
                            </div>

                            <div className="space-y-4">
                                <div className="bg-white/60 rounded-2xl border border-white/60 p-4">
                                    <div className="text-[11px] font-bold text-slate-400 uppercase mb-2">Topic Title</div>
                                    <input value={assignment.title || ''} onChange={e => setAssignment({ ...assignment, title: e.target.value })} className="w-full input-breath p-2 rounded-lg text-sm outline-none font-bold text-slate-800 bg-white/50" placeholder="例如：A Happy Day" />
                                </div>
                                <div className="bg-white/60 rounded-2xl border border-white/60 p-4">
                                    <div className="flex items-center justify-between gap-3 mb-2">
                                        <div className="text-[11px] font-bold text-slate-400 uppercase">Exam Name</div>
                                        <button onClick={() => setAssignment(p => ({ ...p, examName: '' }))} disabled={!String(assignment.examName || '').trim()} className="btn-pure px-3 py-1 rounded-full text-[11px] font-bold disabled:opacity-50">清空</button>
                                    </div>
                                    <input value={assignment.examName || ''} onChange={e => setAssignment({ ...assignment, examName: e.target.value })} className="w-full input-breath p-2 rounded-lg text-sm outline-none font-bold text-slate-800 bg-white/50" placeholder="例如：2026年上学期期末考试 / Unit 3 单元测" />
                                    <div className="text-[11px] text-slate-400 mt-2">用于学生分析报告标题，方便学生对照具体试卷。</div>
                                </div>
                                <div className="bg-white/60 rounded-2xl border border-white/60 p-4">
                                    <div className="flex items-center justify-between gap-3 mb-2">
                                        <div className="text-[11px] font-bold text-slate-400 uppercase">题目文字稿 (Topic Text)</div>
                                        <button onClick={() => setAssignment(p => ({ ...p, topic: '' }))} disabled={!String(assignment.topic || '').trim()} className="btn-pure px-3 py-1 rounded-full text-[11px] font-bold disabled:opacity-50">清空</button>
                                    </div>
                                    <textarea value={assignment.topic || ''} onChange={e => setAssignment({ ...assignment, topic: e.target.value })} className="w-full min-h-[220px] p-3 bg-white/50 input-breath rounded-xl text-xs outline-none font-mono whitespace-pre-wrap" placeholder="点击“识别题目文字”后会自动填入；请先核对/补全再生成题目要点。" />
                                    <div className="text-[11px] text-slate-400 mt-2">题目文字稿越完整，题目要点越准确。</div>
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 bg-white/60 rounded-2xl border border-white/60 p-4">
                            <div className="flex items-center justify-between gap-3 mb-2">
                                <div className="text-[11px] font-bold text-slate-400 uppercase">题目要点分析</div>
                                <button onClick={() => setAssignment(p => ({ ...p, analysis: '' }))} disabled={!String(assignment.analysis || '').trim()} className="btn-pure px-3 py-1 rounded-full text-[11px] font-bold disabled:opacity-50">清空</button>
                            </div>
                            <textarea value={assignment.analysis || ''} onChange={e => setAssignment({ ...assignment, analysis: e.target.value })} className="w-full min-h-[180px] p-3 bg-white/50 input-breath rounded-xl text-xs outline-none whitespace-pre-wrap" placeholder="点击“生成题目要点”后会自动生成；也可手动调整。" />
                        </div>
                    </div>

                    <div className="bg-white/50 p-6 rounded-3xl border border-white/60 shadow-sm mb-8">
                        <div className="flex items-start justify-between gap-4 mb-4">
                            <div>
                                <div className="text-sm font-bold text-slate-800">AI生成标准</div>
                                <div className="text-xs text-slate-400 mt-1">基于题目要点分析生成评分标准，支持直接编辑并应用到评分模板。</div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 justify-end">
                                <button onClick={() => setShowRubricImportModal(true)} className="btn-pure px-4 py-2 rounded-full text-xs font-bold">（可选）导入评分标准</button>
                                {(() => {
                                    const done3 = rubricDesignState && rubricDesignState.status === 'success' && !!rubricDesignState.result;
                                    const cls3 = `btn-pure px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 disabled:opacity-50 ${done3 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'active'}`;
                                    return (
                                        <button
                                            onClick={generateRubricDesign}
                                            disabled={!String(assignment.analysis || '').trim() || rubricDesignState.status === 'analyzing'}
                                            className={cls3}
                                        >
                                            {rubricDesignState.status === 'analyzing' ? <Refresh size={14} className="spin"/> : (done3 ? <Check size={14}/> : <Sparkles size={14} />)}
                                            {rubricDesignState.status === 'analyzing' ? '生成中...' : '③ 生成评分标准'}
                                        </button>
                                    );
                                })()}
                                {(() => {
                                    const done4 = !!rubricDesignAppliedAt;
                                    const cls4 = `btn-pure px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 disabled:opacity-50 ${done4 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : ''}`;
                                    return (
                                        <button
                                            onClick={applyGeneratedRubricToSystem}
                                            disabled={!rubricDesignState.result}
                                            className={cls4}
                                        >
                                            {done4 ? <Check size={14}/> : <Sparkles size={14} />} ④应用到评分标准
                                        </button>
                                    );
                                })()}
                            </div>
                        </div>
                        <div className="text-xs text-slate-500 flex flex-wrap gap-3 items-center">
                            <div className="bg-white/70 border border-slate-100 rounded-full px-3 py-1">状态：<span className="font-semibold text-slate-700">{rubricDesignState.status}</span></div>
                            {rubricDesignState.error && <div className="text-red-600 font-semibold">{rubricDesignState.error}</div>}
                            {rubricDesignState.result && <button onClick={() => setRubricDesignState({ status: 'idle', result: null, error: '' })} className="btn-pure px-3 py-1 rounded-full text-[11px] font-bold">清空结果</button>}
                        </div>

                        {rubricDesignState.result && (
                            <div className="mt-5">
                                <details open className="bg-white/70 rounded-2xl border border-slate-100 p-4">
                                    <summary className="cursor-pointer text-xs font-bold text-slate-700">评分标准结果（可编辑）</summary>
                                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="bg-white/60 rounded-2xl border border-white/60 p-4">
                                            <div className="text-[11px] font-bold text-slate-400 uppercase mb-2">总分</div>
                                            <input type="number" value={rubricDesignState.result.total ?? ''} onChange={e => setRubricDesignState(p => ({ ...p, result: { ...(p.result || {}), total: parseFloat(e.target.value) || 0 } }))} className="w-full bg-transparent font-bold text-2xl outline-none text-slate-800" />
                                        </div>
                                        <div className="bg-white/60 rounded-2xl border border-white/60 p-4">
                                            <div className="text-[11px] font-bold text-slate-400 uppercase mb-2">字数要求</div>
                                            <input value={rubricDesignState.result.wordCount ?? ''} onChange={e => setRubricDesignState(p => ({ ...p, result: { ...(p.result || {}), wordCount: e.target.value } }))} className="w-full input-breath p-2 rounded-lg text-sm outline-none" />
                                        </div>
                                        <div className="bg-white/60 rounded-2xl border border-white/60 p-4">
                                            <div className="text-[11px] font-bold text-slate-400 uppercase mb-2">年级</div>
                                            <input value={rubricDesignState.result.gradeLevel ?? ''} onChange={e => setRubricDesignState(p => ({ ...p, result: { ...(p.result || {}), gradeLevel: e.target.value } }))} className="w-full input-breath p-2 rounded-lg text-sm outline-none" />
                                        </div>
                                        <div className="bg-white/60 rounded-2xl border border-white/60 p-4">
                                            <div className="text-[11px] font-bold text-slate-400 uppercase mb-2">评分松紧度</div>
                                            <input value={rubricDesignState.result.strictness ?? ''} onChange={e => setRubricDesignState(p => ({ ...p, result: { ...(p.result || {}), strictness: e.target.value } }))} className="w-full input-breath p-2 rounded-lg text-sm outline-none" />
                                        </div>
                                    </div>

                                    <div className="mt-4 space-y-3">
                                        {Array.isArray(rubricDesignState.result.dimensions) && rubricDesignState.result.dimensions.map((d, idx) => (
                                            <details key={idx} className="bg-white rounded-2xl border border-slate-100 p-4">
                                                <summary className="cursor-pointer flex items-center justify-between">
                                                    <div className="text-sm font-bold text-slate-800">{d?.name || `维度 ${idx + 1}`}</div>
                                                    <div className="text-xs text-slate-400 font-semibold">{d?.points ?? ''} 分</div>
                                                </summary>
                                                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div>
                                                        <div className="text-[11px] font-bold text-slate-400 uppercase mb-1">维度名称</div>
                                                        <input value={d?.name ?? ''} onChange={e => setRubricDesignState(p => {
                                                            const r = JSON.parse(JSON.stringify(p.result || {}));
                                                            r.dimensions = Array.isArray(r.dimensions) ? r.dimensions : [];
                                                            if (!r.dimensions[idx]) r.dimensions[idx] = {};
                                                            r.dimensions[idx].name = e.target.value;
                                                            return { ...p, result: r };
                                                        })} className="w-full input-breath p-2 rounded-lg text-sm outline-none" />
                                                    </div>
                                                    <div>
                                                        <div className="text-[11px] font-bold text-slate-400 uppercase mb-1">分值</div>
                                                        <input type="number" value={d?.points ?? ''} onChange={e => setRubricDesignState(p => {
                                                            const r = JSON.parse(JSON.stringify(p.result || {}));
                                                            r.dimensions = Array.isArray(r.dimensions) ? r.dimensions : [];
                                                            if (!r.dimensions[idx]) r.dimensions[idx] = {};
                                                            r.dimensions[idx].points = parseFloat(e.target.value) || 0;
                                                            return { ...p, result: r };
                                                        })} className="w-full input-breath p-2 rounded-lg text-sm outline-none" />
                                                    </div>
                                                    <div className="md:col-span-2">
                                                        <div className="text-[11px] font-bold text-slate-400 uppercase mb-1">核心描述</div>
                                                        <textarea value={d?.description ?? ''} onChange={e => setRubricDesignState(p => {
                                                            const r = JSON.parse(JSON.stringify(p.result || {}));
                                                            r.dimensions = Array.isArray(r.dimensions) ? r.dimensions : [];
                                                            if (!r.dimensions[idx]) r.dimensions[idx] = {};
                                                            r.dimensions[idx].description = e.target.value;
                                                            return { ...p, result: r };
                                                        })} className="w-full p-3 bg-white/70 input-breath rounded-xl text-sm outline-none min-h-20" />
                                                    </div>
                                                </div>
                                            </details>
                                        ))}
                                    </div>
                                </details>
                            </div>
                        )}
                    </div>

                    <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                            <div className="text-sm font-bold text-slate-800">评分设置</div>
                            <div className="text-xs text-slate-400 mt-1">先设置总分/字数/年级/难度控制等，再维护评分标准。</div>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-8 mb-8">
                        <div className="bg-white/50 p-5 rounded-2xl border border-white/60 shadow-sm">
                            <span className="block text-xs font-bold text-slate-400 uppercase mb-2">作文总分</span>
                            <input type="number" value={rubric.total} onChange={handleRubricTotalChange} className="w-full bg-transparent font-bold text-3xl outline-none text-slate-800" />
                        </div>
                        <div className="bg-white/50 p-5 rounded-2xl border border-white/60 shadow-sm">
                            <span className="block text-xs font-bold text-slate-400 uppercase mb-2">字数要求</span>
                            <input type="text" value={rubric.wordCount} onChange={e => setRubric({...rubric, wordCount: e.target.value})} className="w-full bg-transparent font-bold text-lg outline-none text-slate-800" />
                        </div>
                            <div className="bg-white/50 p-5 rounded-2xl border border-white/60 shadow-sm col-span-2">
                                <div className="flex items-center justify-between gap-4">
                                    <div>
                                        <div className="text-xs font-bold text-slate-400 uppercase mb-1">词数评分控制</div>
                                        <div className="text-xs text-slate-500">关闭严格控制：基本忽略词数，但极端少/多会触发上限。</div>
                                    </div>
                                    <label className="flex items-center gap-2 text-sm text-slate-700 font-bold">
                                        <input
                                            type="checkbox"
                                            checked={rubric && rubric.wordCountStrict !== false}
                                            onChange={(e) => setRubric({ ...rubric, wordCountStrict: !!e.target.checked })}
                                        />
                                        严格控制
                                    </label>
                                </div>
                                <div className="mt-2 text-[11px] text-slate-400">
                                    规则（严格关闭时）：少于最低要求 70% → 词数维度最多拿 50%；超过最高要求 200% → 最多拿 80%。划掉的单词（如 ~~word~~）不计入词数统计。
                                </div>
                            </div>
                        <div className="bg-white/50 p-5 rounded-2xl border border-white/60 shadow-sm col-span-2 md:col-span-1">
                            <span className="block text-xs font-bold text-slate-400 uppercase mb-2">评分松紧度</span>
                            <div className="flex flex-wrap gap-2">
                                {STRICTNESS_LEVELS.map(l => (
                                    <span key={l} onClick={() => setRubric({ ...rubric, strictness: l, strictnessLevel: strictnessLevelFromLabel(l) })} className={`chip px-3 py-1.5 rounded-full text-xs font-medium ${rubric.strictness === l ? 'active' : 'inactive'}`}>{l}</span>
                                ))}
                            </div>
                            <div className="mt-4">
                                <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    step="1"
                                    value={strictnessLevelUi}
                                    onChange={e => {
                                        const v = clampStrictnessLevel(e.target.value);
                                        const level = v === null ? 45 : v;
                                        setRubric({ ...rubric, strictnessLevel: level, strictness: strictnessLabelFromLevel(level) });
                                    }}
                                    className="w-full"
                                />
                                <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2">
                                    <span>严格</span>
                                    <span>适中</span>
                                    <span>宽松</span>
                                    <span>激励</span>
                                </div>
                                <div className="text-xs text-slate-500 mt-2">当前：<span className="font-semibold text-slate-700">{strictnessLabelUi}</span>（{strictnessLevelUi}/100）</div>
                            </div>
                        </div>
                        <div className="bg-white/50 p-5 rounded-2xl border border-white/60 shadow-sm col-span-2 md:col-span-1">
                            <span className="block text-xs font-bold text-slate-400 uppercase mb-2">学生年级</span>
                            <div className="flex flex-wrap gap-2 mb-3">
                                {GRADE_LEVELS.map(g => (
                                    <span key={g} onClick={() => setRubric({...rubric, gradeLevel: g})} className={`chip px-3 py-1.5 rounded-full text-xs font-medium ${rubric.gradeLevel === g ? 'active' : 'inactive'}`}>{g}</span>
                                ))}
                            </div>
                            <input type="text" value={rubric.gradeLevel} onChange={e => setRubric({...rubric, gradeLevel: e.target.value})} className="w-full input-breath p-2 rounded-lg text-sm outline-none" placeholder="自定义年级..." />
                        </div>
                        <div className="bg-white/50 p-5 rounded-2xl border border-white/60 shadow-sm col-span-2 md:col-span-1">
                            <span className="block text-xs font-bold text-slate-400 uppercase mb-2">语言难度控制</span>
                            {(() => {
                                const base = resolveGradeDifficultyProfile(rubric.gradeLevel);
                                const eff = resolveEffectiveDifficultyProfile(rubric.gradeLevel, languageDifficulty);
                                const capPct = Math.round(((languageDifficulty && languageDifficulty.enabled === false) ? 0 : (eff.capRatio || 1)) * 100);
                                return (
                                    <div className="space-y-3">
                                        <label className="flex items-center gap-2 text-sm text-slate-700">
                                            <input
                                                type="checkbox"
                                                checked={languageDifficulty && languageDifficulty.enabled !== false}
                                                onChange={(e) => setLanguageDifficulty(p => ({ ...(p || {}), enabled: !!e.target.checked }))}
                                            />
                                            启用难度上限（按年级约束 AI 英文输出）
                                        </label>
                                        <div className={`${languageDifficulty && languageDifficulty.enabled === false ? 'opacity-50 pointer-events-none' : ''}`}>
                                            <div className="text-xs text-slate-500 mb-2">
                                                年级系数：{base.coefficient}；当前上限：{eff.coefficient}（{capPct}%）
                                            </div>
                                            <input
                                                type="range"
                                                min="0.6"
                                                max="1"
                                                step="0.05"
                                                value={Number.isFinite(Number(languageDifficulty && languageDifficulty.capRatio)) ? Number(languageDifficulty.capRatio) : 1}
                                                onChange={(e) => setLanguageDifficulty(p => ({ ...(p || {}), capRatio: Math.min(1, Math.max(0.6, Number(e.target.value) || 1)) }))}
                                                className="w-full"
                                            />
                                            <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2">
                                                <span>更简单</span>
                                                <span>按年级</span>
                                            </div>
                                            <label className="flex items-center gap-2 text-sm text-slate-700 mt-2">
                                                <input
                                                    type="checkbox"
                                                    checked={languageDifficulty && languageDifficulty.autoRewrite !== false}
                                                    onChange={(e) => setLanguageDifficulty(p => ({ ...(p || {}), autoRewrite: !!e.target.checked }))}
                                                />
                                                超标自动降难度（批改后自动重写英文建议）
                                            </label>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                        <div className="bg-white/50 p-5 rounded-2xl border border-white/60 shadow-sm col-span-2 md:col-span-1">
                            <span className="block text-xs font-bold text-slate-400 uppercase mb-2">基本时态 (多选)</span>
                            <div className="flex flex-wrap gap-2 mb-3">
                                {TENSES.map(t => (
                                    <span key={t} onClick={() => toggleTense(t)} className={`chip px-3 py-1.5 rounded-full text-xs font-medium ${rubric.tense.includes(t) ? 'active' : 'inactive'}`}>{t}</span>
                                ))}
                            </div>
                            <input type="text" onKeyDown={e => {
                                if(e.key === 'Enter' && e.target.value.trim()) {
                                    if(!rubric.tense.includes(e.target.value.trim())) setRubric({...rubric, tense: [...rubric.tense, e.target.value.trim()]});
                                    e.target.value = '';
                                }
                            }} className="w-full input-breath p-2 rounded-lg text-sm outline-none" placeholder="自定义时态..." />
                        </div>
                    </div>
                    <div className="flex items-center justify-between mb-3">
                        <div className="text-sm font-bold text-slate-800">评分标准</div>
                        <button onClick={addRubricItem} className="btn-pure active px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2"><Plus size={14}/> 添加评分维度</button>
                    </div>
                    <div className="space-y-4">
                        {rubric.items.map((item, idx) => (
                            <div key={item.id} id={`rubric-item-${item.id}`} className="flex items-start gap-5 p-5 border border-white/60 rounded-2xl bg-white/40 hover:bg-white/80 transition relative group shadow-sm">
                                <div className="pt-2"><div className="w-2.5 h-2.5 rounded-full bg-indigo-500/20"></div></div>
                                <div className="flex-1">
                                    <div className="flex justify-between mb-2">
                                        <input value={item.label} onChange={e => updateRubricItem(idx, 'label', e.target.value)} className="font-bold text-lg text-slate-800 bg-transparent border-b border-transparent hover:border-slate-200 outline-none transition" />
                                        <div className="flex items-center gap-2 bg-white/80 px-3 py-1 rounded-lg border border-slate-100"><input type="number" value={item.score} onChange={e => updateRubricItem(idx, 'score', parseFloat(e.target.value)||0)} className="w-12 text-right bg-transparent font-bold outline-none" /><span className="text-xs text-slate-400">分</span></div>
                                    </div>
                                    <textarea value={item.desc} onChange={e => updateRubricItem(idx, 'desc', e.target.value)} className="w-full text-sm text-slate-500 bg-transparent outline-none border-b border-transparent hover:border-slate-200 transition resize-none" rows={2} />
                                </div>
                                <button onClick={() => removeRubricItem(item.id)} className="absolute top-4 right-4 text-slate-300 hover:text-red-400 transition opacity-0 group-hover:opacity-100"><Trash size={16}/></button>
                            </div>
                        ))}
                    </div>

                    <div className="mt-10 bg-white/50 p-6 rounded-3xl border border-white/60 shadow-sm">
                        <div className="flex items-center justify-between gap-4 mb-4">
                            <div>
                                <div className="text-sm font-bold text-slate-800">标准范文</div>
                                <div className="text-xs text-slate-400 mt-1">依据题目要求、评分标准与难度设置生成。</div>
                            </div>
                            <div className="flex items-center gap-2">
                                <select value={rubric.modelDifficulty} onChange={e => setRubric({ ...rubric, modelDifficulty: e.target.value })} className="text-xs p-2 rounded-full border border-slate-200 bg-white outline-none cursor-pointer font-bold text-slate-700">
                                    {DIFFICULTY_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                                </select>
                                <button className="btn-pure active text-xs px-5 py-2 rounded-full flex items-center gap-2" onClick={generateModelEssay} disabled={assignment.isGeneratingModel}>
                                    {assignment.isGeneratingModel ? <Refresh className="spin" size={14}/> : <Sparkles size={14}/>}
                                    {assignment.isGeneratingModel ? '生成中...' : '生成范文'}
                                </button>
                            </div>
                        </div>
                        {assignment.isGeneratingModel ? (
                            <div className="h-48 flex items-center justify-center bg-white/40 rounded-2xl border border-slate-100/50"><Loader /></div>
                        ) : (
                            <textarea className="w-full min-h-[220px] p-5 bg-white/60 input-breath rounded-2xl text-sm font-serif leading-relaxed outline-none whitespace-pre-wrap shadow-sm transition resize-none" value={assignment.modelEssay || ''} onChange={e => setAssignment({ ...assignment, modelEssay: e.target.value })} placeholder="点击“生成范文”，或在此手动编辑/粘贴范文..." />
                        )}
                    </div>
                </div>
                );
            };

            const renderStep2 = () => {
                const pageSize = 20;
                const allClasses = Array.isArray(classes) ? classes.filter(Boolean) : [];
                const totalPages = Math.max(1, Math.ceil(allClasses.length / pageSize));
                const pageIndex = Math.min(Math.max(0, classPage), totalPages - 1);
                const pageClasses = allClasses.slice(pageIndex * pageSize, pageIndex * pageSize + pageSize);
                const selected = Array.isArray(activeClassIds) ? activeClassIds : [];

                const toggleSelectedClass = (id) => {
                    const cid = String(id);
                    setActiveClassIds(prev => {
                        const p = Array.isArray(prev) ? prev : [];
                        if (p.includes(cid)) {
                            const next = p.filter(x => x !== cid);
                            if (String(currentClassId || '') === cid) {
                                setCurrentClassId(next.length > 0 ? String(next[0]) : '');
                            }
                            return next;
                        }
                        const next = [...p, cid];
                        setCurrentClassId(cid);
                        return next;
                    });
                };

                return (
                    <div className="max-w-4xl mx-auto mt-8 p-10 bg-white/70 glass-pure rounded-3xl fade-in text-center">
                        <h2 className="text-xl font-bold text-slate-800 mb-8 flex items-center justify-center gap-3"><span className="bg-indigo-600 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm shadow-md">2</span> 导入学生作文</h2>

                        <div className="mb-8 bg-white/60 rounded-3xl p-6 border border-white/50 shadow-sm text-left">
                            <div className="flex items-start justify-between gap-4 mb-4">
                                <div>
                                    <div className="text-sm font-bold text-slate-700">学生名单管理</div>
                                    <div className="text-xs text-slate-400 mt-1">不选择则默认“全部班级”。系统会自动识别作文中的姓名并与学生名单匹配；匹配不确定时会标记为“待确认”以避免误归档。</div>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => setShowStudentMgmt(true)} className="btn-pure text-xs px-4 py-2 rounded-full flex items-center gap-2 shrink-0"><Settings size={14}/> 学生管理</button>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 mb-4">
                                <button onClick={() => setActiveClassIds(allClasses.map(c => String(c.id)))} className="btn-pure px-3 py-2 rounded-full text-xs font-bold">全选</button>
                                <button onClick={() => setActiveClassIds([])} className="btn-pure px-3 py-2 rounded-full text-xs font-bold">清空（默认全部）</button>
                                <div className="text-xs text-slate-500 ml-1">已选 {selected.length}/{allClasses.length}</div>
                                <div className="flex-1" />
                                <div className="text-xs text-slate-500">当前分析班级：</div>
                                <select
                                    value={selected.length === 0 ? '' : (currentClassId || '')}
                                    onChange={(e) => {
                                        const v = (e.target.value || '').toString();
                                        if (!v) {
                                            setActiveClassIds([]);
                                            setCurrentClassId('');
                                            return;
                                        }
                                        setCurrentClassId(v);
                                    }}
                                    className="p-2 bg-transparent text-xs font-bold outline-none text-slate-700 cursor-pointer border border-slate-200 rounded-full"
                                >
                                    <option value="">全部班级</option>
                                    {allClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {pageClasses.map(c => (
                                    <label key={c.id} className="flex items-center gap-3 p-3 rounded-2xl bg-white/70 border border-slate-100 cursor-pointer hover:bg-white">
                                        <input type="checkbox" checked={selected.includes(String(c.id))} onChange={() => toggleSelectedClass(c.id)} />
                                        <span className="text-sm font-bold text-slate-700">{c.name}</span>
                                        <span className="text-[11px] text-slate-400 ml-auto">{c.gradeLevel || rubric.gradeLevel}</span>
                                    </label>
                                ))}
                                {pageClasses.length === 0 && (
                                    <div className="text-center text-slate-400 py-6">暂无班级，请先在“学生管理”中新建班级</div>
                                )}
                            </div>

                            <div className="flex items-center justify-between mt-4">
                                <button onClick={() => setClassPage(p => Math.max(0, p - 1))} disabled={pageIndex === 0} className="btn-pure px-4 py-2 rounded-full text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed">上一页</button>
                                <div className="text-xs text-slate-500">第 {pageIndex + 1}/{totalPages} 页</div>
                                <button onClick={() => setClassPage(p => Math.min(totalPages - 1, p + 1))} disabled={pageIndex >= totalPages - 1} className="btn-pure px-4 py-2 rounded-full text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed">下一页</button>
                            </div>
                        </div>

                        <div className="border-2 border-dashed border-slate-200 rounded-3xl p-16 bg-white/30 hover:bg-white/60 transition cursor-pointer relative mb-8 group">
                            <input type="file" multiple accept="image/*" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" onChange={handleStudentUpload} />
                            <div className="flex flex-col items-center gap-4 text-slate-400 group-hover:scale-105 transition duration-300">
                                <div className="bg-white p-5 rounded-2xl shadow-sm text-indigo-400"><Upload size={40} /></div>
                                <div className="text-xl font-bold text-slate-600">点击或拖拽上传图片</div>
                                <p className="text-sm">支持批量选择 JPG, PNG</p>
                            </div>
                        </div>
                        {files.length > 0 && (
                            <div className="bg-white/60 rounded-3xl p-8 border border-white/50 shadow-sm">
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="font-bold text-slate-700">已选择 {files.length} 份文件</h3>
                                    <button onClick={() => setFiles([])} className="text-red-400 text-xs hover:underline flex items-center gap-1 font-bold"><Trash size={12}/> 清空重选</button>
                                </div>
                                <div className="grid grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-6">
                                    {files.map(f => (
                                        <div key={f.id} className="relative group aspect-[3/4] bg-white rounded-xl border border-slate-100 overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1">
                                            <img src={f.url} className="w-full h-full object-cover" />
                                            <button onClick={() => setFiles(files.filter(x => x.id !== f.id))} className="absolute top-2 right-2 bg-white/90 text-red-500 rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition shadow-sm hover:bg-red-50"><Trash size={12}/></button>
                                            <div className="absolute bottom-0 w-full bg-white/90 backdrop-blur text-slate-700 text-[10px] font-medium truncate px-2 py-1 border-t border-slate-100">{f.name}</div>
                                        </div>
                                    ))}
                                    <label className="flex flex-col items-center justify-center aspect-[3/4] border-2 border-dashed border-slate-200 rounded-xl cursor-pointer hover:bg-white/50 transition bg-slate-50/50 hover:border-slate-300 group">
                                        <Plus size={24} className="text-slate-300 group-hover:text-slate-400 transition"/>
                                        <span className="text-xs text-slate-400 mt-2 font-medium group-hover:text-slate-500">加一张</span>
                                        <input type="file" multiple accept="image/*" className="hidden" onChange={handleStudentUpload} />
                                    </label>
                                </div>
                            </div>
                        )}
                    </div>
                );
            };

            const renderStep3 = () => {
                const currentFile = files.find(f => f.id === selectedFileId);

                const handleToggleOverallPreview = () => {
                    const next = !overallPreviewOpen;
                    setOverallPreviewOpen(next);
                    if (next) {
                        setViewMode('grid');
                        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
                    } else {
                        const top = document.querySelector('#step-4-root')?.getBoundingClientRect().top || 0;
                        const scrollTop = window.scrollY + top - 120;
                        window.scrollTo({ top: Math.max(0, scrollTop), behavior: 'smooth' });
                    }
                };
                return (
                    <div className="relative" id="step-4-root">
                        <div className="mt-8 fade-in flex flex-col gap-6 px-8">
                            <div className="flex items-center justify-between gap-4 mb-2">
                                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                    <span className="bg-indigo-600 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm shadow-md">3</span>
                                    批改导出
                                </h2>
                            </div>
                        <nav className="teacher-report-tools no-print" aria-label="报告操作">
                            <button onClick={handleToggleOverallPreview} aria-pressed={overallPreviewOpen}><Grid size={16}/>整体预览</button>
                            <button onClick={()=>setShowPDFSettings(true)}><Sliders size={16}/>排版设置</button>
                            <button onClick={()=>handlePrint('single')}><Printer size={16}/>打印当前学生</button>
                            <button onClick={exportCsvForClass}><Download size={16}/>导出 CSV</button>
                            <button className="teacher-tool-primary" onClick={()=>handlePrint('batch')}><Printer size={16}/>打印/导出所有PDF</button>
                        </nav>
                            <div className="teacher-grading-layout flex gap-4 items-stretch h-[calc(100vh-220px)]">
                                <div className="teacher-grading-sidebar w-64 bg-white/90 glass-iso border border-white/60 rounded-3xl flex flex-col h-full z-10 shadow-xl backdrop-blur-md overflow-hidden">
                                    <div className="p-5 border-b border-white/50">
                                        <button onClick={startBatchGrading} disabled={isBatchProcessing || files.length === 0} className={`w-full flex justify-center items-center gap-2 py-4 rounded-2xl text-sm font-bold shadow-lg transition-all transform hover:scale-[1.02] ${isBatchProcessing ? 'bg-slate-100 text-slate-400 cursor-wait' : 'btn-pure active'}`}>
                                            {isBatchProcessing ? <Refresh className="spin" size={18}/> : <Check size={18}/>} {isBatchProcessing ? '正在智能批改...' : (isPaused ? '继续批改' : '开始批改')}
                                        </button>
                                        <button onClick={handlePauseBatch} disabled={!isBatchProcessing || pauseRequested} className="w-full mt-3 flex justify-center items-center gap-2 py-3 rounded-2xl text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed">
                                            {pauseRequested ? '已请求暂停' : '暂停批改'}
                                        </button>
                                        <button onClick={openSaveDialogWithDefaultName} disabled={files.filter(f => f && f.status === 'success' && f.result).length === 0} className="w-full mt-3 flex justify-center items-center gap-2 py-3 rounded-2xl text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed">
                                            保存批改结果
                                        </button>
                                        {pauseBanner && (
                                            <div className="mt-3 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-100 rounded-2xl px-3 py-2">
                                                {pauseBanner}
                                            </div>
                                        )}
                                        <label className="w-full mt-4 flex justify-center items-center gap-2 py-3 border border-dashed border-slate-300 rounded-2xl text-sm font-medium text-slate-500 hover:bg-white hover:border-slate-400 hover:text-slate-700 cursor-pointer transition bg-slate-50/50">
                                            <FilePlus size={16}/> 添加图片
                                            <input type="file" multiple accept="image/*" className="hidden" onChange={handleStudentUpload} />
                                        </label>
                                    </div>
                                    <div className="flex-1 overflow-y-auto p-3 space-y-2">
                                        {files.map((f, idx) => (
                                            <div key={f.id} onClick={() => handleFileClick(f)} className={`p-4 rounded-xl cursor-pointer flex items-center gap-4 border transition-all ${selectedFileId === f.id ? 'bg-white border-slate-200 shadow-md transform scale-[1.02]' : 'border-transparent hover:bg-white/40'}`}>
                                                <div className="w-12 h-12 rounded-lg bg-slate-100 overflow-hidden shrink-0 border border-slate-200 shadow-inner">
                                                    {f.url ? <img src={f.url} className="w-full h-full object-cover opacity-80" /> : <div className="w-full h-full flex items-center justify-center bg-slate-50 text-slate-300 text-[10px]">无图</div>}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sm font-bold text-slate-700 truncate">{(f.result && f.result.student_name) || f.name || `学生 ${f.index}`}</div>
                                                    <div className="text-xs mt-1 font-medium">{f.status === 'success' ? <span className="text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-100">{f.result.total_score}分</span> : <span className="text-slate-400 flex items-center gap-1">{f.status==='loading'?<><Refresh size={10} className="spin"/> 批改中...</>:'待处理'}</span>}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="teacher-grading-detail flex-1 h-full">
                                    <div className="h-full flex flex-col">
                                        <div className="flex-1 overflow-y-auto flex justify-center relative">
                                            {currentFile ? (
                                                <div className="w-full max-w-7xl mx-auto">
                                                    <div className="flex gap-8 items-start justify-between pb-40">
                                                        <div className="hidden xl:block w-60 sticky top-10 shrink-0">
                                                            <div className="bg-white p-4 rounded-3xl shadow-sm border border-white/60">
                                                                <h4 className="text-xs font-bold text-slate-400 uppercase mb-3 tracking-wider ml-1">学生原卷</h4>
                                                                {currentFile.url ? <img src={currentFile.url} onClick={() => setLightboxSrc(currentFile.url)} className="w-full rounded-2xl border border-slate-100 shadow-inner cursor-zoom-in hover:opacity-95 transition" /> : <div className="h-64 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 text-sm">原卷不可用</div>}
                                                            </div>
                                                        </div>
                                                        <div className="shrink-0 animate-in fade-in zoom-in duration-300 w-full max-w-[880px] relative">
                                                            <div className="bg-white rounded-3xl shadow-sm border border-white/60 pt-8 pb-6 px-0 overflow-hidden">
                                                                {currentFile.status === 'success' ? (
                                                                    <EditablePaper readOnly={!!currentFile.cloudBoundRef} data={currentFile.result} assignment={assignment} rubric={rubric} studentIndex={currentFile.index} onUpdate={(d) => {
                                                                        const prevResult = currentFile.result || {};
                                                                        let nextResult = reconcileIdentityAfterTeacherEdit(prevResult, d, currentFile);
                                                                        if (didTeacherEditScores(prevResult, nextResult, rubric)) {
                                                                            nextResult = normalizeTeacherEditedScoresAgainstRubric(nextResult, rubric);
                                                                        }
                                                                        nextResult = upsertArchivedRecordForEditedResult(currentFile, prevResult, nextResult);
                                                                        setFiles(prev => (Array.isArray(prev) ? prev : []).map(f => f.id === currentFile.id ? { ...f, result: nextResult } : f));
                                                                    }} pdfConfig={pdfConfig} />
                                                                ) : (
                                                                    <div className="a4-wrapper flex flex-col items-center justify-center gap-6 text-slate-400 rounded-3xl border border-dashed border-slate-200 bg-white/50 h-[800px]">
                                                                        {currentFile.status === 'loading' ? <Loader /> : <div className="flex flex-col items-center gap-2"><ImageIcon size={48} className="text-slate-200 mb-2"/><p>请点击左侧“开始批改”</p></div>}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col items-center justify-center text-slate-400 h-full">
                                                    <ImageIcon size={64} className="text-slate-200 mb-4"/>
                                                    <p>请选择左侧学生查看</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>
                );
            };

            const renderStep4 = () => {
                const gradedCount = files.filter(f => f && f.status === 'success').length;
                const cls = getClassNameById(currentClassId) || '未分班级';
                const canExport = files.filter(f => f && f.status === 'success' && f.result).length > 0;
                const savedList = Array.isArray(savedGradingResults) ? savedGradingResults : [];
                const analysisList = (Array.isArray(analysisHistory) ? analysisHistory : []).filter(item => {
                    if (!item) return false;
                    const cid = (item.classId || '').toString();
                    if (currentClassId && cid && String(currentClassId) === cid) return true;
                    const cn = (item.className || '').toString().trim();
                    return cn && cn === cls;
                });

                return (
                    <div className="max-w-7xl mx-auto mt-8 p-8 md:p-10 bg-white/70 glass-panel rounded-3xl fade-in">
                        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-6">
                            <div>
                                <h2 className="text-xl font-bold text-slate-800 mb-2 flex items-center justify-start gap-2">
                                    <span className="bg-indigo-600 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm shadow-md">4</span>
                                    班级综合分析
                                </h2>
                                <p className="text-slate-500 text-sm">当前班级：<span className="font-semibold text-slate-700">{cls}</span> · 已批改 <span className="font-semibold text-slate-700">{gradedCount}</span> 份</p>
                            </div>
                            <div className="flex flex-wrap gap-2 no-print">
                                <button onClick={() => setShowStudentMgmt(true)} className="btn-pure px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2"><Settings size={14}/> 学生管理</button>
                                <button onClick={() => setShowStudentProfiles(true)} className="btn-pure px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2"><Settings size={14}/> 学生档案</button>
                                <button onClick={openSaveDialogWithDefaultName} disabled={!canExport} className="btn-pure px-4 py-2 rounded-full text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed">保存结果</button>
                                <button onClick={exportCsvForClass} disabled={!canExport} className="btn-pure active px-4 py-2 rounded-full text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"><Download size={14}/> 导出 CSV</button>
                                <button onClick={() => setShowCsvHistory(true)} className="btn-pure px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2"><Download size={14}/> 导出历史</button>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <div className="space-y-6">
                                <div className="bg-white/60 rounded-3xl p-5 border border-white/60 shadow-sm">
                                    <div className="flex items-center justify-between gap-3 mb-4">
                                        <div className="text-sm font-bold text-slate-700">分析设置</div>
                                        <button onClick={openAnalysisGenerateDialog} disabled={isAnalyzingClass} className="btn-primary active px-6 py-3 rounded-2xl text-sm font-bold shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                                            {isAnalyzingClass ? <Refresh className="spin" size={16}/> : <PieChart size={16} />}
                                            {isAnalyzingClass ? "AI 正在分析..." : "生成分析报告"}
                                        </button>
                                    </div>
                                    <div className="space-y-3">
                                        <div className="text-xs font-bold text-slate-500 ml-1">分析侧重</div>
                                        <select value={analysisConfig.focus} onChange={e => setAnalysisConfig({ ...analysisConfig, focus: e.target.value })} className="w-full p-3 bg-white/70 input-breath rounded-2xl text-sm font-bold outline-none text-slate-700 cursor-pointer">
                                            <option>全面分析</option><option>侧重语法纠错</option><option>侧重内容创意</option><option>侧重篇章结构</option><option>自定义</option>
                                        </select>
                                            {analysisConfig.focus === '自定义' && (
                                                <input
                                                    value={analysisConfig.focusCustom}
                                                    onChange={e => setAnalysisConfig({ ...analysisConfig, focusCustom: e.target.value })}
                                                    placeholder="请输入自定义分析侧重（例如：重点看词汇多样性与句式变化）"
                                                    className="w-full p-3 bg-white/70 input-breath rounded-2xl text-sm font-bold outline-none text-slate-700"
                                                />
                                            )}
                                        <div className="text-xs font-bold text-slate-500 ml-1">表达语气</div>
                                        <select value={analysisConfig.tone} onChange={e => setAnalysisConfig({ ...analysisConfig, tone: e.target.value })} className="w-full p-3 bg-white/70 input-breath rounded-2xl text-sm font-bold outline-none text-slate-700 cursor-pointer">
                                            <option>专业客观</option><option>热情鼓励</option><option>严肃严谨</option><option>自定义</option>
                                        </select>
                                            {analysisConfig.tone === '自定义' && (
                                                <input
                                                    value={analysisConfig.toneCustom}
                                                    onChange={e => setAnalysisConfig({ ...analysisConfig, toneCustom: e.target.value })}
                                                    placeholder="请输入自定义语气（例如：温和但严格、给出可执行改进建议）"
                                                    className="w-full p-3 bg-white/70 input-breath rounded-2xl text-sm font-bold outline-none text-slate-700"
                                                />
                                            )}
                                        {showAnalysis && (
                                            <div className="flex gap-2 mt-3 no-print">
                                                <button onClick={() => handlePrint('analysis')} className="btn-pure active px-4 py-2 rounded-full text-xs font-bold flex-1 flex items-center justify-center gap-2"><Printer size={14}/> 打印</button>
                                                <button onClick={() => setShowAnalysis(false)} className="btn-pure px-4 py-2 rounded-full text-xs font-bold flex-1">收起</button>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="bg-white/60 rounded-3xl p-6 md:p-8 border border-white/60 shadow-sm">
                                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-5">
                                        <div>
                                            <div className="text-slate-800 font-bold">分析报告列表</div>
                                            <div className="text-xs text-slate-500 mt-1">点击“查看”会以浮窗打开报告内容。</div>
                                        </div>
                                        <button onClick={openAnalysisGenerateDialog} disabled={isAnalyzingClass} className="btn-primary active px-6 py-3 rounded-2xl text-sm font-bold shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                                            {isAnalyzingClass ? <Refresh className="spin" size={16}/> : <PieChart size={16} />}
                                            {isAnalyzingClass ? "AI 正在分析..." : "生成新报告"}
                                        </button>
                                    </div>

                                    <div className="space-y-3">
                                        {analysisList.map(item => (
                                            <div key={item.id} className="bg-white/70 rounded-2xl border border-slate-100 p-4">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <div className="text-sm font-bold text-slate-800 truncate">{(item.data && (item.data.subtitle || item.data.title)) || `${item.className || cls} - 分析报告`}</div>
                                                        <div className="text-[11px] text-slate-400 mt-1 truncate">
                                                            {item.className || cls}{item.examName ? ` · ${item.examName}` : ''}{item.assignmentTitle ? ` · ${item.assignmentTitle}` : ''} · {formatDateTime(item.createdAt || Date.now())}
                                                        </div>
                                                    </div>
                                                    <div className="shrink-0 flex gap-2 no-print">
                                                        <button onClick={() => setAnalysisPreview({ open: true, item })} className="btn-pure active px-3 py-2 rounded-full text-xs font-bold">查看</button>
                                                        <button onClick={() => setAnalysisHistory(prev => (Array.isArray(prev) ? prev : []).filter(x => String(x && x.id) !== String(item.id)))} className="btn-pure px-3 py-2 rounded-full text-xs font-bold text-red-500">删除</button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                        {analysisList.length === 0 && (
                                            <div className="text-center text-slate-400 py-14">
                                                <div className="text-sm font-bold mb-2">暂无分析报告</div>
                                                <div className="text-xs">点击右上角“生成新报告”。</div>
                                                {gradedCount === 0 && <div className="mt-3 text-xs text-rose-500 font-bold">当前还没有可用于统计的批改结果</div>}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="bg-white/60 rounded-3xl p-6 md:p-8 border border-white/60 shadow-sm">
                                    <div className="text-sm font-bold text-slate-700 mb-3">学生个人历次作文分析</div>
                                    {(() => {
                                        const c = getClassById(currentClassId);
                                        const roster = c && Array.isArray(c.students) ? c.students : [];
                                        const options = roster.map(s => ({
                                            studentId: (s && s.id !== undefined && s.id !== null) ? String(s.id) : '',
                                            studentName: (s && s.name) ? String(s.name).trim() : '',
                                            studentNo: (s && s.no !== undefined && s.no !== null && Number.isFinite(Number(s.no))) ? Number(s.no) : null
                                        })).filter(s => s.studentId && s.studentName);
                                        const selected = historyStudentId ? options.find(x => String(x.studentId) === String(historyStudentId)) : null;
                                        const chosen = selected || options[0] || null;
                                        const profile = chosen ? studentProfiles[String(chosen.studentId)] : null;
                                        const records = profile && Array.isArray(profile.records) ? profile.records.slice().sort((a, b) => new Date(a.gradedAt).getTime() - new Date(b.gradedAt).getTime()) : [];
                                        const currentTotal = Number(rubric && rubric.total) || 0;
                                        const maxByLabel = new Map((Array.isArray(rubric && rubric.items) ? rubric.items : []).map(it => [String(it.label), Number(it.score) || 0]));
                                        const normalizeScore = (rec) => {
                                            const r = rec && rec.result && typeof rec.result === 'object' ? rec.result : {};
                                            const raw = (rec && rec.totalScore !== undefined && rec.totalScore !== null) ? Number(rec.totalScore) : Number(r.total_score);
                                            const recTotal = Number.isFinite(Number(rec && rec.rubricTotal)) ? Number(rec.rubricTotal) : (Number.isFinite(Number(rubric && rubric.total)) ? Number(rubric.total) : 0);
                                            if (!Number.isFinite(raw)) return null;
                                            if (currentTotal > 0 && recTotal > 0) return clampNumber((raw / recTotal) * currentTotal, 0, currentTotal);
                                            return raw;
                                        };
                                        const scores = records.map(normalizeScore).filter(Number.isFinite);
                                        const first = scores.length > 0 ? scores[0] : null;
                                        const last = scores.length > 0 ? scores[scores.length - 1] : null;
                                        const avg = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length) : null;
                                        const delta = (first !== null && last !== null) ? (last - first) : null;
                                        const req = parseWordCountRequirement(rubric && rubric.wordCount);
                                        const wordCounts = records.map(rec => {
                                            const r = rec && rec.result && typeof rec.result === 'object' ? rec.result : {};
                                            const wcRaw = Number(r.word_count);
                                            const wc = Number.isFinite(wcRaw) ? wcRaw : countEnglishWordsForScoring(r.original_essay || '');
                                            return wc;
                                        });
                                        const within = req && req.min > 0 ? wordCounts.filter(wc => wc >= req.min && (!Number.isFinite(req.max) || wc <= req.max)).length : null;
                                        const withinRatio = within === null ? null : (records.length > 0 ? within / records.length : 0);
                                        const errorTypeCounts = new Map();
                                        records.forEach(rec => {
                                            const r = rec && rec.result && typeof rec.result === 'object' ? rec.result : {};
                                            const errs = Array.isArray(r.errors) ? r.errors : [];
                                            errs.forEach(e => {
                                                const t = e && e.type ? String(e.type).trim() : '';
                                                if (!t) return;
                                                errorTypeCounts.set(t, (errorTypeCounts.get(t) || 0) + 1);
                                            });
                                        });
                                        const topErrTypes = Array.from(errorTypeCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4);

                                        const buildSparkSvg = () => {
                                            const pts = scores.slice(-20);
                                            if (pts.length < 2) return null;
                                            const w = 240;
                                            const h = 54;
                                            const min = 0;
                                            const max = Number.isFinite(currentTotal) && currentTotal > 0 ? currentTotal : Math.max(...pts);
                                            const xs = pts.map((_, i) => (i / (pts.length - 1)) * (w - 10) + 5);
                                            const ys = pts.map(v => {
                                                const t = max > min ? (v - min) / (max - min) : 0.5;
                                                return (h - 8) - t * (h - 16) + 4;
                                            });
                                            const d = xs.map((x, i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(' ');
                                            return (
                                                <svg width={w} height={h} className="bg-white/60 rounded-2xl border border-slate-100">
                                                    <path d={d} fill="none" stroke="#10b981" strokeWidth="2" />
                                                    {xs.map((x, i) => <circle key={i} cx={x} cy={ys[i]} r="2.2" fill="#10b981" />)}
                                                </svg>
                                            );
                                        };

                                        const calcDimAverages = () => {
                                            const sums = new Map();
                                            const cnts = new Map();
                                            records.forEach(rec => {
                                                const r = rec && rec.result && typeof rec.result === 'object' ? rec.result : {};
                                                const b = r && r.breakdown && typeof r.breakdown === 'object' ? r.breakdown : null;
                                                if (!b) return;
                                                Object.entries(b).forEach(([k, v]) => {
                                                    const x = Number(v);
                                                    if (!Number.isFinite(x)) return;
                                                    sums.set(k, (sums.get(k) || 0) + x);
                                                    cnts.set(k, (cnts.get(k) || 0) + 1);
                                                });
                                            });
                                            const rows = Array.from(sums.entries()).map(([k, sum]) => {
                                                const c0 = cnts.get(k) || 0;
                                                const avg0 = c0 > 0 ? sum / c0 : 0;
                                                const max0 = maxByLabel.get(String(k)) || 0;
                                                const ratio = max0 > 0 ? avg0 / max0 : null;
                                                return { label: k, avg: avg0, max: max0, ratio };
                                            }).filter(r => r.max > 0);
                                            return rows.sort((a, b) => (a.ratio === null ? 1 : a.ratio) - (b.ratio === null ? 1 : b.ratio));
                                        };
                                        const dimAverages = calcDimAverages().slice(0, 3);

                                        return (
                                            <div className="space-y-3">
                                                {(() => {
                                                    const q = (historyStudentQuery || '').toString().trim();
                                                    const qNo = (q.match(/\d+/g) || []).join('');
                                                    const qName = q.replace(/\d+/g, '').trim();
                                                    const byQuery = (s) => {
                                                        if (!q) return true;
                                                        const name = (s.studentName || '').toString();
                                                        const no = (s.studentNo === undefined || s.studentNo === null) ? '' : String(s.studentNo);
                                                        const idStr = (s.studentId || '').toString();
                                                        if (qNo && (no === qNo || idStr.includes(qNo))) return true;
                                                        if (qName && name.includes(qName)) return true;
                                                        if (!qName && name.includes(q)) return true;
                                                        return false;
                                                    };
                                                    const filtered = options.filter(byQuery);
                                                    const shown = q ? (filtered.length > 0 ? filtered : options) : options;
                                                    return (
                                                        <div className="flex flex-col md:flex-row gap-2">
                                                            <select
                                                                value={historyStudentId || (chosen ? chosen.studentId : '')}
                                                                onChange={(e) => { setHistoryStudentId(e.target.value); setHistoryStudentQuery(''); }}
                                                                className="flex-1 p-3 bg-white/70 input-breath rounded-2xl text-sm font-bold outline-none text-slate-700 cursor-pointer"
                                                            >
                                                                {shown.map(s => {
                                                                    const p = studentProfiles[String(s.studentId)];
                                                                    const cnt = p && Array.isArray(p.records) ? p.records.length : 0;
                                                                    const noLabel = (s.studentNo === undefined || s.studentNo === null) ? '' : `${s.studentNo} `;
                                                                    return <option key={s.studentId} value={s.studentId}>{noLabel}{s.studentName}（{cnt}次）</option>;
                                                                })}
                                                            </select>
                                                            <input
                                                                value={historyStudentQuery}
                                                                onChange={(e) => {
                                                                    const v = e.target.value;
                                                                    setHistoryStudentQuery(v);
                                                                    const vv = (v || '').toString().trim();
                                                                    if (!vv) return;
                                                                    const noPart = (vv.match(/\d+/g) || []).join('');
                                                                    const namePart = vv.replace(/\d+/g, '').trim();
                                                                    const match = options.find(s => {
                                                                        const no = (s.studentNo === undefined || s.studentNo === null) ? '' : String(s.studentNo);
                                                                        const name = (s.studentName || '').toString();
                                                                        if (noPart && no && (no === noPart || no.startsWith(noPart))) return true;
                                                                        if (namePart && name.includes(namePart)) return true;
                                                                        if (!namePart && name.includes(vv)) return true;
                                                                        return false;
                                                                    });
                                                                    if (match && match.studentId) setHistoryStudentId(String(match.studentId));
                                                                }}
                                                                className="md:w-56 p-3 bg-white/70 input-breath rounded-2xl text-sm font-bold outline-none text-slate-700"
                                                                placeholder="搜索：序号/姓名"
                                                            />
                                                        </div>
                                                    );
                                                })()}
                                                {!chosen ? (
                                                    <div className="text-center text-slate-400 py-8">当前班级暂无学生名单</div>
                                                ) : records.length === 0 ? (
                                                    <div className="text-center text-slate-400 py-8">该学生暂无归档记录（完成批改后会自动归档）</div>
                                                ) : (
                                                    <div className="space-y-3">
                                                        <div className="grid grid-cols-3 gap-3">
                                                            <div className="bg-white/70 rounded-2xl border border-slate-100 p-3">
                                                                <div className="text-[11px] text-slate-400 font-bold">记录数</div>
                                                                <div className="text-lg font-black text-slate-800">{records.length}</div>
                                                            </div>
                                                            <div className="bg-white/70 rounded-2xl border border-slate-100 p-3">
                                                                <div className="text-[11px] text-slate-400 font-bold">均分</div>
                                                                <div className="text-lg font-black text-slate-800">{avg !== null ? `${avg.toFixed(1)}/${currentTotal || '--'}` : '--'}</div>
                                                            </div>
                                                            <div className="bg-white/70 rounded-2xl border border-slate-100 p-3">
                                                                <div className="text-[11px] text-slate-400 font-bold">进步</div>
                                                                <div className={`text-lg font-black ${delta === null ? 'text-slate-400' : (delta >= 0 ? 'text-emerald-600' : 'text-rose-600')}`}>{delta === null ? '--' : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}`}</div>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center justify-between gap-3">
                                                            <div className="text-xs font-bold text-slate-500">趋势（最近最多20次）</div>
                                                            <div className="text-[11px] text-slate-400">{req && req.min > 0 ? `字数：${rubric.wordCount}` : '字数：未设置'}</div>
                                                        </div>
                                                        {buildSparkSvg() || <div className="text-center text-slate-400 py-4 bg-white/60 rounded-2xl border border-slate-100">暂无可展示的分数趋势</div>}
                                                        <div className="grid grid-cols-1 gap-3">
                                                            <div className="bg-white/70 rounded-2xl border border-slate-100 p-3">
                                                                <div className="text-xs font-bold text-slate-500 mb-2">维度短板（近况）</div>
                                                                {dimAverages.length === 0 ? (
                                                                    <div className="text-[11px] text-slate-400">暂无维度数据</div>
                                                                ) : (
                                                                    <div className="space-y-1">
                                                                        {dimAverages.map(d => (
                                                                            <div key={d.label} className="flex items-center justify-between text-sm">
                                                                                <div className="font-bold text-slate-700 truncate">{d.label}</div>
                                                                                <div className="text-[11px] font-bold text-slate-500">{d.avg.toFixed(1)}/{d.max}</div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div className="bg-white/70 rounded-2xl border border-slate-100 p-3">
                                                                <div className="text-xs font-bold text-slate-500 mb-2">高频错误类型</div>
                                                                {topErrTypes.length === 0 ? (
                                                                    <div className="text-[11px] text-slate-400">暂无错误统计</div>
                                                                ) : (
                                                                    <div className="flex flex-wrap gap-2">
                                                                        {topErrTypes.map(([t, c0]) => (
                                                                            <div key={t} className="text-[11px] font-bold px-2 py-1 rounded-full border bg-amber-50 text-amber-700 border-amber-100">{t}×{c0}</div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div className="bg-white/70 rounded-2xl border border-slate-100 p-3">
                                                                <div className="flex items-center justify-between gap-3">
                                                                    <div className="text-xs font-bold text-slate-500">最近记录</div>
                                                                    {withinRatio !== null && <div className="text-[11px] text-slate-400">字数达标率：{Math.round(withinRatio * 100)}%</div>}
                                                                </div>
                                                                <div className="space-y-2 mt-2">
                                                                    {records.slice().reverse().slice(0, 5).map(rec => {
                                                                        const s = normalizeScore(rec);
                                                                        const r = rec && rec.result && typeof rec.result === 'object' ? rec.result : {};
                                                                        const wcRaw = Number(r.word_count);
                                                                        const wc = Number.isFinite(wcRaw) ? wcRaw : countEnglishWordsForScoring(r.original_essay || '');
                                                                        const ok = req && req.min > 0 ? (wc >= req.min && (!Number.isFinite(req.max) || wc <= req.max)) : null;
                                                                        return (
                                                                            <div key={rec.id} className="flex items-center justify-between gap-2">
                                                                                <div className="min-w-0">
                                                                                    <div className="text-[11px] text-slate-400 truncate">{formatDateTime(rec.gradedAt || Date.now())} · {rec.assignmentTitle || '未命名任务'}</div>
                                                                                </div>
                                                                                <div className="shrink-0 flex items-center gap-2">
                                                                                    <div className="text-[11px] font-bold px-2 py-1 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-100">{Number.isFinite(Number(s)) ? `${Number(s).toFixed(1)}` : '--'}/{currentTotal || '--'}</div>
                                                                                    <div className={`text-[11px] font-bold px-2 py-1 rounded-full border ${ok === null ? 'bg-slate-50 text-slate-500 border-slate-100' : (ok ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-rose-50 text-rose-600 border-rose-100')}`}>{wc}w</div>
                                                                                    <button onClick={() => setArchivedPreview({ open: true, record: rec })} className="btn-pure px-3 py-2 rounded-full text-xs font-bold">查看</button>
                                                                                    <button onClick={() => deleteStudentArchivedRecord(chosen.studentId, rec.id)} className="btn-pure px-3 py-2 rounded-full text-xs font-bold text-red-500">删除</button>
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()}
                                </div>

                                <div className="bg-white/60 rounded-3xl p-6 md:p-8 border border-white/60 shadow-sm">
                                    <div className="text-sm font-bold text-slate-700 mb-3">已保存结果</div>
                                    <div className="space-y-3">
                                        {savedList.map(item => (
                                            <div key={item.id} className="bg-white/70 rounded-2xl border border-slate-100 p-4">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <div className="text-sm font-bold text-slate-800 truncate">{item.name || '未命名结果'}</div>
                                                        <div className="text-[11px] text-slate-400 mt-1 truncate">{item.className || '未分班级'} · {formatDateTime(item.savedAt || Date.now())} · {item.gradedCount || 0} 份</div>
                                                    </div>
                                                </div>
                                                <div className="flex gap-2 mt-3 no-print">
                                                    <button onClick={() => applySavedGradingSnapshot(item)} className="btn-pure active px-3 py-2 rounded-full text-xs font-bold flex-1">恢复</button>
                                                    <button onClick={() => downloadSavedGradingSnapshot(item)} className="btn-pure px-3 py-2 rounded-full text-xs font-bold flex-1">下载</button>
                                                    <button onClick={() => deleteSavedGradingSnapshot(item.id)} className="btn-pure px-3 py-2 rounded-full text-xs font-bold text-red-500">删除</button>
                                                </div>
                                            </div>
                                        ))}
                                        {savedList.length === 0 && (
                                            <div className="text-center text-slate-400 py-8">暂无保存结果</div>
                                        )}
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>
                );
            };

            return (
                <div className="min-h-screen flex flex-col relative">
                    {/* Dynamic Print Styles Injection */}
                    <style>{`
                        @media print {
                            @page {
                                margin: ${pdfConfig.padding}mm !important;
                                size: A4 portrait;
                            }
                            .a4-wrapper { font-size: ${10.5 * (Number.isFinite(Number(pdfConfig.fontSizeScale)) ? Number(pdfConfig.fontSizeScale) : 1.0)}pt !important; line-height: ${Math.max(1.0, Number.isFinite(Number(pdfConfig.lineHeight)) ? Number(pdfConfig.lineHeight) : 1.2)} !important; }
                            .a4-wrapper .annotation { font-size: 9pt !important; color: #94a3b8 !important; }
                            .a4-wrapper .annotation * { color: #94a3b8 !important; }
                            .a4-wrapper u, .a4-wrapper .underline { text-decoration: none !important; }
                        }
                    `}</style>

                    <div className="no-print">
                        {workflowMode === 'full' ? <Stepper currentStep={step} maxStep={maxStep} steps={['评分标准', '导入作文', '批改导出', '班级分析']} onStepClick={navigateTo} onHelp={() => setShowHelp(true)} onConfig={() => setShowConfig(true)} onHome={()=>{setWorkflowMode('quick');setStep(0);}} /> : (
                            <header className="teacher-quick-header">
                                <a href="/"><img src="/favicon.svg" alt=""/>智能英语作文批改</a>
                                <div>{step !== 0 && <button onClick={() => setStep(0)}>返回快速批改</button>}{step === 2 && <button onClick={() => setStep(3)}>班级分析</button>}<button onClick={() => setShowConfig(true)}>设置</button><button onClick={() => setWorkflowMode('full')}>完整工作台</button></div>
                            </header>
                        )}
                        
                        <main className={`pb-32 pt-24 ${workflowMode === 'quick' ? 'teacher-quick-main' : 'teacher-full-main'}`}>
                            <CloudConnection busy={isBatchProcessing}/>
                            {cloud.mode==='cloud'&&cloud.identity?.role==='admin'&&<React.Suspense fallback={null}><SchoolDirectoryPanel/></React.Suspense>}
                            <div className="teacher-task-tools">
                            {cloud.mode === 'cloud' && <TeacherTasksPanel assignment={assignment} rubric={rubric} settings={{pdfConfig,csvExportConfig,languageDifficulty}} busy={isBatchProcessing} sourceTask={sourceTask} onOpenReports={(task,reports,members) => {
                                if(isBatchProcessing)throw new Error('请先暂停当前批改，再载入班级结果。');
                                if(files.some(file=>!file.cloudBoundRef||file.cloudBoundRef.taskId!==task.id))throw new Error('当前工作台已有其他作文。请先保存结果，再到完整工作台的“导入作文”中清空重选，然后载入班级结果。');
                                if(!reports.length)return;
                                const document=reports[0].document;
                                if(reports.some(item=>JSON.stringify(item.document.rubric)!==JSON.stringify(document.rubric)||JSON.stringify(item.document.assignment)!==JSON.stringify(document.assignment)))throw new Error('这些报告对应不同题目或评分标准，请按任务版本分别查看。');
                                setAssignment(document.assignment);setRubric(document.rubric);setSourceTask(task);
                                const imported=taskClasses({task,document},members,classes),ids=imported.map(c=>c.id);setClasses(previous=>[...previous.filter(c=>!ids.includes(c.id)),...imported]);setCurrentClassId(ids[0]||'');setActiveClassIds(ids);
                                if(document.settings.pdfConfig)setPdfConfig(document.settings.pdfConfig);
                                if(document.settings.csvExportConfig)setCsvExportConfig(document.settings.csvExportConfig);
                                if(document.settings.languageDifficulty)setLanguageDifficulty(document.settings.languageDifficulty);
                                const restored=reports.map((item,index)=>({id:'bound-'+item.report.id,index:index+1,name:item.document.identity.name,status:'success',result:item.document.result,url:item.document.result.original_image_url,cloudAssetIds:item.document.source.manifest.pages.map(page=>page.assetId),cloudBoundRef:{id:item.report.id,revision:item.report.revision,taskId:task.id,inputHash:item.document.provenance.inputHash},targetClassId:'daily:'+item.document.identity.classId}));
                                setFiles(restored);setSelectedFileId(restored[0].id);setStep(2);setMaxStep(previous=>Math.max(previous,2));setPauseBanner('已载入学生关联报告，可沿用原有导出和分析。需要修改时，请打开“班级批阅”保存教师版本。');
                            }} onApply={(value,members) => {
                                if(isBatchProcessing)return;
                                if(files.length)throw new Error('当前批次已有作文。请先保存结果，再到完整工作台的“导入作文”中清空重选，然后载入任务，避免旧报告套用新标准。');
                                setAssignment(value.document.assignment);setRubric(value.document.rubric);setSourceTask(value.task);
                                const settings=value.document.settings||{};
                                if(settings.pdfConfig)setPdfConfig(settings.pdfConfig);
                                if(settings.csvExportConfig)setCsvExportConfig(settings.csvExportConfig);
                                if(settings.languageDifficulty)setLanguageDifficulty(settings.languageDifficulty);
                                if(members.length){
                                    const imported=taskClasses(value,members,classes),ids=imported.map(c=>c.id);
                                    setClasses(previous=>[...previous.filter(c=>!ids.includes(c.id)),...imported]);setCurrentClassId(ids[0]);setActiveClassIds(ids);
                                } else setClasses(previous=>previous.map(c=>String(c.id)===String(currentClassId)?{...c,gradeLevel:value.document.rubric.gradeLevel}:c));
                                setStep(0);
                            }}/>}
                            {cloud.mode === 'cloud' && <CloudSnapshotsPanel sync={cloudSnapshots} onDownload={downloadSavedGradingSnapshot} onRestore={value => {
                                applySavedGradingSnapshot({...value.snapshot,cloud:value.cloud});
                                if(!isBatchProcessing){setStep(2);setMaxStep(previous => Math.max(previous,2));}
                            }}/>}
                            </div>
                            {draftError && <p className="mx-auto max-w-3xl px-4 py-2 text-xs text-amber-700" role="status">{draftError}</p>}
                            {workflowMode === 'full' && <div className="teacher-mode-bar"><div>完整工作台</div><button onClick={() => { setWorkflowMode('quick'); setStep(0); }}>切换到快速批改</button></div>}
                            {step === 0 && (workflowMode === 'full' ? renderStep1() : <QuickGrading
                                assignment={assignment} setAssignment={setAssignment} rubric={rubric}
                                setRubric={updater => setRubric(prev => { const next = typeof updater === 'function' ? updater(prev) : updater; return next.total !== prev.total ? { ...next, items: redistributeItemScoresToTotal(next.items, next.total) } : next; })}
                                classes={classes} currentClassId={currentClassId} activeClassIds={activeClassIds} setCurrentClassId={setCurrentClassId} setActiveClassIds={setActiveClassIds}
                                onGradeChange={gradeLevel => { setRubric(prev => ({ ...prev, gradeLevel })); if (activeClassIds.length <= 1) setClasses(prev => prev.map(c => String(c.id) === String(currentClassId) ? { ...c, gradeLevel } : c)); }}
                                files={files} isBatchProcessing={isBatchProcessing} configReady={cloud.mode === 'cloud' ? modelReady : !!config.apiKey}
                                onPromptUpload={handlePromptImageUpload} onRecognizePrompt={extractPromptTextFromImage}
                                onUpload={handleStudentUpload} onManageStudents={() => setShowStudentMgmt(true)} onModelSettings={() => setShowConfig(true)}
                                onAdvanced={() => { setWorkflowMode('full'); setStep(0); }} onImportRubric={() => setShowRubricImportModal(true)}
                                onRemoveFile={id => { const old = files.find(f => f.id === id); if (old?.url) URL.revokeObjectURL(old.url); setFiles(prev => prev.filter(f => f.id !== id)); if (selectedFileId === id) setSelectedFileId(files.find(f => f.id !== id)?.id || null); }}
                                onRetry={() => setFiles(prev => prev.map(f => f.status === 'error' ? { ...f, status: 'idle' } : f))}
                                onStart={handleQuickStart}
                            />)}
                            {step === 1 && renderStep2()}
                            {step === 2 && renderStep3()}
                            {step === 3 && renderStep4()}
                        </main>
                        
                        {/* ISO Glass Navigation Pill */}
                        {workflowMode === 'full' && <div className="teacher-navigation fixed bottom-8 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 p-2 glass-iso rounded-full shadow-2xl transition-all hover:-translate-y-1">
                            <button onClick={() => setStep(s => Math.max(0, s-1))} disabled={step === 0} className="btn-pure flex items-center gap-2 px-8 py-3.5 rounded-full font-bold text-sm hover-glow">
                                <ArrowLeft size={18} strokeWidth={2.5} /> 上一步
                            </button>
                            {step < 3 && <button onClick={() => {
                                if(step===0 && !assignment.topic) return alert("请填写或生成题目文字稿");
                                if(step===1 && files.length===0) return alert("请至少上传一张图片");
                                advanceStep();
                            }} className="btn-pure active flex items-center gap-2 px-8 py-3.5 rounded-full font-bold text-sm hover-glow">
                                下一步 <ArrowRight size={18} strokeWidth={2.5} />
                            </button>}
                        </div>}
                    </div>

                    <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
                    
                    {/* Modals - Same as previous version, ensuring consistency */}
                    <Modal isOpen={showConfig} onClose={() => setShowConfig(false)} title="系统设置" footer={<button onClick={() => setShowConfig(false)} className="btn-pure active px-6 py-2.5 rounded-full text-sm font-bold">完成</button>}>
                         <div className="space-y-6 py-2">
                            {cloud.mode === 'cloud' ? <CloudModelSettings temperature={config.temperature} onTemperatureChange={temperature => setConfig(prev => ({...prev,temperature}))}/> : <div className="space-y-3">
                                <h3 className="font-bold text-slate-700 text-sm">API 设置</h3>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1.5 ml-1">模型预设</label>
                                    <select
                                        value={config.preset || 'custom'}
                                        onChange={e => {
                                            const value = e.target.value;
                                            setConfig(prev => {
                                                const next = { ...prev, preset: value };
                                                if (value === 'aliyun-dashscope') {
                                                    next.apiUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
                                                    if (!prev.model) next.model = 'qwen3-omni-flash';
                                                } else if (value === 'openai') {
                                                    next.apiUrl = 'https://api.openai.com/v1/chat/completions';
                                                    if (!prev.model) next.model = 'gpt-4o';
                                                } else if (value === 'gemini-proxy') {
                                                    next.apiUrl = 'https://gemini.newsunenglish.com/v1/chat/completions';
                                                    if (!prev.model) next.model = 'gemini-1.5-flash-001';
                                                } else if (value === 'deepseek') {
                                                    next.apiUrl = 'https://api.deepseek.com/v1/chat/completions';
                                                    if (!prev.model) next.model = 'deepseek-chat';
                                                }
                                                if (value === 'custom' && !prev.apiUrl) {
                                                    next.apiUrl = '';
                                                }
                                                return next;
                                            });
                                        }}
                                        className="w-full p-3 input-breath rounded-xl text-sm outline-none"
                                    >
                                        <option value="aliyun-dashscope">阿里云通义 Qwen（OpenAI 兼容）</option>
                                        <option value="openai">OpenAI 官方</option>
                                        <option value="gemini-proxy">Gemini 代理（兼容模式）</option>
                                        <option value="deepseek">DeepSeek</option>
                                        <option value="custom">自定义 / 其它</option>
                                    </select>
                                    <div className="mt-1 text-[11px] text-slate-400 ml-1">选择预设后只需填写 API Key 和模型名称即可使用，接口地址会自动填入，可根据需要手动微调。</div>
                                </div>
                                <div><label className="block text-xs font-bold text-slate-500 mb-1.5 ml-1">API Address</label><input type="text" value={config.apiUrl} onChange={e=>setConfig({...config, apiUrl: e.target.value})} className="w-full p-3 input-breath rounded-xl text-sm font-mono outline-none" placeholder="https://..." /></div>
                                <div><label className="block text-xs font-bold text-slate-500 mb-1.5 ml-1">API Key</label><input type="password" value={config.apiKey} onChange={e=>setConfig({...config, apiKey: e.target.value})} className="w-full p-3 input-breath rounded-xl text-sm font-mono outline-none" /></div>
                                <div><label className="block text-xs font-bold text-slate-500 mb-1.5 ml-1">Model</label><input type="text" value={config.model} onChange={e=>setConfig({...config, model: e.target.value})} className="w-full p-3 input-breath rounded-xl text-sm font-mono outline-none" placeholder="如：qwen3-omni-flash / gpt-4o / deepseek-chat" /></div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1.5 ml-1">Temperature</label>
                                    <input type="range" min="0" max="1" step="0.05" value={typeof config.temperature === 'number' && !Number.isNaN(config.temperature) ? config.temperature : 0.3} onChange={e=>setConfig({...config, temperature: parseFloat(e.target.value)})} className="w-full" />
                                    <div className="mt-1 text-[11px] text-slate-400 ml-1">数值越低越稳定，推荐 0.3 以减少幻觉。</div>
                                </div>
                            </div>}
                            <hr className="border-slate-100"/>
                            <div className="space-y-3">
                                <h3 className="font-bold text-slate-700 text-sm">数据管理</h3>
                                <div className="flex gap-3">
                                    <button onClick={exportData} className="flex-1 btn-pure flex items-center justify-center gap-2 py-3 rounded-xl text-sm"><Download size={16}/> 备份数据</button>
                                    <label className="flex-1 btn-pure flex items-center justify-center gap-2 py-3 rounded-xl text-sm cursor-pointer hover:bg-white">
                                        <UploadCloud size={16}/> 还原数据
                                        <input type="file" className="hidden" accept=".json" onChange={importData} />
                                    </label>
                                </div>
                            </div>
                        </div>
                    </Modal>

                    <Modal isOpen={showRubricImportModal} onClose={() => setShowRubricImportModal(false)} title="评分标准导入（可选）" large footer={<button onClick={() => setShowRubricImportModal(false)} className="btn-pure active px-6 py-2.5 rounded-full text-sm font-bold">关闭</button>}>
                        <div className="space-y-6 py-2">
                            <div className="bg-white/60 p-6 rounded-3xl border border-white/60 shadow-sm">
                                <div className="flex items-center justify-between gap-3 mb-4">
                                    <div>
                                        <div className="text-sm font-bold text-slate-800">从文件导入评分标准</div>
                                        <div className="text-xs text-slate-400 mt-1">支持 PDF / DOCX / TXT，解析后可应用到评分模板。</div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <label className="btn-pure px-4 py-2 rounded-full text-xs font-bold cursor-pointer flex items-center gap-2">
                                            <UploadCloud size={14} /> 选择文件
                                            <input type="file" accept=".pdf,.docx,.txt" className="hidden" onChange={handleRubricDocSelected} />
                                        </label>
                                        <button onClick={startRubricParse} disabled={!rubricParseState.file || rubricParseState.status === 'extracting' || rubricParseState.status === 'analyzing'} className="btn-pure active px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 disabled:opacity-50">
                                            {(rubricParseState.status === 'extracting' || rubricParseState.status === 'analyzing') ? <Refresh size={14} className="spin"/> : <Sparkles size={14} />}
                                            {rubricParseState.status === 'analyzing' ? 'AI 解析中...' : '开始解析'}
                                        </button>
                                        <button onClick={applyParsedRubricToSystem} disabled={!rubricParseState.result} className="btn-pure px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 disabled:opacity-50">
                                            <Check size={14} /> 应用到评分模板
                                        </button>
                                    </div>
                                </div>

                                <div className="text-xs text-slate-500 flex flex-wrap gap-3 items-center">
                                    <div className="bg-white/70 border border-slate-100 rounded-full px-3 py-1">文件：<span className="font-semibold text-slate-700">{rubricParseState.fileName || '未选择'}</span></div>
                                    <div className="bg-white/70 border border-slate-100 rounded-full px-3 py-1">状态：<span className="font-semibold text-slate-700">{rubricParseState.status}</span></div>
                                    {rubricParseState.error && <div className="text-red-600 font-semibold">{rubricParseState.error}</div>}
                                </div>

                                {rubricParseState.extractedText && (
                                    <details className="mt-4">
                                        <summary className="cursor-pointer text-xs font-bold text-slate-600">查看提取文本</summary>
                                        <div className="mt-3 p-4 bg-slate-50 rounded-2xl border border-slate-100 text-xs text-slate-600 whitespace-pre-wrap max-h-60 overflow-auto">{rubricParseState.extractedText}</div>
                                    </details>
                                )}
                            </div>

                            <div className="bg-white/60 p-6 rounded-3xl border border-white/60 shadow-sm">
                                <div className="flex items-start justify-between gap-3 mb-3">
                                    <div>
                                        <div className="text-sm font-bold text-slate-800">直接粘贴评分标准文本</div>
                                        <div className="text-xs text-slate-400 mt-1">粘贴评分细则原文后解析并应用到模板。</div>
                                    </div>
                                    <button
                                        onClick={startRubricParseFromText}
                                        disabled={!rubricPasteText.trim() || rubricParseState.status === 'extracting' || rubricParseState.status === 'analyzing'}
                                        className="btn-pure active px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 disabled:opacity-50"
                                    >
                                        {(rubricParseState.status === 'extracting' || rubricParseState.status === 'analyzing') ? <Refresh size={14} className="spin"/> : <Sparkles size={14} />}
                                        {rubricParseState.status === 'analyzing' ? 'AI 解析中...' : '解析粘贴文本'}
                                    </button>
                                </div>
                                <textarea
                                    className="w-full min-h-[140px] p-4 bg-white/70 input-breath rounded-2xl text-xs outline-none font-mono shadow-inner"
                                    placeholder="在此粘贴评分标准原文，例如试卷说明或教案中的评分细则..."
                                    value={rubricPasteText}
                                    onChange={e => setRubricPasteText(e.target.value)}
                                />
                            </div>

                            {rubricParseState.result && (
                                <div className="bg-white/60 p-6 rounded-3xl border border-white/60 shadow-sm">
                                    <div className="flex items-center justify-between gap-3 mb-4">
                                        <div>
                                            <div className="text-sm font-bold text-slate-800">解析结果（可编辑）</div>
                                            <div className="text-xs text-slate-400 mt-1">确认无误后点击“应用到评分模板”。</div>
                                        </div>
                                        <button onClick={() => setRubricParseState(p => ({ ...p, result: null }))} className="btn-pure px-4 py-2 rounded-full text-xs font-bold">清空结果</button>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="bg-white/60 rounded-2xl border border-white/60 p-4">
                                            <div className="text-[11px] font-bold text-slate-400 uppercase mb-2">总分</div>
                                            <input type="number" value={rubricParseState.result.total ?? ''} onChange={e => setRubricParseState(p => ({ ...p, result: { ...(p.result || {}), total: parseFloat(e.target.value) || 0 } }))} className="w-full bg-transparent font-bold text-2xl outline-none text-slate-800" />
                                        </div>
                                        <div className="bg-white/60 rounded-2xl border border-white/60 p-4">
                                            <div className="text-[11px] font-bold text-slate-400 uppercase mb-2">字数要求</div>
                                            <input value={rubricParseState.result.wordCount ?? ''} onChange={e => setRubricParseState(p => ({ ...p, result: { ...(p.result || {}), wordCount: e.target.value } }))} className="w-full input-breath p-2 rounded-lg text-sm outline-none" />
                                        </div>
                                        <div className="bg-white/60 rounded-2xl border border-white/60 p-4">
                                            <div className="text-[11px] font-bold text-slate-400 uppercase mb-2">年级</div>
                                            <input value={rubricParseState.result.gradeLevel ?? ''} onChange={e => setRubricParseState(p => ({ ...p, result: { ...(p.result || {}), gradeLevel: e.target.value } }))} className="w-full input-breath p-2 rounded-lg text-sm outline-none" />
                                        </div>
                                        <div className="bg-white/60 rounded-2xl border border-white/60 p-4">
                                            <div className="text-[11px] font-bold text-slate-400 uppercase mb-2">评分松紧度</div>
                                            <input value={rubricParseState.result.strictness ?? ''} onChange={e => setRubricParseState(p => ({ ...p, result: { ...(p.result || {}), strictness: e.target.value } }))} className="w-full input-breath p-2 rounded-lg text-sm outline-none" />
                                        </div>
                                    </div>
                                    <div className="mt-4 space-y-3">
                                        {Array.isArray(rubricParseState.result.dimensions) && rubricParseState.result.dimensions.map((d, idx) => (
                                            <details key={idx} className="bg-white rounded-2xl border border-slate-100 p-4">
                                                <summary className="cursor-pointer flex items-center justify-between">
                                                    <div className="text-sm font-bold text-slate-800">{d?.name || `维度 ${idx + 1}`}</div>
                                                    <div className="text-xs text-slate-400 font-semibold">{d?.points ?? ''} 分</div>
                                                </summary>
                                                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div>
                                                        <div className="text-[11px] font-bold text-slate-400 uppercase mb-1">维度名称</div>
                                                        <input value={d?.name ?? ''} onChange={e => setRubricParseState(p => {
                                                            const r = JSON.parse(JSON.stringify(p.result || {}));
                                                            r.dimensions = Array.isArray(r.dimensions) ? r.dimensions : [];
                                                            if (!r.dimensions[idx]) r.dimensions[idx] = {};
                                                            r.dimensions[idx].name = e.target.value;
                                                            return { ...p, result: r };
                                                        })} className="w-full input-breath p-2 rounded-lg text-sm outline-none" />
                                                    </div>
                                                    <div>
                                                        <div className="text-[11px] font-bold text-slate-400 uppercase mb-1">分值</div>
                                                        <input type="number" value={d?.points ?? ''} onChange={e => setRubricParseState(p => {
                                                            const r = JSON.parse(JSON.stringify(p.result || {}));
                                                            r.dimensions = Array.isArray(r.dimensions) ? r.dimensions : [];
                                                            if (!r.dimensions[idx]) r.dimensions[idx] = {};
                                                            r.dimensions[idx].points = parseFloat(e.target.value) || 0;
                                                            return { ...p, result: r };
                                                        })} className="w-full input-breath p-2 rounded-lg text-sm outline-none" />
                                                    </div>
                                                    <div className="md:col-span-2">
                                                        <div className="text-[11px] font-bold text-slate-400 uppercase mb-1">核心描述</div>
                                                        <textarea value={d?.description ?? ''} onChange={e => setRubricParseState(p => {
                                                            const r = JSON.parse(JSON.stringify(p.result || {}));
                                                            r.dimensions = Array.isArray(r.dimensions) ? r.dimensions : [];
                                                            if (!r.dimensions[idx]) r.dimensions[idx] = {};
                                                            r.dimensions[idx].description = e.target.value;
                                                            return { ...p, result: r };
                                                        })} className="w-full p-3 bg-white/70 input-breath rounded-xl text-sm outline-none min-h-20" />
                                                    </div>
                                                </div>
                                            </details>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </Modal>

                    <Modal isOpen={showCsvHistory} onClose={() => setShowCsvHistory(false)} title="CSV 导出历史" large footer={<button onClick={() => setShowCsvHistory(false)} className="btn-pure active px-6 py-2.5 rounded-full text-sm font-bold">关闭</button>}>
                        <div className="space-y-5 py-2">
                            <div className="flex flex-col md:flex-row md:items-center gap-3">
                                <label className="flex items-center gap-2 text-sm text-slate-700">
                                    <input type="checkbox" checked={!!csvExportConfig.includeUtf8Bom} onChange={(e) => setCsvExportConfig(p => ({ ...p, includeUtf8Bom: !!e.target.checked }))} />
                                    包含 UTF-8 BOM（Excel 更友好）
                                </label>
                                <div className="flex-1" />
                                <button onClick={clearCsvHistory} disabled={(csvExportHistory || []).length === 0} className="btn-pure px-4 py-2 rounded-full text-xs font-bold text-red-500 disabled:opacity-50 disabled:cursor-not-allowed">清空历史</button>
                            </div>

                            <div className="flex flex-col md:flex-row gap-3">
                                <input value={csvHistoryQuery} onChange={(e) => setCsvHistoryQuery(e.target.value)} placeholder="搜索：班级 / 任务 / 文件名 / 日期" className="flex-1 p-3 rounded-2xl glass-iso outline-none focus:ring-2 focus:ring-indigo-200 text-sm" />
                                <button onClick={() => setCsvHistoryQuery('')} disabled={!csvHistoryQuery} className="btn-pure px-4 py-2 rounded-full text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed">清除搜索</button>
                                <button onClick={exportCsvForClass} disabled={files.filter(f => f.status === 'success' && f.result).length === 0} className="btn-pure active px-4 py-2 rounded-full text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed">导出本班 CSV</button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {exportCsvHistoryFiltered().map(item => (
                                    <div key={item.id} className="bg-white/80 rounded-2xl border border-white shadow-sm p-4 flex flex-col gap-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="text-sm font-bold text-slate-800 truncate">{item.className || '未分班级'} · {item.taskName || '未命名任务'}</div>
                                                <div className="text-xs text-slate-500 mt-1 truncate">{item.fileName || ''}</div>
                                            </div>
                                            <div className="shrink-0 text-[11px] font-bold px-2 py-1 rounded-full border bg-indigo-50 text-indigo-600 border-indigo-100">{item.count || 0} 份</div>
                                        </div>

                                        <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
                                            <div className="truncate">导出时间：{formatDateTime(item.exportedAt || Date.now())}</div>
                                            <div className="shrink-0">{item.includeUtf8Bom ? 'BOM: 开' : 'BOM: 关'}</div>
                                        </div>

                                        <div className="flex gap-2">
                                            <button onClick={() => downloadCsvHistoryItem(item)} className="btn-pure active px-3 py-2 rounded-full text-xs font-bold flex-1">下载</button>
                                            <button onClick={() => deleteCsvHistoryItem(item.id)} className="btn-pure px-3 py-2 rounded-full text-xs font-bold text-red-500">删除</button>
                                        </div>
                                    </div>
                                ))}
                                {exportCsvHistoryFiltered().length === 0 && (
                                    <div className="col-span-full text-center text-slate-400 py-10">暂无导出历史</div>
                                )}
                            </div>
                        </div>
                    </Modal>

                    <Modal
                        isOpen={showSaveDialog}
                        onClose={() => setShowSaveDialog(false)}
                        title="保存批改结果"
                        footer={
                            <>
                                <button onClick={() => setShowSaveDialog(false)} className="btn-pure px-6 py-2.5 rounded-full text-sm font-bold">取消</button>
                                <button onClick={() => saveCurrentGradingSnapshot(saveDraftName)} className="btn-pure active px-6 py-2.5 rounded-full text-sm font-bold">保存</button>
                            </>
                        }
                    >
                        <div className="space-y-4 py-2">
                            <div className="text-xs text-slate-500">{cloud.mode === 'cloud' ? '本机先保留副本，再同步报告、当次评分标准和原稿到云端。同步失败时本机结果仍会保留。' : '保存到本地浏览器存储（不包含任何 API Key）。可在“班级分析”里管理与恢复。'}</div>
                            {cloud.mode === 'cloud' && activeCloudSnapshot && <label className="flex items-start gap-2 text-xs text-slate-600"><input type="checkbox" checked={saveToCurrentCloud} onChange={event => setSaveToCurrentCloud(event.target.checked)}/><span>更新当前云端存档“{activeCloudSnapshot.name}”（第 {activeCloudSnapshot.revision} 版），保留旧版本。未勾选则另存为新记录。</span></label>}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1.5 ml-1">名称</label>
                                <input aria-label="批改存档名称" value={saveDraftName} onChange={(e) => setSaveDraftName(e.target.value)} className="w-full p-3 input-breath rounded-xl text-sm outline-none" placeholder={buildDefaultSaveName()} />
                            </div>
                            <div className="text-xs text-slate-400">直接点击“保存”会使用默认名称；修改后会使用你输入的名称。</div>
                        </div>
                    </Modal>

                    <Modal
                        isOpen={showAnalysisGenerateDialog}
                        onClose={() => setShowAnalysisGenerateDialog(false)}
                        title="选择分析范围"
                        footer={
                            <>
                                <button onClick={() => setShowAnalysisGenerateDialog(false)} className="btn-pure px-6 py-2.5 rounded-full text-sm font-bold">取消</button>
                                <button onClick={confirmGenerateClassAnalysis} disabled={isAnalyzingClass} className="btn-pure active px-6 py-2.5 rounded-full text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed">开始分析</button>
                            </>
                        }
                    >
                        {(() => {
                            const cls = getClassNameById(currentClassId) || '未分班级';
                            const currentGradedCount = (Array.isArray(files) ? files : []).filter(f => f && f.status === 'success' && f.result).length;
                            const list = Array.isArray(savedGradingResults) ? savedGradingResults : [];
                            const eligible = list.filter(x => {
                                if (!x) return false;
                                const cid = (x.classId || '').toString();
                                if (currentClassId && cid && String(currentClassId) === cid) return true;
                                const cn = (x.className || '').toString().trim();
                                return cn && cn === cls;
                            });
                            return (
                                <div className="space-y-4 py-2">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <button onClick={() => setAnalysisGenerateMode('current')} className={`btn-pure px-4 py-4 rounded-2xl text-left ${analysisGenerateMode === 'current' ? 'active' : ''}`}>
                                            <div className="text-sm font-bold text-slate-800">分析当前批改</div>
                                            <div className="text-xs text-slate-500 mt-1">使用当前页面中的批改结果（已批改 {currentGradedCount} 份）</div>
                                        </button>
                                        <button onClick={() => setAnalysisGenerateMode('history')} className={`btn-pure px-4 py-4 rounded-2xl text-left ${analysisGenerateMode === 'history' ? 'active' : ''}`}>
                                            <div className="text-sm font-bold text-slate-800">分析历史批改</div>
                                            <div className="text-xs text-slate-500 mt-1">使用已保存的批改快照（当前班级 {eligible.length} 份）</div>
                                        </button>
                                    </div>

                                    {analysisGenerateMode === 'history' && (
                                        <div className="bg-white/60 rounded-2xl border border-white/60 p-4">
                                            <div className="text-xs font-bold text-slate-500 mb-2">选择历史批改快照</div>
                                            <select value={analysisGenerateSnapshotId} onChange={(e) => setAnalysisGenerateSnapshotId(e.target.value)} className="w-full p-3 bg-white/70 input-breath rounded-2xl text-sm font-bold outline-none text-slate-700 cursor-pointer">
                                                {eligible.map(it => (
                                                    <option key={it.id} value={it.id}>{(it.name || '未命名结果').toString().trim()} · {formatDateTime(it.savedAt || Date.now())} · {it.gradedCount || 0}份</option>
                                                ))}
                                            </select>
                                            {eligible.length === 0 && (
                                                <div className="text-xs text-rose-500 font-bold mt-2">当前班级暂无历史批改快照，请先在“已保存结果”里保存一次批改结果。</div>
                                            )}
                                        </div>
                                    )}

                                    {analysisGenerateMode === 'current' && currentGradedCount === 0 && (
                                        <div className="text-xs text-rose-500 font-bold">当前没有可用于分析的批改结果；可切换到“分析历史批改”。</div>
                                    )}
                                </div>
                            );
                        })()}
                    </Modal>

                    <Modal
                        isOpen={showRubricBackupDialog}
                        onClose={() => setShowRubricBackupDialog(false)}
                        title="标准备份"
                        footer={
                            <>
                                <button onClick={() => setShowRubricBackupDialog(false)} className="btn-pure px-6 py-2.5 rounded-full text-sm font-bold">取消</button>
                                <button onClick={confirmRubricBackup} className="btn-pure active px-6 py-2.5 rounded-full text-sm font-bold">保存备份</button>
                            </>
                        }
                    >
                        <div className="space-y-4 py-2">
                            <div className="text-xs text-slate-500">默认会自动组合考试名称、Topic Title、班级与时间。</div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1.5 ml-1">备份名称</label>
                                <input value={rubricBackupName} onChange={(e) => setRubricBackupName(e.target.value)} className="w-full p-3 input-breath rounded-xl text-sm outline-none" placeholder={buildDefaultRubricHistoryName()} />
                            </div>
                            <div className="text-[11px] text-slate-400">内容包含：考试名称、Topic Title、题目要点、参考范文、评分标准（含人工调整）。</div>
                        </div>
                    </Modal>

                    <Modal
                        isOpen={showRubricBackupSuccess}
                        onClose={() => setShowRubricBackupSuccess(false)}
                        title="备份成功"
                        footer={<button onClick={() => setShowRubricBackupSuccess(false)} className="btn-pure active px-6 py-2.5 rounded-full text-sm font-bold">知道了</button>}
                    >
                        <div className="py-2 text-sm text-slate-700">标准备份成功：<span className="font-bold">{rubricBackupSuccessName || ''}</span></div>
                    </Modal>

                    <Modal
                        isOpen={!!(analysisPreview && analysisPreview.open && analysisPreview.item)}
                        onClose={() => setAnalysisPreview({ open: false, item: null })}
                        title="班级分析报告"
                        large
                        footer={
                            <>
                                <button onClick={() => setAnalysisPreview({ open: false, item: null })} className="btn-pure px-6 py-2.5 rounded-full text-sm font-bold">关闭</button>
                                <button onClick={() => handlePrint('analysis')} className="btn-pure active px-6 py-2.5 rounded-full text-sm font-bold flex items-center gap-2"><Printer size={18}/> 打印</button>
                            </>
                        }
                    >
                        {(() => {
                            const item = analysisPreview && analysisPreview.item;
                            if (!item) return null;
                            return (
                                <div className="space-y-4">
                                    <div className="text-xs text-slate-500">
                                        {item.className || ''}{item.examName ? ` · ${item.examName}` : ''}{item.assignmentTitle ? ` · ${item.assignmentTitle}` : ''} · {formatDateTime(item.createdAt || Date.now())}
                                    </div>
                                    <div className="bg-slate-50/80 p-4 rounded-2xl shadow-sm border border-slate-100">
                                        <ClassAnalysisReport data={item.data} assignment={assignment} currentClass={item.className || getClassNameById(currentClassId) || ''} />
                                    </div>
                                </div>
                            );
                        })()}
                    </Modal>

                    <Modal
                        isOpen={showRubricHistory}
                        onClose={() => setShowRubricHistory(false)}
                        title="标准恢复"
                        large
                    >
                        <div className="space-y-4 py-2">
                            <div className="text-xs text-slate-500">点击某条备份即可恢复（包含：考试名称、Topic Title、题目要点、参考范文、评分标准）。</div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {(Array.isArray(rubricHistory) ? rubricHistory : []).map(item => (
                                    <div key={item.id} onClick={() => restoreRubricFromHistory(item)} className="bg-white/80 rounded-2xl border border-white shadow-sm p-4 flex flex-col gap-3 cursor-pointer hover:bg-white transition">
                                        <div className="min-w-0">
                                            <div className="text-sm font-bold text-slate-800 truncate">{item.name || '未命名备份'}</div>
                                            <div className="text-[11px] text-slate-400 mt-1 truncate">{item.className || '未分班级'}{item.examName ? ` · ${item.examName}` : ''}{item.assignmentTitle ? ` · ${item.assignmentTitle}` : ''}</div>
                                            <div className="text-[11px] text-slate-400 truncate">保存时间：{formatDateTime(item.createdAt || Date.now())}</div>
                                        </div>
                                        <div className="flex justify-end gap-2">
                                            <button onClick={(e) => { e.stopPropagation(); deleteRubricHistoryItem(item.id); }} className="btn-pure px-3 py-2 rounded-full text-xs font-bold text-red-500">删除</button>
                                        </div>
                                    </div>
                                ))}
                                {(!rubricHistory || rubricHistory.length === 0) && (
                                    <div className="col-span-full text-center text-slate-400 py-10">暂无备份历史</div>
                                )}
                            </div>
                        </div>
                    </Modal>

                    <Modal isOpen={showPDFSettings} onClose={() => setShowPDFSettings(false)} title="PDF 排版设置">
                         <div className="space-y-6 py-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">页边距 (Padding): {pdfConfig.padding}mm</label>
                                <input type="range" min="10" max="40" step="1" value={pdfConfig.padding} onChange={e => setPdfConfig({...pdfConfig, padding: parseInt(e.target.value)})} className="w-full" />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">行间距 (Line Height): {pdfConfig.lineHeight}</label>
                                <input type="range" min="1.0" max="2.0" step="0.1" value={pdfConfig.lineHeight} onChange={e => setPdfConfig({...pdfConfig, lineHeight: parseFloat(e.target.value)})} className="w-full" />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">板块间距 (Section Gap): {pdfConfig.sectionGapPt}pt</label>
                                <input type="range" min="4" max="16" step="1" value={pdfConfig.sectionGapPt} onChange={e => setPdfConfig({...pdfConfig, sectionGapPt: parseInt(e.target.value)})} className="w-full" />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">段落间距 (Paragraph Gap): {pdfConfig.paragraphGapPt}pt</label>
                                <input type="range" min="0" max="8" step="0.5" value={Number.isFinite(Number(pdfConfig.paragraphGapPt)) ? pdfConfig.paragraphGapPt : 2} onChange={e => setPdfConfig({...pdfConfig, paragraphGapPt: parseFloat(e.target.value)})} className="w-full" />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">字体缩放 (Scale): {pdfConfig.fontSizeScale}x</label>
                                <input type="range" min="0.8" max="1.2" step="0.05" value={pdfConfig.fontSizeScale} onChange={e => setPdfConfig({...pdfConfig, fontSizeScale: parseFloat(e.target.value)})} className="w-full" />
                            </div>
                            <div className="flex items-center gap-2 pt-2">
                                <input id="showPrompt" type="checkbox" checked={!!pdfConfig.showPrompt} onChange={e => setPdfConfig({...pdfConfig, showPrompt: e.target.checked})} className="w-4 h-4" />
                                <label htmlFor="showPrompt" className="text-xs text-slate-600">在 PDF 中显示作文题目</label>
                            </div>
                            <div className="flex items-center gap-2">
                                <input id="showOriginal" type="checkbox" checked={!!pdfConfig.showOriginal} onChange={e => setPdfConfig({...pdfConfig, showOriginal: e.target.checked})} className="w-4 h-4" />
                                <label htmlFor="showOriginal" className="text-xs text-slate-600">在 PDF 中显示作文原稿（如有图片则显示截图）</label>
                            </div>
                         </div>
                    </Modal>

                     <Modal isOpen={showHelp} onClose={() => setShowHelp(false)} title="使用指南">
                         <div className="space-y-5 py-2 text-sm text-slate-600">
                             <div className="flex gap-4"><div className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold shrink-0 text-xs shadow-sm">1</div><div><strong className="text-slate-900 block mb-1">评分标准</strong>填写考试名称（Exam Name）、Topic Title、题目文字稿与要点分析；可生成标准范文。支持“标准备份/标准恢复”用于全局数据回滚。</div></div>
                            <div className="flex gap-4"><div className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold shrink-0 text-xs shadow-sm">2</div><div><strong className="text-slate-900 block mb-1">导入作文</strong>在“学生名单管理”选择本次批改范围（可选）；上传作文图片后系统会自动识别姓名并归档到学生历次记录。</div></div>
                            <div className="flex gap-4"><div className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold shrink-0 text-xs shadow-sm">3</div><div><strong className="text-slate-900 block mb-1">批改导出</strong>开始批改后可在纸张视图中修改结果；支持打印/导出所有 PDF；支持保存批改结果快照，便于后续复用与班级分析再分析。</div></div>
                            <div className="flex gap-4"><div className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold shrink-0 text-xs shadow-sm">4</div><div><strong className="text-slate-900 block mb-1">班级分析</strong>生成报告时可选择“分析当前批改”或“分析历史批改快照”；报告以列表管理，点击可浮窗查看/打印。</div></div>
                            <div className="flex gap-4"><div className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold shrink-0 text-xs shadow-sm">5</div><div><strong className="text-slate-900 block mb-1">学生个人历次</strong>在班级分析页可随时查看学生趋势与最近记录；支持单条删除、打开单篇详情。</div></div>
                        </div>
                    </Modal>

                    <Modal isOpen={showStudentMgmt} onClose={() => setShowStudentMgmt(false)} title="学生管理" large footer={<button onClick={() => setShowStudentMgmt(false)} className="btn-pure active px-6 py-2.5 rounded-full text-sm font-bold">保存</button>}>
                        <div className="space-y-6 py-2">
                            <div className="flex flex-col md:flex-row gap-3">
                                <input id="newClassInputV5" type="text" className="flex-1 input-breath p-3 rounded-xl text-sm outline-none" placeholder="新增班级名称，例如：701班" />
                                <button onClick={() => {
                                    const el = document.getElementById('newClassInputV5');
                                    const val = el ? el.value : '';
                                    addClass(val);
                                    const created = (val || '').toString().trim();
                                    if (created) {
                                        const c = (Array.isArray(classes) ? classes : []).find(x => x && String(x.name).trim() === created) || null;
                                        if (c) setCurrentClassId(String(c.id));
                                    }
                                    if (el) el.value = '';
                                }} className="btn-pure active px-5 rounded-xl text-sm font-bold">添加班级</button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="bg-white/70 rounded-3xl p-5 border border-white/60 shadow-sm">
                                    <div className="text-xs font-bold text-slate-500 mb-3">班级列表</div>
                                    <div className="space-y-2 max-h-[360px] overflow-auto pr-1">
                                        {(Array.isArray(classes) ? classes : []).map(c => (
                                            <div key={c.id} className={`p-3 rounded-2xl border flex items-center gap-2 ${String(c.id) === String(currentClassId) ? 'bg-indigo-50 border-indigo-200' : 'bg-white/60 border-slate-100'}`}>
                                                <button onClick={() => setCurrentClassId(String(c.id))} className="text-sm font-bold text-slate-700 truncate flex-1 text-left">{c.name}</button>
                                                <select value={c.gradeLevel || rubric.gradeLevel} onChange={(e) => {
                                                    const v = e.target.value;
                                                    setClasses(prev => (prev || []).map(x => x && String(x.id) === String(c.id) ? { ...x, gradeLevel: v } : x));
                                                }} className="p-2 bg-transparent text-xs font-bold outline-none text-slate-700 cursor-pointer border border-slate-200 rounded-full">
                                                    {GRADE_LEVELS.map(g => <option key={g} value={g}>{g}</option>)}
                                                </select>
                                                <button onClick={() => deleteClassById(c.id)} className="text-slate-300 hover:text-red-400"><X size={16}/></button>
                                            </div>
                                        ))}
                                        {(Array.isArray(classes) ? classes : []).length === 0 && <div className="text-center text-slate-400 py-10">暂无班级</div>}
                                    </div>
                                </div>

                                <div className="bg-white/70 rounded-3xl p-5 border border-white/60 shadow-sm">
                                    <div className="text-xs font-bold text-slate-500 mb-2">当前班级学生名单</div>
                                    <div className="text-[11px] text-slate-400 mb-3">支持“序号 姓名”或“姓名”。例如：49 戴紫桂</div>
                                    <textarea value={studentImportText} onChange={(e) => setStudentImportText(e.target.value)} className="w-full h-28 p-3 input-breath rounded-xl text-xs outline-none resize-none font-mono" placeholder="49 戴紫桂\n50 张三\n李四" />
                                    <div className="flex items-center gap-2 mt-3">
                                        <button onClick={() => { upsertStudentsFromText(currentClassId, studentImportText); setStudentImportText(''); }} className="btn-pure active px-4 py-2 rounded-full text-xs font-bold">添加到名单</button>
                                        <div className="text-xs text-slate-500">当前人数：{(() => {
                                            const cls = getClassById(currentClassId);
                                            const students = cls && Array.isArray(cls.students) ? cls.students : [];
                                            return students.length;
                                        })()}</div>
                                    </div>
                                    <div className="mt-4 max-h-[220px] overflow-auto pr-1 space-y-2">
                                        {(() => {
                                            const cls = getClassById(currentClassId);
                                            const students = cls && Array.isArray(cls.students) ? cls.students : [];
                                            if (students.length === 0) return <div className="text-center text-slate-400 py-6">暂无学生</div>;
                                            return students.map(st => (
                                                <div key={st.id} className="flex items-center gap-2 bg-white/60 border border-slate-100 rounded-2xl px-3 py-2">
                                                    <input
                                                        type="number"
                                                        value={(st.no === undefined || st.no === null) ? '' : st.no}
                                                        onChange={(e) => {
                                                            const v = e.target.value === '' ? null : Number(e.target.value);
                                                            updateStudentInClass(currentClassId, st.id, { no: Number.isFinite(v) ? v : null });
                                                        }}
                                                        className="w-16 bg-transparent text-xs font-bold text-slate-700 border border-slate-200 rounded-xl px-2 py-1 outline-none"
                                                        placeholder="No"
                                                    />
                                                    <input
                                                        value={st.name || ''}
                                                        onChange={(e) => updateStudentInClass(currentClassId, st.id, { name: e.target.value })}
                                                        className="flex-1 bg-transparent text-sm font-semibold text-slate-700 outline-none border-b border-transparent focus:border-indigo-300"
                                                    />
                                                    <button onClick={() => removeStudentFromClass(currentClassId, st.id)} className="text-slate-300 hover:text-red-400"><Trash size={14}/></button>
                                                </div>
                                            ));
                                        })()}
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white/60 border border-white/60 rounded-3xl p-5">
                                <div className="flex items-center justify-between gap-3 mb-2">
                                    <div className="text-xs font-bold text-slate-500">粘贴“序号 班级 姓名”批量导入（自动建班并写入学生）</div>
                                    <button onClick={() => {
                                        const parsed = parseClassStudentImportText(bulkStudentImportText);
                                        if (!parsed.classes || parsed.classes.length === 0) return alert('未识别到“班级 姓名”结构，请检查粘贴内容');
                                        setClasses(prev => {
                                            const list = Array.isArray(prev) ? prev : [];
                                            const byName = new Map(list.map(c => [String(c.name).trim(), c]));
                                            const next = [...list];
                                            for (const clsName of parsed.classes) {
                                                const key = String(clsName).trim();
                                                if (!key) continue;
                                                if (!byName.has(key)) {
                                                    const id = createId();
                                                    const obj = { id, name: key, gradeLevel: rubric.gradeLevel, students: [] };
                                                    byName.set(key, obj);
                                                    next.push(obj);
                                                }
                                                const clsObj = byName.get(key);
                                                const entries = Array.isArray(parsed.studentsByClass && parsed.studentsByClass[clsName]) ? parsed.studentsByClass[clsName] : [];
                                                const students = Array.isArray(clsObj.students) ? clsObj.students : [];
                                                const byNorm2 = new Map();
                                                students.forEach((s, idx) => {
                                                    const k = s && s.name ? normalizeName(s.name) : '';
                                                    if (k) byNorm2.set(k, idx);
                                                });
                                                const mergedStudents = students.slice();
                                                for (const it of entries) {
                                                    const k = normalizeName(it.name);
                                                    if (!k) continue;
                                                    const hit = byNorm2.get(k);
                                                    if (hit === undefined) {
                                                        mergedStudents.push({ id: createId(), name: it.name, no: (it.no === null ? null : it.no), aliases: [] });
                                                        byNorm2.set(k, mergedStudents.length - 1);
                                                    } else {
                                                        const cur = mergedStudents[hit] || {};
                                                        const nextNo = (it.no === null || it.no === undefined) ? cur.no : it.no;
                                                        mergedStudents[hit] = { ...cur, name: cur.name || it.name, no: nextNo };
                                                    }
                                                }
                                                clsObj.students = mergedStudents.slice().sort((a, b) => {
                                                    const an = Number(a && a.no);
                                                    const bn = Number(b && b.no);
                                                    const aHas = Number.isFinite(an);
                                                    const bHas = Number.isFinite(bn);
                                                    if (aHas && bHas) return an - bn;
                                                    if (aHas) return -1;
                                                    if (bHas) return 1;
                                                    return String(a && a.name || '').localeCompare(String(b && b.name || ''), 'zh');
                                                });
                                            }
                                            return next;
                                        });
                                        setBulkStudentImportText('');
                                    }} className="btn-pure active px-4 py-2 rounded-full text-xs font-bold">识别并导入</button>
                                </div>
                                <textarea value={bulkStudentImportText} onChange={e => setBulkStudentImportText(e.target.value)} className="w-full h-28 p-3 input-breath rounded-xl text-xs outline-none resize-none font-mono" placeholder="序号\t班级\t姓名\n49\t714\t戴紫桂\n50\t714\t张三" />
                                <div className="mt-2 text-[11px] text-slate-400">支持空格/Tab/逗号分隔；首行包含“班级 姓名”会自动跳过。</div>
                            </div>
                        </div>
                    </Modal>

                    <Modal isOpen={showStudentProfiles} onClose={() => setShowStudentProfiles(false)} title="学生档案" large footer={<button onClick={() => setShowStudentProfiles(false)} className="btn-pure active px-6 py-2.5 rounded-full text-sm font-bold">关闭</button>}>
                        {(() => {
                            const allStudents = (Array.isArray(classes) ? classes : []).flatMap(c => {
                                const students = c && Array.isArray(c.students) ? c.students : [];
                                return students.map(s => ({
                                    classId: c.id,
                                    className: c.name,
                                    gradeLevel: c.gradeLevel || rubric.gradeLevel,
                                    studentId: s.id,
                                    studentName: s.name
                                }));
                            });
                            const q = (profilesQuery || '').toString().trim().toLowerCase();
                            const filtered = !q ? allStudents : allStudents.filter(s => String(s.studentName || '').toLowerCase().includes(q) || String(s.className || '').toLowerCase().includes(q));
                            const selected = profilesSelectedStudentId ? filtered.find(s => String(s.studentId) === String(profilesSelectedStudentId)) || allStudents.find(s => String(s.studentId) === String(profilesSelectedStudentId)) : (filtered[0] || null);
                            const profile = selected ? studentProfiles[String(selected.studentId)] : null;
                            const records = profile && Array.isArray(profile.records) ? profile.records.slice().sort((a, b) => new Date(a.gradedAt).getTime() - new Date(b.gradedAt).getTime()) : [];
                            const scores = records.map(r => Number(r && r.totalScore)).filter(Number.isFinite);
                            const first = scores.length > 0 ? scores[0] : null;
                            const last = scores.length > 0 ? scores[scores.length - 1] : null;
                            const avg = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length) : null;
                            const delta = (first !== null && last !== null) ? (last - first) : null;
                            const rubricTotal = (records[0] && Number.isFinite(Number(records[0].rubricTotal))) ? Number(records[0].rubricTotal) : Number(rubric.total);

                            const buildSparkSvg = () => {
                                const pts = scores.slice(-20);
                                if (pts.length < 2) return null;
                                const w = 240;
                                const h = 60;
                                const min = 0;
                                const max = Number.isFinite(rubricTotal) && rubricTotal > 0 ? rubricTotal : Math.max(...pts);
                                const xs = pts.map((_, i) => (i / (pts.length - 1)) * (w - 10) + 5);
                                const ys = pts.map(v => {
                                    const t = max > min ? (v - min) / (max - min) : 0.5;
                                    return (h - 8) - t * (h - 16) + 4;
                                });
                                const d = xs.map((x, i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(' ');
                                return (
                                    <svg width={w} height={h} className="bg-white/60 rounded-2xl border border-slate-100">
                                        <path d={d} fill="none" stroke="#6366f1" strokeWidth="2" />
                                        {xs.map((x, i) => <circle key={i} cx={x} cy={ys[i]} r="2.5" fill="#6366f1" />)}
                                    </svg>
                                );
                            };

                            return (
                                <div className="space-y-5 py-2">
                                    <div className="flex gap-3">
                                        <input value={profilesQuery} onChange={(e) => setProfilesQuery(e.target.value)} placeholder="搜索：学生姓名 / 班级" className="flex-1 p-3 rounded-2xl glass-iso outline-none focus:ring-2 focus:ring-indigo-200 text-sm" />
                                        <button onClick={() => setProfilesQuery('')} disabled={!profilesQuery} className="btn-pure px-4 py-2 rounded-full text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed">清除</button>
                                    </div>
                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                        <div className="text-[11px] text-slate-400">
                                            当前班级：<span className="font-semibold text-slate-600">{getClassNameById(currentClassId) || '未选择'}</span>
                                            {(() => {
                                                const cls = getClassById(currentClassId);
                                                const roster = cls && Array.isArray(cls.students) ? cls.students : [];
                                                const ids = roster.map(s => (s && s.id !== undefined && s.id !== null) ? String(s.id) : '').filter(Boolean);
                                                const total = ids.reduce((acc, sid) => {
                                                    const p = studentProfiles && studentProfiles[String(sid)];
                                                    const cnt = p && Array.isArray(p.records) ? p.records.length : 0;
                                                    return acc + cnt;
                                                }, 0);
                                                if (!currentClassId) return '';
                                                return ` · 班级记录数：${total}`;
                                            })()}
                                        </div>
                                        <button
                                            onClick={() => {
                                                if (!currentClassId) return alert('请先在主界面选择一个班级（学生名单管理处）。');
                                                const clsName = getClassNameById(currentClassId) || '当前班级';
                                                const cls = getClassById(currentClassId);
                                                const roster = cls && Array.isArray(cls.students) ? cls.students : [];
                                                const ids = roster.map(s => (s && s.id !== undefined && s.id !== null) ? String(s.id) : '').filter(Boolean);
                                                const total = ids.reduce((acc, sid) => {
                                                    const p = studentProfiles && studentProfiles[String(sid)];
                                                    const cnt = p && Array.isArray(p.records) ? p.records.length : 0;
                                                    return acc + cnt;
                                                }, 0);
                                                const ok = window.confirm(`确定要清空“${clsName}”全班档案记录吗？\n- 学生人数：${ids.length}\n- 归档记录：${total}\n\n此操作不可恢复。`);
                                                if (!ok) return;
                                                clearArchivedRecordsForClass(currentClassId);
                                            }}
                                            className="btn-pure px-4 py-2 rounded-full text-xs font-bold text-red-500"
                                        >
                                            一键清空本班记录
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="bg-white/70 rounded-3xl p-5 border border-white/60 shadow-sm">
                                            <div className="text-xs font-bold text-slate-500 mb-3">学生列表</div>
                                            <div className="space-y-2 max-h-[420px] overflow-auto pr-1">
                                                {filtered.map(s => {
                                                    const p = studentProfiles[String(s.studentId)];
                                                    const cnt = p && Array.isArray(p.records) ? p.records.length : 0;
                                                    return (
                                                        <button key={s.studentId} onClick={() => setProfilesSelectedStudentId(String(s.studentId))} className={`w-full text-left p-3 rounded-2xl border flex items-center gap-3 ${String(selected?.studentId) === String(s.studentId) ? 'bg-indigo-50 border-indigo-200' : 'bg-white/60 border-slate-100 hover:bg-white'}`}>
                                                            <div className="min-w-0 flex-1">
                                                                <div className="text-sm font-bold text-slate-800 truncate">{s.studentName}</div>
                                                                <div className="text-[11px] text-slate-400 truncate">{s.className} · {s.gradeLevel}</div>
                                                            </div>
                                                            <div className="shrink-0 text-[11px] font-bold px-2 py-1 rounded-full border bg-indigo-50 text-indigo-600 border-indigo-100">{cnt} 次</div>
                                                        </button>
                                                    );
                                                })}
                                                {filtered.length === 0 && <div className="text-center text-slate-400 py-10">未找到学生</div>}
                                            </div>
                                        </div>
                                        <div className="bg-white/70 rounded-3xl p-5 border border-white/60 shadow-sm">
                                            {!selected ? (
                                                <div className="text-center text-slate-400 py-16">请选择学生查看档案</div>
                                            ) : (
                                                <div className="space-y-4">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div>
                                                            <div className="text-lg font-bold text-slate-800">{selected.studentName}</div>
                                                            <div className="text-xs text-slate-400 mt-1">{selected.className} · {selected.gradeLevel}</div>
                                                        </div>
                                                        <div className="text-right text-xs text-slate-500">
                                                            <div>记录数：{records.length}</div>
                                                            {avg !== null && <div>均分：{avg.toFixed(1)}/{rubricTotal}</div>}
                                                            {delta !== null && <div>进步：{delta >= 0 ? '+' : ''}{delta.toFixed(1)}</div>}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center justify-between gap-3">
                                                        <div className="text-xs font-bold text-slate-500">趋势</div>
                                                        <div className="text-[11px] text-slate-400">最近最多 20 次</div>
                                                    </div>
                                                    {buildSparkSvg() || <div className="text-center text-slate-400 py-6 bg-white/60 rounded-2xl border border-slate-100">暂无可展示的分数趋势</div>}
                                                    <div className="flex items-center justify-between gap-2 mt-2">
                                                        <div className="text-xs font-bold text-slate-500">历次记录</div>
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                onClick={() => {
                                                                    const next = !profilesMultiSelect;
                                                                    setProfilesMultiSelect(next);
                                                                    if (!next) setProfilesSelectedRecordIds(new Set());
                                                                }}
                                                                className={`btn-pure px-3 py-1.5 rounded-full text-[11px] font-bold ${profilesMultiSelect ? 'active' : ''}`}
                                                            >
                                                                多选删除
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    if (!profilesMultiSelect) return;
                                                                    const allIds = records.map(r => String(r && r.id)).filter(Boolean);
                                                                    const all = profilesSelectedRecordIds && typeof profilesSelectedRecordIds.has === 'function' ? allIds.every(id => profilesSelectedRecordIds.has(id)) : false;
                                                                    setProfilesSelectedRecordIds(new Set(all ? [] : allIds));
                                                                }}
                                                                disabled={!profilesMultiSelect || records.length === 0}
                                                                className="btn-pure px-3 py-1.5 rounded-full text-[11px] font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                                                            >
                                                                全选
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    if (!profilesMultiSelect) return;
                                                                    const ids = Array.from(profilesSelectedRecordIds || []).map(x => String(x || '')).filter(Boolean);
                                                                    if (!selected || ids.length === 0) return;
                                                                    const ok = window.confirm(`确定删除所选 ${ids.length} 条归档记录吗？\n此操作不可恢复。`);
                                                                    if (!ok) return;
                                                                    deleteStudentArchivedRecordsBulk(selected.studentId, ids);
                                                                    setProfilesSelectedRecordIds(new Set());
                                                                }}
                                                                disabled={!profilesMultiSelect || !selected || !profilesSelectedRecordIds || profilesSelectedRecordIds.size === 0}
                                                                className="btn-pure px-3 py-1.5 rounded-full text-[11px] font-bold text-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                                            >
                                                                删除所选{profilesMultiSelect && profilesSelectedRecordIds && profilesSelectedRecordIds.size > 0 ? `(${profilesSelectedRecordIds.size})` : ''}
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className="space-y-2 max-h-[260px] overflow-auto pr-1">
                                                        {records.slice().reverse().map(rec => (
                                                            <div key={rec.id} className="p-3 rounded-2xl border bg-white/60 border-slate-100">
                                                                <div className="flex items-start justify-between gap-3">
                                                                    <div className="min-w-0">
                                                                        <div className="text-sm font-bold text-slate-800 truncate">{rec.assignmentTitle || '未命名任务'}</div>
                                                                        <div className="text-[11px] text-slate-400 truncate">{formatDateTime(rec.gradedAt || Date.now())} · {rec.fileName || ''}</div>
                                                                    </div>
                                                                    <div className="shrink-0 text-[11px] font-bold px-2 py-1 rounded-full border bg-green-50 text-green-700 border-green-100">{Number.isFinite(Number(rec.totalScore)) ? `${Number(rec.totalScore).toFixed(1)}` : '--'}/{rec.rubricTotal || rubricTotal}</div>
                                                                </div>
                                                                <div className="flex items-center gap-2 mt-3">
                                                                    {profilesMultiSelect && (
                                                                        <label className="flex items-center gap-2 px-3 py-2 rounded-full border bg-slate-50 text-slate-600 border-slate-100 text-xs font-bold">
                                                                            <input
                                                                                type="checkbox"
                                                                                className="accent-indigo-600"
                                                                                checked={profilesSelectedRecordIds && typeof profilesSelectedRecordIds.has === 'function' ? profilesSelectedRecordIds.has(String(rec.id)) : false}
                                                                                onChange={() => {
                                                                                    const rid = String(rec && rec.id || '');
                                                                                    if (!rid) return;
                                                                                    setProfilesSelectedRecordIds(prev => {
                                                                                        const base = prev && typeof prev.has === 'function' ? prev : new Set();
                                                                                        const next = new Set(base);
                                                                                        if (next.has(rid)) next.delete(rid);
                                                                                        else next.add(rid);
                                                                                        return next;
                                                                                    });
                                                                                }}
                                                                            />
                                                                            选中
                                                                        </label>
                                                                    )}
                                                                    <button onClick={() => setArchivedPreview({ open: true, record: rec })} className="btn-pure active px-3 py-2 rounded-full text-xs font-bold flex-1">查看报告</button>
                                                                    <button onClick={() => {
                                                                        if (!selected) return;
                                                                        const ok = window.confirm('确定删除该条归档记录吗？此操作不可恢复。');
                                                                        if (!ok) return;
                                                                        deleteStudentArchivedRecord(selected.studentId, rec.id);
                                                                        setProfilesSelectedRecordIds(prev => {
                                                                            const base = prev && typeof prev.has === 'function' ? prev : new Set();
                                                                            const next = new Set(base);
                                                                            next.delete(String(rec.id));
                                                                            return next;
                                                                        });
                                                                    }} className="btn-pure px-3 py-2 rounded-full text-xs font-bold text-red-500">删除</button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                        {records.length === 0 && <div className="text-center text-slate-400 py-10">暂无归档记录</div>}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}
                    </Modal>

                    {archivedPreview && archivedPreview.open && archivedPreview.record && (
                        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center no-print" style={{ zIndex: 130 }}>
                            <div className="bg-slate-50 rounded-3xl shadow-2xl max-w-6xl w-full max-h-[90vh] flex flex-col overflow-hidden">
                                <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200">
                                    <div>
                                        <div className="text-xs font-semibold text-slate-400 mb-1">学生档案 · 报告预览</div>
                                        <div className="text-sm font-bold text-slate-800 truncate">{(archivedPreview.record.result && archivedPreview.record.result.student_name) || archivedPreview.record.fileName || '报告'}</div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button onClick={() => setArchivedPreview({ open: false, record: null })} className="w-8 h-8 rounded-full flex items-center justify-center bg-slate-100 text-slate-600 hover:bg-slate-200">
                                            <X size={16} />
                                        </button>
                                    </div>
                                </div>
                                <div className="flex-1 overflow-auto flex items-start justify-center p-6">
                                    <div className="shadow-xl border border-slate-200 rounded-3xl overflow-hidden bg-white max-w-[900px] w-full">
                                        <EditablePaper data={archivedPreview.record.result} assignment={assignment} rubric={rubric} studentIndex={0} readOnly={true} pdfConfig={pdfConfig} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {(() => {
                        const f = previewFileId ? files.find(x => x.id === previewFileId && x.status === 'success') : null;
                        if (!f) return null;
                        return (
                            <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center no-print" style={{ zIndex: 130 }}>
                                <div className="bg-slate-50 rounded-3xl shadow-2xl max-w-6xl w-full max-h-[90vh] flex flex-col overflow-hidden">
                                    <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200">
                                        <div>
                                            <div className="text-xs font-semibold text-slate-400 mb-1">PDF 浮窗预览</div>
                                            <div className="text-sm font-bold text-slate-800 truncate">{f.name || `学生 ${f.index}`}</div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="flex items-center gap-1 bg-white rounded-full border border-slate-200 px-3 py-1">
                                                <button onClick={() => setPreviewScale(Math.max(0.5, Number((previewScale - 0.1).toFixed(2))))} className="w-6 h-6 rounded-full flex items-center justify-center text-slate-600 hover:bg-slate-100 text-sm">-</button>
                                                <span className="text-xs text-slate-500 w-10 text-center">{Math.round(previewScale * 100)}%</span>
                                                <button onClick={() => setPreviewScale(Math.min(2, Number((previewScale + 0.1).toFixed(2))))} className="w-6 h-6 rounded-full flex items-center justify-center text-slate-600 hover:bg-slate-100 text-sm">+</button>
                                                <button onClick={() => setPreviewScale(1)} className="ml-1 px-2 h-6 rounded-full text-[10px] font-semibold text-slate-500 hover:bg-slate-100">重置</button>
                                            </div>
                                            <button onClick={() => { setPreviewFileId(null); setPreviewScale(1); }} className="w-8 h-8 rounded-full flex items-center justify-center bg-slate-100 text-slate-600 hover:bg-slate-200">
                                                <X size={16} />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex-1 overflow-auto flex items-start justify-center p-6">
                                        <div className="shadow-xl border border-slate-200 rounded-3xl overflow-hidden bg-white" style={{ transform: `scale(${previewScale})`, transformOrigin: 'top center' }}>
                                            <EditablePaper data={f.result} assignment={assignment} rubric={rubric} studentIndex={f.index} readOnly={true} pdfConfig={pdfConfig} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })()}

                    <div className="print-area">
                        <div className="no-print max-w-7xl mx-auto mt-8 px-4">
                            {files.filter(f => f.status === 'success').length > 0 && (
                                <div className="bg-white/70 glass-panel rounded-3xl p-6 border border-white/80">
                                    <div className="flex items-center justify-between mb-4 gap-4">
                                        <div>
                                            <h3 className="text-sm font-bold text-slate-700">PDF 预览</h3>
                                            <p className="text-xs text-slate-400 mt-1">点击缩略图可在浮窗中放大查看；需要连续浏览所有学生时，可点击右下角“整体预览”打开下方连续预览区域。</p>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {files.filter(f => f.status === 'success').map(f => (
                                            <div key={f.id} className="cursor-pointer group" onClick={() => { setPreviewFileId(f.id); setPreviewScale(1); }}>
                                                <div className="aspect-[210/297] bg-white rounded-2xl shadow-md border border-slate-100 overflow-hidden relative">
                                                    <div className="absolute inset-0 origin-top-left transform scale-[0.33] w-[300%] h-[300%] pointer-events-none">
                                                        <div className="scale-[1] origin-top-left">
                                                            <EditablePaper data={f.result} assignment={assignment} rubric={rubric} studentIndex={f.index} readOnly={true} pdfConfig={pdfConfig} />
                                                        </div>
                                                    </div>
                                                    <div className="absolute inset-0 bg-transparent group-hover:bg-black/5 transition-colors"></div>
                                                </div>
                                                <div className="mt-2 text-center">
                                                    <div className="text-xs font-semibold text-slate-700">{(f.result && f.result.student_name) || f.name || `学生 ${f.index}`}</div>
                                                    <div className="text-[11px] text-green-600 font-bold bg-green-50 inline-block px-2 py-0.5 rounded-full mt-1 border border-green-100">{f.result.total_score}分</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {overallPreviewOpen && (
                            <div className="no-print max-w-7xl mx-auto mt-6 mb-24 px-4">
                                {files.filter(f => f.status === 'success').length > 0 && (
                                    <div className="bg-white/70 glass-panel rounded-3xl p-6 border border-white/80">
                                        <div className="flex items-center justify-between mb-4 gap-4">
                                            <div>
                                                <h3 className="text-sm font-bold text-slate-700">PDF 整体预览</h3>
                                                <p className="text-xs text-slate-400 mt-1">下方按学生顺序连续展示所有批改报告，方便滚动浏览；再次点击右下角“整体预览”可关闭本区域。</p>
                                            </div>
                                        </div>
                                        <div className="space-y-8">
                                            {files.filter(f => f.status === 'success').map(f => (
                                                <div key={f.id} className="flex flex-col items-center">
                                                    <div className="shadow-xl border border-slate-200 rounded-3xl overflow-hidden bg-white max-w-[900px] w-full">
                                                        <EditablePaper data={f.result} assignment={assignment} rubric={rubric} studentIndex={f.index} readOnly={true} pdfConfig={pdfConfig} />
                                                    </div>
                                                    <div className="mt-3 text-center">
                                                        <div className="text-xs font-semibold text-slate-700">{(f.result && f.result.student_name) || f.name || `学生 ${f.index}`}</div>
                                                        <div className="text-[11px] text-green-600 font-bold bg-green-50 inline-block px-2 py-0.5 rounded-full mt-1 border border-green-100">{f.result.total_score}分</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Student Reports for printing only */}
                        {files.filter(f => f.status === 'success').map(f => {
                            const pages = estimatePageCount(f.result);
                            const effectivePdfConfig = getEffectivePdfConfigForPages(pdfConfig, pages);
                            return (
                                <div key={f.id} className={`print-container ${selectedFileId === f.id ? 'active-print-item' : ''}`}>
                                    <EditablePaper
                                        data={f.result}
                                        assignment={assignment}
                                        rubric={rubric}
                                        studentIndex={f.index}
                                        readOnly={true}
                                        pdfConfig={effectivePdfConfig}
                                    />
                                </div>
                            );
                        })}
                        {/* Analysis Report Print Only Version - Always available for printing if data exists */}
                        {analysisData && (
                            <div className="analysis-print-container">
                                <ClassAnalysisReport data={analysisData} assignment={assignment} currentClass={getClassNameById(currentClassId) || ''} dateOverride={null} />
                            </div>
                        )}
                    </div>
                </div>
            );
        };


export default App;
