import type { FastifyInstance } from 'fastify';
import type { Database } from '../db.js';
import { execute } from '../db.js';
import type { Config } from '../config.js';
import { createPendingOrder, markCheckoutFailed, plansPublic, applyXunhuNotification } from '../orders.js';
import { createXunhuCheckout, type XunhuParams } from '../payments/xunhu.js';
import { requireIdentity } from './auth.js';

function readBody(value:unknown):Record<string,unknown>{
 return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
}
/** Preserve the original signed fields; duplicate form keys must be rejected. */
export function parseXunhuForm(raw:string):XunhuParams {
 if(raw.length>4096)throw new Error('Callback too large');
 const params=new URLSearchParams(raw);
 const out:XunhuParams={};
 for(const [name,value] of params){
  if(Object.prototype.hasOwnProperty.call(out,name))throw new Error('Duplicate signed field');
  if(!/^[a-zA-Z0-9_]{1,70}$/.test(name))throw new Error('Bad signed field');
  out[name]=value;
 }
 return out;
}
export function registerBilling(app:FastifyInstance,db:Database,config:Config) {
 app.addContentTypeParser('application/x-www-form-urlencoded',
  {parseAs:'string',bodyLimit:4096},(_req,body,done)=>{
   try{done(null,parseXunhuForm(String(body)));}
   catch(err){done(err instanceof Error?err:new Error('Bad form'),undefined);}
  });
 app.get('/api/plans',async()=>({plans:await plansPublic(db),paymentEnabled:config.paymentsEnabled}));
 app.post('/api/checkout',{config:{rateLimit:{max:10,timeWindow:'1 minute'}}},async(req,reply)=>{
  const user=await requireIdentity(db,req,reply);
  if(!user)return;
  if(!config.paymentsEnabled)return reply.code(503).send({error:'PAYMENTS_NOT_LIVE'});
  const b=readBody(req.body),planId=b.planId;
  if(typeof planId!=='string'||planId.length>36)return reply.code(400).send({error:'BAD_PLAN'});
  let order;
  try{order=await createPendingOrder(db,user.id,planId);}
  catch{return reply.code(400).send({error:'PLAN_UNAVAILABLE'});}
  try{
   const gateway=await createXunhuCheckout(config,{
    id:order.id,amountFen:order.priceFen,description:'DeAIfy '+order.title,
   });
   return reply.code(201).send({orderId:order.id,priceFen:order.priceFen,credits:order.credits,...gateway});
  }catch(error){
   await markCheckoutFailed(db,order.id);
   req.log.warn({orderId:order.id},'Xunhu checkout was not created');
   return reply.code(502).send({error:'PAYMENT_PROVIDER_UNAVAILABLE'});
  }
 });
 app.post('/api/payments/xunhu/notify',{config:{rateLimit:{max:200,timeWindow:'1 minute'}}},async(req,reply)=>{
  if(!config.paymentsEnabled)return reply.code(503).type('text/plain').send('disabled');
  const data=readBody(req.body) as XunhuParams;
  try {
   await applyXunhuNotification(db,data,config.xunhu.appid,config.xunhu.secret);
   // Per Xunhu docs the exact text 'success' acknowledges a processed notification.
   return reply.type('text/plain; charset=utf-8').send('success');
  }catch(error){
   req.log.warn({reason:error instanceof Error?error.message:'invalid'},'Payment webhook rejected');
   return reply.code(400).type('text/plain').send('invalid');
  }
 });
}
