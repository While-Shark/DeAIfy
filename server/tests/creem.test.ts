import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { creemCheckoutUrl, parseCreemWebhook, validateCreemProduct, verifyCreem } from '../src/payments/creem.js';
import { parseCreemOffers } from '../src/config.js';

describe('Creem payment trust boundaries',()=>{
 it('validates signed original bodies, rejecting tampered and malformed signatures',()=>{
  const secret='test-creem-signature-secret',body='{"eventType":"checkout.completed"}';
  const signature=createHmac('sha256',secret).update(body).digest('hex');
  expect(verifyCreem(body,signature,secret)).toBe(true);
  expect(verifyCreem(body+' ',signature,secret)).toBe(false);
  expect(verifyCreem(body,'invalid',secret)).toBe(false);
 });
 it('only accepts exact official checkout HTTPS hosts',()=>{
  expect(creemCheckoutUrl('https://checkout.creem.io/ch_123')).toContain('checkout.creem.io');
  expect(creemCheckoutUrl('https://test-checkout.creem.io/ch_123')).toContain('test-checkout.creem.io');
  expect(()=>creemCheckoutUrl('https://checkout.creem.io.evil.test/')).toThrow();
  expect(()=>creemCheckoutUrl('http://checkout.creem.io/')).toThrow();
 });
 it('requires active one-time matching products, price, mode and tax-inclusive amounts',()=>{
  const offer={productId:'prod_123',amountMinor:500,currency:'USD' as const};
  const p={id:'prod_123',mode:'test',price:500,currency:'USD',billing_type:'onetime',status:'active',tax_mode:'inclusive'};
  expect(()=>validateCreemProduct(p,offer,'test')).not.toThrow();
  for(const change of [{price:1},{mode:'prod'},{billing_type:'recurring'},{tax_mode:'exclusive'}])
   expect(()=>validateCreemProduct({...p,...change},offer,'test')).toThrow();
  expect(parseCreemOffers('{"plan-starter":{"productId":"prod_123","amountMinor":500,"currency":"USD"}}')['plan-starter'])
   .toEqual(offer);
  expect(()=>parseCreemOffers('{"bad":{"productId":"prod_123","amountMinor":-1,"currency":"USD"}}')).toThrow();
 });
 it('rejects malformed webhook envelopes',()=>{
  expect(parseCreemWebhook('{"id":"evt_123","eventType":"checkout.completed","object":{"id":"ch_1"}}').eventType)
   .toBe('checkout.completed');
  expect(()=>parseCreemWebhook('{"id":"evt_123","eventType":"checkout.completed","object":{}}')).toThrow();
 });
});
