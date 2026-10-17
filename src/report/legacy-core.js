// Extracted unchanged from WriteAscend commit 2def1d2; keep scoring changes explicit.
        const estimatePageCount = (result) => {
            if (!result) return 1;
            if (typeof result.page_count === 'number') return result.page_count;
            if (typeof result.page_count === 'string') {
                const m = result.page_count.match(/\d+/);
                if (m) return parseInt(m[0], 10);
            }
            if (typeof result.pageCount === 'number') return result.pageCount;
            if (typeof result.pageCount === 'string') {
                const m = result.pageCount.match(/\d+/);
                if (m) return parseInt(m[0], 10);
            }
            const parts = [];
            if (result.brief_comment) parts.push(result.brief_comment);
            if (result.optimized_essay) parts.push(result.optimized_essay);
            if (Array.isArray(result.errors)) {
                parts.push(result.errors.map(e => `${e.orig || ''} ${e.corr || ''} ${e.note || ''}`).join(' '));
            }
            const length = parts.join(' ').length;
            if (length > 2400) return 3;
            if (length > 1600) return 2;
            return 1;
        };

        const indentParagraphs = (text) => {
            const raw = (text || '').toString();
            const parts = raw.split(/\n\s*\n/);
            return parts.map(p => {
                const t = (p || '').trim();
                if (!t) return '';
                return `\u3000\u3000${t}`;
            }).join('\n\n');
        };

        const getEffectivePdfConfigForPages = (baseConfig, pages) => {
            const base = baseConfig || {};
            const baseLineHeight = Number(base.lineHeight);
            const basePadding = Number(base.padding);
            const baseScale = Number(base.fontSizeScale);
            const baseGap = Number(base.sectionGapPt);

            const safeLineHeight = Number.isFinite(baseLineHeight) ? baseLineHeight : 1.2;
            const safePadding = Number.isFinite(basePadding) ? basePadding : 15;
            const safeScale = Number.isFinite(baseScale) ? baseScale : 1.0;
            const safeGap = Number.isFinite(baseGap) ? baseGap : 8;

            if (pages === 3) {
                return {
                    ...base,
                    lineHeight: Math.max(safeLineHeight, 1.3),
                    padding: Math.max(10, safePadding - 2),
                    fontSizeScale: Math.max(0.92, safeScale - 0.04),
                    sectionGapPt: Math.min(safeGap, 6)
                };
            }
            if (pages > 3) {
                return {
                    ...base,
                    lineHeight: Math.max(safeLineHeight, 1.3),
                    padding: Math.max(safePadding, 15),
                    fontSizeScale: Math.max(safeScale, 1.0),
                    sectionGapPt: Math.max(safeGap, 8)
                };
            }
            return {
                ...base,
                lineHeight: Math.max(safeLineHeight, 1.3),
                sectionGapPt: Math.max(safeGap, 8)
            };
        };

        const INITIAL_RUBRIC = {
            total: 20,
            wordCount: "60-80 words",
            wordCountStrict: true,
            gradeLevel: "七年级",
            tense: ["一般现在时"], 
            strictness: "适中", 
            strictnessLevel: 45,
            modelDifficulty: "标准 (课标要求)", 
            items: [
                { id: 'c1', label: '内容完整度', score: 8, desc: '是否包含所有要点，细节是否丰富' },
                { id: 'c2', label: '语言准确性', score: 6, desc: '语法、拼写、标点是否正确' },
                { id: 'c3', label: '篇章结构', score: 4, desc: '逻辑是否连贯，连接词使用' },
                { id: 'c_wc', label: '词数要求', score: 1, desc: '是否满足字数要求；可设置严格/宽松模式' },
                { id: 'c4', label: '书写规范', score: 1, desc: '书写规范、卷面整洁' }
            ]
        };

        const GRADE_LEVELS = ["六年级", "七年级", "八年级", "九年级", "高一", "高二", "高三"];
        const TENSES = ["一般现在时", "一般过去时", "一般将来时", "现在进行时", "过去进行时", "现在完成时", "过去完成时"];
        const STRICTNESS_LEVELS = ["严格", "适中", "宽松", "激励模式"];
        const DIFFICULTY_LEVELS = ["简单 (基础词汇)", "标准 (课标要求)", "进阶 (丰富句式)"];

        const GRADE_DIFFICULTY_TABLE = {
            "六年级": { key: "G6", coefficient: 0.62, maxFkgl: 3.6, maxAvgSentenceWords: 10, maxLongWordRatio: 0.12, bannedWords: ["moreover", "furthermore", "nevertheless", "consequently", "sophisticated", "profound", "compelling", "notwithstanding"] },
            "七年级": { key: "G7", coefficient: 0.68, maxFkgl: 4.2, maxAvgSentenceWords: 12, maxLongWordRatio: 0.14, bannedWords: ["moreover", "furthermore", "nevertheless", "consequently", "sophisticated", "profound", "compelling", "notwithstanding"] },
            "八年级": { key: "G8", coefficient: 0.74, maxFkgl: 4.8, maxAvgSentenceWords: 14, maxLongWordRatio: 0.17, bannedWords: ["nevertheless", "consequently", "sophisticated", "notwithstanding"] },
            "九年级": { key: "G9", coefficient: 0.80, maxFkgl: 5.5, maxAvgSentenceWords: 16, maxLongWordRatio: 0.20, bannedWords: ["notwithstanding"] },
            "高一": { key: "G10", coefficient: 0.86, maxFkgl: 6.4, maxAvgSentenceWords: 18, maxLongWordRatio: 0.23, bannedWords: [] },
            "高二": { key: "G11", coefficient: 0.92, maxFkgl: 7.2, maxAvgSentenceWords: 20, maxLongWordRatio: 0.26, bannedWords: [] },
            "高三": { key: "G12", coefficient: 0.98, maxFkgl: 8.2, maxAvgSentenceWords: 22, maxLongWordRatio: 0.30, bannedWords: [] }
        };

        const resolveGradeDifficultyProfile = (gradeLevel) => {
            const g = (gradeLevel || "").toString().trim();
            return GRADE_DIFFICULTY_TABLE[g] || { key: g || "custom", coefficient: 0.75, maxFkgl: 5.0, maxAvgSentenceWords: 14, maxLongWordRatio: 0.18, bannedWords: ["notwithstanding"] };
        };

        const clampRatio = (v, min = 0.6, max = 1.0) => {
            const n = Number(v);
            if (!Number.isFinite(n)) return 1.0;
            return Math.min(max, Math.max(min, n));
        };

        const resolveEffectiveDifficultyProfile = (gradeLevel, languageDifficulty) => {
            const base = resolveGradeDifficultyProfile(gradeLevel);
            const enabled = !(languageDifficulty && languageDifficulty.enabled === false);
            if (!enabled) return { ...base, enabled: false, capRatio: 1.0 };
            const capRatio = clampRatio(languageDifficulty && languageDifficulty.capRatio, 0.6, 1.0);
            const ratio = capRatio;
            const coefficient = Number((Number(base.coefficient) * ratio).toFixed(3));
            return {
                ...base,
                enabled: true,
                capRatio,
                coefficient,
                maxFkgl: Number((Number(base.maxFkgl) * ratio).toFixed(2)),
                maxAvgSentenceWords: Number((Number(base.maxAvgSentenceWords) * ratio).toFixed(1)),
                maxLongWordRatio: Number((Number(base.maxLongWordRatio) * ratio).toFixed(3))
            };
        };

        const tokenizeEnglishWords = (text) => {
            const s = (text || "").toString();
            const m = s.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g);
            return (m || []).map(x => x.toLowerCase());
        };

        const splitEnglishSentences = (text) => {
            const s = (text || "").toString().replace(/\s+/g, " ").trim();
            if (!s) return [];
            const parts = s.split(/(?<=[.!?])\s+/g).map(t => t.trim()).filter(Boolean);
            return parts.length > 0 ? parts : [s];
        };

        const countSyllables = (word) => {
            const w = (word || "").toString().toLowerCase().replace(/[^a-z]/g, "");
            if (!w) return 0;
            if (w.length <= 3) return 1;
            const cleaned = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/g, "").replace(/^y/g, "");
            const matches = cleaned.match(/[aeiouy]{1,2}/g);
            const c = matches ? matches.length : 0;
            return Math.max(1, c);
        };

        const computeFleschKincaidGradeLevel = (text) => {
            const sentences = splitEnglishSentences(text);
            const words = tokenizeEnglishWords(text);
            if (sentences.length === 0 || words.length === 0) return 0;
            const syllables = words.reduce((acc, w) => acc + countSyllables(w), 0);
            const wps = words.length / Math.max(1, sentences.length);
            const spw = syllables / Math.max(1, words.length);
            return 0.39 * wps + 11.8 * spw - 15.59;
        };

        const computeEnglishDifficultyStats = (text) => {
            const words = tokenizeEnglishWords(text);
            const sentences = splitEnglishSentences(text);
            const longWords = words.filter(w => w.length >= 8);
            const avgSentenceWords = sentences.length > 0 ? (words.length / sentences.length) : (words.length || 0);
            const fkgl = computeFleschKincaidGradeLevel(text);
            return {
                wordCount: words.length,
                sentenceCount: sentences.length,
                avgSentenceWords,
                longWordRatio: words.length > 0 ? (longWords.length / words.length) : 0,
                fkgl
            };
        };

        const collectEnglishFieldsForDifficultyCheck = (result) => {
            const r = result && typeof result === "object" ? result : {};
            const parts = [];
            const push = (v) => {
                const s = (v === undefined || v === null) ? "" : String(v);
                if (/[A-Za-z]/.test(s)) parts.push(s);
            };
            const errors = Array.isArray(r.errors) ? r.errors : [];
            errors.forEach(e => {
                if (e && typeof e === "object") {
                    push(e.corr);
                }
            });
            push(r.optimized_essay);
            push(r.content_logic);
            const highlights = Array.isArray(r.highlights) ? r.highlights : [];
            highlights.forEach(h => {
                if (h && typeof h === "object") push(h.text);
            });
            return parts.join("\n\n");
        };

        const validateDifficultyForGrade = (result, gradeLevel, languageDifficulty) => {
            const profile = resolveEffectiveDifficultyProfile(gradeLevel, languageDifficulty);
            const combined = collectEnglishFieldsForDifficultyCheck(result);
            if (!combined.trim()) return { ok: true, profile, stats: null, reasons: [] };
            const stats = computeEnglishDifficultyStats(combined);
            const reasons = [];
            if (Number.isFinite(stats.fkgl) && stats.fkgl > profile.maxFkgl) reasons.push(`FKGL ${stats.fkgl.toFixed(2)} > ${profile.maxFkgl}`);
            if (Number.isFinite(stats.avgSentenceWords) && stats.avgSentenceWords > profile.maxAvgSentenceWords) reasons.push(`AvgSentenceWords ${stats.avgSentenceWords.toFixed(1)} > ${profile.maxAvgSentenceWords}`);
            if (Number.isFinite(stats.longWordRatio) && stats.longWordRatio > profile.maxLongWordRatio) reasons.push(`LongWordRatio ${(stats.longWordRatio * 100).toFixed(1)}% > ${(profile.maxLongWordRatio * 100).toFixed(1)}%`);
            const lower = combined.toLowerCase();
            (profile.bannedWords || []).forEach(w => {
                const ww = (w || "").toString().toLowerCase();
                if (ww && new RegExp(`\\b${ww}\\b`, "i").test(lower)) reasons.push(`BannedWord: ${ww}`);
            });
            return { ok: reasons.length === 0, profile, stats, reasons };
        };

        const SYSTEM_PROMPT_TEMPLATE = (assignment, rubric, roster, gradeLevel, languageDifficulty) => {
            const level = clampStrictnessLevel(rubric && rubric.strictnessLevel);
            const levelText = level === null ? '' : `（松紧度数值：${level}/100）`;
            const strictnessLabel = (rubric && rubric.strictness) ? String(rubric.strictness) : '';
            const effectiveLevel = level === null ? strictnessLevelFromLabel(strictnessLabel) : level;
            const isEncouraging = strictnessLabel.includes('激励') || effectiveLevel >= 85;
            const isStrict = strictnessLabel.includes('严格') || effectiveLevel < 25;
            const errorFindingRule = isEncouraging
                ? '3. 激励模式下：只在非常确定存在错误时才列入 errors；如果整体表达正确，errors 允许为空数组 []；不要为了“凑数”制造错误或做无意义改动（如仅空格/标点/同义替换）。'
                : (isStrict
                    ? '3. 严格模式下：优先尽可能完整找出错误（errors 不要只写 2-3 条）；若原文存在多处明显问题，建议列出 6-12 条典型错误；若整体非常好，可列出 0-3 条可改进的小问题或更自然的写法，但不要编造错误。'
                    : '3. 适中/宽松模式下：以典型错误为主；若整体非常好，可列出 0-3 条可改进的小问题或更自然的写法，但不要编造错误。');
            const diffEnabled = !(languageDifficulty && languageDifficulty.enabled === false);
            const diff = resolveEffectiveDifficultyProfile(gradeLevel || (rubric && rubric.gradeLevel), languageDifficulty);
            const gradeText = (gradeLevel || (rubric && rubric.gradeLevel) || "").toString().trim();
            const diffRule = diffEnabled ? [
                '3. 英语难度控制（必须严格遵守）：',
                '   - 你的所有英文输出（errors.corr、optimized_essay、content_logic 中的英文示例、highlights.text 等）必须不超过该年级的英语难度系数。',
                `   - 难度系数：${diff.coefficient}（参考：${gradeText || rubric.gradeLevel}；上限比例：${Math.round((diff.capRatio || 1) * 100)}%）。`,
                '   - 写法：尽量短句；优先使用基础词汇；连接词优先使用 First/Then/Next/Finally/Because/But/So/Also。',
                '   - 避免：长句堆叠、从句过多、过于抽象或高阶词汇；如必须出现较难词，请用更简单的同义表达替换。'
            ].join('\n') : '3. 英语难度控制：当前已关闭。';
            return `
你是一个专业的初中英语作文批改助手。
【题目要求】
主题：${assignment.title || "无标题"}
内容：${assignment.topic}
字数：${rubric.wordCount}
年级：${gradeText || rubric.gradeLevel}
基本时态：${rubric.tense.join(', ')}

【评分标准 (总分 ${rubric.total})】
${rubric.items.map(r => `- ${r.label} (${r.score}分): ${r.desc}`).join('\n')}

【评分松紧度：${rubric.strictness}${levelText}】
- 严格：严扣语法错误。
- 适中：正常教学标准。
- 宽松：主要看意思表达，轻微语法和拼写错误酌情不扣分。
- 激励模式：重点表扬优点，适当弱化扣分，避免打击学生信心。
- 在给出总分和各维度得分时，必须根据以上松紧度动态调整扣分力度，但不要在文字中直接说明“采用激励模式”或“总分略高以鼓励学生”等评分方式。
- 松紧度数值（如 60/100）仅表示“扣分力度”的偏好，不代表得分比例，也不代表最低分。
- 以 45/100 为中性基准：低于 45 更严格扣分；高于 45 更宽松。同样错误在 35/100 的扣分应明显大于 55/100。
- 宽松模式下依然要如实列出明显错误，不要因为宽松而少报错误；宽松只影响扣分力度，不影响错误识别的真实性。

【评分与区分度要求】
1. 先看“内容是否完成+字数是否达标”，再看“语言错误数量与严重程度”，最后看“篇章结构与连贯性”。
2. 不要默认给中上分：如果错误多、字数明显不足、要点缺失，请大胆扣分。
${errorFindingRule}
4. 分数锚点（总分 ${rubric.total}，松紧度：${rubric.strictness}）：
${buildScoreAnchorText(rubric.total, rubric)}

【重要规则】
1. 分数精度控制：所有打分（包括总分和单项分）必须严格以 0.5 为单位 (如 7.0, 7.5, 8.0, 8.5)。严禁出现 7.2、7.3、8.1 等非 0 或 5 结尾的分数。
2. 身份识别：尽力识别手写 Class、Name、No/序号。若识别到“序号:两位数”（如 49:12 或 49：12），冒号前的数字才是 student_no；冒号后的两位数不要当成序号。使用名单：${roster}
${diffRule}
4. 错误纠正要求：
   - 字段 orig 必须保留学生的原句或原短语，包含错误本身。
   - 只有当你确定 orig 存在语法/拼写/用词/标点等问题时才输出该条 errors；如果原句本身正确但你只是想给“更高级/更自然”的写法，请不要放进 errors，可写入 brief_comment 或 content_logic。
   - 字段 corr 必须是你认为更正确或更自然的写法；当 corr 与 orig 不同时，必须体现清晰、可解释的修改点；不要只改空格或做无意义的标点/同义替换（除非确实属于错误）。
   - errors 允许为空数组 []。
   - 字段 note 要用中文简要说明原因，例如“名词单复数错误，应为 heroes”或“第三人称单数动词缺少 -s”。
5. 分数一致性：
   - total_score 的取值范围必须在 0 到 ${rubric.total} 之间。
   - breakdown 的每一项得分必须在 0 到该维度满分之间。
   - breakdown 的各项得分之和必须等于 total_score（允许 0.5 的精度误差，但最终请你自行调整使其严格相等）。
   - 维度满分之和应等于总分 ${rubric.total}；如果你发现维度满分之和与总分不一致，请按比例换算后再评分。
6. 输出：严格 JSON。
7. 标准参考范文：你会在用户输入中看到“标准范文：...”，请在输出 JSON 的 standard_reference 字段中原样返回该标准范文。
8. 升级版习作（学生优化稿）：optimized_essay 必须基于学生原稿进行改写与润色（AI 可从图片直接读出学生作文）。
   - 目标：在不改变学生主要观点与信息点的前提下，纠错、补全细节、提升连贯性与句式多样性。
   - 禁止：不要照抄 standard_reference，不要写成与 standard_reference 基本相同的文章。
   - 允许：当学生原文缺少某个要点时，可以参考 standard_reference 补充，但必须用不同措辞与句式，并与学生原文语境一致。
   - 格式：必须使用双换行符（\n\n）分段，至少 3 段。
9. 学生原稿文本：请从图片中识别并输出 original_essay（尽量按原样抄写学生作文，不要主动纠错；如确实无法识别则输出空字符串）。
10. 词数统计：word_count 必须严格统计 original_essay 的英文单词数（按空格/换行分词，忽略纯标点；缩写如 don't 计 1 个）。如果发现被划掉的单词/短语，请在 original_essay 中用 ~~ ~~ 包裹，这些内容不计入 word_count。

【优秀表达（简单提炼）】
只需要帮老师把学生作文中写得比较好的句子整理出来，并用一句中文说明“好在哪里”。
- 直接在学生原文中挑选 2-3 句比较优秀的英文句子或者短语。
- 如果实在没有明显亮点，也要输出至少 1 条鼓励性的话，可以概括学生整体表达清楚、态度认真等优点。
- 不需要再输出维度标签（词汇/句式/逻辑）和位置，只保留句子本身和简短说明。

输出字段要求：
- highlights：数组，建议 2-3 条，最多 3 条。
- 每一条包含：
  - text：从学生原文中摘出来的英文句子或短语；如果没有亮点，就写一条你为学生写的鼓励句（可以是中文或英文）。
  - comment：用简短中文说明这句话好在哪里，或者给出鼓励性评价。

请输出 JSON:
{
  "student_no": "",
  "student_name": "识别到的姓名",
  "class_name": "识别到的班级",
  "total_score": 0,
  "breakdown": { 
    ${rubric.items.map(r => `"${r.label}": 0`).join(', ')} 
  },
  "brief_comment": "总体评价",
  "highlights": [
    { "text": "excellent expression", "comment": "中文点评，说明这句话好在哪" }
  ],
  "errors": [
    { "orig": "错误句子", "corr": "修正后句子", "type": "语法", "note": "解释原因" }
  ],
  "standard_reference": "标准参考范文（原样返回用户输入中的标准范文内容）",
  "original_essay": "从图片中识别的学生原稿英文文本（尽量原样，不要纠错；可为空字符串）",
  "optimized_essay": "基于学生原稿润色改写后的升级版习作（使用双换行符分段）...",
  "word_count": 80,
  "content_logic": "请按结构化方式输出与示例图一致的‘内容优化建议 (Content Optimization Suggestions)’：先以‘1. 内容拓展建议’为小标题，分条写出各段可以补充的具体内容；再以‘2. 句式升级示例’为小标题，使用‘原句：… / 升级句：…’的编号条目给出2-3组示例；最后以‘3. 结尾优化’为小标题，总结如何更好地呼应主题与情感。整体采用清晰的编号+条列格式，便于教师直接朗读或投影展示。",
  "isBlank": false
}

【总体评价写作要求】
- brief_comment 必须用 3-5 句中文，对“内容完整度”、“语言准确性”、“篇章结构”、“书写卷面”等评分维度进行综合评价。
- 总体评价中需要同时指出本次作文的优点和需要改进的方面，并结合本次打分结果（总分和各维度得分）进行解释。
- 不要在评价中直接说明“本次采用激励模式/评分偏宽松/为了鼓励学生总分略高”等评分策略，只需给出自然的教学评价。
- 尽量给出 1-2 个具体表现的概括描述（可以不用逐字引用原文），让任课老师能够直接据此进行课堂讲评。
`;
        };

        const OPTIMIZED_REPAIR_PROMPT_TEMPLATE = (assignment, rubric, gradeLevel, languageDifficulty) => {
            const diff = resolveEffectiveDifficultyProfile(gradeLevel || (rubric && rubric.gradeLevel), languageDifficulty);
            const gradeText = (gradeLevel || (rubric && rubric.gradeLevel) || "").toString().trim();
            const diffEnabled = !(languageDifficulty && languageDifficulty.enabled === false);
            return `
你是一个初中英语作文批改修复助手。
你将看到：标准范文 + 学生作文图片。

你的任务：从图片中识别学生原稿 original_essay，并基于 original_essay 写出升级版习作 optimized_essay。

规则：
1. 输出严格 JSON，只包含以下字段：original_essay、optimized_essay、word_count。
2. optimized_essay 必须基于 original_essay 改写润色，保持主要观点与信息点一致。
3. optimized_essay 严禁照抄标准范文，不得与 standard_reference 基本相同。
4. optimized_essay 必须使用双换行符（\n\n）分段，至少 3 段。
5. word_count 必须严格统计 original_essay 的英文单词数（按空格/换行分词，忽略纯标点；缩写如 don't 计 1 个）。
${diffEnabled ? `6. 英语难度控制（必须严格遵守）：\n   - optimized_essay 必须符合学生年级：${gradeText || rubric.gradeLevel}。\n   - 难度系数：${diff.coefficient}（上限比例：${Math.round((diff.capRatio || 1) * 100)}%）。\n   - 用词与句式：基础词汇、短句为主；连接词优先 First/Then/Next/Finally/Because/But/So/Also。` : '6. 英语难度控制：当前已关闭。'}

请输出 JSON：
{
  "original_essay": "",
  "optimized_essay": "",
  "word_count": 0
}
`;
        };

        const clampNumber = (v, min, max) => {
            const n = Number(v);
            if (!Number.isFinite(n)) return min;
            return Math.min(max, Math.max(min, n));
        };

        const roundToHalf = (v) => {
            const n = Number(v);
            if (!Number.isFinite(n)) return 0;
            return Math.round(n * 2) / 2;
        };

        const sumItemMax = (items) => (items || []).reduce((acc, it) => acc + (Number(it && it.score) || 0), 0);

        const redistributeItemScoresToTotal = (items, total) => {
            const safeItems = Array.isArray(items) ? items : [];
            const t = Number(total);
            if (!Number.isFinite(t) || t < 0) return safeItems;
            if (safeItems.length === 0) return safeItems;

            const oldSum = sumItemMax(safeItems);
            let weights = safeItems.map(it => (Number(it && it.score) || 0));
            if (!Number.isFinite(oldSum) || oldSum <= 0) {
                weights = safeItems.map(() => 1);
            }
            const weightSum = weights.reduce((a, b) => a + b, 0) || safeItems.length;

            const next = safeItems.map((it, idx) => {
                const raw = t * (weights[idx] / weightSum);
                return { ...it, score: Math.max(0, roundToHalf(raw)) };
            });
            let s = sumItemMax(next);
            const diff = roundToHalf(t - s);
            if (next.length > 0 && diff !== 0) {
                const last = next[next.length - 1];
                const nextLast = roundToHalf((Number(last.score) || 0) + diff);
                next[next.length - 1] = { ...last, score: Math.max(0, nextLast) };
            }
            return next;
        };

        const normalizeHighlights = (highlights, isBlank) => {
            if (isBlank) return [];

            const raw = Array.isArray(highlights) ? highlights : (highlights ? [highlights] : []);
            const items = raw
                .map((h) => {
                    if (typeof h === 'string') {
                        const t = h.trim();
                        return t ? { text: t, comment: '' } : null;
                    }
                    if (!h || typeof h !== 'object') return null;

                    const textRaw = (h.text ?? h.sentence ?? h.expr ?? h.expression ?? '').toString();
                    const commentRaw = (h.comment ?? h.note ?? h.reason ?? h.explain ?? '').toString();
                    const text = textRaw.trim();
                    const comment = commentRaw.trim();

                    if (!text && comment) return { text: comment, comment: '' };
                    if (!text && !comment) return null;
                    return { text, comment };
                })
                .filter(Boolean);

            const seen = new Set();
            const deduped = [];
            for (const it of items) {
                const key = String(it.text || '').trim().toLowerCase();
                if (!key) continue;
                if (seen.has(key)) continue;
                seen.add(key);
                deduped.push(it);
                if (deduped.length >= 3) break;
            }

            if (deduped.length === 0) {
                return [
                    {
                        text: 'Good effort—keep practicing and you will improve!',
                        comment: '整体有表达意愿，继续积累词汇与基础句型，很快会更流畅。'
                    }
                ];
            }

            return deduped;
        };

        const normalizeErrorsForRubric = (errors, rubric, isBlank) => {
            if (isBlank) return [];

            const strictnessLabel = (rubric && rubric.strictness) ? String(rubric.strictness) : '';
            const level = clampStrictnessLevel(rubric && rubric.strictnessLevel);
            const isEncouraging = strictnessLabel.includes('激励') || (level !== null && level >= 85);

            const raw = Array.isArray(errors) ? errors : (errors ? [errors] : []);
            const normalizeSpace = (s) => (s || '').toString().replace(/\u00A0/g, ' ').replace(/\s+/g, '').toLowerCase().trim();
            const normalizePunct = (s) => normalizeSpace(s).replace(/[.,!?;:，。！？；：“”"()\[\]{}<>]/g, '').trim();
            const isTrivialDiff = (a, b) => {
                const a1 = normalizeSpace(a);
                const b1 = normalizeSpace(b);
                if (!a1 || !b1) return false;
                if (a1 === b1) return true;
                const a2 = normalizePunct(a);
                const b2 = normalizePunct(b);
                return a2 && b2 && a2 === b2;
            };

            const items = raw
                .map((e) => {
                    if (typeof e === 'string') return null;
                    if (!e || typeof e !== 'object') return null;

                    const orig = (e.orig ?? e.original ?? e.before ?? '').toString().trim();
                    const corr = (e.corr ?? e.correct ?? e.after ?? '').toString().trim();
                    const type = (e.type ?? e.category ?? '').toString().trim();
                    const note = (e.note ?? e.reason ?? e.explain ?? '').toString().trim();

                    if (!orig || !corr) return null;
                    if (orig === corr) return null;

                    if (isEncouraging && isTrivialDiff(orig, corr)) {
                        const meta = `${type} ${note}`;
                        const allow = /标点|大小写|punct|capital/i.test(meta);
                        if (!allow) return null;
                    }

                    return { orig, corr, type, note };
                })
                .filter(Boolean);

            const seen = new Set();
            const deduped = [];
            for (const it of items) {
                const key = `${it.orig}→${it.corr}`.trim().toLowerCase();
                if (!key) continue;
                if (seen.has(key)) continue;
                seen.add(key);
                deduped.push(it);
            }

            const cap = isEncouraging ? 8 : 20;
            return deduped.slice(0, cap);
        };

        const normalizeForWordCount = (text) => {
            const s = (text || '').toString();
            if (!s.trim()) return '';
            return s
                .replace(/\u00A0/g, ' ')
                .replace(/[“”‘’]/g, "'")
                .replace(/[—–]/g, '-')
                .replace(/\s+/g, ' ')
                .trim();
        };

        const countEnglishWords = (text) => {
            const s = normalizeForWordCount(text);
            if (!s) return 0;
            const tokens = s.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g);
            return tokens ? tokens.length : 0;
        };

        const countEnglishWordsForScoring = (text) => {
            const s0 = normalizeForWordCount(text);
            if (!s0) return 0;
            const s = s0
                .replace(/~~[^~]*~~/g, ' ')
                .replace(/\[\s*del\s*\][\s\S]*?\[\s*\/\s*del\s*\]/gi, ' ')
                .replace(/\[del\][\s\S]*?\[\/del\]/gi, ' ')
                .replace(/\(.*?划掉.*?\)/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            const tokens = s.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g);
            return tokens ? tokens.length : 0;
        };

        const normalizeForSimilarity = (text) => {
            const s = (text || '').toString().toLowerCase();
            return s
                .replace(/\u00A0/g, ' ')
                .replace(/[“”‘’]/g, "'")
                .replace(/[—–]/g, '-')
                .replace(/[^a-z0-9\s']/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        };

        const diceSimilarity = (a, b) => {
            const s1 = normalizeForSimilarity(a);
            const s2 = normalizeForSimilarity(b);
            if (!s1 || !s2) return 0;
            if (s1 === s2) return 1;
            if (s1.length < 2 || s2.length < 2) return 0;

            const bigramCounts = new Map();
            for (let i = 0; i < s1.length - 1; i++) {
                const bg = s1.slice(i, i + 2);
                bigramCounts.set(bg, (bigramCounts.get(bg) || 0) + 1);
            }
            let intersection = 0;
            for (let i = 0; i < s2.length - 1; i++) {
                const bg = s2.slice(i, i + 2);
                const c = bigramCounts.get(bg) || 0;
                if (c > 0) {
                    intersection += 1;
                    bigramCounts.set(bg, c - 1);
                }
            }
            return (2 * intersection) / ((s1.length - 1) + (s2.length - 1));
        };

        const isOptimizedTooSimilarToReference = (optimized, reference) => {
            const o = normalizeForSimilarity(optimized);
            const r = normalizeForSimilarity(reference);
            if (!o || !r) return false;
            if (o === r) return true;
            const sim = diceSimilarity(o, r);
            return sim >= 0.86;
        };

        const parseWordCountRequirement = (raw) => {
            const text = (raw || '').toString();
            const nums = (text.match(/\d+/g) || []).map(n => Number(n)).filter(n => Number.isFinite(n) && n >= 0);
            if (nums.length >= 2) {
                const a = nums[0];
                const b = nums[1];
                return { min: Math.min(a, b), max: Math.max(a, b) };
            }
            if (nums.length === 1) {
                const n = nums[0];
                const isLowerBound = /\+|以上|不少于|至少|>=|＞=|≥/.test(text);
                if (isLowerBound) return { min: n, max: Number.POSITIVE_INFINITY };
                const tol = Math.max(8, Math.round(n * 0.15));
                return { min: Math.max(0, n - tol), max: n + tol };
            }
            return { min: 0, max: Number.POSITIVE_INFINITY };
        };

        const clampStrictnessLevel = (v) => {
            const n = Number(v);
            if (!Number.isFinite(n)) return null;
            return Math.max(0, Math.min(100, n));
        };

        const strictnessLabelFromLevel = (level) => {
            const x = clampStrictnessLevel(level);
            if (x === null) return '适中';
            if (x < 25) return '严格';
            if (x < 60) return '适中';
            if (x < 85) return '宽松';
            return '激励模式';
        };

        const strictnessLevelFromLabel = (label) => {
            const s = (label || '').toString();
            if (s.includes('严格')) return 15;
            if (s.includes('宽松')) return 70;
            if (s.includes('激励')) return 90;
            return 45;
        };

        const strictnessFactorFromLevel = (level) => {
            const x = clampStrictnessLevel(level);
            if (x === null) return 1.0;

            const lerp = (a, b, t) => a + (b - a) * t;
            const seg = (x0, y0, x1, y1, x) => {
                if (x <= x0) return y0;
                if (x >= x1) return y1;
                return lerp(y0, y1, (x - x0) / (x1 - x0));
            };

            if (x <= 45) return seg(0, 1.25, 45, 1.00, x);
            if (x <= 70) return seg(45, 1.00, 70, 0.92, x);
            if (x <= 90) return seg(70, 0.92, 90, 0.84, x);
            return seg(90, 0.84, 100, 0.80, x);
        };

        const strictnessFactor = (rubricOrStrictness) => {
            if (rubricOrStrictness && typeof rubricOrStrictness === 'object') {
                const level = clampStrictnessLevel(rubricOrStrictness.strictnessLevel);
                if (level !== null) return strictnessFactorFromLevel(level);
                const s = (rubricOrStrictness.strictness || '').toString();
                return strictnessFactorFromLevel(strictnessLevelFromLabel(s));
            }
            return strictnessFactorFromLevel(strictnessLevelFromLabel(rubricOrStrictness));
        };

        const strictnessScoreShift = (totalMax, rubricOrStrictness) => {
            const t = Number(totalMax);
            if (!Number.isFinite(t) || t <= 0) return 0;

            let level = null;
            if (rubricOrStrictness && typeof rubricOrStrictness === 'object') {
                level = clampStrictnessLevel(rubricOrStrictness.strictnessLevel);
            } else {
                level = clampStrictnessLevel(strictnessLevelFromLabel(rubricOrStrictness));
            }

            const neutral = 45;
            const x = level === null ? neutral : level;
            const ratio = (x - neutral) / (100 - neutral);

            const base = t >= 16 ? 2.0 : 1.0;
            const cap = base;
            const scaled = base * ratio * 2.2;
            return clampNumber(roundToHalf(scaled), -cap, cap);
        };

        const buildScoreAnchorText = (totalMax, rubricOrStrictness) => {
            const t = Number(totalMax);
            if (!Number.isFinite(t) || t <= 0) return '';
            let level = null;
            let s = '';
            if (rubricOrStrictness && typeof rubricOrStrictness === 'object') {
                level = clampStrictnessLevel(rubricOrStrictness.strictnessLevel);
                s = (rubricOrStrictness.strictness || '').toString();
            } else {
                s = (rubricOrStrictness || '').toString();
                level = clampStrictnessLevel(strictnessLevelFromLabel(s));
            }

            const p = (x) => roundToHalf(t * x);
            const clampBand = (min, max) => {
                const a = clampNumber(roundToHalf(min), 0, t);
                const b = clampNumber(roundToHalf(max), 0, t);
                return a <= b ? [a, b] : [b, a];
            };

            const neutral = 45;
            const x = level === null ? neutral : level;
            const ratio = (x - neutral) / (100 - neutral);
            const strictish = clampNumber(-ratio, 0, 1);
            const lenientish = clampNumber(ratio, 0, 1);

            let topMin = p(0.90 + strictish * 0.04 - lenientish * 0.05);
            let highMin = p(0.75 + strictish * 0.03 - lenientish * 0.05);
            let midMin = p(0.60 + strictish * 0.02 - lenientish * 0.04);

            if (s.includes('严格')) {
                topMin = p(0.92);
                highMin = p(0.78);
                midMin = p(0.62);
            } else if (s.includes('宽松')) {
                topMin = p(0.87);
                highMin = p(0.72);
                midMin = p(0.58);
            } else if (s.includes('激励')) {
                topMin = p(0.85);
                highMin = p(0.70);
                midMin = p(0.56);
            }

            const [a1, a2] = clampBand(topMin, t);
            const [b1, b2] = clampBand(highMin, a1 - 0.5);
            const [c1, c2] = clampBand(midMin, b1 - 0.5);
            const [d1, d2] = clampBand(0, c1 - 0.5);

            if (s.includes('严格')) {
                return `   - ${a1}-${a2}：字数达标；错误很少（通常 ≤2-3 处且多为小错）；结构清晰连贯。\n   - ${b1}-${b2}：字数基本达标；有少量错误（约 4-7 处，含个别语法/时态问题）；结构基本清晰。\n   - ${c1}-${c2}：错误较多（约 8-12 处，语法/时态/用词问题明显）或内容要点缺失；结构一般。\n   - ${d1}-${d2}：错误频繁（>12 处）/严重跑题/字数严重不足/大量句子不可理解。`.replace(/\\n/g, "\n");
            }
            if (s.includes('激励')) {
                return `   - ${a1}-${a2}：字数基本达标；意思表达清楚；允许存在一定错误（含语法/拼写），但不影响理解；结构较完整。\n   - ${b1}-${b2}：字数接近达标；有一些错误但大体可读；内容要点大致齐全。\n   - ${c1}-${c2}：字数不足或错误较多，但能看出基本意思；需要重点改进语法与表达。\n   - ${d1}-${d2}：严重跑题/字数严重不足/大量句子不可理解。`.replace(/\\n/g, "\n");
            }
            if (s.includes('宽松')) {
                return `   - ${a1}-${a2}：字数达标；表达清楚；允许少量错误；结构清晰。\n   - ${b1}-${b2}：字数基本达标；错误数量中等；不影响整体理解；结构基本清晰。\n   - ${c1}-${c2}：错误较多或要点缺失，但仍能理解主要意思；结构一般。\n   - ${d1}-${d2}：严重跑题/字数严重不足/大量句子不可理解。`.replace(/\\n/g, "\n");
            }
            return `   - ${a1}-${a2}：字数达标；错误较少；结构清晰连贯。\n   - ${b1}-${b2}：字数基本达标；有少量错误；结构基本清晰。\n   - ${c1}-${c2}：错误较多或内容要点缺失；结构一般。\n   - ${d1}-${d2}：错误频繁/严重跑题/字数严重不足/大量句子不可理解。`.replace(/\\n/g, "\n");
        };

        const classifyErrorWeight = (err) => {
            const type = (err && err.type ? err.type : '').toString();
            const note = (err && err.note ? err.note : '').toString();
            const merged = `${type} ${note}`;
            let w = 0.6;
            if (/语法|时态|主谓|从句|非谓语|单复数|冠词|一致|句子结构|搭配错误/.test(merged)) w = 1.0;
            else if (/用词|词汇|搭配|介词|拼写/.test(merged)) w = 0.7;
            else if (/标点|大小写/.test(merged)) w = 0.45;
            if (/严重|必须|关键|致命|明显/.test(merged)) w *= 1.25;
            return w;
        };

        const estimateParagraphCount = (text) => {
            const s = (text || '').toString().trim();
            if (!s) return 0;
            const parts = s.split(/\n\s*\n+/g).map(t => t.trim()).filter(Boolean);
            if (parts.length >= 2) return parts.length;
            const lines = s.split(/\n+/g).map(t => t.trim()).filter(Boolean);
            return lines.length >= 3 ? 2 : 1;
        };

        const countConnectors = (text) => {
            const s = (text || '').toString().toLowerCase();
            if (!s.trim()) return 0;
            const connectors = [
                'first', 'second', 'third', 'then', 'next', 'after', 'before', 'finally',
                'because', 'so', 'therefore', 'however', 'but', 'although', 'though',
                'also', 'besides', 'moreover', 'in addition', 'for example', 'for instance'
            ];
            let c = 0;
            for (const k of connectors) {
                const re = new RegExp(`\\b${k.replace(/\s+/g, '\\s+')}\\b`, 'g');
                const m = s.match(re);
                if (m) c += m.length;
            }
            return c;
        };

        const pickRubricLabels = (rubric) => {
            const items = Array.isArray(rubric && rubric.items) ? rubric.items : [];
            const labels = items.map(it => (it && it.label ? String(it.label) : '')).filter(Boolean);
            const find = (re, fallbackIdx) => labels.find(l => re.test(l)) || labels[fallbackIdx] || labels[0] || '';
            return {
                content: find(/内容|要点|信息|细节/, 0),
                language: find(/语言|语法|拼写|标点|词汇/, 1),
                structure: find(/结构|篇章|连贯|逻辑/, 2),
                wordCount: labels.find(l => /词数|字数/.test(l)) || '',
                handwriting: find(/书写|卷面|字迹/, 4)
            };
        };

        const addPointsToBreakdown = (breakdown, items, delta) => {
            const pts = Number(delta);
            if (!Number.isFinite(pts) || pts === 0) return breakdown;
            let remain = pts;
            const next = { ...(breakdown || {}) };
            const seq = Array.isArray(items) ? items.slice().reverse() : [];
            for (const it of seq) {
                if (remain <= 0.001) break;
                const label = it && it.label ? String(it.label) : '';
                const max = Number(it && it.score) || 0;
                if (!label || max <= 0) continue;
                const cur = Number(next[label]) || 0;
                const headroom = Math.max(0, max - cur);
                if (headroom <= 0) continue;
                const add = Math.min(headroom, remain);
                next[label] = clampNumber(roundToHalf(cur + add), 0, max);
                remain = roundToHalf(remain - add);
            }
            return next;
        };

        const subtractPointsFromBreakdown = (breakdown, items, delta) => {
            const pts = Math.abs(Number(delta));
            if (!Number.isFinite(pts) || pts === 0) return breakdown;
            let remain = pts;
            const next = { ...(breakdown || {}) };
            const seq = Array.isArray(items) ? items.slice().reverse() : [];
            for (const it of seq) {
                if (remain <= 0.001) break;
                const label = it && it.label ? String(it.label) : '';
                const max = Number(it && it.score) || 0;
                if (!label || max <= 0) continue;
                const cur = Number(next[label]) || 0;
                if (cur <= 0) continue;
                const sub = Math.min(cur, remain);
                next[label] = clampNumber(roundToHalf(cur - sub), 0, max);
                remain = roundToHalf(remain - sub);
            }
            return next;
        };

        const calibrateResultScoresAgainstEvidence = (result, rubric) => {
            const out = { ...(result || {}) };
            const items = Array.isArray(rubric && rubric.items) ? rubric.items : [];
            const totalMax = Number(rubric && rubric.total) || 0;
            if (!out || !out.breakdown || items.length === 0 || totalMax <= 0) return out;
            if (out.isBlank) {
                const zeroed = {};
                items.forEach(it => { if (it && it.label) zeroed[String(it.label)] = 0; });
                out.breakdown = zeroed;
                out.total_score = 0;
                return out;
            }

            const labels = pickRubricLabels(rubric);
            const factor = strictnessFactor(rubric);

                const wc = countEnglishWordsForScoring(out.original_essay) || (Number.isFinite(Number(out.word_count)) ? Number(out.word_count) : 0);
            const req = parseWordCountRequirement(rubric && rubric.wordCount);

            let breakdown = { ...(out.breakdown || {}) };
            const maxByLabel = new Map(items.map(it => [String(it.label), Number(it.score) || 0]));

            const contentMax = maxByLabel.get(labels.content) || 0;
            const langMax = maxByLabel.get(labels.language) || 0;
            const structMax = maxByLabel.get(labels.structure) || 0;
                const wcMax = maxByLabel.get(labels.wordCount) || 0;

            const contentBase = Number(breakdown[labels.content]) || 0;
            const langBase = Number(breakdown[labels.language]) || 0;
            const structBase = Number(breakdown[labels.structure]) || 0;
                const wcBase = Number(breakdown[labels.wordCount]) || 0;

            let contentPenalty = 0;
                const applyWordCountToContentFallback = !(labels.wordCount && wcMax > 0);
                if (applyWordCountToContentFallback && wc > 0 && req.min > 0) {
                    const deficit = wc < req.min ? (req.min - wc) : 0;
                    const excess = Number.isFinite(req.max) && wc > req.max ? (wc - req.max) : 0;
                    const strictOn = !(rubric && rubric.wordCountStrict === false);
                    if (strictOn) {
                        if (deficit > 0) {
                            const ratio = deficit / Math.max(req.min, 1);
                            if (ratio >= 0.5) contentPenalty = 3.5;
                            else if (ratio >= 0.35) contentPenalty = 2.5;
                            else if (ratio >= 0.2) contentPenalty = 1.5;
                            else if (ratio >= 0.1) contentPenalty = 0.5;
                        } else if (excess > 0 && Number.isFinite(req.max) && req.max > 0) {
                            const ratio = excess / req.max;
                            if (ratio >= 0.35) contentPenalty = 1.0;
                            else if (ratio >= 0.2) contentPenalty = 0.5;
                        }
                        contentPenalty = roundToHalf(contentPenalty * factor);
                    } else {
                        if (deficit > 0) {
                            const ratio = deficit / Math.max(req.min, 1);
                            if (ratio >= 0.3) contentPenalty = 1.0;
                        } else if (excess > 0 && Number.isFinite(req.max) && req.max > 0) {
                            const ratio = excess / req.max;
                            if (ratio >= 1.0) contentPenalty = 0.5;
                        }
                        contentPenalty = roundToHalf(contentPenalty);
                    }
                    contentPenalty = clampNumber(contentPenalty, 0, Math.max(0, contentMax));
                }

            const errs = Array.isArray(out.errors) ? out.errors : [];
            const weightedErrors = errs.reduce((acc, e) => acc + classifyErrorWeight(e), 0);
            let languagePenalty = 0;
            if (weightedErrors > 0) {
                const scaled = Math.sqrt(Math.max(0, weightedErrors));
                const per = 0.65 * factor;
                languagePenalty = roundToHalf(scaled * per);
                languagePenalty = clampNumber(languagePenalty, 0, Math.max(0, langMax));
            }

            let structurePenalty = 0;
            const para = estimateParagraphCount(out.original_essay);
            const conn = countConnectors(out.original_essay);
            if (wc > 0) {
                if (para <= 1 && wc >= 40) structurePenalty += 0.5;
                if (conn === 0 && wc >= 50) structurePenalty += 0.5;
            }
            structurePenalty = roundToHalf(structurePenalty * (factor >= 1 ? 1 : factor));
            structurePenalty = clampNumber(structurePenalty, 0, Math.max(0, structMax));

                let wordCountCeiling = null;
                if (labels.wordCount && wcMax > 0 && wc > 0 && req.min > 0) {
                    const strictOn = !(rubric && rubric.wordCountStrict === false);
                    let cap = wcMax;
                    if (strictOn) {
                        if (wc < req.min) {
                            cap = wcMax * (wc / Math.max(req.min, 1));
                        } else if (Number.isFinite(req.max) && req.max > 0 && wc > req.max) {
                            cap = wcMax * Math.max(0.5, req.max / wc);
                        }
                        cap = roundToHalf(cap);
                    } else {
                        if (wc < req.min * 0.7) cap = roundToHalf(wcMax * 0.5);
                        else if (Number.isFinite(req.max) && req.max > 0 && wc > req.max * 2.0) cap = roundToHalf(wcMax * 0.8);
                        else cap = wcMax;
                    }
                    wordCountCeiling = clampNumber(cap, 0, wcMax);
                }

            if (labels.content && contentMax > 0) {
                const ceiling = clampNumber(roundToHalf(contentMax - contentPenalty), 0, contentMax);
                breakdown[labels.content] = clampNumber(roundToHalf(Math.min(contentBase, ceiling)), 0, contentMax);
            }
            if (labels.language && langMax > 0) {
                const ceiling = clampNumber(roundToHalf(langMax - languagePenalty), 0, langMax);
                breakdown[labels.language] = clampNumber(roundToHalf(Math.min(langBase, ceiling)), 0, langMax);
            }
            if (labels.structure && structMax > 0) {
                const ceiling = clampNumber(roundToHalf(structMax - structurePenalty), 0, structMax);
                breakdown[labels.structure] = clampNumber(roundToHalf(Math.min(structBase, ceiling)), 0, structMax);
            }
                if (labels.wordCount && wcMax > 0 && wordCountCeiling !== null) {
                    breakdown[labels.wordCount] = clampNumber(roundToHalf(Math.min(wcBase, wordCountCeiling)), 0, wcMax);
                }

            const sum = roundToHalf(Object.values(breakdown).reduce((a, b) => a + (Number(b) || 0), 0));
            let total = clampNumber(sum, 0, totalMax);
            const sum2 = roundToHalf(Object.values(breakdown).reduce((a, b) => a + (Number(b) || 0), 0));
            const diff = roundToHalf(total - sum2);
            if (diff !== 0 && items.length > 0) {
                const last = items[items.length - 1];
                const label = String(last.label);
                const max = Number(last.score) || 0;
                breakdown[label] = clampNumber(roundToHalf((Number(breakdown[label]) || 0) + diff), 0, max);
                total = roundToHalf(Object.values(breakdown).reduce((a, b) => a + (Number(b) || 0), 0));
                total = clampNumber(total, 0, totalMax);
            }

            const shift = strictnessScoreShift(totalMax, rubric);
            if (shift !== 0 && items.length > 0) {
                breakdown = shift > 0
                    ? addPointsToBreakdown(breakdown, items, shift)
                    : subtractPointsFromBreakdown(breakdown, items, shift);
                total = roundToHalf(Object.values(breakdown).reduce((a, b) => a + (Number(b) || 0), 0));
                total = clampNumber(total, 0, totalMax);
            }

            out.breakdown = breakdown;
            out.total_score = total;
            return out;
        };

        const normalizeBreakdownAgainstRubric = (result, rubric) => {
            const items = Array.isArray(rubric && rubric.items) ? rubric.items : [];
            const totalMax = Number(rubric && rubric.total) || 0;
            const out = { ...(result || {}) };

            const rawBreakdown = (out && typeof out.breakdown === 'object' && out.breakdown) ? out.breakdown : {};
            const breakdown = {};

            for (const it of items) {
                const label = (it && it.label) ? String(it.label) : '';
                if (!label) continue;
                const max = Number(it && it.score) || 0;
                const v = rawBreakdown[label];
                if (v === '' || v === null || typeof v === 'undefined') {
                    breakdown[label] = 0;
                } else {
                    breakdown[label] = clampNumber(roundToHalf(v), 0, max);
                }
            }

            const sum = Object.values(breakdown).reduce((a, b) => a + (Number(b) || 0), 0);
            let total = out.total_score;
            if (!Number.isFinite(Number(total))) total = sum;
            total = clampNumber(roundToHalf(total), 0, totalMax);

            let fixed = { ...breakdown };
            const sumFixed = Object.values(fixed).reduce((a, b) => a + (Number(b) || 0), 0);
            if (sumFixed === 0 && total > 0 && items.length > 0) {
                const weights = items.map(it => Math.max(0, Number(it && it.score) || 0));
                const wSum = weights.reduce((a, b) => a + b, 0) || items.length;
                fixed = {};
                items.forEach((it, idx) => {
                    const label = String(it.label);
                    const max = Number(it.score) || 0;
                    const raw = total * (weights[idx] / wSum);
                    fixed[label] = clampNumber(roundToHalf(raw), 0, max);
                });
            }

            let fixedSum = Object.values(fixed).reduce((a, b) => a + (Number(b) || 0), 0);
            if (fixedSum > 0 && total > 0 && Math.abs(fixedSum - total) >= 0.25) {
                const ratio = total / fixedSum;
                const scaled = {};
                items.forEach(it => {
                    const label = String(it.label);
                    const max = Number(it.score) || 0;
                    const raw = (Number(fixed[label]) || 0) * ratio;
                    scaled[label] = clampNumber(roundToHalf(raw), 0, max);
                });
                fixed = scaled;
            }

            fixedSum = Object.values(fixed).reduce((a, b) => a + (Number(b) || 0), 0);
            const delta = roundToHalf(total - fixedSum);
            if (delta !== 0 && items.length > 0) {
                const last = items[items.length - 1];
                const label = String(last.label);
                const max = Number(last.score) || 0;
                fixed[label] = clampNumber(roundToHalf((Number(fixed[label]) || 0) + delta), 0, max);
            }

            out.breakdown = fixed;
            out.total_score = roundToHalf(Object.values(fixed).reduce((a, b) => a + (Number(b) || 0), 0));
            out.total_score = clampNumber(out.total_score, 0, totalMax);

            out.highlights = normalizeHighlights(out.highlights, Boolean(out.isBlank));

            out.errors = normalizeErrorsForRubric(out.errors, rubric, Boolean(out.isBlank));

            if (typeof out.original_essay !== 'string') {
                if (typeof out.original_text === 'string') out.original_essay = out.original_text;
                else if (typeof out.ocr_text === 'string') out.original_essay = out.ocr_text;
                else if (typeof out.student_essay === 'string') out.original_essay = out.student_essay;
                else out.original_essay = '';
            }
            const computedWordCount = countEnglishWords(out.original_essay);
            if (computedWordCount > 0) out.word_count = computedWordCount;
            else if (!Number.isFinite(Number(out.word_count))) out.word_count = 0;
            else out.word_count = Math.max(0, Math.floor(Number(out.word_count)));

            return calibrateResultScoresAgainstEvidence(out, rubric);
        };

        const didTeacherEditScores = (prevResult, nextResult, rubric) => {
            const prev = prevResult && typeof prevResult === 'object' ? prevResult : {};
            const next = nextResult && typeof nextResult === 'object' ? nextResult : {};
            const items = Array.isArray(rubric && rubric.items) ? rubric.items : [];
            const prevTotal = prev.total_score;
            const nextTotal = next.total_score;
            if (String(prevTotal ?? '') !== String(nextTotal ?? '')) return true;
            const prevB = (prev && typeof prev.breakdown === 'object' && prev.breakdown) ? prev.breakdown : {};
            const nextB = (next && typeof next.breakdown === 'object' && next.breakdown) ? next.breakdown : {};
            for (const it of items) {
                const label = (it && it.label) ? String(it.label) : '';
                if (!label) continue;
                if (String(prevB[label] ?? '') !== String(nextB[label] ?? '')) return true;
            }
            return false;
        };

        const normalizeTeacherEditedScoresAgainstRubric = (result, rubric) => {
            const items = Array.isArray(rubric && rubric.items) ? rubric.items : [];
            const totalMax = Number(rubric && rubric.total) || 0;
            const out = { ...(result || {}) };
            const rawBreakdown = (out && typeof out.breakdown === 'object' && out.breakdown) ? out.breakdown : {};
            const breakdown = {};
            for (const it of items) {
                const label = (it && it.label) ? String(it.label) : '';
                if (!label) continue;
                const max = Number(it && it.score) || 0;
                const v = rawBreakdown[label];
                if (v === '' || v === null || typeof v === 'undefined') {
                    breakdown[label] = v === '' ? '' : 0;
                } else {
                    breakdown[label] = clampNumber(roundToHalf(v), 0, max);
                }
            }
            const sum = roundToHalf(Object.values(breakdown).reduce((a, b) => a + (Number(b) || 0), 0));
            out.breakdown = breakdown;
            out.total_score = clampNumber(sum, 0, totalMax);
            return out;
        };

        const RUBRIC_PARSE_PROMPT_SYSTEM = (currentRubric) => {
            const total = Number(currentRubric && currentRubric.total);
            const fallbackTotal = Number.isFinite(total) ? total : 10;
            const wordCount = (currentRubric && currentRubric.wordCount) ? String(currentRubric.wordCount) : '60-80 words';
            const gradeLevel = (currentRubric && currentRubric.gradeLevel) ? String(currentRubric.gradeLevel) : '七年级';
            const tense = Array.isArray(currentRubric && currentRubric.tense) ? currentRubric.tense.filter(Boolean) : ['一般现在时'];
            const strictness = (currentRubric && currentRubric.strictness) ? String(currentRubric.strictness) : '适中';
            return `
你是一个评分标准解析引擎。请从教师上传的评分标准文本中提取结构化信息，并输出严格 JSON。

【输入】
- 可能包含：总分、字数要求、评分维度、各维度的详细描述、评分等级（如A/B/C或优秀/良好/及格/待改进）及其标准。
- 文本可能不规整、包含换行与列表。

【输出 JSON 结构】
{
  "total": ${fallbackTotal},
  "wordCount": ${JSON.stringify(wordCount)},
  "gradeLevel": ${JSON.stringify(gradeLevel)},
  "tense": ${JSON.stringify(tense)},
  "strictness": ${JSON.stringify(strictness)},
  "dimensions": [
    {
      "name": "内容完整度",
      "points": 4,
      "description": "一句话概括该维度核心要求",
      "levels": [
        { "name": "优秀", "criteria": "对应标准" },
        { "name": "良好", "criteria": "对应标准" },
        { "name": "及格", "criteria": "对应标准" },
        { "name": "待改进", "criteria": "对应标准" }
      ]
    }
  ]
}

【规则】
1. 如果找不到某字段，使用合理默认值或空字符串/空数组，但必须保留字段。
2. points 必须是数字。
3. dimensions 至少输出 1 项。
4. description 保持精炼，levels 只保留与标准相关的内容。
`;
        };

        const RUBRIC_DESIGN_PROMPT_SYSTEM = (currentRubric, assignment) => {
            const total = Number(currentRubric && currentRubric.total);
            const fallbackTotal = Number.isFinite(total) ? total : 10;
            const wordCount = (currentRubric && currentRubric.wordCount) ? String(currentRubric.wordCount) : '60-80 words';
            const gradeLevel = (currentRubric && currentRubric.gradeLevel) ? String(currentRubric.gradeLevel) : '七年级';
            const tense = Array.isArray(currentRubric && currentRubric.tense) ? currentRubric.tense.filter(Boolean) : ['一般现在时'];
            const strictness = (currentRubric && currentRubric.strictness) ? String(currentRubric.strictness) : '适中';
            const topic = (assignment && assignment.topic) ? String(assignment.topic) : '';
            const analysis = (assignment && assignment.analysis) ? String(assignment.analysis) : '';
            return `
你是一个评分标准设计引擎。你将基于“题目文字稿”和“题目要点分析”，生成结构化评分标准（可直接映射到系统评分模板）。

请严格只输出一个 JSON 对象，不要输出任何 Markdown、代码块标记或解释性文字；JSON 必须可被 JSON.parse 正常解析。
规则：
1) 必须使用双引号包裹所有字段名与字符串值。
2) 字符串中如果需要换行，请用 \\n 表示，不要直接输出原始换行符。
3) points 必须为数字；dimensions 至少 3 项。
4) 维度必须覆盖题目要点（漏点要可扣分），描述要可操作、可判定，避免空话。
5) 总分 total 必须严格等于各维度 points 之和（误差=0）；如果题目要点分析中给出了“建议分值/建议总分”，必须优先采用并保持一致。
6) 必须包含一个“词数/字数要求”相关维度（可命名为“词数要求”或“字数要求”），并写清“严格/宽松”的扣分口径。

【题目文字稿】
${topic}

【题目要点分析】
${analysis}

【输出 JSON 结构】
{
  "total": ${fallbackTotal},
  "wordCount": ${JSON.stringify(wordCount)},
  "gradeLevel": ${JSON.stringify(gradeLevel)},
  "tense": ${JSON.stringify(tense)},
  "strictness": ${JSON.stringify(strictness)},
  "dimensions": [
    {
      "name": "内容要点覆盖",
      "points": 4,
      "description": "要求与扣分点说明（可判定）",
      "levels": [
        { "name": "优秀", "criteria": "对应标准" },
        { "name": "良好", "criteria": "对应标准" },
        { "name": "及格", "criteria": "对应标准" },
        { "name": "待改进", "criteria": "对应标准" }
      ]
    }
  ]
}
`;
        };

        const EXTRACT_PROMPT_TEXT_SYSTEM = () => `
你是一个OCR与文本提取引擎。请从用户上传的英语作文题目图片中，完整提取图片里的所有可见文字内容。

请严格只输出一个 JSON 对象，不要输出任何 Markdown、代码块标记或解释性文字；JSON 必须可被 JSON.parse 正常解析。
规则：
1) 必须使用双引号包裹所有字段名与字符串值。
2) 字符串中如果需要换行，请用 \\n 表示，不要直接输出原始换行符。
3) 必须“尽可能逐字完整”转写：包括标题、要求、编号/项目符号、示例、括号内容、提示语、页眉页脚等；不要总结、不要改写、不要删减。
4) 如果有不确定字符，用最接近的字符替代；如确实无法判断，用 [UNK] 标记该处，但不要整段省略。

输出 JSON：
{
  "title": "如果图片中有明确英文标题则填入，否则留空字符串",
  "topic": "完整题目文字稿（保持原有分行/编号结构）"
}
`;

        const ANALYZE_TOPIC_TEXT_SYSTEM = (rubric) => `
你是一个教学助手。你将基于用户确认过的“题目文字稿”，生成可直接用于拟定评分标准的“题目分析要点”。

请严格只输出一个 JSON 对象，不要输出任何 Markdown、代码块标记或解释性文字；JSON 必须可被 JSON.parse 正常解析。
规则：
1) 必须使用双引号包裹所有字段名与字符串值。
2) 字符串中如果需要换行，请用 \\n 表示，不要直接输出原始换行符。
3) 不要凭空添加题目没有要求的任务点；只把题目中明确或强暗示的要求结构化出来。

输出 JSON：
{
  "title": "提炼一个简短的英语标题（例如 A Happy Day；若题目本身已有标题可沿用）",
  "analysis": "用中文输出：\\n1) 写作任务与体裁\\n2) 必须覆盖的要点清单（逐条对应题目要求）\\n3) 推荐结构（至少3段，每段写什么）\\n4) 推荐时态（从：${(Array.isArray(rubric.tense) ? rubric.tense : []).join(', ')} 中选择最匹配的，必要时可说明原因）\\n5) 推荐字数与细节密度（参考：${rubric.wordCount}）\\n6) 常见扣分点提醒（围绕本题最容易跑题/漏点的地方）\\n7) 评分建议（必须包含总分与分值分配）：\\n- 本次作文总分：${Number(rubric && rubric.total) || 0} 分（用一句话说明总分构成/覆盖要点+语言+结构+书写/词数等）。\\n- 建议分值分配（必须列出 4-6 个维度，每个维度带具体分值，分值之和必须严格等于总分；用形如“维度：X分（扣分点…）”的格式逐条列出）。"
}
`;

 const CLASS_ANALYSIS_PROMPT = (config, assignment, dateStr) => `
你是一位资深英语教师。你将基于提供的全班批改数据，生成一份专业的英语写作质量分析报告，受众是英语教研组。

请严格按以下要求，只输出 JSON，不要输出任何 Markdown、HTML 标签或解释性文字：

1. 输出结构：
{
  "title": "整体报告主标题，建议为‘英语写作质量分析报告’",
  "subtitle": "一句话副标题，例如：${(assignment.examName ? assignment.examName + ' - ' : '')}${assignment.title || '本次作业'} - 班级学情概览",
  "date": "${dateStr}",
  "class_name": "可使用传入数据中的班级名称或留空",
  "summaryMetrics": {
    "sample_size": "样本数量描述（必须根据传入 uploadedCount 计算，例如：共 48 份作文；如果 uploadedCount 与 gradedCount 不一致，需要在这句话里说明‘其中成功批改45份，3份未纳入统计’）",
    "average_score": "平均分描述（必须根据 gradedSamples 中的 score 实际计算；如果 gradedCount < uploadedCount，只对 gradedSamples 统计并说明统计口径）",
    "score_range": "分数区间描述（最高分和最低分同样只基于 gradedSamples；如存在未纳入统计样本需说明）",
    "key_focus": "一句话点出本次分析重点，例如：重点关注${config.focus}，并点明学生在本次写作中的主要优势或短板"
  },
  "sections": [
    {
      "title": "${(assignment.examName ? assignment.examName + ' - ' : '')}${assignment.title || '本次作业'} - 班级学情概览",
      "paragraphs": [
        "2-4 段文字，每段 2-4 句，客观概述整体完成情况，明确说明整体得分水平、不同分段学生的大致比例等，结论必须来自 samples.score 的统计结果。"
      ]
    },
    {
      "title": "高频共性问题",
      "paragraphs": [
        "用 1-2 段文字概括共性问题的整体特点，必须说明是从 samples.errors 中统计得出的，比如“时态错误在 45 份作文中出现了 18 次，其中一般现在时与一般过去时时态混用最为常见”。"
      ],
      "bullets": [
        "列出 4-6 条典型问题，每条尽量简短有力，并尽量引用 1-2 句来自 samples.errors.orig/corr 的真实例句，格式类似：He is a selfless and responsible hero. → He is a selfless and responsible hero.（注意：在你的输出中，orig 和 corr 必须不同，真正体现出修改前后的差异）。"
      ]
    },
    {
      "title": "知识盲点深度诊断",
      "paragraphs": ["重点分析语法、词汇、篇章结构等层面的薄弱点，并说明这些结论与哪些高频错误类型相对应。"],
      "bullets": ["列出 3-5 条需要重点补救的知识点，尽量结合 errors.type 和 note 进行归纳。"]
    },
    {
      "title": "优秀表达展示与赏析",
      "paragraphs": [
        "整体评价学生的亮点，说明哪些学生在用词、句式或篇章结构上表现突出，这些判断要来自 samples.highlights 和 optimized_essay。"
      ],
      "bullets": [
        "列出 3-5 条值得课堂分享的真实英文表达，优先直接引用 samples.highlights.text 或 optimized_essay 中的典型句子，并用简洁中文进行赏析。"
      ]
    },
    {
      "title": "后续教学建议",
      "paragraphs": ["给出 2-3 段教学建议，兼顾近期可执行措施与中长期规划，建议与前面发现的问题、亮点一一呼应。"],
      "bullets": ["列出 3-6 条可操作的教学行动建议，每条建议尽量具体，例如“用 2 节课专门训练过去式与一般现在时的对比练习，并用学生的真实错误句子改编练习题”。"]
    }
  ],
  "conclusion": "用 1 段话作整体总结，语气${config.tone}。"
}

2. 语言要求：
- 全部内容使用规范的书面中文。
- 语气保持${config.tone}，受众是专业教师，避免口语化表达。

3. 版式与对齐要求（由前端控制，仅供你写作参考）：
- 不需要也不要使用任何 text-align、style 等内联样式描述。
- 不要输出换行符形式的标题装饰，只需专注于文字本身。

4. 重要：
- 只输出一个 JSON 对象。
- 不要使用任何 Markdown 代码块标记（例如写成“json 代码块”）。
- 不要包含 HTML 标签。
\n\n你将从用户输入中得到一个 JSON 对象，包含：className、rubricTotal、uploadedCount、gradedCount、missingCount、missingFiles、gradedSamples。请严格基于这些字段写作，严禁把 uploadedCount 当作得分比例或最低分比例。\n\n统计口径：\n- sample_size 必须基于 uploadedCount。\n- average_score 与 score_range 必须仅基于 gradedSamples（即已成功批改且有 score 的样本），并在文字中说明是否存在 missingCount。\n\n如果 missingCount > 0：\n- 在“班级学情概览”中说明未纳入统计的数量与常见原因（从 missingFiles 推断，不要编造）。
`;


export { estimatePageCount, indentParagraphs, getEffectivePdfConfigForPages, INITIAL_RUBRIC, GRADE_LEVELS, TENSES, STRICTNESS_LEVELS, DIFFICULTY_LEVELS, GRADE_DIFFICULTY_TABLE, resolveGradeDifficultyProfile, clampRatio, resolveEffectiveDifficultyProfile, tokenizeEnglishWords, splitEnglishSentences, countSyllables, computeFleschKincaidGradeLevel, computeEnglishDifficultyStats, collectEnglishFieldsForDifficultyCheck, validateDifficultyForGrade, SYSTEM_PROMPT_TEMPLATE, OPTIMIZED_REPAIR_PROMPT_TEMPLATE, clampNumber, roundToHalf, sumItemMax, redistributeItemScoresToTotal, normalizeHighlights, normalizeErrorsForRubric, normalizeForWordCount, countEnglishWords, countEnglishWordsForScoring, normalizeForSimilarity, diceSimilarity, isOptimizedTooSimilarToReference, parseWordCountRequirement, clampStrictnessLevel, strictnessLabelFromLevel, strictnessLevelFromLabel, strictnessFactorFromLevel, strictnessFactor, strictnessScoreShift, buildScoreAnchorText, classifyErrorWeight, estimateParagraphCount, countConnectors, pickRubricLabels, addPointsToBreakdown, subtractPointsFromBreakdown, calibrateResultScoresAgainstEvidence, normalizeBreakdownAgainstRubric, didTeacherEditScores, normalizeTeacherEditedScoresAgainstRubric, RUBRIC_PARSE_PROMPT_SYSTEM, RUBRIC_DESIGN_PROMPT_SYSTEM, EXTRACT_PROMPT_TEXT_SYSTEM, ANALYZE_TOPIC_TEXT_SYSTEM };
