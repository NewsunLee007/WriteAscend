import React, {useRef,useState} from 'react';

export default function QuickGrading({assignment,setAssignment,rubric,setRubric,classes,currentClassId,activeClassIds,setCurrentClassId,setActiveClassIds,onGradeChange,files,isBatchProcessing,configReady,onPromptUpload,onRecognizePrompt,onUpload,onStart,onManageStudents,onModelSettings,onAdvanced,onImportRubric,onRemoveFile,onRetry}) {
  const upload=useRef(null),camera=useRef(null),topic=useRef(null);
  const [editingTask,setEditingTask]=useState(false);
  const hasTopic=!!String(assignment.topic||'').trim(),taskExpanded=editingTask||!hasTopic;
  const currentClass=classes.find(c=>String(c.id)===String(currentClassId));
  const selectedClasses=activeClassIds.length?activeClassIds:(currentClassId?[currentClassId]:[]);
  const grade=activeClassIds.length>1?rubric.gradeLevel:(currentClass?.gradeLevel||rubric.gradeLevel);
  const grades=[...new Set(['六年级','七年级','八年级','九年级','高一','高二','高三',grade].filter(Boolean))];
  const pending=files.filter(f=>f.status==='idle').length;
  const completed=files.filter(f=>f.status==='success').length;
  const failures=files.filter(f=>f.status==='error').length;
  return <div className="quick-grading">
    <header className="quick-heading"><h1>英语作文，一键批阅。</h1><span>沿用上次设置，上传作文即可开始。题目和评分标准可随时调整。</span></header>
    <section className="quick-card" aria-labelledby="quick-task-title">
      <div className="quick-card-title"><h2 id="quick-task-title"><b>1</b> 本次写作</h2>{hasTopic?<button aria-expanded={taskExpanded} aria-controls="quick-task-fields" onClick={()=>setEditingTask(!taskExpanded)}>{taskExpanded?'收起本次设置':'编辑本次写作'}</button>:<button onClick={onAdvanced}>完整设置</button>}</div>
      {!taskExpanded&&<div className="quick-task-summary"><strong>{assignment.title||assignment.examName||'已设置写作任务'}</strong><p>{assignment.topic}</p><div><span>{activeClassIds.length>1?selectedClasses.length+' 个班级':currentClass?.name||'请选择班级'}</span><span>{grade}</span><span>满分 {rubric.total} 分</span><span>{rubric.wordCount||'字数不限'}</span></div><small>{rubric.items?.length||0} 项评分标准 · {rubric.strictness||'适中'}</small></div>}
      <div id="quick-task-fields" hidden={!taskExpanded} onFocusCapture={()=>setEditingTask(true)}>
      <div className="quick-fields">
        <label>{activeClassIds.length>1?'默认年级':'本班年级'}<select value={grade} onChange={e=>onGradeChange(e.target.value)}>{grades.map(x=><option key={x}>{x}</option>)}</select></label>
        <label>批改班级<select value={currentClassId} onChange={e=>{setCurrentClassId(e.target.value);setActiveClassIds([e.target.value]);}}>{classes.map(c=><option key={c.id} value={c.id}>{c.name}（{c.students?.length||0}人）</option>)}</select></label>
      </div>
      <div className="quick-class-tools"><button onClick={onManageStudents}>管理班级与学生名单</button><span>{activeClassIds.length>1?`已选 ${activeClassIds.length} 个班，可按作文信息关联`:'使用当前班级名单核对学生信息'}</span></div>
      {classes.length>1&&<details className="quick-multiclass"><summary>需要同时批改多个班级</summary><div>{classes.map(c=><label key={c.id}><input type="checkbox" checked={selectedClasses.includes(c.id)} disabled={selectedClasses.length===1&&selectedClasses.includes(c.id)} onChange={e=>setActiveClassIds(e.target.checked?[...new Set([...selectedClasses,c.id])]:selectedClasses.filter(id=>id!==c.id))}/>{c.name}</label>)}</div><p>多班批改沿用各班年级，可在班级管理中分别修改。</p></details>}
      <label className="quick-topic-label">写作要求<span>必填</span><textarea ref={topic} value={assignment.topic||''} onChange={e=>setAssignment(p=>({...p,topic:e.target.value}))} placeholder="粘贴写作题目与要求，或拍照识别题目。" rows={5}/></label>
      <div className="quick-topic-tools"><label className="quick-file-button"><span>拍照 / 上传题目</span><input type="file" accept="image/*" onChange={onPromptUpload}/></label><button onClick={onRecognizePrompt} disabled={!assignment.promptImageBase64||assignment.isExtractingText}>{assignment.isExtractingText?'正在识别…':'识别题目文字'}</button>{assignment.promptImageName&&<small>{assignment.promptImageName}</small>}</div>
      <div className="quick-fields quick-score-fields"><label>作文满分<input type="number" min="1" max="1000" step="0.5" value={rubric.total} onChange={e=>setRubric(p=>({...p,total:Number(e.target.value)}))}/></label><label>字数要求<input value={rubric.wordCount} onChange={e=>setRubric(p=>({...p,wordCount:e.target.value}))} placeholder="如 80–100 words"/></label></div>
      <details className="quick-advanced"><summary><span>评分标准与更多选项</span><small>{rubric.items?.length||0} 个评分维度 · {rubric.strictness||'适中'}</small></summary><div className="quick-rubric-summary">{rubric.items?.map(c=><div key={c.id}><strong>{c.label}</strong><span>{c.score} 分</span><p>{c.desc}</p></div>)}</div><div className="quick-advanced-actions"><button onClick={onImportRubric}>导入评分标准</button><button onClick={onAdvanced}>编辑标准 / AI 生成标准与范文</button><button onClick={onModelSettings}>模型设置</button></div><p className="quick-help">可调整评分松紧度、时态与语言难度，也可复用已保存的评分标准和范文。</p></details>
      </div>
    </section>
    <section className="quick-card" aria-labelledby="quick-upload-title"><div className="quick-card-title"><h2 id="quick-upload-title"><b>2</b> 上传学生作文</h2><span>{files.length?`${files.length} 份作文`:''}</span></div><div className="quick-upload-actions"><button onClick={()=>camera.current?.click()}><span>拍一份</span><small>调用手机相机</small></button><button onClick={()=>upload.current?.click()}><span>批量上传</span><small>从相册或电脑选择多张</small></button></div><input ref={upload} type="file" accept="image/*" multiple hidden onChange={onUpload}/><input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={onUpload}/>
      {files.length>0&&<><div className="quick-file-summary"><span>待批改 {pending} · 已完成 {completed}{failures?` · 需重试 ${failures}`:''}</span>{failures>0&&<button onClick={onRetry}>重试失败作文</button>}</div><ul className="quick-files">{files.map((f,i)=><li key={f.id}><img src={f.url} alt={`作文 ${i+1}`}/><div><strong>{f.result?.student_name||f.inferredStudentName||f.name||`作文 ${i+1}`}</strong><small>{{idle:'已就绪',loading:'批改中',success:'已完成',error:'需重试'}[f.status]||'待核对'}</small></div>{!isBatchProcessing&&f.status!=='success'&&<button onClick={()=>onRemoveFile(f.id)} aria-label={`移除作文 ${i+1}`}>×</button>}</li>)}</ul></>}
      {!files.length&&<p className="quick-help">支持多张 JPG、PNG 等图片。姓名、班级和序号会结合名单核对，不需要逐份填写。</p>}
    </section>
    <div className="quick-start-bar"><div><strong>{files.length?`已准备 ${files.length} 份作文`:'上传作文后开始批改'}</strong><small>{configReady?'使用已配置的大模型与当前评分标准':'首次使用请先完成模型设置'}</small></div><button onClick={onStart} disabled={isBatchProcessing||files.length===0}>{isBatchProcessing?'正在批改…':pending?`一键批改（${pending}份）`:files.length?'查看批改结果':'一键批改'}</button></div>
  </div>;
}
