import { randomUUID } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Database, Row } from './db.js';
import { execute, rows } from './db.js';
import { authenticate, randomToken, sha256 } from './identity.js';

const API_TOKEN = /^Bearer (dak_[a-f\d]{64})$/i;
export function validProjectName(name: unknown): name is string {
  return typeof name === 'string' && name.length >= 2 && name.length <= 64
    && /^[a-zA-Z0-9 _.-]+$/.test(name);
}
export async function createApiKey(db: Database, userId: string, project: string) {
  if (!validProjectName(project)) throw new Error('INVALID_PROJECT_NAME');
  const secret = 'dak_' + randomToken();
  const id = randomUUID();
  await execute(db, 'INSERT INTO api_keys(id,user_id,project,token_hash) VALUES(?,?,?,?)',
    [id, userId, project, sha256(secret)]);
  return { id, project, token: secret };
}
export async function authenticateApiKey(db: Database, header: unknown) {
  if (typeof header !== 'string') return null;
  const token = API_TOKEN.exec(header)?.[1];
  if (!token) return null;
  const [key] = await rows<Row & { user_id: string; id: string; project: string }>(db,
    'SELECT k.id,k.user_id,k.project FROM api_keys k JOIN users u ON u.id=k.user_id ' +
    'WHERE k.token_hash=? AND k.revoked_at IS NULL AND u.is_disabled=0 LIMIT 1',
    [sha256(token)]);
  return key ?? null;
}
/** Resolve the billing owner for either a login session or a project API key. */
export async function requireProcessingOwner(db: Database, req: FastifyRequest, reply: FastifyReply) {
  const key = await authenticateApiKey(db, req.headers.authorization);
  if (key) return { id: key.user_id, apiKeyId: key.id };
  if (typeof req.headers.authorization === 'string' && req.headers.authorization.startsWith('Bearer dak_')) {
    reply.code(401).send({ error: 'API_KEY_INVALID' });
    return null;
  }
  const session = await authenticate(db, req.headers.authorization);
  if (session) return { id: session.id, apiKeyId: null };
  reply.code(401).send({ error: 'AUTH_REQUIRED' });
  return null;
}
