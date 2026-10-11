import { createHmac, timingSafeEqual } from 'node:crypto';
import type { CreemConfig, CreemOffer } from '../config.js';

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject {
 return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
}
function apiBase(config: CreemConfig): string {
 return config.mode === 'test' ? 'https://test-api.creem.io' : 'https://api.creem.io';
}
export function expectedCreemMode(config: CreemConfig): 'test' | 'prod' {
 return config.mode === 'test' ? 'test' : 'prod';
}
async function requestCreem(config: CreemConfig, path: string, init: RequestInit = {}): Promise<JsonObject> {
 const response = await fetch(apiBase(config) + path, {
  ...init, headers: { 'x-api-key': config.apiKey, ...init.headers },
  signal: AbortSignal.timeout(12000),
 });
 if (!response.ok) throw new Error('Creem API request failed (' + response.status + ')');
 const result = await response.json() as unknown;
 if (!result || typeof result !== 'object' || Array.isArray(result)) {
  throw new Error('Invalid Creem API response');
 }
 return result as JsonObject;
}
export function verifyCreem(raw: string, signature: unknown, secret: string): boolean {
 if (!secret || typeof signature !== 'string' || !/^[a-f0-9]{64}$/i.test(signature)) return false;
 const expected = createHmac('sha256', secret).update(raw, 'utf8').digest();
 return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}
export function creemCheckoutUrl(value: unknown): string {
 if (typeof value !== 'string') throw new Error('Missing Creem checkout URL');
 const url = new URL(value);
 if (url.protocol !== 'https:' ||
     !['checkout.creem.io', 'test-checkout.creem.io'].includes(url.hostname) ||
     url.username || url.password || url.port) {
  throw new Error('Unexpected Creem checkout URL');
 }
 return url.href;
}
/** Creem sells fixed-price products: refuse to sell a mismatched/recurring item. */
export function validateCreemProduct(product: JsonObject, offer: CreemOffer, mode: 'test' | 'prod'): void {
 if (product.id !== offer.productId || product.mode !== mode ||
     product.price !== offer.amountMinor || product.currency !== offer.currency ||
     product.billing_type !== 'onetime' || product.status !== 'active' ||
     product.tax_mode !== 'inclusive') {
  throw new Error('Creem product/price mismatch; configure an active one-time tax-inclusive product');
 }
}
export async function createCreemCheckout(config: CreemConfig, order: {
 id: string; userId: string; offer: CreemOffer; email?: string; successUrl: string;
}): Promise<{ url: string }> {
 const {offer} = order;
 const product = await requestCreem(config, '/v1/products?product_id=' + encodeURIComponent(offer.productId));
 validateCreemProduct(product, offer, expectedCreemMode(config));
 const checkout = await requestCreem(config, '/v1/checkouts', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
   product_id: offer.productId, request_id: order.id, units: 1,
   success_url: order.successUrl, metadata: {orderId: order.id, userId: order.userId},
   ...(order.email ? {customer: {email: order.email}} : {}),
  }),
 });
 const checkoutProduct = typeof checkout.product === 'string'
  ? checkout.product : object(checkout.product).id;
 if (checkout.mode !== expectedCreemMode(config) || checkout.request_id !== order.id ||
     checkoutProduct !== offer.productId || checkout.status !== 'pending') {
  throw new Error('Creem checkout identity mismatch');
 }
 return {url: creemCheckoutUrl(checkout.checkout_url)};
}
export interface CreemTransaction {
 id: string; order: string; currency: string; amount: number; status: string;
}
export async function retrieveCreemTransaction(config: CreemConfig, transactionId: string): Promise<CreemTransaction> {
 if (!/^tran_[a-zA-Z0-9]{1,88}$/.test(transactionId)) throw new Error('Invalid Creem transaction ID');
 const txn = await requestCreem(config, '/v1/transactions?transaction_id=' + encodeURIComponent(transactionId));
 const orderId = typeof txn.order === 'string' ? txn.order : object(txn.order).id;
 if (txn.id !== transactionId || txn.mode !== expectedCreemMode(config) ||
     typeof orderId !== 'string' || !/^ord_[a-zA-Z0-9]{1,88}$/.test(orderId) ||
     typeof txn.currency !== 'string' || !Number.isSafeInteger(txn.amount) ||
     typeof txn.status !== 'string') throw new Error('Invalid Creem transaction');
 return {id: transactionId, order: orderId, currency: txn.currency,
  amount: txn.amount as number, status: txn.status};
}
export interface CreemWebhook {
 id: string; eventType: string; object: JsonObject;
}
export function parseCreemWebhook(raw: string): CreemWebhook {
 if (raw.length > 65536) throw new Error('Creem payload too large');
 const value: unknown = JSON.parse(raw);
 const event = object(value);
 if (!/^evt_[a-zA-Z0-9]+$/.test(String(event.id ?? '')) ||
     typeof event.eventType !== 'string' || Object.keys(object(event.object)).length === 0) {
  throw new Error('Invalid Creem event');
 }
 return {id: event.id as string, eventType: event.eventType, object: object(event.object)};
}
