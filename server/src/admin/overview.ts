import type { Database, Row } from '../db.js';
import { rows } from '../db.js';

type AggregateRow = Row & Record<string, number | string | null>;

async function aggregate(db: Database, sql: string): Promise<AggregateRow> {
  const [row] = await rows<AggregateRow>(db, sql);
  return row ?? ({} as AggregateRow);
}
function integer(row: AggregateRow, key: string): number {
  const result = Number(row[key] ?? 0);
  return Number.isSafeInteger(result) ? result : 0;
}

/** Operator metrics for decisions, not a legally reconciled finance report. */
export async function adminOverview(db: Database) {
  const [users, orders, plans, jobs] = await Promise.all([
    aggregate(db, 'SELECT COUNT(*) AS total FROM users'),
    aggregate(db, `SELECT
       SUM(state='paid') AS paid,
       SUM(state='pending') AS pending,
       SUM(state='refunded') AS refunded,
       SUM(CASE WHEN state='paid' THEN price_fen ELSE 0 END) AS collected_fen
       FROM orders`),
    aggregate(db, 'SELECT COUNT(*) AS active FROM plans WHERE active=1'),
    aggregate(db, `SELECT
       SUM(state='complete') AS processed,
       SUM(state='reversed') AS reversed,
       SUM(state='complete' AND source='free') AS free,
       SUM(state='complete' AND source='credits') AS credits
       FROM processing_jobs
       WHERE created_at>=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 24 HOUR)`),
  ]);
  return {
    users: integer(users, 'total'),
    activePlans: integer(plans, 'active'),
    paidOrders: integer(orders, 'paid'),
    pendingOrders: integer(orders, 'pending'),
    refundedOrders: integer(orders, 'refunded'),
    paidOrderValueFen: integer(orders, 'collected_fen'),
    completed24h: integer(jobs, 'processed'),
    reversed24h: integer(jobs, 'reversed'),
    free24h: integer(jobs, 'free'),
    credits24h: integer(jobs, 'credits'),
  };
}
