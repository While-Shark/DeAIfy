import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { mkdir, readFile, rename, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Config } from '../config.js';

const check=(id:string)=>{
 if(!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(id))throw new Error('Bad job ID');
 return id;
};
const outputPath=(config:Config,id:string)=>join(config.outputDirectory,check(id)+'.enc');
export async function saveResult(config:Config,id:string,bytes:Buffer):Promise<void>{
 const iv=randomBytes(12);
 const cipher=createCipheriv('aes-256-gcm',config.resultsKey,iv);
 const ciphertext=Buffer.concat([cipher.update(bytes),cipher.final()]);
 const encrypted=Buffer.concat([iv,cipher.getAuthTag(),ciphertext]);
 await mkdir(config.outputDirectory,{recursive:true,mode:0o700});
 const temp=outputPath(config,id)+'.tmp';
 await writeFile(temp,encrypted,{flag:'wx',mode:0o600});
 try{await rename(temp,outputPath(config,id));}
 catch(error){await unlink(temp).catch(()=>{});throw error;}
}
export async function readResult(config:Config,id:string):Promise<Buffer>{
 const bytes=await readFile(outputPath(config,id));
 if(bytes.byteLength<28)throw new Error('Corrupt encrypted result');
 const decipher=createDecipheriv('aes-256-gcm',config.resultsKey,bytes.subarray(0,12));
 decipher.setAuthTag(bytes.subarray(12,28));
 return Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]);
}
export async function deleteResult(config:Config,id:string){
 await unlink(outputPath(config,id)).catch(()=>{});
}
export async function sweepResults(config:Config) {
 await mkdir(config.outputDirectory,{recursive:true,mode:0o700});
 for(const file of await readdir(config.outputDirectory)){
  // Remove any expired results; no image is kept beyond roughly 45 minutes.
  if(!/^[a-f\d-]{36}\.enc$/i.test(file))continue;
  const path=join(config.outputDirectory,file);
  try{
   const info=await stat(path);
   if(Date.now()-info.mtimeMs>45*60_000)await unlink(path);
  }catch{/* File may have been removed concurrently. */}
 }
}
