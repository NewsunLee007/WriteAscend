/** Additional judgment rules shared by the original workbench and cloud pipeline.
 * Keep the original scoring contract; do not turn a preferred tense into a ban.
 */
export const WRITING_CONTEXT_RULES = `【结合语境核对，不机械套用模板】
- “基本时态”表示本篇通常采用的时态，不表示全文只能使用这一时态。观点、普遍事实可以用现在时，已完成的历史事件、人物经历通常可以用过去时；同一篇中两者合理切换不构成语法错误。
- 不得仅因基本时态为一般现在时，就把历史人物过去的行为判错或统一改成现在时。判断须依据原句的时间、事实与上下文，而不是人物是否作为一个例子出现。
- 若题目明确规定一种时态训练，应区分“未满足本次训练要求”和“语法错误”，说明具体依据；不要声称符合语境的过去时在语法上错误。不确定时请教师核对，不凭猜测扣分。
- 纠错采用最小必要修改，保留人物、事件、时间关系及事实含义。修正词汇或搭配时不要顺带改变正确的动词时态。不要把写法偏好列为错误，或为增加错误条数拆分重复问题。
- 润色与难度调整同样必须保留原作的事件时间和事实，不能为了短句、基础词汇或难度指标把过去事实改成当前行为，也不能重新解释已经核对的纠错理由。
- 按本篇真实题目评价。通用体裁模板中的举例、建议或步骤，不自动成为每篇必须完成的内容；题目与评分标准有冲突时明确提示教师核对，不自行编造要求。`;

export function withWritingContext(prompt:string){return prompt+'\n\n'+WRITING_CONTEXT_RULES;}
