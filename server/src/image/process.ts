import sharp from 'sharp';
import { adjustPixels } from './pixels.js';
import { imageMagic,MAX_PIXELS,MAX_UPLOAD_BYTES,validateFormat,validateParams,
 type ImageFormat,type ProcessingParams } from './types.js';

export async function safeProcess(data:Buffer,params:ProcessingParams,format:ImageFormat):Promise<Buffer>{
 if(data.length===0||data.length>MAX_UPLOAD_BYTES)throw new Error('Image file size limit exceeded');
 const magic=imageMagic(data);
 if(!magic)throw new Error('Unrecognized or unsafe image container');
 validateFormat(format);
 validateParams(params);
 // Untrusted metadata is never forwarded to the output.
 const decoder=sharp(data,{limitInputPixels:MAX_PIXELS,failOn:'error',animated:false});
 const info=await decoder.metadata();
 if(!info.width||!info.height||info.width*info.height>MAX_PIXELS||
   (info.pages??1)>1||info.format!==magic.split('/')[1] && !(info.format==='jpeg' && magic==='image/jpeg')) {
  throw new Error('Rejected suspicious or oversized image');
 }
 const decoded=await sharp(data,{limitInputPixels:MAX_PIXELS,failOn:'error',animated:false})
  .rotate().ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const pixels=new Uint8ClampedArray(decoded.data.buffer,decoded.data.byteOffset,decoded.data.byteLength);
 adjustPixels(pixels,decoded.info.width,decoded.info.height,params);
 let encoder=sharp(decoded.data,{raw:{
  width:decoded.info.width,height:decoded.info.height,channels:4,
 }});
 if(format==='image/jpeg')encoder=encoder.flatten({background:'#ffffff'}).jpeg({quality:94,mozjpeg:true});
 else if(format==='image/webp')encoder=encoder.webp({quality:94,effort:4});
 else encoder=encoder.png({compressionLevel:6});
 const out=await encoder.toBuffer();
 if(out.byteLength>80*1024*1024)throw new Error('Encoded image exceeds server limit');
 return out;
}
