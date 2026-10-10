import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { safeCheckoutLink, signXunhu, verifyXunhu } from '../src/payments/xunhu.js';

describe('Xunhu official API v1.1 signing', () => {
  it('sorts ASCII keys, omits blanks/hash, appends secret and produces lower-case md5', () => {
    const p = { total_fee: '9.90', time: 1700000000, appid: 'abc', hash: 'not-included', attach: '' };
    const expected = createHash('md5').update('appid=abc&time=1700000000&total_fee=9.90example-secret').digest('hex');
    expect(signXunhu(p, 'example-secret')).toBe(expected);
    expect(verifyXunhu({ ...p, hash: expected }, 'example-secret')).toBe(true);
  });
  it('rejects missing/modified signatures', () => {
    expect(verifyXunhu({ status: 'OD' }, 'secret')).toBe(false);
    const body = { status: 'OD', appid: 'app', total_fee: '19.00' };
    const hash = signXunhu(body, 'secret');
    expect(verifyXunhu({ ...body, hash, total_fee: '190.00' }, 'secret')).toBe(false);
  });
  it('prevents provider-link injection and HTTP links', () => {
    expect(safeCheckoutLink('https://api.xunhupay.com/pay')).toContain('xunhupay.com');
    expect(() => safeCheckoutLink('https://api.xunhupay.com.evil.invalid/pay')).toThrow();
    expect(() => safeCheckoutLink('javascript:alert(1)')).toThrow();
    expect(() => safeCheckoutLink('http://api.xunhupay.com/pay')).toThrow();
  });
});
