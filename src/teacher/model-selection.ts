export type TeacherModelProfile={id:string;label:string;model:string;supportsImages?:boolean;purposes?:('grading'|'ocr')[];helpUrl?:string};
export function supportsPurpose(profile:TeacherModelProfile,purpose:'grading'|'ocr'){
  // Existing server catalogs predate capability metadata and were all image models.
  return profile.supportsImages!==false&&(!profile.purposes||profile.purposes.includes(purpose));
}
export function chooseGradingModel(profiles:TeacherModelProfile[],wanted:string){
  const available=profiles.filter(p=>supportsPurpose(p,'grading'));
  return available.find(p=>p.id===wanted)?.id||available[0]?.id||'';
}
export function chooseOcrModel(profiles:TeacherModelProfile[],gradingId:string,choice:string){
  const available=profiles.filter(p=>supportsPurpose(p,'ocr'));
  return available.find(p=>p.id===choice)?.id||available.find(p=>p.id===gradingId)?.id||available[0]?.id||'';
}
