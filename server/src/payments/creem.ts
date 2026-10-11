import { createHmac, timingSafeEqual } from 'node:crypto';
import type { CreemConfig } from '../config.js';

export function verifyCreem(raw: string, signature: unknown, secret: string): boolean {
 if (!secret || typeof signature !== 'string' || !/^[a-f0-9]{64}$/i.test(signature)) return false;
 const expected=createHmac('sha256',secret).update(raw,'utf8').digest();
 return timingSafeEqual(expected,Buffer.from(signature,'hex'));
}
export function creemCheckoutUrl(value: unknown): string {
 if (typeof value!=='string') throw new Error('Missing Creem checkout URL');
 const url=new URL(value);
 if (url.protocol!=='https:' || url.hostname!=='checkout.creem.io' || url.username || url.password)
  throw new Error('Unexpected Creem checkout URL');
 return url.href;
}
export async function createCreemCheckout(config:CreemConfig, order:{
 id:string;userId:string;productId:string;email?:string;successUrl:string;
}): Promise<{url:string}> {
 const base=config.mode==='test'?'https://test-api.creem.io':'https://api.creem.io';
 const response=await fetch(base+'/v1/checkouts',{
  method:'POST',
  headers:{'x-api-key':config.apiKey,'Content-Type':'application/json'},
  body:JSON.stringify({
   product_id:order.productId,request_id:order.id,units:1,
   success_url:order.successUrl,metadata:{orderId:order.id,userId:order.userId},
   ...(order.email?{customer:{email:order.email}}:{}),
  }),signal:AbortSignal.timeout(12000),
 });
 if (!response.ok) throw new Error('Creem checkout API unavailable');
 const checkout=await response.json() as Record<string,unknown>;
 if (checkout.mode!==config.mode || checkout.request_id!==order.id ||
     (typeof checkout.product==='string'?checkout.product:(checkout.product as {id?:string}|undefined)?.id)!==order.productId)
  throw new Error('Creem checkout identity mismatch');
 return {url:creemCheckoutUrl(checkout.checkout_url)};
}
export interface CreemWebhook {
 id:string;eventType:string;object:Record<string,unknown>;
}
export function parseCreemWebhook(raw:string):CreemWebhook {
 const event=JSON.parse(raw) as Record<string,unknown>;
 if (!/^evt_[a-zA-Z0-9]+$/.test(String(event.id??'')) ||
  typeof event.eventType!=='string' || !event.object ||
  typeof event.object!=='object'||Array.isArray(event.object))throw new Error('Invalid Creem event');
 return event as unknown as CreemWebhook;
}
