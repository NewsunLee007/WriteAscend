// Original callAI JSON parser; only raw-content logging is removed.
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
                    // Keep raw student/model content out of server logs.
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


export {parseJsonObject,extractContentFromApiResponse};
