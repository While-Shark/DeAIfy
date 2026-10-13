import { describe, expect, it } from 'vitest';
import { CreditAdjustmentError, parseCreditAdjustment } from '../src/admin/credits.js';

describe('admin wallet changes', () => {
  const request = { delta: 99999, reason: '本地测试账号初始额度', idempotencyKey: 'grant_' + 'x'.repeat(25) };
  it('accepts signed amounts and an auditable reason', () => {
    expect(parseCreditAdjustment(request)).toEqual(request);
    expect(parseCreditAdjustment({ ...request, delta: -99 }).delta).toBe(-99);
  });
  it('rejects unsafe amounts, empty reason, invalid idempotency', () => {
    for (const delta of [0, 1.5, NaN, Infinity, 1000001, -1000001]) {
      expect(() => parseCreditAdjustment({ ...request, delta })).toThrow(CreditAdjustmentError);
    }
    expect(() => parseCreditAdjustment({ ...request, reason: ' ' })).toThrow();
    expect(() => parseCreditAdjustment({ ...request, idempotencyKey: 'short' })).toThrow();
  });
});
