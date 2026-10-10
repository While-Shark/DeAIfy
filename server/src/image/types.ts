export interface ProcessingParams {
 strength:number;grain:number;warmth:number;saturation:number;contrast:number;softness:number;texture:number;
}
export type ImageFormat='image/png'|'image/jpeg'|'image/webp';
export const MAX_UPLOAD_BYTES=25*1024*1024;
export const MAX_PIXELS=30_000_000;
const PARAM_LIMITS:Record<keyof ProcessingParams,[number,number]>={
 strength:[0,100],grain:[0,80],warmth:[-40,40],saturation:[-40,40],
 contrast:[-40,40],softness:[0,50],texture:[0,60],
};
export function validateParams(value:unknown):ProcessingParams{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid parameters');
 const record=value as Record<string,unknown>, result={} as ProcessingParams;
 for(const [key,[min,max]] of Object.entries(PARAM_LIMITS) as [keyof ProcessingParams,[number,number]][]){
  const input=record[key];
  if(typeof input!=='number'||!Number.isFinite(input)||input<min||input>max)throw new Error('Invalid parameter: '+key);
  result[key]=input;
 }
 return result;
}
export function validateFormat(value:unknown):ImageFormat {
 if(value==='image/png'||value==='image/jpeg'||value==='image/webp')return value;
 throw new Error('Unsupported output format');
}
export function imageMagic(input:Buffer):ImageFormat|null{
 if(input.length>=8&&input.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
 if(input.length>=3&&input[0]===255&&input[1]===216&&input[2]===255)return 'image/jpeg';
 if(input.length>=12&&input.toString('ascii',0,4)==='RIFF'&&input.toString('ascii',8,12)==='WEBP')return 'image/webp';
 return null;
}
