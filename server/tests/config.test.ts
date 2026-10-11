import { describe, expect, it } from 'vitest';
import { parseTrustedProxyCidrs } from '../src/config.js';

describe('reverse proxy trust boundary', () => {
  it('disables X-Forwarded-For trust by default', () => {
    expect(parseTrustedProxyCidrs('')).toBe(false);
  });
  it('allows explicit trusted proxy addresses and constrained CIDRs', () => {
    expect(parseTrustedProxyCidrs('127.0.0.1/32, 172.18.0.1/32'))
      .toEqual(['127.0.0.1/32', '172.18.0.1/32']);
  });
  it('never accepts all addresses, invalid prefixes or malformed entries', () => {
    for(const candidate of ['0.0.0.0/0', '::/0', '1.2.3.4/33', 'not-an-ip',
      '127.0.0.1/24/12', '127.0.0.1/-1']){
      expect(()=>parseTrustedProxyCidrs(candidate)).toThrow();
    }
  });
});
