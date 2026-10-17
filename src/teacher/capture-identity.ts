export type CaptureIntent={memberId:string;draftNumber:number;pageNumber:number;pageCount:number};
export const selectedIdentityNote='拍摄前已选定学生，上传时核对纸面姓名、班级和页码。';
export function captureConflict(intent:CaptureIntent,sheet:CaptureIntent){
  const fields:string[]=[];
  if(intent.memberId!==sheet.memberId)fields.push('学生');
  if(intent.draftNumber!==sheet.draftNumber)fields.push('稿次');
  if(intent.pageNumber!==sheet.pageNumber||intent.pageCount!==sheet.pageCount)fields.push('页码');
  return fields.length?'二维码的'+fields.join('、')+'与拍摄前所选信息不一致，请明确选择归属后上传。':'';
}
export function availableCapturePages(pageCount:number,received:number[],pending:number[]=[]){
  const used=new Set([...received,...pending]);
  return Array.from({length:pageCount},(_,i)=>i+1).filter(page=>!used.has(page));
}
