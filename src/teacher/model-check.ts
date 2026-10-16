import {createCloudModelTransport} from './cloud-model';
import {parseModelJson} from './identity-ocr';
export function visionCheckImage(){
  const canvas=document.createElement('canvas');canvas.width=560;canvas.height=180;
  const ctx=canvas.getContext('2d')!;ctx.fillStyle='white';ctx.fillRect(0,0,560,180);ctx.fillStyle='black';ctx.font='bold 100px sans-serif';ctx.fillText('7M42',100,125);
  return canvas.toDataURL('image/png');
}
export async function checkImageModel(profileId:string,workspaceId:string,signal:AbortSignal,onUnauthorized:()=>void){
  const transport=createCloudModelTransport({profileId,workspaceId,onUnauthorized});
  const response=await transport(JSON.stringify({messages:[{role:'system',content:'WA_VISION_CHECK_V1. Read the characters printed in the image. Return only a JSON object with the key visible_text. Do not guess if you cannot read the image.'},{role:'user',content:[{type:'image_url',image_url:{url:visionCheckImage()}}]}],temperature:0,response_format:{type:'json_object'}}),signal);
  const body=await response.json() as any;
  if(!response.ok)throw Error(body.error?.message||'连接检查暂未通过，请检查模型配置。');
  const parsed=parseModelJson(body);
  if(typeof parsed?.visible_text!=='string'||parsed.visible_text.trim()!=='7M42')throw Error('模型已连接，但未正确读出测试图片。请改选支持图片输入的模型后重试。');
}
