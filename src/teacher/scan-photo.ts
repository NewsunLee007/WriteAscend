import jsQR from 'jsqr';
export function decodeSheetCodes(data:Uint8ClampedArray,width:number,height:number){
  const found:{code:string;x:number;y:number;size:number}[]=[];
  function region(x0:number,y0:number,w:number,h:number,repeat=1){
    const pixels=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)pixels.set(data.subarray(((y+y0)*width+x0)*4,((y+y0)*width+x0+w)*4),y*w*4);
    for(let attempt=0;attempt<repeat;attempt++){
      const code=jsQR(pixels,w,h,{inversionAttempts:'dontInvert'});if(!code)break;
      const corners=[code.location.topLeftCorner,code.location.topRightCorner,code.location.bottomLeftCorner,code.location.bottomRightCorner],left=Math.min(...corners.map(p=>p.x)),right=Math.max(...corners.map(p=>p.x)),top=Math.min(...corners.map(p=>p.y)),bottom=Math.max(...corners.map(p=>p.y)),cx=x0+(left+right)/2,cy=y0+(top+bottom)/2,size=Math.max(right-left,bottom-top);
      if(/^WA1:[a-zA-Z0-9_-]{43}$/.test(code.data)&&!found.some(p=>Math.hypot(p.x-cx,p.y-cy)<Math.max(20,Math.min(p.size,size)*0.4)))found.push({code:code.data,x:cx,y:cy,size});
      if(found.length>1)return;
      for(let y=Math.max(0,Math.floor(top)-8);y<Math.min(h,Math.ceil(bottom)+8);y++)for(let x=Math.max(0,Math.floor(left)-8);x<Math.min(w,Math.ceil(right)+8);x++){const n=(y*w+x)*4;pixels[n]=pixels[n+1]=pixels[n+2]=pixels[n+3]=255;}
    }
  }
  region(0,0,width,height,2);const grids=found.length?[2]:[2,3];
  for(const grid of grids)for(let row=0;row<grid;row++)for(let column=0;column<grid;column++){
    if(found.length>1)return found.map(p=>p.code);
    const overlap=0.1,x0=Math.max(0,Math.floor((column/grid-overlap)*width)),y0=Math.max(0,Math.floor((row/grid-overlap)*height)),x1=Math.min(width,Math.ceil(((column+1)/grid+overlap)*width)),y1=Math.min(height,Math.ceil(((row+1)/grid+overlap)*height));region(x0,y0,x1-x0,y1-y0);
  }
  return found.map(p=>p.code);
}
async function loaded(blob:Blob){const url=URL.createObjectURL(blob),image=new Image();try{await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(Error('图片无法读取，请使用 JPG、PNG 或 WebP 照片。'));image.src=url;});return {image,release:()=>URL.revokeObjectURL(url)};}catch(e){URL.revokeObjectURL(url);throw e;}}
export async function prepareScanPhoto(blob:Blob){
  if(blob.size>64*1024*1024)throw Error('照片过大，请先在相册缩小后重新选择。');const {image,release}=await loaded(blob);
  try{
    const width=image.naturalWidth,height=image.naturalHeight;if(!width||!height||width*height>60000000)throw Error('照片尺寸暂不支持，请缩小后重新选择。');
    const warnings:string[]=[];if(Math.max(width,height)<1200)warnings.push('照片分辨率偏低，建议重拍以免影响文字识别。');
    const canvas=document.createElement('canvas');let codes:string[]=[];
    for(const edge of [1800,2600]){
      const scale=Math.min(1,edge/Math.max(width,height));canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);const ctx=canvas.getContext('2d',{willReadFrequently:true})!;ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);codes=decodeSheetCodes(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height);if(codes.length||scale===1)break;await new Promise<void>(resolve=>setTimeout(resolve,0));
    }
    let upload=blob;if(blob.size>12*1024*1024||!/^image\/(jpeg|png|webp|gif)$/.test(blob.type)){
      const scale=Math.min(1,2800/Math.max(width,height));canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);canvas.getContext('2d')!.drawImage(image,0,0,canvas.width,canvas.height);upload=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('照片转换未完成，请换用 JPG 照片。')),'image/jpeg',0.92));warnings.push('已保留整页内容并转换为 JPG，请核对清晰度。');
    }
    if(upload.size>12*1024*1024)throw Error('转换后的照片仍超过 12 MiB，请缩小后重试。');
    const previewScale=Math.min(1,1100/Math.max(width,height));canvas.width=Math.round(width*previewScale);canvas.height=Math.round(height*previewScale);const previewContext=canvas.getContext('2d')!;previewContext.fillStyle='#fff';previewContext.fillRect(0,0,canvas.width,canvas.height);previewContext.drawImage(image,0,0,canvas.width,canvas.height);
    const previewBlob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('照片预览暂未准备好，请重试。')),'image/jpeg',0.85));
    return {blob:upload,previewBlob,code:codes.length===1?codes[0]:undefined,warnings,blocked:codes.length>1?'检测到多张写作单。请每次只拍摄一页，避免混入其他学生。':''};
  }finally{release();}
}
