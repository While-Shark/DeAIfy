import { describe, expect, it } from 'vitest';
import { pricing, formatFen, parseAmountFen } from '../src/pricing.js';

const plan = { base_price_fen: 2990, discount_bps: 9000, credits: 70, bonus_credits: 10,
  discount_starts_at: null, discount_ends_at: null };
describe('catalog pricing', () => {
  it('calculates discounts and bonus server-side', () => {
    expect(pricing(plan)).toEqual({
      originalPriceFen: 2990, priceFen: 2691, discountBps: 9000,
      credited: 80, credits: 70, bonusCredits: 10,
    });
  });
  it('ignores expired discounts and forbids invalid values', () => {
    expect(pricing({ ...plan, discount_ends_at: '2020-01-01T00:00:00Z' }).priceFen).toBe(2990);
    expect(() => pricing({ ...plan, discount_bps: -1 })).toThrow();
    expect(() => pricing({ ...plan, credits: Number.NaN })).toThrow();
  });
  it('handles CNY fractions without float comparisons', () => {
    expect(parseAmountFen('9.90')).toBe(990);
    expect(parseAmountFen('9.9')).toBe(990);
    expect(formatFen(2691)).toBe('26.91');
    expect(() => parseAmountFen('9.999')).toThrow();
    expect(() => parseAmountFen('9e2')).toThrow();
  });
});
