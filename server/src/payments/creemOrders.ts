import type { Database, Row } from '../db.js';
import { execute, rows, tx } from '../db.js';
import type { CreemWebhook, CreemTransaction } from './creem.js';

interface Order extends Row {
 id:string;user_id:string;provider:'xunhu'|'creem';state:'pending'|'paid'|'failed'|'refunded';
 credits_snapshot:number;provider_product_id:string|null;provider_amount_minor:number|null;
 provider_currency:string|null;provider_order_id:string|null;provider_transaction_id:string|null;
}
function object(value:unknown):Record<string,unknown>{
 return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
}
function identifier(value:unknown,prefix:string):string{
 if(typeof value!=='string'||!new RegExp('^'+prefix+'_[a-zA-Z0-9]{1,88}$').test(value))
  throw new Error('Invalid Creem identifier');
 return value;
}
/** Signed events settle under the order row lock. All repeat deliveries are idempotent. */
export async function applyCreemEvent(db:Database,event:CreemWebhook,mode:'test'|'prod',
 transaction?:CreemTransaction) {
 if(event.eventType==='checkout.completed') {
  const checkout=event.object,metadata=object(checkout.metadata),paid=object(checkout.order);
  const id=metadata.orderId,userId=metadata.userId;
  if(typeof id!=='string'||!/^[a-f0-9]{24}$/.test(id)||
     typeof userId!=='string'||!/^[-a-f0-9]{36}$/.test(userId)||
     checkout.request_id!==id||checkout.mode!==mode||checkout.status!=='completed'||
     paid.status!=='paid'||paid.type!=='onetime'||checkout.units!==1)throw new Error('Creem checkout not eligible');
  const orderId=identifier(paid.id,'ord'),product=object(checkout.product);
  const productId=identifier(product.id??paid.product,'prod');
  const amount=paid.amount,currency=paid.currency;
  if(!Number.isSafeInteger(amount)||typeof currency!=='string')throw new Error('Missing Creem amount');
  const transactionId=typeof paid.transaction==='string'?identifier(paid.transaction,'tran'):
   paid.transaction?identifier(object(paid.transaction).id,'tran'):null;
  return tx(db,async conn=>{
   const [order]=await rows<Order>(conn,'SELECT * FROM orders WHERE id=? FOR UPDATE',[id]);
   if(!order||order.provider!=='creem'||order.user_id!==userId||
      order.provider_product_id!==productId||order.provider_amount_minor!==amount||
      order.provider_currency!==currency)throw new Error('Creem order mismatch');
   if(order.state==='refunded')return 'already_refunded';
   if(order.state==='paid') {
    if(order.provider_order_id!==orderId)throw new Error('Conflicting Creem order');
    return 'duplicate';
   }
   if(order.state!=='pending')throw new Error('Failed order requires reconciliation');
   await rows(conn,'SELECT credits FROM wallets WHERE user_id=? FOR UPDATE',[order.user_id]);
   await execute(conn,'UPDATE wallets SET credits=credits+? WHERE user_id=?',[order.credits_snapshot,order.user_id]);
   await execute(conn,"INSERT INTO credit_ledger(user_id,delta,kind,reference_id) VALUES(?,?,'purchase',?)",
    [order.user_id,order.credits_snapshot,order.id]);
   await execute(conn,"UPDATE orders SET state='paid',provider_order_id=?,provider_transaction_id=?,paid_at=UTC_TIMESTAMP(3) WHERE id=?",
    [orderId,transactionId,id]);
   return 'credited';
  });
 }
 if(event.eventType==='refund.created'||event.eventType==='dispute.created') {
  if(!transaction)throw new Error('Transaction lookup required');
  const reversal=event.object,ref=object(reversal.transaction);
  const transactionId=identifier(ref.id,'tran');
  if(transaction.id!==transactionId||
     transaction.status!==(event.eventType==='refund.created'?'refunded':'chargeback')||
     typeof reversal.status==='string'&&event.eventType==='refund.created'&&reversal.status!=='succeeded')
   throw new Error('Creem reversal not final');
  return tx(db,async conn=>{
   const [order]=await rows<Order>(conn,'SELECT * FROM orders WHERE provider=? AND provider_order_id=? FOR UPDATE',
    ['creem',transaction.order]);
   if(!order)throw new Error('Creem transaction has no matching order');
   if(order.provider_amount_minor!==transaction.amount||order.provider_currency!==transaction.currency)
    throw new Error('Creem reversal price mismatch');
   if(order.provider_transaction_id&&order.provider_transaction_id!==transactionId)
    throw new Error('Creem transaction mismatch');
   if(order.state==='refunded')return 'duplicate_refund';
   if(order.state!=='paid')throw new Error('Reversal requires paid order');
   await rows(conn,'SELECT credits FROM wallets WHERE user_id=? FOR UPDATE',[order.user_id]);
   await execute(conn,'UPDATE wallets SET credits=credits-? WHERE user_id=?',[order.credits_snapshot,order.user_id]);
   await execute(conn,"INSERT INTO credit_ledger(user_id,delta,kind,reference_id) VALUES(?,?,'refund',?)",
    [order.user_id,-order.credits_snapshot,order.id]);
   await execute(conn,"UPDATE orders SET state='refunded',provider_transaction_id=? WHERE id=?",[transactionId,order.id]);
   return 'refunded';
  });
 }
 return 'ignored';
}
