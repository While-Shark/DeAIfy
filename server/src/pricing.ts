export interface PlanLike {
  base_price_fen: number;
  discount_bps: number;
  credits: number;
  bonus_credits: number;
  discount_starts_at: Date | string | null;
  discount_ends_at: Date | string | null;
}
export function normalizeInt(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error('Invalid integer in range ' + min + '..' + max);
  }
  return value;
}
export function pricing(plan: PlanLike, at: Date = new Date()) {
  const base = normalizeInt(plan.base_price_fen, 1, 10_000_000);
  const discount = normalizeInt(plan.discount_bps, 100, 10000);
  const credits = normalizeInt(plan.credits, 1, 1_000_000);
  const bonus = normalizeInt(plan.bonus_credits, 0, 1_000_000);
  const started = !plan.discount_starts_at || new Date(plan.discount_starts_at).getTime() <= at.getTime();
  const notEnded = !plan.discount_ends_at || new Date(plan.discount_ends_at).getTime() > at.getTime();
  const activeDiscount = discount < 10000 && started && notEnded;
  const priceFen = activeDiscount ? Math.max(1, Math.round(base * discount / 10000)) : base;
  return { originalPriceFen: base, priceFen, discountBps: activeDiscount ? discount : 10000,
    credited: credits + bonus, credits, bonusCredits: bonus };
}
export function parseAmountFen(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{1,9}(?:\.\d{1,2})?$/.test(value)) throw new Error('Invalid CNY amount');
  const [whole, decimal = ''] = value.split('.');
  const result = Number(whole) * 100 + Number(decimal.padEnd(2, '0'));
  if (!Number.isSafeInteger(result)) throw new Error('Invalid CNY amount');
  return result;
}
export function formatFen(amountFen: number): string {
  if (!Number.isSafeInteger(amountFen) || amountFen < 0) throw new Error('Invalid price');
  return (amountFen / 100).toFixed(2);
}
