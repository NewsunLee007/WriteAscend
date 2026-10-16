// Original report content and teacher editing retained.
import React, {useState,useEffect} from "react";
import {Edit,Trash,Plus} from "lucide-react";
import {indentParagraphs,clampNumber,roundToHalf,countEnglishWords} from "./legacy-core.js";
        const EditablePaper = ({ data, assignment, rubric, studentIndex, onUpdate, readOnly = false, pdfConfig }) => {
            const [localData, setLocalData] = useState(data);
            
            const adjustHeight = (e) => {
                e.target.style.height = 'auto';
                e.target.style.height = e.target.scrollHeight + 'px';
            };

            useEffect(() => { setLocalData(data); }, [data]);
            
            const handleChange = (field, value, nestedKey) => {
                if (readOnly) return;
                const newData = { ...localData };
                if (nestedKey) { if (!newData[field]) newData[field] = {}; newData[field][nestedKey] = value; } 
                else { newData[field] = value; }
                setLocalData(newData);
            };

            const handleTotalChange = (e) => {
                if (readOnly) return;
                const valStr = e.target.value;
                const newTotal = parseFloat(valStr);
                if (valStr === '') { setLocalData({ ...localData, total_score: '' }); return; }
                if (isNaN(newTotal)) return;

                const oldTotal = parseFloat(localData.total_score) || 0;
                if (oldTotal === 0) { setLocalData({ ...localData, total_score: newTotal }); return; }

                const ratio = newTotal / oldTotal;
                const newBreakdown = { ...localData.breakdown };
                const items = Array.isArray(rubric && rubric.items) ? rubric.items : [];
                const maxByLabel = {};
                for (const it of items) {
                    const label = (it && it.label) ? String(it.label) : '';
                    if (!label) continue;
                    maxByLabel[label] = Number(it && it.score) || 0;
                }
                for (let key in newBreakdown) {
                    const raw = (Number(newBreakdown[key]) || 0) * ratio;
                    const max = Number(maxByLabel[key]) || 0;
                    newBreakdown[key] = clampNumber(roundToHalf(raw), 0, max);
                }
                let sum = 0;
                for (let key in newBreakdown) {
                    const v = Number(newBreakdown[key]);
                    if (Number.isFinite(v)) sum += v;
                }
                sum = roundToHalf(sum);
                const delta = roundToHalf(newTotal - sum);
                if (delta !== 0 && items.length > 0) {
                    const lastLabel = String(items[items.length - 1].label);
                    const max = Number(maxByLabel[lastLabel]) || 0;
                    newBreakdown[lastLabel] = clampNumber(roundToHalf((Number(newBreakdown[lastLabel]) || 0) + delta), 0, max);
                }
                const finalSum = roundToHalf(Object.values(newBreakdown).reduce((a, b) => a + (Number(b) || 0), 0));
                setLocalData({ ...localData, total_score: finalSum, breakdown: newBreakdown });
            };

            const handleBreakdownChange = (label, e) => {
                if (readOnly) return;
                const valStr = e.target.value;
                const newScore = parseFloat(valStr);
                const newBreakdown = { ...localData.breakdown };
                if (valStr === '') newBreakdown[label] = '';
                else if (!isNaN(newScore)) {
                    const items = Array.isArray(rubric && rubric.items) ? rubric.items : [];
                    const found = items.find(it => String(it && it.label) === String(label));
                    const max = Number(found && found.score) || 0;
                    newBreakdown[label] = clampNumber(roundToHalf(newScore), 0, max);
                }

                let newTotal = 0;
                for (let key in newBreakdown) {
                    const val = parseFloat(newBreakdown[key]);
                    if(!isNaN(val)) newTotal += val;
                }
                newTotal = roundToHalf(newTotal);
                setLocalData({ ...localData, breakdown: newBreakdown, total_score: newTotal });
            };
            
            const handleBlur = () => { if (!readOnly && onUpdate) onUpdate(localData); };
            
            const InputEl = ({ value, onChange, className, type = "text", ...props }) => {
                const safeVal = value === undefined || value === null ? '' : value;
                if (readOnly) return <span className={className}>{safeVal}</span>;
                return (
                    <input
                        type={type}
                        value={safeVal}
                        onChange={onChange}
                        onBlur={handleBlur}
                        className={`bg-transparent hover:bg-slate-50 focus:bg-white focus:ring-1 focus:ring-indigo-300 rounded px-1 transition outline-none ${className}`}
                        {...props}
                    />
                );
            };

            const AutoTextareaEl = ({ value, onChange, className, placeholder, style, minRows = 1, maxRows = 12 }) => {
                const safeVal = value === undefined || value === null ? '' : value;
                if (readOnly) return <div className={`whitespace-pre-wrap break-words ${className}`} style={style}>{safeVal}</div>;
                return (
                    <textarea
                        value={safeVal}
                        placeholder={placeholder}
                        onChange={e => {
                            adjustHeight(e);
                            if (onChange) onChange(e);
                        }}
                        onBlur={handleBlur}
                        onFocus={adjustHeight}
                        className={`auto-textarea hover:bg-slate-50 focus:bg-white focus:ring-1 focus:ring-indigo-300 rounded px-1 transition ${className}`}
                        style={style}
                        rows={minRows}
                    />
                );
            };

            const renderContentLogic = (text) => {
                const raw = (text || '').toString();
                const lines = raw.split(/\r?\n/g);
                const items = [];
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    const trimmed = line.trim();
                    if (!trimmed) continue;
                    const numMatch = trimmed.match(/^(\d+(?:\.\d+)*)([\.|、])\s*(.+)$/);
                    if (numMatch) {
                        const num = numMatch[1];
                        const content = numMatch[3] || '';
                        const isSevere = /严重|必须|明显|关键|致命|错误/.test(content);
                        const badgeCls = isSevere ? 'bg-red-500' : 'bg-indigo-500';
                        const textCls = isSevere ? 'text-red-700' : 'text-slate-700';
                        items.push(
                            <div key={`n-${i}`} className="flex gap-2.5 items-start">
                                <span className={`text-white ${badgeCls} rounded-full w-5 h-5 flex items-center justify-center text-[11px] mt-0.5 shrink-0 font-bold shadow-sm`}>{num}</span>
                                <div className={`text-sm ${textCls} whitespace-pre-wrap break-words`}>{content}</div>
                            </div>
                        );
                        continue;
                    }
                    const bulletMatch = trimmed.match(/^[-•·]\s*(.+)$/);
                    if (bulletMatch) {
                        items.push(
                            <div key={`b-${i}`} className="flex gap-2.5 pl-6 items-start">
                                <span className="text-slate-300 mt-1.5 shrink-0">•</span>
                                <div className="text-sm text-slate-600 whitespace-pre-wrap break-words">{bulletMatch[1]}</div>
                            </div>
                        );
                        continue;
                    }
                    items.push(
                        <div key={`t-${i}`} className="text-sm text-slate-700 whitespace-pre-wrap break-words">{trimmed}</div>
                    );
                }
                if (items.length === 0) return <div className="text-sm text-slate-400">暂无</div>;
                return <div className="space-y-0.5">{items}</div>;
            };

            // Dynamic padding style to fix truncation
            const sectionGapPt = (pdfConfig && Number.isFinite(Number(pdfConfig.sectionGapPt))) ? Number(pdfConfig.sectionGapPt) : 8;
            const fontScale = (pdfConfig && Number.isFinite(Number(pdfConfig.fontSizeScale))) ? Number(pdfConfig.fontSizeScale) : 1.0;
            const baseBodyPt = 10.5;
            const bodyPt = Math.max(8, baseBodyPt * fontScale);
            const lineHeight = pdfConfig && Number.isFinite(Number(pdfConfig.lineHeight)) ? Number(pdfConfig.lineHeight) : 1.3;
            const paperStyle = pdfConfig ? { padding: `${pdfConfig.padding}mm`, lineHeight, fontSize: `${bodyPt}pt` } : { padding: '20mm', lineHeight: 1.3, fontSize: '10.5pt' };

            const textStyle = { lineHeight };
            const paragraphGapPt = (pdfConfig && Number.isFinite(Number(pdfConfig.paragraphGapPt))) ? Number(pdfConfig.paragraphGapPt) : 2;
            const renderTightParagraphs = (text, className) => {
                const raw = (text || '').toString();
                if (!raw.trim()) return <div className="text-sm text-slate-400">暂无</div>;
                const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
                const parts = normalized.split(/\n\s*\n+/g);
                return (
                    <div className={className} style={textStyle}>
                        {parts.map((p, i) => {
                            const t = (p || '').toString().trim();
                            if (!t) return null;
                            const mb = i === parts.length - 1 ? 0 : paragraphGapPt;
                            return (
                                <div key={i} className="whitespace-pre-wrap break-words" style={{ marginBottom: `${mb}pt` }}>{t}</div>
                            );
                        })}
                    </div>
                );
            };

            return (
                <div className="a4-wrapper text-slate-800 relative" style={paperStyle}>
                    {/* Header: Unified Card */}
                    <div className="pb-6 mb-6 no-break mt-4 border-b border-slate-100">
                        <div className="flex justify-between items-end">
                            <div>
                                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight leading-tight mb-3" style={{ whiteSpace: 'normal' }}>{assignment.examName ? `${assignment.examName} - ` : ''}{assignment.title ? `${assignment.title} - ` : ''}学生英语写作质量分析报告</h1>
                                <div className="flex gap-8 text-sm text-slate-500 font-medium">
                                    <span className="flex items-center gap-2">Class: {InputEl({ value: localData.class_name || '_______', onChange: e => handleChange('class_name', e.target.value), className: "w-24 font-bold text-slate-800 border-b border-slate-200 focus:border-indigo-500" })}</span>
                                    {(() => {
                                        const mismatch = !!(localData && localData.identity_name_mismatch);
                                        const verified = !!(localData && localData.identity_name_mismatch_verified);
                                        const activeMismatch = mismatch && !verified;
                                        const aiName = (localData && localData.identity_name_from_ai) ? String(localData.identity_name_from_ai).trim() : '';
                                        const cls = activeMismatch
                                            ? "w-24 font-bold text-rose-600 border-b border-rose-200 focus:border-rose-400"
                                            : "w-24 font-bold text-slate-800 border-b border-slate-200 focus:border-indigo-500";
                                        const handleVerify = () => {
                                            if (!activeMismatch) return;
                                            const official = (localData && localData.identity_name_from_no) ? String(localData.identity_name_from_no).trim() : '';
                                            const ok = window.confirm(`姓名匹配提示：\n- 序号对应姓名：${official || (localData && localData.student_name) || ''}\n- 识别姓名：${aiName}\n\n点击“确定”表示已核对，将恢复正常颜色。`);
                                            if (ok) handleChange('identity_name_mismatch_verified', true);
                                        };
                                        return (
                                            <div className="flex items-center gap-2">
                                                Name:
                                                <div
                                                    className={activeMismatch ? "cursor-pointer" : ""}
                                                    onClick={handleVerify}
                                                    title={activeMismatch ? "点击核对姓名" : ""}
                                                >
                                                    {InputEl({ value: localData.student_name || '_______', onChange: e => handleChange('student_name', e.target.value), className: cls })}
                                                </div>
                                            </div>
                                        );
                                    })()}
                                    <span className="flex items-center gap-2">No: <span className="font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">#{(() => {
                                        const v = (localData && localData.student_no !== undefined && localData.student_no !== null) ? String(localData.student_no).trim() : '';
                                        return v ? v : String(studentIndex);
                                    })()}{(() => {
                                        const sfx = (localData && localData.student_no_suffix) ? String(localData.student_no_suffix).trim() : '';
                                        return sfx ? <span className="text-slate-400">:{sfx}</span> : null;
                                    })()}</span></span>
                                </div>
                            </div>
                            <div className="text-right flex flex-col items-end">
                                <div className="flex items-baseline gap-1">
                                    {InputEl({ type: "number", step: "0.5", value: localData.total_score, onChange: handleTotalChange, className: "text-6xl font-black text-red-600 w-32 text-right leading-none tracking-tighter" })}
                                    <span className="text-2xl text-slate-400 font-bold">/{rubric.total}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {pdfConfig?.showPrompt && assignment.topic && (
                        <div className="mb-6 no-break p-4 bg-slate-50 rounded-2xl border border-slate-100">
                            <h3 className="text-xs font-bold text-slate-600 mb-2 uppercase tracking-wide flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span> 作文题目 (Prompt)</h3>
                            <div className="text-sm text-slate-700 whitespace-pre-wrap" style={textStyle}>{assignment.topic}</div>
                        </div>
                    )}

                    {/* Score Grid + Word Count */}
                    <div className="grid grid-cols-5 gap-4 mb-8 no-break">
                        {rubric.items.map(r => (
                            <div key={r.id} className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col items-center justify-center shadow-sm">
                                <div className="font-bold text-3xl text-slate-800 leading-none mb-2">
                                    {InputEl({ type: "number", step: "0.5", value: localData.breakdown?.[r.label] ?? 0, onChange: e => handleBreakdownChange(r.label, e), className: "w-full text-center bg-transparent" })}
                                </div>
                                <div className="text-xs text-slate-500 font-medium uppercase tracking-wider text-center">{(() => {
                                    const v = localData?.breakdown?.[r.label];
                                    const display = (v === undefined || v === null || v === '') ? 0 : v;
                                    return `${r.label} (${display}/${r.score})`;
                                })()}</div>
                            </div>
                        ))}
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col items-center justify-center shadow-sm">
                            <div className="font-bold text-3xl text-slate-800 leading-none mb-2">
                                {(() => {
                                    const computed = countEnglishWords(localData.original_essay);
                                    if (computed > 0) return computed;
                                    const fallback = Number(localData.word_count);
                                    return Number.isFinite(fallback) ? Math.max(0, Math.floor(fallback)) : 0;
                                })()}
                            </div>
                            <div className="text-xs text-slate-500 font-medium text-center">词数要求 {rubric.wordCount}</div>
                        </div>
                    </div>

                    {/* Overall Comment */}
                    <div className="mb-8 no-break p-5 bg-indigo-50/40 rounded-2xl border border-indigo-100/60 relative group" style={{ marginBottom: `${sectionGapPt}pt` }}>
                        {!readOnly && <div className="absolute top-3 right-3 text-indigo-300 opacity-0 group-hover:opacity-100 transition"><Edit size={14}/></div>}
                        <h3 className="text-xs font-bold text-indigo-600 mb-2 uppercase tracking-wide flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span> 总体评价 (Overall Comment)</h3>
                        {AutoTextareaEl({
                            value: readOnly ? indentParagraphs(localData.brief_comment) : localData.brief_comment,
                            onChange: e => handleChange('brief_comment', e.target.value),
                            className: "text-sm text-slate-700 w-full font-medium",
                            style: textStyle,
                            minRows: 3,
                            maxRows: 8
                        })}
                    </div>

                    {/* Excellent Expressions */}
                    {localData.highlights && localData.highlights.length > 0 && (
                        <div className="mb-8 no-break relative group" style={{ marginBottom: `${sectionGapPt}pt` }}>
                             {!readOnly && <div className="absolute top-2 right-2 text-amber-300 opacity-0 group-hover:opacity-100"><Edit size={14}/></div>}
                            <h3 className="text-sm font-bold text-slate-900 border-l-4 border-amber-400 pl-3 mb-3 flex items-center gap-2">优秀表达 (Excellent Expressions)</h3>
                            <div className="p-4 bg-amber-50/40 rounded-2xl border border-amber-100/60">
                                <div className="space-y-2">
                                    {localData.highlights.slice(0, 3).map((h, idx) => {
                                        const text = h.text ?? h.excerpt ?? '';
                                        const comment = h.comment ?? h.why_good ?? '';
                                        return (
                                            <div key={idx} className="relative group/item">
                                                <div className="flex gap-2 items-start">
                                                    <div className="text-[11px] text-slate-400 mt-1 shrink-0">第{idx + 1}句：</div>
                                                    {AutoTextareaEl({
                                                        value: text,
                                                        onChange: e => {const n=[...localData.highlights]; const v=e.target.value; if (typeof n[idx].text !== 'undefined' || typeof n[idx].excerpt === 'undefined') n[idx].text=v; else n[idx].excerpt=v; handleChange('highlights',n)},
                                                        className: "font-serif text-amber-900 font-medium w-full text-sm",
                                                        style: textStyle,
                                                        minRows: 2,
                                                        maxRows: 4
                                                    })}
                                                </div>
                                                <div className="flex items-start gap-2 pl-0.5 mt-1">
                                                    <span className="text-amber-400 text-xs mt-1 shrink-0">💡</span>
                                                    {AutoTextareaEl({
                                                        value: comment,
                                                        onChange: e => {const n=[...localData.highlights]; const v=e.target.value; if (typeof n[idx].comment !== 'undefined' || typeof n[idx].why_good === 'undefined') n[idx].comment=v; else n[idx].why_good=v; handleChange('highlights',n)},
                                                        className: "text-slate-500 text-xs w-full italic annotation",
                                                        placeholder: "简要说明这句话好在哪里，或写一句鼓励",
                                                        style: textStyle,
                                                        minRows: 2,
                                                        maxRows: 4
                                                    })}
                                                </div>
                                                {!readOnly && (
                                                    <button onClick={() => {
                                                        const n = localData.highlights.filter((_, i) => i !== idx);
                                                        handleChange('highlights', n);
                                                    }} className="text-slate-300 hover:text-amber-500 p-1 absolute right-0 top-0 opacity-0 group-hover/item:opacity-100 transition"><Trash size={14}/></button>
                                                )}
                                            </div>
                                        );
                                    })}
                                    {!readOnly && (localData.highlights || []).length < 3 && <button onClick={() => handleChange('highlights', [...(localData.highlights||[]), { text: '', comment: '' }])} className="text-xs text-amber-600 hover:underline ml-2 flex items-center gap-1"><Plus size={12}/> 添加优秀表达</button>}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Corrections */}
                    <div className="mb-3" style={{ marginBottom: `${Math.max(sectionGapPt - 5, 1)}pt` }}>
                        <h3 className="text-sm font-bold text-slate-900 border-l-4 border-red-500 pl-3 mb-1">诊断与提升 (Correction)</h3>
                        {localData.isBlank ? <div className="p-2 bg-slate-50 text-slate-500 rounded text-sm text-center">空白卷或无法识别</div> : (
                            <div className="space-y-1">
                                {(localData.errors || []).map((err, idx) => (
                                    <div key={idx} className="flex gap-2 text-sm items-start group relative bg-white rounded-lg p-0.5 hover:bg-slate-50/50 transition">
                                        <span className="text-white bg-red-500 rounded-full w-5 h-5 flex items-center justify-center text-xs mt-1 shrink-0 font-bold shadow-sm">{idx+1}</span>
                                        <div className="flex-1 min-w-0 grid grid-cols-1 gap-1">
                                            <div className="flex flex-col sm:flex-row gap-1.5 items-baseline">
                                                {AutoTextareaEl({
                                                    value: err.orig,
                                                    onChange: e => {const n=[...localData.errors];n[idx].orig=e.target.value;handleChange('errors',n)},
                                                    className: "text-slate-500 line-through decoration-red-300 decoration-1 flex-1 bg-red-50/30 px-1 py-0.5 rounded",
                                                    style: textStyle,
                                                    minRows: 1,
                                                    maxRows: 3
                                                })}
                                                <span className="text-slate-300 text-xs">➔</span>
                                                {AutoTextareaEl({
                                                    value: err.corr,
                                                    onChange: e => {const n=[...localData.errors];n[idx].corr=e.target.value;handleChange('errors',n)},
                                                    className: "text-green-700 font-bold bg-green-50/30 px-1 py-0.5 rounded flex-1",
                                                    style: textStyle,
                                                    minRows: 1,
                                                    maxRows: 3
                                                })}
                                            </div>
                                            {AutoTextareaEl({
                                                value: err.note,
                                                onChange: e => {const n=[...localData.errors];n[idx].note=e.target.value;handleChange('errors',n)},
                                                className: "text-[11px] text-slate-400 italic w-full pl-1.5 annotation",
                                                placeholder: "添加错误原因...",
                                                style: textStyle,
                                                minRows: 1,
                                                maxRows: 4
                                            })}
                                        </div>
                                        {!readOnly && (
                                            <button onClick={() => {
                                                const n = localData.errors.filter((_, i) => i !== idx);
                                                handleChange('errors', n);
                                            }} className="text-slate-300 hover:text-red-500 p-1 absolute right-0 top-0 opacity-0 group-hover:opacity-100 transition"><Trash size={14}/></button>
                                        )}
                                    </div>
                                ))}
                                {!readOnly && <button onClick={() => handleChange('errors', [...(localData.errors||[]), {orig:'error', corr:'correction', note:'reason'}])} className="text-[11px] text-indigo-500 hover:underline ml-8 flex items-center gap-1"><Plus size={12}/> 添加纠错条目</button>}
                            </div>
                        )}
                    </div>

                    <div className="mb-5 no-break" style={{ marginBottom: `${Math.max(sectionGapPt - 3, 2)}pt` }}>
                        <h3 className="text-sm font-bold text-slate-900 border-l-4 border-blue-500 pl-3 mb-1">内容优化建议 (Content Optimization Suggestions)</h3>
                        {readOnly ? (
                            <div style={textStyle}>
                                {renderContentLogic(localData.content_logic)}
                            </div>
                        ) : (
                            AutoTextareaEl({
                                value: localData.content_logic,
                                onChange: e => handleChange('content_logic', e.target.value),
                                className: "text-sm text-slate-700 w-full",
                                placeholder: "请按照与“诊断与提升 (Correction)”相同的序号风格书写本段：\n\n1. 内容拓展建议\n- 用条列方式给出可以补充的细节或例子。\n\n2. 句式升级示例\n- 使用“原句：… / 升级句：…”的格式列出2-3组示例。\n\n3. 结尾优化\n- 给出更具体、更有力量的结尾表达建议。",
                                style: textStyle,
                                minRows: 4,
                                maxRows: 16
                            })
                        )}
                    </div>

                    {/* Essays Grid */}
                    <div className="grid grid-cols-2 gap-8 flex-1 min-h-0 no-break" style={{ marginBottom: `${sectionGapPt}pt` }}>
                        <div className="flex flex-col h-full">
                            <h3 className="text-sm font-bold text-slate-900 border-l-4 border-green-500 pl-3 mb-3">升级版习作 (Revised)</h3>
                            <div className="bg-green-50/20 rounded-2xl p-5 border border-green-100 flex-1">
                                {readOnly ? (
                                    renderTightParagraphs(localData.optimized_essay, "w-full h-full font-serif text-slate-800 text-sm text-justify")
                                ) : (
                                    AutoTextareaEl({
                                        value: localData.optimized_essay,
                                        onChange: e => handleChange('optimized_essay', e.target.value),
                                        className: "w-full h-full font-serif text-slate-800 text-sm text-justify",
                                        style: textStyle,
                                        minRows: 10,
                                        maxRows: 40
                                    })
                                )}
                            </div>
                        </div>
                        <div className="flex flex-col h-full">
                            <h3 className="text-sm font-bold text-slate-900 border-l-4 border-indigo-500 pl-3 mb-3">标准参考范文 (Model)</h3>
                            <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 flex-1">
                                {readOnly ? (
                                    renderTightParagraphs(localData.standard_reference || assignment.modelEssay, "font-serif text-slate-600 text-sm text-justify")
                                ) : (
                                    <div className="font-serif text-slate-600 text-sm text-justify whitespace-pre-wrap" style={textStyle}>{localData.standard_reference || assignment.modelEssay || "暂无"}</div>
                                )}
                            </div>
                        </div>
                    </div>

                    {pdfConfig?.showOriginal && (
                        <div className="mb-4">
                            <h3 className="text-sm font-bold text-slate-900 border-l-4 border-slate-500 pl-3 mb-3">作文原稿 (Original)</h3>
                            {data.original_image_url ? (
                                <div className="w-full max-h-[520px] rounded-2xl border border-slate-200 overflow-hidden bg-white flex items-center justify-center">
                                    <img src={data.original_image_url} className="w-full h-full object-contain" />
                                </div>
                            ) : (
                                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-xs text-slate-500 whitespace-pre-wrap">
                                    {localData.original_essay || '当前报告无可用原稿图片，仅提供文字报告。'}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            );
        };


export default EditablePaper;
