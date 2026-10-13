import { randomUUID } from 'node:crypto';
import { readConfig } from '../config.js';
import { execute, openDb, rows, tx } from '../db.js';
import { addUser, passwordHash } from '../identity.js';

// Explicit opt-in: never create demo users on a public/production instance.
const config = readConfig();
const localOnly = process.env.NODE_ENV === 'development'
  && process.env.LOCAL_DEMO_SEED_ENABLED === '1'
  && config.mysql.host === 'mysql'
  && config.publicOrigin === 'http://127.0.0.1:18088'
  && config.frontendOrigin === 'http://localhost:5173';
if (!localOnly) throw new Error('Refusing demo accounts outside local development');

const demoAccounts = [1, 2, 3].map(n => {
  const password = process.env['DEMO_' + n + '_PASSWORD'];
  if (typeof password !== 'string' || password.length < 16) {
    throw new Error('Missing strong DEMO_' + n + '_PASSWORD');
  }
  return { email: 'demo' + n + '@local.test', password };
});

const db = openDb(config);
try {
  const hashes = await Promise.all(demoAccounts.map(user => passwordHash(user.password)));
  const count = await tx(db, async conn => {
    let inserted = 0;
    for (const [index, demo] of demoAccounts.entries()) {
      const [existing] = await rows(conn, 'SELECT id FROM users WHERE email=?', [demo.email]);
      if (existing) {
        const [seeded] = await rows(conn,
          "SELECT id FROM audit_logs WHERE action='demo.seed' AND target_id=? LIMIT 1",
          [existing.id]);
        if (!seeded) throw new Error('Conflicting existing email: ' + demo.email);
        continue; // Never reset balances or passwords after the first seed.
      }
      const id = randomUUID();
      await addUser(conn, id, demo.email, hashes[index]!, 'user');
      await execute(conn, 'UPDATE wallets SET credits=99999 WHERE user_id=?', [id]);
      await execute(conn,
        "INSERT INTO credit_ledger(user_id,delta,kind,reference_id) VALUES(?,99999,'admin_adjustment',?)",
        [id, 'demo_seed_' + id]);
      await execute(conn,
        'INSERT INTO audit_logs(actor_id,action,target_id,detail) VALUES(NULL,?,?,?)',
        ['demo.seed', id, 'Local-only initial allocation of 99999 credits']);
      inserted++;
    }
    return inserted;
  });
  console.log('Demo users newly created: ' + count + '; existing demo users preserved.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Demo bootstrap failed');
  process.exitCode = 1;
} finally {
  await db.end();
}
