import type { Database, Row } from '../db.js';
import { execute, rows, tx } from '../db.js';
import { validIdempotency } from '../wallet.js';

const MAX_ADJUSTMENT = 1_000_000;
const MAX_BALANCE = 1_000_000_000;

export class CreditAdjustmentError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export interface CreditAdjustment {
  delta: number;
  reason: string;
  idempotencyKey: string;
}

export function parseCreditAdjustment(value: unknown): CreditAdjustment {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CreditAdjustmentError('INVALID_ADJUSTMENT', 400);
  }
  const obj = value as Record<string, unknown>;
  if (typeof obj.delta !== 'number' || !Number.isSafeInteger(obj.delta)
      || obj.delta === 0 || Math.abs(obj.delta) > MAX_ADJUSTMENT) {
    throw new CreditAdjustmentError('INVALID_CREDIT_DELTA', 400);
  }
  const reason = typeof obj.reason === 'string' ? obj.reason.trim() : '';
  if (reason.length < 2 || reason.length > 200) {
    throw new CreditAdjustmentError('INVALID_ADJUSTMENT_REASON', 400);
  }
  if (!validIdempotency(obj.idempotencyKey)) {
    throw new CreditAdjustmentError('INVALID_IDEMPOTENCY_KEY', 400);
  }
  return { delta: obj.delta, reason, idempotencyKey: obj.idempotencyKey };
}

/** Transactionally adjust a wallet; retries use one ledger reference, never duplicate credit. */
export async function adjustUserCredits(
  db: Database, actorId: string, userId: string, request: CreditAdjustment,
) {
  if (!/^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(userId)) {
    throw new CreditAdjustmentError('INVALID_USER_ID', 400);
  }
  try {
    return await tx(db, async conn => {
      const [wallet] = await rows<Row & { credits: number | string }>(conn,
        'SELECT credits FROM wallets WHERE user_id=? FOR UPDATE', [userId]);
      if (!wallet) throw new CreditAdjustmentError('USER_NOT_FOUND', 404);

      const [existing] = await rows<Row & { user_id: string; delta: number | string }>(
        conn, "SELECT user_id,delta FROM credit_ledger WHERE kind='admin_adjustment' AND reference_id=? LIMIT 1",
        [request.idempotencyKey]);
      if (existing) {
        if (existing.user_id !== userId || Number(existing.delta) !== request.delta) {
          throw new CreditAdjustmentError('IDEMPOTENCY_KEY_CONFLICT', 409);
        }
        return { credits: Number(wallet.credits), alreadyApplied: true };
      }

      const next = Number(wallet.credits) + request.delta;
      if (!Number.isSafeInteger(next) || next > MAX_BALANCE) {
        throw new CreditAdjustmentError('CREDIT_BALANCE_LIMIT', 422);
      }
      if (next < 0) throw new CreditAdjustmentError('INSUFFICIENT_CREDITS', 422);
      await execute(conn, 'UPDATE wallets SET credits=? WHERE user_id=?', [next, userId]);
      await execute(conn,
        "INSERT INTO credit_ledger(user_id,delta,kind,reference_id) VALUES(?,?,'admin_adjustment',?)",
        [userId, request.delta, request.idempotencyKey]);
      await execute(conn,
        'INSERT INTO audit_logs(actor_id,action,target_id,detail) VALUES(?,?,?,?)',
        [actorId, 'wallet.admin_adjusted', userId,
          JSON.stringify({ delta: request.delta, reason: request.reason,
            balance: next, idempotencyKey: request.idempotencyKey })]);
      return { credits: next, alreadyApplied: false };
    });
  } catch (error) {
    if (error instanceof CreditAdjustmentError) throw error;
    if ((error as { code?: string }).code === 'ER_DUP_ENTRY') {
      throw new CreditAdjustmentError('IDEMPOTENCY_KEY_CONFLICT', 409);
    }
    throw error;
  }
}
