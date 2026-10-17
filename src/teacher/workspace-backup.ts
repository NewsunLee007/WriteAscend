import {isObject,sanitizeLegacy} from '../report/legacy-import';
import {legacyKeys,type WorkspaceStorage} from './workspace-storage';

export const historyNames=['csvExportHistory','savedGradingResults','rubricHistory','analysisHistory'] as const;
export type HistoryName=typeof historyNames[number];
export type WorkspaceBackup={data:Record<string,any>;histories:Partial<Record<HistoryName,any[]>>;removedCredentialFields:number;summary:{files:number;reports:number;classes:number;profiles:number;history:number}};
const historyStorage:Record<HistoryName,string>={csvExportHistory:'smart_grader_csv_exports_v1',savedGradingResults:'smart_grader_saved_results_v1',rubricHistory:'smart_grader_rubric_history_v1',analysisHistory:'smart_grader_class_analysis_history_v1'};

export function persistWorkspaceRestore(target:WorkspaceStorage,core:Record<string,unknown>,prepared:WorkspaceBackup){
  const entries:Array<[string,string]>=[['smart_grader_data_v5_0',JSON.stringify(core)]];
  if(prepared.data.studentProfiles)entries.push(['smart_grader_student_profiles_v1',JSON.stringify(prepared.data.studentProfiles)]);
  for(const name of historyNames)if(prepared.histories[name])entries.push([historyStorage[name],JSON.stringify(prepared.histories[name])]);
  const previous=entries.map(([key])=>[key,target.getItem(key)] as const);
  try{for(const [key,value]of entries)target.setItem(key,value);}
  catch{
    try{
      // Free all newly written values before restoring, so rollback itself does
      // not need more quota than the original workspace occupied.
      for(const [key]of previous)target.removeItem(key);
      for(const [key,value]of previous)if(value!==null)target.setItem(key,value);
    }catch{throw Error('本机存储暂时无法恢复原状态。请保留备份文件，清理浏览器空间后重新恢复。');}
    throw Error('本机空间不足或存储不可用，未完成恢复；原工作区已保留。请释放空间后重试。');
  }
}

export function createWorkspaceBackup(data:Record<string,unknown>,histories:Record<HistoryName,unknown>){
  return sanitizeLegacy({schema:'writeascend-workspace-backup-v1',createdAt:new Date().toISOString(),...data,...histories}).value;
}
export function prepareWorkspaceBackup(input:unknown):WorkspaceBackup{
  const safe=sanitizeLegacy(input);if(!isObject(safe.value))throw Error('请选择原系统导出的完整 JSON 备份。');
  const source=safe.value;
  if(source.schema&&source.schema!=='writeascend-workspace-backup-v1')throw Error('此文件不是工作区完整备份，请选择“备份数据”导出的 JSON。');
  const core=source.smart_grader_data_v5_0??source.smart_grader_data_v4_3??source;
  if(!isObject(core))throw Error('备份中的批改设置格式不正确。');
  if(!['config','assignment','rubric','classes','files','studentProfiles'].some(key=>key in core)&&!legacyKeys.some(key=>key in source))throw Error('没有找到批改设置、作文或学生档案。');
  const data={...core} as Record<string,any>;
  if('smart_grader_student_profiles_v1' in source)data.studentProfiles=source.smart_grader_student_profiles_v1;
  for(const key of ['config','assignment','rubric','pdfConfig','csvExportConfig','languageDifficulty','studentProfiles'])if(key in data&&!isObject(data[key]))throw Error('备份字段格式不正确：'+key);
  for(const key of ['classes','files','activeClassIds'])if(key in data&&!Array.isArray(data[key]))throw Error('备份字段格式不正确：'+key);
  if(data.rubric&&(!Number.isFinite(data.rubric.total)||data.rubric.total<=0||!Array.isArray(data.rubric.items)||!data.rubric.items.length||data.rubric.items.some((item:unknown)=>!isObject(item)||typeof item.label!=='string'||!Number.isFinite(item.score)||Number(item.score)<0)))throw Error('备份评分标准的维度或分值不完整。');
  if(data.classes?.some((item:unknown)=>!isObject(item)||('students' in item&&!Array.isArray(item.students))))throw Error('备份班级名单格式不正确。');
  if(data.studentProfiles&&Object.values(data.studentProfiles).some(item=>!isObject(item)||('records' in item&&!Array.isArray(item.records))))throw Error('备份学生档案格式不正确。');
  if(Array.isArray(data.files))data.files=data.files.map((file:unknown)=>{
    if(!isObject(file))throw Error('备份中有无法读取的作文记录。');
    if(file.result!==undefined&&file.result!==null&&!isObject(file.result))throw Error('备份中有无法读取的批改结果。');
    const result=isObject(file.result)?{...file.result}:file.result;
    if(isObject(result)){
      const embedded=(value:unknown)=>typeof value==='string'&&/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=\r\n]+$/.test(value);
      if(!embedded(result.original_image_url))delete result.original_image_url;
      const images=Array.isArray(result.original_image_urls)?result.original_image_urls.filter(embedded):[];
      if(images.length)result.original_image_urls=images;else delete result.original_image_urls;
    }
    return {...file,file:null,url:'',result,status:result?'success':'idle'};
  });
  const histories:Partial<Record<HistoryName,any[]>>={};
  for(const name of historyNames){const value=source[name]??source[historyStorage[name]];if(value!==undefined){if(!Array.isArray(value)||value.some(item=>!isObject(item)))throw Error('备份历史格式不正确：'+name);histories[name]=value;}}
  return {data,histories,removedCredentialFields:safe.removed,summary:{files:data.files?.length||0,reports:data.files?.filter((f:any)=>f.result).length||0,classes:data.classes?.length||0,profiles:data.studentProfiles?Object.keys(data.studentProfiles).length:0,history:Object.values(histories).reduce((sum,list)=>sum+list.length,0)}};
}

export function needsLocalMigration(source:WorkspaceStorage,target:WorkspaceStorage){
  return !!target.getItem('migration_pending')||(!target.getItem('migration_decision')&&!legacyKeys.some(key=>target.getItem(key)!==null)&&legacyKeys.some(key=>source.getItem(key)!==null));
}
export function migrateLocalWorkspace(source:WorkspaceStorage,target:WorkspaceStorage,importData:boolean){
  // Parse every source entry before touching the destination; malformed later
  // history must not leave earlier settings looking like a completed migration.
  const entries=importData?legacyKeys.flatMap(key=>{
    const raw=source.getItem(key);if(raw===null)return [];
    const value=key==='writeascend_teacher_mode'?(raw==='full'?'full':'quick'):JSON.stringify(sanitizeLegacy(JSON.parse(raw)).value);
    return [[key,value] as const];
  }):[];
  const keys=[...new Set([...entries.map(([key])=>key),...(target.getItem('migration_pending')&&!importData?legacyKeys:[]),'migration_decision'])];
  const previous=new Map(keys.map(key=>[key,target.getItem(key)]));
  target.setItem('migration_pending','pending');
  try{
    if(!importData&&previous.size>1)for(const key of legacyKeys)target.removeItem(key);
    for(const [key,value]of entries)target.setItem(key,value);
    target.setItem('migration_decision',importData?'imported':'fresh');target.removeItem('migration_pending');
  }catch(error){
    let restored=true;
    for(const [key]of previous)try{target.removeItem(key);}catch{restored=false;}
    for(const [key,value]of previous)if(value!==null)try{target.setItem(key,value);}catch{restored=false;}
    if(restored)try{target.removeItem('migration_pending');}catch{}
    throw error;
  }
}
