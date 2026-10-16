import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import crypto from 'node:crypto';
import jsQR from 'jsqr';
const require=createRequire(import.meta.url),{PNG}=require('pngjs');
const file=path.resolve(process.argv[2]||'output/pdf/writing-sheets-synthetic.pdf'),temporary=fs.mkdtempSync(path.join(os.tmpdir(),'writeascend-sheet-pdf-'));
try{
  const info=execFileSync('pdfinfo',[file],{encoding:'utf8'}),pages=Number(info.match(/^Pages:\s+(\d+)/m)?.[1]);
  if(pages!==5||!info.includes('(A4)'))throw Error('Expected one instruction page and four A4 writing pages');
  execFileSync('pdftoppm',['-r','120','-png',file,path.join(temporary,'page')]);
  const tokens=[];let rotated=0;
  for(const name of fs.readdirSync(temporary).filter(n=>n.endsWith('.png')).sort()){
    const png=PNG.sync.read(fs.readFileSync(path.join(temporary,name))),rgba=new Uint8ClampedArray(png.data),code=jsQR(rgba,png.width,png.height,{inversionAttempts:'dontInvert'});
    if(name===`page-1.png`){if(code)throw Error('Instruction sheet unexpectedly has a personal QR code');continue;}
    if(!code||!/^WA1:[a-zA-Z0-9_-]{43}$/.test(code.data))throw Error('Cannot read a personal page code: '+name);tokens.push(code.data);
    const reverse=new Uint8ClampedArray(rgba.length);for(let i=0,n=png.width*png.height;i<n;i++)for(let c=0;c<4;c++)reverse[(n-1-i)*4+c]=rgba[i*4+c];
    if(jsQR(reverse,png.width,png.height,{inversionAttempts:'dontInvert'})?.data!==code.data)throw Error('Upside-down page could not be decoded');rotated++;
  }
  if(tokens.length!==4||new Set(tokens).size!==4)throw Error('Personal page codes are missing or duplicated');
  const result={verifiedAt:new Date().toISOString(),syntheticOnly:true,pages,writingPages:tokens.length,distinctPageCodes:new Set(tokens).size,upsideDownPagesDecoded:rotated,renderDpi:120,actualPaperCameraVerified:false,pdfSha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')};
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
}finally{fs.rmSync(temporary,{recursive:true,force:true});}
