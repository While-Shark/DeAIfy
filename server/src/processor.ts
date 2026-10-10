import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { randomBytes,timingSafeEqual } from 'node:crypto';
import { safeProcess } from './image/process.js';
import { MAX_UPLOAD_BYTES,imageMagic,validateFormat,validateParams } from './image/types.js';

const secret=process.env.PROCESSOR_SHARED_TOKEN??'';
if(secret.length<32)throw new Error('PROCESSOR_SHARED_TOKEN must be set');
const app=Fastify({logger:true,bodyLimit:MAX_UPLOAD_BYTES+8192,requestTimeout:40000});
await app.register(multipart,{limits:{files:1,fields:3,parts:4,fileSize:MAX_UPLOAD_BYTES}});
let active=0;
app.post('/internal/process',async(req,reply)=>{
 const supplied=req.headers['x-processor-token'];
 const a=Buffer.from(secret),b=Buffer.from(typeof supplied==='string'?supplied:'');
 if(a.length!==b.length||!timingSafeEqual(a,b))return reply.code(401).send({error:'unauthorized'});
 if(active>=1)return reply.code(429).send({error:'processor_busy'});
 active++;
 try{
  let image:Buffer|null=null,params:unknown=null,format:unknown=null;
  for await(const part of req.parts()){
   if(part.type==='field'){
    if(part.fieldname==='params')params=JSON.parse(String(part.value));
    else if(part.fieldname==='format')format=String(part.value);
    else throw new Error('Unexpected multipart field');
   }else{
    if(part.fieldname!=='image'||image)throw new Error('Unexpected file');
    image=await part.toBuffer();
   }
  }
  if(!image||!imageMagic(image))throw new Error('Invalid image signature');
  const mime=validateFormat(format);
  const result=await safeProcess(image,validateParams(params),mime);
  reply.header('Content-Type',mime).header('Cache-Control','no-store')
    .header('X-Content-Type-Options','nosniff');
  return reply.send(result);
 }catch(error){
  req.log.warn({reason:error instanceof Error?error.message:'invalid'},'Image rejected');
  return reply.code(422).send({error:'IMAGE_REJECTED'});
 }finally{active--;}
});
app.get('/internal/health',async()=>({ok:true}));
await app.listen({port:Number(process.env.PROCESSOR_PORT??8081),host:'0.0.0.0'});
