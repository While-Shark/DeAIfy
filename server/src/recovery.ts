import { randomUUID } from 'node:crypto';
import type { Database, Row } from './db.js';
import { execute, rows, tx } from './db.js';
import { codeDigest, compareDigest } from './identity.js';

interface ResetRow extends Row { id: string; code_digest: string; attempts: number; }
interface UserRow extends Row { id: string; }

/** Keep 8-digit OTP separate from registration codes and limit online guesses. */
export function resetCodeDigest(email: string, code: string, secret: string): string {
  return codeDigest('reset:' + email, code, secret);
}

export async function prepareRecovery(db: Database, email: string, code: string, secret: string): Promise<boolean> {
  const [user] = await rows<UserRow>(db,
    'SELECT id FROM users WHERE email=? AND is_disabled=0 LIMIT 1', [email]);
  if (!user) return false;
  const [recent] = await rows<Row>(db,
    'SELECT id FROM password_reset_codes WHERE user_id=? AND created_at>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 60 SECOND) LIMIT 1',
    [user.id]);
  if (recent) return false;
  await execute(db,
    'INSERT INTO password_reset_codes(id,user_id,code_digest,expires_at) VALUES(?,?,?,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 10 MINUTE))',
    [randomUUID(), user.id, resetCodeDigest(email, code, secret)]);
  return true;
}

/** Atomically consume the reset code, rotate the password and revoke all sessions. */
export async function applyRecovery(
  db: Database, email: string, code: string, newHash: string, secret: string,
): Promise<boolean> {
  return tx(db, async (conn) => {
    const [user] = await rows<UserRow>(conn,
      'SELECT id FROM users WHERE email=? AND is_disabled=0 LIMIT 1', [email]);
    if (!user) return false;
    const [entry] = await rows<ResetRow>(conn,
      'SELECT id,code_digest,attempts FROM password_reset_codes WHERE user_id=? AND consumed=0 AND expires_at>UTC_TIMESTAMP(3) ORDER BY created_at DESC LIMIT 1 FOR UPDATE',
      [user.id]);
    if (!entry || entry.attempts >= 5) return false;
    if (!compareDigest(entry.code_digest, resetCodeDigest(email, code, secret))) {
      await execute(conn, 'UPDATE password_reset_codes SET attempts=attempts+1 WHERE id=?', [entry.id]);
      return false;
    }
    await execute(conn, 'UPDATE users SET password_hash=? WHERE id=?', [newHash, user.id]);
    await execute(conn, 'DELETE FROM sessions WHERE user_id=?', [user.id]);
    await execute(conn, 'UPDATE password_reset_codes SET consumed=1 WHERE id=?', [entry.id]);
    return true;
  });
}
