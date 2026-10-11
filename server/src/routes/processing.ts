import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import type { Database } from '../db.js';
import type { Config } from '../config.js';
import { imageMagic,MAX_UPLOAD_BYTES,validateFormat,validateParams,
 type ImageFormat,type ProcessingParams } from '../image/types.js';
import { deleteResult,readResult,saveResult } from '../image/results.js';
import { finalize,jobForDownload,reserve,reverse,walletStatus,validIdempotency } from '../wallet.js';
import { requireIdentity } from './auth.js';

const MAX_BODY=MAX_UPLOAD_BYTES+8192;
function safeFilename(input:string,format:ImageFormat) {
 const extension=format==='image/jpeg'?'jpg':format.split('/')[1];
 const cleaned=input.replace(/[/\\]/g,'_').replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,110).replace(/\.[^.]+$/,'');
 return (cleaned||'photo')+'-deaify.'+extension;
}
export async function registerProcessing(app:FastifyInstance,db:Database,config:Config) {
 await app.register(multipart,{limits:{parts:4,files:1,fields:3,fileSize:MAX_UPLOAD_BYTES}});
 app.post('/api/process',{bodyLimit:MAX_BODY,config:{rateLimit:{max:5,timeWindow:'1 minute'}}},async(req,reply)=>{
  const user=await requireIdentity(db,req,reply);
  if(!user)return;
  const key=req.headers['idempotency-key'];
  if(!validIdempotency(key))return reply.code(400).send({error:'IDEMPOTENCY_KEY_REQUIRED'});
  let image:Buffer|null=null,originalName='image',params:unknown,format:unknown;
  try{
   for await(const part of req.parts()){
    if(part.type==='file'){
     if(part.fieldname!=='image'||image)throw new Error('Unexpected file');
     image=await part.toBuffer();
     originalName=part.filename;
     if(imageMagic(image)!==part.mimetype)throw new Error('Image type/magic mismatch');
    }else if(part.fieldname==='params')params=JSON.parse(String(part.value));
    else if(part.fieldname==='format')format=String(part.value);
    else throw new Error('Unknown multipart field');
   }
   if(!image||!imageMagic(image))throw new Error('Image format not accepted');
   validateParams(params);
   validateFormat(format);
  }catch{
   return reply.code(422).send({error:'INVALID_IMAGE_OR_PARAMS'});
  }
  let reservation;
  try{reservation=await reserve(db,user.id,key,config.freePerDay);}
  catch(error){
   if(error instanceof Error&&error.message==='NO_CREDITS')return reply.code(402).send({error:'NO_CREDITS'});
   throw error;
  }
  const jobId=reservation.jobId;
  if(reservation.existingState==='reserved')return reply.code(409).send({error:'JOB_IN_PROGRESS',jobId});
  if(reservation.existingState==='reversed')return reply.code(409).send({error:'JOB_REVERSED',jobId});
  if(reservation.existingState==='complete'){
   // The idempotency key belongs to one already-charged job. After retention
   // expires, never pretend this old job is a new free download.
   const existing=await jobForDownload(db,user.id,jobId);
   if(!existing)return reply.code(410).send({error:'RESULT_EXPIRED',jobId});
   return {
    jobId,downloadUrl:'/api/jobs/'+jobId+'/download',
    wallet:await walletStatus(db,user.id,config.freePerDay),alreadyProcessed:true,
   };
  }
  const name=safeFilename(originalName,format as ImageFormat);
  try{
   const form=new FormData();
   form.set('params',JSON.stringify(params));
   form.set('format',String(format));
   form.set('image',new Blob([new Uint8Array(image)],{type:imageMagic(image)!}),name);
   const resp=await fetch(config.processor.url+'/internal/process',{
    method:'POST',headers:{'x-processor-token':config.processor.token},
    body:form,redirect:'error',signal:AbortSignal.timeout(40_000),
   });
   if(!resp.ok||resp.headers.get('content-type')?.split(';')[0]!==format){
    throw new Error('Processor rejected image');
   }
   const buffer=Buffer.from(await resp.arrayBuffer());
   if(!buffer.length||buffer.length>80*1024*1024||imageMagic(buffer)!==format){
    throw new Error('Invalid processor output');
   }
   await saveResult(config,jobId,buffer);
   await finalize(db,user.id,jobId,name,format as string,buffer.length);
   // A status refresh failure after finalize must never destroy a paid output.
   const currentWallet=await walletStatus(db,user.id,config.freePerDay).catch(()=>null);
   return reply.code(201).send({
    jobId,downloadUrl:'/api/jobs/'+jobId+'/download',
    wallet:currentWallet,retentionMinutes:30,
   });
  }catch(error){
   // Finalization may have committed even if its client connection failed.
   // Re-read the durable job before deciding to delete bytes or reverse funds.
   let committed;
   try{
    committed=await jobForDownload(db,user.id,jobId);
   }catch{
    req.log.error({jobId},'Cannot resolve job state; preserving encrypted output for reconciliation');
    return reply.code(503).send({error:'JOB_STATUS_UNKNOWN',jobId});
   }
   if(committed){
    req.log.error({jobId},'Output committed; automatic debit reversal intentionally skipped');
    return reply.code(503).send({error:'OUTPUT_READY_IN_ACCOUNT_HISTORY',jobId});
   }
   try{
    await reverse(db,user.id,jobId);
    await deleteResult(config,jobId);
   }catch{
    req.log.error({jobId},'Failed to reverse reservation; background reconciliation required');
    return reply.code(503).send({error:'JOB_RECONCILIATION_REQUIRED',jobId});
   }
   req.log.warn({jobId},'Image rejected or processing failed; quota reversed');
   return reply.code(422).send({error:'PROCESSING_FAILED_AND_QUOTA_REFUNDED'});
  }
 });
 app.get('/api/jobs/:id/download',async(req,reply)=>{
  const user=await requireIdentity(db,req,reply);
  if(!user)return;
  const id=(req.params as {id:string}).id;
  if(!/^[a-f\d-]{36}$/i.test(id))return reply.code(400).send({error:'INVALID_JOB'});
  const job=await jobForDownload(db,user.id,id);
  if(!job)return reply.code(404).send({error:'RESULT_EXPIRED_OR_MISSING'});
  let buffer;
  try{buffer=await readResult(config,id);}
  catch{return reply.code(410).send({error:'RESULT_NOT_AVAILABLE'});}
  const mime=String(job.mime);
  const filename=encodeURIComponent(String(job.filename));
  return reply.header('Content-Type',mime).header('Content-Disposition',"attachment; filename*=UTF-8''"+filename)
   .header('Cache-Control','no-store').header('X-Content-Type-Options','nosniff').send(buffer);
 });
}
