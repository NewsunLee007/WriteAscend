import React from "react";
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


export default ClassAnalysisReport;
