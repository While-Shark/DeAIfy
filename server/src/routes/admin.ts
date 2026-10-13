import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Config } from '../config.js';
import type { Database, Row } from '../db.js';
import { execute, rows, tx } from '../db.js';
import { normalizeInt, pricing } from '../pricing.js';
import { requireIdentity } from './auth.js';
import { adminOverview } from '../admin/overview.js';
import { adjustUserCredits, CreditAdjustmentError, parseCreditAdjustment } from '../admin/credits.js';

type PlanInput = {
 title:string;base_price_fen:number;discount_bps:number;credits:number;bonus_credits:number;
 discount_starts_at:string|null;discount_ends_at:string|null;
 active:number;sort_order:number;
};
function utcMysql(value:unknown):string|null {
 if(value===null||value===undefined||value==='')return null;
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(value))throw new Error('Invalid date');
 const d=new Date(value);
 if(Number.isNaN(d.getTime()))throw new Error('Invalid date');
 return d.toISOString().slice(0,23).replace('T',' ');
}
function parsePlan(value:unknown):PlanInput {
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid plan');
 const b=value as Record<string,unknown>;
 const title=String(b.title??'').trim();
 if(title.length<2||title.length>60)throw new Error('Invalid plan title');
 const base_price_fen=normalizeInt(b.basePriceFen,1,10_000_000);
 const discount_bps=normalizeInt(b.discountBps,100,10000);
 const credits=normalizeInt(b.credits,1,1_000_000);
 const bonus_credits=normalizeInt(b.bonusCredits,0,1_000_000);
 const sort_order=normalizeInt(b.sortOrder,0,100_000);
 if(typeof b.active!=='boolean')throw new Error('Invalid active state');
 const discount_starts_at=utcMysql(b.startsAt);
 const discount_ends_at=utcMysql(b.endsAt);
 if(discount_starts_at&&discount_ends_at&&discount_starts_at>=discount_ends_at)throw new Error('Invalid discount period');
 // Validate discount math before storage; orders always take a snapshot.
 pricing({base_price_fen,discount_bps,credits,bonus_credits,discount_starts_at,discount_ends_at});
 return {title,base_price_fen,discount_bps,credits,bonus_credits,sort_order,
  discount_starts_at,discount_ends_at,active:b.active?1:0};
}
async function isAdmin(db:Database,req:FastifyRequest,reply:FastifyReply){
 const user=await requireIdentity(db,req,reply);
 if(!user)return null;
 if(user.role!=='admin'){reply.code(403).send({error:'ADMIN_ONLY'});return null;}
 return user;
}
export function registerAdmin(app:FastifyInstance,db:Database,_config:Config) {
 app.get('/api/admin/overview',async(req,reply)=>{
  if(!await isAdmin(db,req,reply))return;
  return adminOverview(db);
 });
 app.get('/api/admin/plans',async(req,reply)=>{
  if(!await isAdmin(db,req,reply))return;
  return {plans:await rows(db,'SELECT * FROM plans ORDER BY sort_order ASC LIMIT 200')};
 });
 app.post('/api/admin/plans',async(req,reply)=>{
  const user=await isAdmin(db,req,reply);
  if(!user)return;
  let p:PlanInput;
  try{p=parsePlan(req.body);}catch(e){return reply.code(400).send({error:e instanceof Error?e.message:'Invalid plan'});}
  const id=randomUUID();
  await tx(db,async conn=>{
   await execute(conn,'INSERT INTO plans(id,title,base_price_fen,discount_bps,credits,bonus_credits,discount_starts_at,discount_ends_at,active,sort_order) VALUES(?,?,?,?,?,?,?,?,?,?)',
    [id,p.title,p.base_price_fen,p.discount_bps,p.credits,p.bonus_credits,p.discount_starts_at,p.discount_ends_at,p.active,p.sort_order]);
   await execute(conn,'INSERT INTO audit_logs(actor_id,action,target_id,detail) VALUES(?,?,?,?)',
    [user.id,'plan.created',id,'new plan']);
  });
  return reply.code(201).send({id});
 });
 app.put('/api/admin/plans/:id',async(req,reply)=>{
  const user=await isAdmin(db,req,reply);
  if(!user)return;
  const id=(req.params as {id:string}).id;
  let p:PlanInput,version:number;
  try{
   p=parsePlan(req.body);
   version=normalizeInt((req.body as Record<string,unknown>).version,1,2147483647);
   if(id.length>36)throw new Error('Invalid plan ID');
  }catch(e){return reply.code(400).send({error:e instanceof Error?e.message:'Invalid plan'});}
  const changed=await tx(db,async conn=>{
   const r=await execute(conn,'UPDATE plans SET title=?,base_price_fen=?,discount_bps=?,credits=?,bonus_credits=?,discount_starts_at=?,discount_ends_at=?,active=?,sort_order=?,version=version+1 WHERE id=? AND version=?',
    [p.title,p.base_price_fen,p.discount_bps,p.credits,p.bonus_credits,p.discount_starts_at,p.discount_ends_at,p.active,p.sort_order,id,version]);
   if(r.affectedRows===1)await execute(conn,'INSERT INTO audit_logs(actor_id,action,target_id,detail) VALUES(?,?,?,?)',
    [user.id,'plan.updated',id,'version '+String(version+1)]);
   return r.affectedRows===1;
  });
  if(!changed)return reply.code(409).send({error:'PLAN_VERSION_CONFLICT'});
  return {ok:true,version:version+1};
 });
 app.get('/api/admin/orders',async(req,reply)=>{
  if(!await isAdmin(db,req,reply))return;
  return {orders:await rows(db,
   'SELECT o.id,u.email,o.title_snapshot,o.price_fen,o.credits_snapshot,o.state,o.created_at FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.created_at DESC LIMIT 100')};
 });
 app.get('/api/admin/users',async(req,reply)=>{
  if(!await isAdmin(db,req,reply))return;
  return {users:await rows(db,
   'SELECT u.id,u.email,u.role,u.is_disabled,w.credits,u.created_at FROM users u JOIN wallets w ON w.user_id=u.id ORDER BY u.created_at DESC LIMIT 100')};
 });
 app.post('/api/admin/users/:id/credits',{config:{rateLimit:{max:30,timeWindow:'1 hour'}}},async(req,reply)=>{
  const actor=await isAdmin(db,req,reply);
  if(!actor)return;
  try {
   const change=parseCreditAdjustment(req.body);
   const result=await adjustUserCredits(db,actor.id,(req.params as {id:string}).id,change);
   return {ok:true,...result};
  } catch(error) {
   if(error instanceof CreditAdjustmentError)return reply.code(error.status).send({error:error.message});
   throw error;
  }
 });
 app.get('/api/admin/audit',async(req,reply)=>{
  if(!await isAdmin(db,req,reply))return;
  return {events:await rows(db,
   'SELECT actor_id,action,target_id,detail,created_at FROM audit_logs ORDER BY id DESC LIMIT 100')};
 });
}
