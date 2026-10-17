import test from 'node:test';
import assert from 'node:assert/strict';
import QRCode from 'qrcode';
import {decodeSheetCodes} from '../src/teacher/scan-photo';
import {newSheetToken} from '../src/teacher/writing-sheet-print';
function photo(codes:string[]){const width=1500,height=1200,data=new Uint8ClampedArray(width*height*4).fill(255);codes.forEach((text,index)=>{const q=QRCode.create(text,{errorCorrectionLevel:'M'}),scale=7,x0=50+index*550,y0=80;for(let y=0;y<q.modules.size;y++)for(let x=0;x<q.modules.size;x++)if(q.modules.get(y,x))for(let yy=0;yy<scale;yy++)for(let xx=0;xx<scale;xx++){const n=((y0+(y+4)*scale+yy)*width+x0+(x+4)*scale+xx)*4;data[n]=data[n+1]=data[n+2]=0;}});return {data,width,height};}
test('photo decoder accepts only writing-sheet codes, detects multiple papers including duplicate copies, and never follows unrelated QR links',()=>{
  const a=newSheetToken(),b=newSheetToken(),read=(codes:string[])=>{const p=photo(codes);return decodeSheetCodes(p.data,p.width,p.height);};
  assert.deepEqual(read([a]),[a]);assert.equal(read([a,b]).length,2);assert.equal(read([a,a]).length,2);assert.deepEqual(read(['https://unrelated.invalid/login',a]),[a]);assert.deepEqual(read(['https://unrelated.invalid/login']),[]);assert.deepEqual(read([]),[]);
});
