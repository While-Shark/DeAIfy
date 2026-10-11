import { randomBytes } from 'node:crypto';
import { isIP } from 'node:net';

export type PaymentProvider = 'xunhu' | 'creem';
export interface CreemOffer { productId: string; amountMinor: number; currency: 'USD' | 'EUR'; }
export type CreemOffers = Record<string, CreemOffer>;
export interface CreemConfig {
  mode: 'test' | 'live';
  apiKey: string;
  webhookSecret: string;
  offers: CreemOffers;
}
/** Static Creem product prices are independent of CNY promotions in the admin panel. */
export function parseCreemOffers(value: string): CreemOffers {
  if (!value) return {};
  if (value.length > 12000) throw new Error('CREEM_PRODUCTS_JSON is too large');
  let data: unknown;
  try { data = JSON.parse(value); }
  catch { throw new Error('Invalid CREEM_PRODUCTS_JSON'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid CREEM_PRODUCTS_JSON');
  const entries = Object.entries(data as Record<string, unknown>);
  if (entries.length > 50) throw new Error('Too many Creem products');
  const offers: CreemOffers = Object.create(null);
  for (const [planId, raw] of entries) {
    if (!/^[a-zA-Z0-9_-]{1,36}$/.test(planId) || !raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('Invalid Creem plan mapping');
    }
    const item = raw as Record<string, unknown>;
    if (typeof item.productId !== 'string' || !/^prod_[a-zA-Z0-9]+$/.test(item.productId) ||
        !Number.isSafeInteger(item.amountMinor) || (item.amountMinor as number) < 100 ||
        (item.amountMinor as number) > 10_000_000 ||
        (item.currency !== 'USD' && item.currency !== 'EUR')) {
      throw new Error('Invalid Creem product, price, or currency');
    }
    offers[planId] = {productId: item.productId, amountMinor: item.amountMinor as number,
      currency: item.currency};
  }
  return offers;
}

export interface Config {
  port: number;
  publicOrigin: string;
  frontendOrigin: string;
  mysql: { host: string; port: number; user: string; password: string; database: string; ssl?: { rejectUnauthorized: true; ca?: string } };
  sessionHours: number;
  allowRegistration: boolean;
  allowRecovery: boolean;
  turnstileSecret: string;
  smtp: { host: string; port: number; user: string; password: string; from: string };
  otpSecret: string;
  paymentsEnabled: boolean;
  paymentProvider: PaymentProvider;
  creem: CreemConfig;
  xunhu: { appid: string; secret: string; gateway: string };
  processor: { url: string; token: string };
  resultsKey: Buffer;
  outputDirectory: string;
  freePerDay: number;
  trustedProxies: string[] | false;
}
export const nonempty = (key: string): string => {
  const value = process.env[key];
  if (!value) throw new Error('Required configuration missing: ' + key);
  return value;
};
function positiveInt(name: string, fallback: number): number {
  const n = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error('Invalid ' + name);
  return n;
}
export function parseTrustedProxyCidrs(value: string): string[] | false {
  const entries = value.split(',').map(s => s.trim()).filter(Boolean);
  if(entries.length === 0) return false;
  if(entries.length > 8) throw new Error('Too many trusted proxies');
  for(const subnet of entries){
    const parts = subnet.split('/');
    const family = isIP(parts[0] ?? '');
    const maxPrefix = family === 4 ? 32 : family === 6 ? 128 : -1;
    const mask = parts.length === 2 ? Number(parts[1]) : maxPrefix;
    if(parts.length > 2 || maxPrefix < 0 || !Number.isInteger(mask) ||
       mask <= 0 || mask > maxPrefix) {
      throw new Error('Invalid TRUSTED_PROXY_CIDRS entry');
    }
  }
  return entries;
}
export function readConfig(): Config {
  const frontendOrigin = nonempty('FRONTEND_ORIGIN');
  const publicOrigin = nonempty('API_PUBLIC_ORIGIN');
  for (const [name, origin] of [['FRONTEND_ORIGIN', frontendOrigin], ['API_PUBLIC_ORIGIN', publicOrigin]] as const) {
    const u = new URL(origin);
    if (u.origin !== origin || (process.env.NODE_ENV === 'production' && u.protocol !== 'https:')) {
      throw new Error(name + ' must be an origin with https:// in production');
    }
  }
  const resultsHex = nonempty('RESULT_ENCRYPTION_KEY_HEX');
  if (!/^[0-9a-f]{64}$/i.test(resultsHex)) throw new Error('RESULT_ENCRYPTION_KEY_HEX must be a 32-byte hex key');
  const token = nonempty('PROCESSOR_SHARED_TOKEN');
  if (token.length < 32) throw new Error('PROCESSOR_SHARED_TOKEN is too short');
  const gateway = process.env.XUNHU_GATEWAY ?? 'https://api.xunhupay.com';
  const host = new URL(gateway);
  if (host.origin !== gateway || host.protocol !== 'https:' ||
      !['api.xunhupay.com', 'api.dpweixin.com'].includes(host.hostname)) {
    throw new Error('XUNHU_GATEWAY must be an approved official HTTPS host');
  }
  const processorOrigin=new URL(process.env.PROCESSOR_URL??'http://processor:8081');
  if(processorOrigin.protocol!=='http:' || !['processor','localhost','127.0.0.1'].includes(processorOrigin.hostname) ||
     processorOrigin.username || processorOrigin.password || processorOrigin.pathname!=='/') {
    throw new Error('PROCESSOR_URL must remain an internal host');
  }
  const sslMode = process.env.MYSQL_SSL_MODE ?? 'disabled';
  if (!['disabled', 'verify'].includes(sslMode)) {
    throw new Error('MYSQL_SSL_MODE must be disabled or verify');
  }
  const caBase64 = process.env.MYSQL_SSL_CA_B64 ?? '';
  if (caBase64 && (!/^[a-zA-Z0-9+/=]+$/.test(caBase64) || caBase64.length > 100_000)) {
    throw new Error('Invalid MYSQL_SSL_CA_B64');
  }
  const ssl = sslMode === 'verify'
    ? { rejectUnauthorized: true as const, ...(caBase64 ? { ca: Buffer.from(caBase64, 'base64').toString('utf8') } : {}) }
    : undefined;
  const paymentsEnabled = process.env.PAYMENTS_ENABLED === 'true';
  const paymentProvider = process.env.PAYMENT_PROVIDER ?? 'xunhu';
  if (paymentProvider !== 'xunhu' && paymentProvider !== 'creem') throw new Error('Invalid PAYMENT_PROVIDER');
  const creemMode = process.env.CREEM_MODE ?? 'test';
  if (creemMode !== 'test' && creemMode !== 'live') throw new Error('Invalid CREEM_MODE');
  const offers = parseCreemOffers(process.env.CREEM_PRODUCTS_JSON ?? '');
  if (paymentsEnabled && paymentProvider === 'xunhu' &&
      (!process.env.XUNHU_APPID || !process.env.XUNHU_SECRET ||
       process.env.MERCHANT_APPROVED !== 'true')) {
    throw new Error('Payment activation requires approved merchant and Xunhu keys');
  }
  if (paymentsEnabled && paymentProvider === 'creem') {
    if (!process.env.CREEM_API_KEY || !process.env.CREEM_WEBHOOK_SECRET ||
        Object.keys(offers).length === 0) {
      throw new Error('Creem payment activation requires API key, webhook secret, and products');
    }
    if (creemMode === 'live' && process.env.MERCHANT_APPROVED !== 'true') {
      throw new Error('Live Creem payments require an approved merchant');
    }
  }
  const allowRecovery = process.env.RECOVERY_ENABLED === 'true';
  if ((process.env.REGISTRATION_ENABLED === 'true' || allowRecovery) &&
      (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD ||
       !process.env.TURNSTILE_SECRET || !process.env.OTP_SECRET || process.env.OTP_SECRET.length < 32)) {
    throw new Error('Registration requires SMTP, Turnstile and a long OTP secret');
  }
  return {
    port: positiveInt('PORT', 8080),
    publicOrigin, frontendOrigin,
    mysql: {
      host: nonempty('MYSQL_HOST'), port: positiveInt('MYSQL_PORT', 3306),
      user: nonempty('MYSQL_USER'), password: nonempty('MYSQL_PASSWORD'),
      database: nonempty('MYSQL_DATABASE'), ssl,
    },
    sessionHours: 24,
    allowRegistration: process.env.REGISTRATION_ENABLED === 'true',
    allowRecovery,
    turnstileSecret: process.env.TURNSTILE_SECRET ?? '',
    smtp: {
      host: process.env.SMTP_HOST ?? '', port: positiveInt('SMTP_PORT', 465),
      user: process.env.SMTP_USER ?? '', password: process.env.SMTP_PASSWORD ?? '',
      from: process.env.SMTP_FROM ?? '',
    },
    otpSecret: process.env.OTP_SECRET ?? randomBytes(32).toString('hex'),
    paymentsEnabled, paymentProvider,
    creem: {
      mode: creemMode, apiKey: process.env.CREEM_API_KEY ?? '',
      webhookSecret: process.env.CREEM_WEBHOOK_SECRET ?? '', offers,
    },
    xunhu: {
      appid: process.env.XUNHU_APPID ?? '', secret: process.env.XUNHU_SECRET ?? '',
      gateway,
    },
    processor: { url: process.env.PROCESSOR_URL ?? 'http://processor:8081', token },
    resultsKey: Buffer.from(resultsHex, 'hex'),
    outputDirectory: process.env.RESULTS_DIRECTORY ?? '/data/results',
    freePerDay: positiveInt('FREE_USES_PER_DAY', 5),
    trustedProxies: parseTrustedProxyCidrs(process.env.TRUSTED_PROXY_CIDRS ?? ''),
  };
}
