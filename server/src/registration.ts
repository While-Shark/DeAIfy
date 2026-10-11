import type { Database, Row } from './db.js';
import { execute, rows, tx } from './db.js';
import { addUser, codeDigest, compareDigest } from './identity.js';

interface RegistrationRow extends Row {
  id: string;
  code_digest: string;
  attempts: number;
}

/** Commit invalid guesses as well as successful consumption to prevent OTP brute force. */
export async function consumeRegistrationCode(
  db: Database, email: string, code: string, secret: string,
  userId: string, passwordHash: string,
): Promise<boolean> {
  return tx(db, async (conn) => {
    const [entry] = await rows<RegistrationRow>(conn,
      'SELECT id,code_digest,attempts FROM email_codes WHERE email=? AND consumed=0 AND expires_at>UTC_TIMESTAMP(3) ORDER BY created_at DESC LIMIT 1 FOR UPDATE',
      [email]);
    if (!entry || entry.attempts >= 5) return false;
    if (!compareDigest(entry.code_digest, codeDigest(email, code, secret))) {
      await execute(conn, 'UPDATE email_codes SET attempts=attempts+1 WHERE id=?', [entry.id]);
      return false;
    }
    await execute(conn, 'UPDATE email_codes SET consumed=1 WHERE id=?', [entry.id]);
    await addUser(conn, userId, email, passwordHash);
    return true;
  });
}
