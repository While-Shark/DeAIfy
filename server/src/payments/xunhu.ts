import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Config } from '../config.js';
import { formatFen } from '../pricing.js';

/** Xunhu API v1.1: signed ASCII-sorted nonempty scalar key/value pairs, then append APPSECRET. */
export type XunhuParams = Record<string, string | number | null | undefined>;
export function signXunhu(data: XunhuParams, secret: string): string {
  const canonical = Object.keys(data).filter(k => k !== 'hash' && data[k] !== '' &&
    data[k] !== null && data[k] !== undefined).sort()
    .map(k => k + '=' + String(data[k])).join('&');
  return createHash('md5').update(canonical + secret, 'utf8').digest('hex');
}
export function verifyXunhu(data: XunhuParams, secret: string): boolean {
  const supplied = data.hash;
  if (typeof supplied !== 'string' || !/^[a-f\d]{32}$/i.test(supplied) || !secret) return false;
  const expected = Buffer.from(signXunhu(data, secret), 'hex');
  return timingSafeEqual(expected, Buffer.from(supplied, 'hex'));
}
export function safeCheckoutLink(url: unknown): string {
  if (typeof url !== 'string') throw new Error('Gateway did not provide a checkout URL');
  const u = new URL(url);
  const permitted = ['xunhupay.com', 'dpweixin.com', 'alipay.com', 'weixin.qq.com'];
  if (u.protocol !== 'https:' || u.username || u.password || !permitted.some(d => u.hostname === d || u.hostname.endsWith('.' + d))) {
    throw new Error('Unexpected payment link host');
  }
  return u.href;
}
export async function createXunhuCheckout(config: Config, order: {
  id: string; amountFen: number; description: string;
}): Promise<{ url?: string; qr?: string }> {
  if (!config.paymentsEnabled) throw new Error('Payments are disabled');
  const data: XunhuParams = {
    version: '1.1', appid: config.xunhu.appid,
    trade_order_id: order.id, total_fee: formatFen(order.amountFen),
    title: order.description.slice(0, 32),
    notify_url: config.publicOrigin + '/api/payments/xunhu/notify',
    return_url: config.frontendOrigin + '/?payment=return',
    time: Math.floor(Date.now() / 1000), nonce_str: randomBytes(12).toString('hex'),
  };
  const signed = { ...data, hash: signXunhu(data, config.xunhu.secret) };
  const res = await fetch(config.xunhu.gateway + '/payment/do.html', {
    method: 'POST', headers: { 'Content-Type': 'application/json;charset=UTF-8' },
    body: JSON.stringify(signed), signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error('Xunhu gateway unavailable');
  const response = await res.json() as Record<string, unknown>;
  if (!verifyXunhu(response as XunhuParams, config.xunhu.secret)) {
    throw new Error('Xunhu response signature invalid');
  }
  if (response.errcode !== 0) throw new Error('Gateway rejected order');
  // Official examples have flat URL fields; some versions return a nested data envelope.
  const dataResult = response.data && typeof response.data === 'object'
    ? response.data as Record<string, unknown> : response;
  const url = dataResult.url ? safeCheckoutLink(dataResult.url) : undefined;
  const qr = dataResult.url_qrcode ? safeCheckoutLink(dataResult.url_qrcode) : undefined;
  if (!url && !qr) throw new Error('Gateway did not return a checkout URL');
  return { url, qr };
}
