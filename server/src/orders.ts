import { randomBytes } from 'node:crypto';
import type { Database, Row } from './db.js';
import { execute, rows, tx } from './db.js';
import { pricing, parseAmountFen, type PlanLike } from './pricing.js';
import type { CreemOffer } from './config.js';
import { verifyXunhu, type XunhuParams } from './payments/xunhu.js';
interface PlanRow extends Row, PlanLike {id:string;title:string;active:number;}
interface OrderRow extends Row {
 id:string;user_id:string;price_fen:number;credits_snapshot:number;
 state:'pending'|'paid'|'failed'|'refunded';provider:'xunhu'|'creem';provider_transaction_id:string|null;
}
export async function plansPublic(db:Database) {
 const plans=await rows<PlanRow>(db,'SELECT * FROM plans WHERE active=1 ORDER BY sort_order ASC,title ASC');
 return plans.filter(p=>{try{pricing(p);return true;}catch{return false;}})
   .map(p=>({id:p.id,title:p.title,...pricing(p)}));
}
export async function createPendingOrder(db:Database,userId:string,planId:string,offer?:CreemOffer) {
 const id=randomBytes(12).toString('hex');
 return tx(db,async conn=>{
  const [plan]=await rows<PlanRow>(conn,'SELECT * FROM plans WHERE id=? AND active=1 FOR UPDATE',[planId]);
  if(!plan)throw new Error('Plan unavailable');
  const p=pricing(plan);
  await execute(conn,
   'INSERT INTO orders(id,user_id,plan_id,title_snapshot,original_price_fen,price_fen,credits_snapshot,discount_bps,provider,provider_product_id,provider_amount_minor,provider_currency) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
   [id,userId,plan.id,plan.title,p.originalPriceFen,p.priceFen,p.credited,p.discountBps,
    offer?'creem':'xunhu',offer?.productId??null,offer?.amountMinor??p.priceFen,offer?.currency??'CNY']);
  return {id,priceFen:p.priceFen,credits:p.credited,title:plan.title};
 });
}
export async function markCheckoutFailed(db:Database,id:string) {
 await execute(db,"UPDATE orders SET state='failed' WHERE id=? AND state='pending'",[id]);
}
/** Signed Xunhu event: the frozen plan amount and provider transaction ID are verified under lock. */
export async function applyXunhuNotification(db:Database,payload:XunhuParams,appid:string,secret:string) {
 if(!verifyXunhu(payload,secret)||payload.appid!==appid||
    typeof payload.trade_order_id!=='string'||!/^[a-zA-Z0-9_-]{1,32}$/.test(payload.trade_order_id)) {
  throw new Error('Invalid signed payment event');
 }
 if(!['OD','CD','RD','UD'].includes(String(payload.status)))throw new Error('Unsupported status');
 const actualFen=parseAmountFen(payload.total_fee);
 const txn=String(payload.transaction_id??'');
 if(txn.length>96 || (payload.status==='OD'&&!txn))throw new Error('Invalid transaction ID');
 return tx(db,async conn=>{
  const [order]=await rows<OrderRow>(conn,'SELECT * FROM orders WHERE id=? FOR UPDATE',[payload.trade_order_id]);
  if(!order||order.provider!=='xunhu'||order.price_fen!==actualFen)throw new Error('Order / price mismatch');
  if(order.state==='failed')throw new Error('Failed order requires reconciliation');
  if(payload.status==='OD') {
   if(order.state==='paid') {
    if(order.provider_transaction_id!==txn)throw new Error('Conflicting transaction ID');
    return 'duplicate';
   }
   if(order.state==='refunded')return 'already_refunded';
   await rows(conn,'SELECT credits FROM wallets WHERE user_id=? FOR UPDATE',[order.user_id]);
   await execute(conn,'UPDATE wallets SET credits=credits+? WHERE user_id=?',[order.credits_snapshot,order.user_id]);
   await execute(conn,"INSERT INTO credit_ledger(user_id,delta,kind,reference_id) VALUES(?,?,'purchase',?)",
     [order.user_id,order.credits_snapshot,order.id]);
   await execute(conn,"UPDATE orders SET state='paid',provider_transaction_id=?,paid_at=UTC_TIMESTAMP(3) WHERE id=?",
     [txn,order.id]);
   return 'credited';
  }
  if(payload.status==='CD') {
   if(order.state==='refunded')return 'duplicate_refund';
   if(order.state==='paid') {
    await rows(conn,'SELECT credits FROM wallets WHERE user_id=? FOR UPDATE',[order.user_id]);
    await execute(conn,'UPDATE wallets SET credits=credits-? WHERE user_id=?',[order.credits_snapshot,order.user_id]);
    await execute(conn,"INSERT INTO credit_ledger(user_id,delta,kind,reference_id) VALUES(?,?,'refund',?)",
      [order.user_id,-order.credits_snapshot,order.id]);
   }
   await execute(conn,"UPDATE orders SET state='refunded' WHERE id=?",[order.id]);
   return 'refunded';
  }
  return 'ignored';
 });
}
