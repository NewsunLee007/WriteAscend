export const legacyKeys=['smart_grader_data_v5_0','smart_grader_data_v4_3','smart_grader_student_profiles_v1','smart_grader_csv_exports_v1','smart_grader_saved_results_v1','smart_grader_rubric_history_v1','smart_grader_class_analysis_history_v1','writeascend_teacher_mode'];
export type WorkspaceStorage=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export function workspaceStorage(workspaceId:string,storage:Storage=localStorage):WorkspaceStorage{
  const prefix='wa_workspace:'+workspaceId+':';
  return {getItem:key=>storage.getItem(prefix+key),setItem:(key,value)=>storage.setItem(prefix+key,value),removeItem:key=>storage.removeItem(prefix+key)};
}
