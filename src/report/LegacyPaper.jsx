// Shared teacher, student-preview and printable report presentation.
import React,{useEffect,useRef,useState} from 'react';
import {Plus,Trash} from 'lucide-react';
import {clampNumber,roundToHalf,countEnglishWords,indentParagraphs} from './legacy-core.js';
import './writing-feedback.css';
const headings=['总体评价 (Overall Comment)','优秀表达 (Excellent Expressions)','诊断与提升 (Correction)','内容优化建议 (Content Optimization Suggestions)','升级版习作 (Revised)','标准参考范文 (Model)'];
export default function EditablePaper({data,assignment,rubric,studentIndex,onUpdate=/** @type {((value: any) => void) | null} */(null),readOnly=false,identityLocked=false,onDraftChange=/** @type {((value: any) => void) | null} */(null),pdfConfig}){
 readOnly=readOnly||!rubric;
 const [localData,setLocalData]=useState(data),root=useRef(null);
 useEffect(()=>setLocalData(data),[data]);
 useEffect(()=>{for(const field of root.current?.querySelectorAll('textarea')||[]){field.style.height='auto';field.style.height=field.scrollHeight+'px';}},[localData,readOnly]);
 const updateDraft=value=>{setLocalData(value);onDraftChange?.(value);};
 const handleChange=(field,value)=>{if(!readOnly)updateDraft({...localData,[field]:value});};
 const commit=(field,value)=>{if(readOnly)return;const next={...localData,[field]:value};updateDraft(next);onUpdate?.(next);};
            const handleTotalChange = (e) => {
                if (readOnly) return;
                const valStr = e.target.value;
                const newTotal = parseFloat(valStr);
                if (valStr === '') { updateDraft({ ...localData, total_score: '' }); return; }
                if (isNaN(newTotal)) return;

                const oldTotal = parseFloat(localData.total_score) || 0;
                if (oldTotal === 0) { updateDraft({ ...localData, total_score: newTotal }); return; }

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
                updateDraft({ ...localData, total_score: finalSum, breakdown: newBreakdown });
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
                updateDraft({ ...localData, breakdown: newBreakdown, total_score: newTotal });
            };
            

 const blur=()=>{if(!readOnly)onUpdate?.(localData);};
 const Field=({label,value,onChange,kind='text',locked=false,className=''})=>{
  const safe=value??'';
  if(readOnly||locked)return <span className={'feedback-value '+className}>{safe===''?'—':typeof safe==='string'||typeof safe==='number'?safe:String(safe)}</span>;
  return <input aria-label={label} type={kind} step={kind==='number'?'0.5':undefined} value={safe} onChange={onChange} onBlur={blur} className={className}/>;
 };
 const paragraphs=value=>String(value||'暂无').replace(/\r\n?/g,'\n').split(/\n\s*\n+/).map((text,index)=><span key={index} className="feedback-paragraph">{text}</span>);
 const Text=({label,value,onChange,english=false,annotation=false})=>{
  const className='feedback-text'+(english?' feedback-english':'')+(annotation?' feedback-annotation':'');
  if(readOnly)return <div className={className}>{english?paragraphs(value):String(value||'').trim()?String(value):'暂无'}</div>;
  return <textarea className={className} aria-label={label} rows={1} value={value||''} placeholder="点击补充或修改" onChange={onChange} onBlur={blur}/>;
 };
 const Title=({number})=><h3 className="feedback-section-title"><span aria-hidden="true">{String(number).padStart(2,'0')}</span><strong>{headings[number-1]}</strong></h3>;
 const fontScale=Number.isFinite(Number(pdfConfig?.fontSizeScale))?Number(pdfConfig.fontSizeScale):1;
 const lineHeight=Math.max(1,Number.isFinite(Number(pdfConfig?.lineHeight))?Number(pdfConfig.lineHeight):1.45);
 const gap=Math.max(4,Number.isFinite(Number(pdfConfig?.sectionGapPt))?Number(pdfConfig.sectionGapPt):8);
 const paragraphGap=Math.max(0,Number.isFinite(Number(pdfConfig?.paragraphGapPt))?Number(pdfConfig.paragraphGapPt):2);
 const paperStyle={padding:(pdfConfig?.padding??16)+'mm',fontSize:Math.max(8,10.5*fontScale)+'pt',lineHeight,'--feedback-section-gap':gap+'pt','--feedback-paragraph-gap':paragraphGap+'pt'};
 const highlights=Array.isArray(localData.highlights)?localData.highlights:[],errors=Array.isArray(localData.errors)?localData.errors:[];
 const editItem=(field,index,key,value)=>handleChange(field,localData[field].map((item,i)=>i===index?{...item,[key]:value}:item));
 const originalImages=Array.isArray(localData.original_image_urls)&&localData.original_image_urls.length?localData.original_image_urls:localData.original_image_url?[localData.original_image_url]:[];
 const scoreItems=Array.isArray(rubric?.items)?rubric.items:Object.keys(localData.breakdown||{}).map(label=>({id:label,label,score:null}));
 return <article ref={root} className="a4-wrapper writing-feedback" style={paperStyle}>
  <header className="feedback-header">
   <div className="feedback-heading"><p className="feedback-eyebrow">英语写作反馈 · 学生英语写作质量分析报告</p><h1>{assignment.title||assignment.examName||'本次英语写作'}</h1>{assignment.examName&&assignment.title&&<p className="feedback-exam">{assignment.examName}</p>}
    <dl className="feedback-identity"><div><dt>姓名</dt><dd className={localData.identity_name_mismatch&&!localData.identity_name_mismatch_verified?'feedback-mismatch':''}>{Field({label:'报告学生姓名',value:localData.student_name,locked:identityLocked,onChange:e=>handleChange('student_name',e.target.value)})}</dd></div><div><dt>班级</dt><dd>{Field({label:'报告班级',value:localData.class_name,locked:identityLocked,onChange:e=>handleChange('class_name',e.target.value)})}</dd></div><div><dt>序号</dt><dd>{localData.student_no||studentIndex||'—'}{localData.student_no_suffix||''}</dd></div></dl>
   </div>
   <div className="feedback-total"><span>本次得分</span><div>{Field({label:'作文总分',kind:'number',value:localData.total_score,onChange:handleTotalChange,className:'feedback-total-value'})}{rubric?<span>/{rubric.total}</span>:<small>满分未记录</small>}</div></div>
  </header>
  {localData.identity_name_mismatch&&!localData.identity_name_mismatch_verified&&!readOnly&&!identityLocked&&<aside className="feedback-identity-alert no-print"><span>识别姓名：{localData.detected_student_name||localData.identity_name_from_ai||'待核对'}。请对照原稿核对学生归属。</span><label><input type="checkbox" checked={false} onChange={()=>commit('identity_name_mismatch_verified',true)}/>已核对，确认归属正确</label></aside>}
  <div className="feedback-score-grid" style={{'--feedback-criteria':Math.min(6,scoreItems.length+1)}}>
   {scoreItems.map(item=><div key={item.id||item.label}><span>{item.label}</span><strong>{Field({label:item.label+'得分',kind:'number',value:localData.breakdown?.[item.label]??0,onChange:e=>handleBreakdownChange(item.label,e)})}{item.score!==null&&<small>/{item.score}</small>}</strong></div>)}
   <div><span>作文词数</span><strong>{countEnglishWords(localData.original_essay)||(localData.word_count??(rubric?0:'未记录'))}</strong><small>{rubric?'要求 '+(rubric.wordCount||'以题目为准'):'字数要求未记录'}</small></div>
  </div>
  {pdfConfig?.showPrompt&&assignment.topic&&<section className="feedback-prompt"><h3>写作任务</h3><div className="feedback-text">{assignment.topic}</div></section>}
  <section className="feedback-section feedback-overall"><Title number={1}/>{Text({label:'总体评价',value:localData.brief_comment,onChange:e=>handleChange('brief_comment',e.target.value)})}</section>
  <section className="feedback-section"><Title number={2}/><div className="feedback-highlights">{highlights.length?highlights.map((item,index)=><div key={index} className="feedback-highlight"><span className="feedback-item-index">{index+1}</span><div>{Text({label:'优秀表达 '+(index+1),value:item.text??item.excerpt,english:true,onChange:e=>editItem('highlights',index,'text',e.target.value)})}{Text({label:'亮点说明 '+(index+1),value:item.comment??item.why_good,annotation:true,onChange:e=>editItem('highlights',index,'comment',e.target.value)})}</div>{!readOnly&&<button className="feedback-delete no-print" aria-label={'删除优秀表达 '+(index+1)} onClick={()=>commit('highlights',highlights.filter((_,i)=>i!==index))}><Trash size={16}/></button>}</div>):<p className="feedback-empty">暂无独立标注的优秀表达。</p>}</div>{!readOnly&&<button className="feedback-add no-print" onClick={()=>commit('highlights',[...highlights,{text:'',comment:''}])}><Plus size={15}/>添加优秀表达</button>}</section>
  <section className="feedback-section"><Title number={3}/>{localData.isBlank?<p className="feedback-empty">本稿被标记为空白或无法识别，请结合原稿核对。</p>:<div className="feedback-corrections">{errors.length?errors.map((item,index)=><div className="feedback-correction" key={index}><div className="feedback-correction-heading"><span>问题 {index+1}{item.type?' · '+item.type:''}</span>{!readOnly&&<button className="feedback-delete no-print" aria-label={'删除纠错条目 '+(index+1)} onClick={()=>commit('errors',errors.filter((_,i)=>i!==index))}><Trash size={16}/></button>}</div><div className="feedback-comparison"><div><small>原句</small>{Text({label:'原句 '+(index+1),value:item.orig,english:true,onChange:e=>editItem('errors',index,'orig',e.target.value)})}</div><div><small>建议修改</small>{Text({label:'建议修改 '+(index+1),value:item.corr,english:true,onChange:e=>editItem('errors',index,'corr',e.target.value)})}</div></div>{Text({label:'修改原因 '+(index+1),value:item.note,annotation:true,onChange:e=>editItem('errors',index,'note',e.target.value)})}</div>):<p className="feedback-empty">暂无逐项纠错记录。</p>}</div>}{!readOnly&&<button className="feedback-add no-print" onClick={()=>commit('errors',[...errors,{orig:'',corr:'',note:''}])}><Plus size={15}/>添加纠错条目</button>}</section>
  <section className="feedback-section"><Title number={4}/>{Text({label:'内容优化建议',value:localData.content_logic,onChange:e=>handleChange('content_logic',e.target.value)})}</section>
  <section className="feedback-section feedback-essay"><Title number={5}/><p className="feedback-section-note">基于原作的改写示范，供比较与修订参考。</p>{Text({label:'升级版习作',value:readOnly?indentParagraphs(localData.optimized_essay):localData.optimized_essay,english:true,onChange:e=>handleChange('optimized_essay',e.target.value)})}</section>
  <section className="feedback-section feedback-essay"><Title number={6}/><p className="feedback-section-note">本次写作任务的参考范文。</p><div className="feedback-text feedback-english">{paragraphs(indentParagraphs(localData.standard_reference||assignment.modelEssay||'暂无'))}</div>{localData.difficulty_status==='exceeded'&&<p className="feedback-section-note">部分英文表达的难度仍需教师核对。</p>}</section>
  {pdfConfig?.showOriginal&&<section className="feedback-section feedback-original"><h3>作文原稿 (Original)</h3>{originalImages.length?originalImages.map((url,index)=><figure key={url}><img src={url} alt={'作文原稿第 '+(index+1)+' 页'}/>{originalImages.length>1&&<figcaption>第 {index+1} 页</figcaption>}</figure>):<div className="feedback-text feedback-english">{localData.original_essay||'当前报告无可用原稿图片。'}</div>}</section>}
  <footer className="feedback-footer"><span>AI 辅助批阅</span><span>请结合教师核对意见，完成自己的下一稿。</span></footer>
 </article>;
}
