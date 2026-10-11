import { randomInt } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Config } from '../config.js';
import type { Database } from '../db.js';
import { sendVerificationCode } from '../email.js';
import { emailValid, passwordHash, passwordValid } from '../identity.js';
import { applyRecovery, prepareRecovery } from '../recovery.js';

function bodyOf(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}
async function challengeIsValid(token: unknown, config: Config, remoteIp: string) {
  if (typeof token !== 'string' || token.length < 8 || token.length > 2048) return false;
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({
        secret: config.turnstileSecret, response: token, remoteip: remoteIp,
      }),
      signal: AbortSignal.timeout(6_000),
    });
    if (!response.ok) return false;
    const data = await response.json() as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

export function registerRecovery(app: FastifyInstance, db: Database, config: Config): void {
  app.post('/api/auth/recovery/request', {
    config: { rateLimit: { max: 3, timeWindow: '1 hour' } },
  }, async (req, reply) => {
    if (!config.allowRecovery) return reply.code(503).send({ error: 'RECOVERY_DISABLED' });
    const body = bodyOf(req.body);
    const email = String(body.email ?? '').trim().toLowerCase();
    if (!emailValid(email)) return reply.code(400).send({ error: 'INVALID_EMAIL' });
    if (!await challengeIsValid(body.turnstileToken, config, req.ip)) {
      return reply.code(403).send({ error: 'CHALLENGE_REQUIRED' });
    }
    const code = String(randomInt(10_000_000, 100_000_000));
    const created = await prepareRecovery(db, email, code, config.otpSecret);
    if (created) {
      try {
        await sendVerificationCode(config, email, code, 'password reset');
      } catch {
        // Do not reveal whether the account exists.
        req.log.warn('Password recovery email delivery failed');
      }
    }
    return { sent: true };
  });

  app.post('/api/auth/recovery/confirm', {
    config: { rateLimit: { max: 6, timeWindow: '15 minutes' } },
  }, async (req, reply) => {
    if (!config.allowRecovery) return reply.code(503).send({ error: 'RECOVERY_DISABLED' });
    const body = bodyOf(req.body);
    const email = String(body.email ?? '').trim().toLowerCase();
    const code = body.code;
    if (!emailValid(email) || typeof code !== 'string' || !/^\d{8}$/.test(code)
      || !passwordValid(body.newPassword)) {
      return reply.code(400).send({ error: 'INVALID_RESET_DATA' });
    }
    const hash = await passwordHash(body.newPassword);
    const success = await applyRecovery(db, email, code, hash, config.otpSecret);
    if (!success) return reply.code(400).send({ error: 'INVALID_OR_EXPIRED_CODE' });
    return { changed: true, next: 'login' };
  });
}
