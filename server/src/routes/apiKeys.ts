import type { FastifyInstance } from 'fastify';
import type { Database, Row } from '../db.js';
import { execute, rows } from '../db.js';
import { createApiKey, validProjectName } from '../apiKeys.js';
import { requireIdentity } from './auth.js';

export function registerApiKeys(app: FastifyInstance, db: Database) {
  app.get('/api/account/api-keys', async (req, reply) => {
    const user = await requireIdentity(db, req, reply);
    if (!user) return;
    return { keys: await rows<Row>(db,
      'SELECT id,project,created_at,revoked_at FROM api_keys WHERE user_id=? ORDER BY created_at DESC LIMIT 30',
      [user.id]) };
  });
  app.post('/api/account/api-keys', { config: { rateLimit: { max: 4, timeWindow: '1 hour' } } }, async (req, reply) => {
    const user = await requireIdentity(db, req, reply);
    if (!user) return;
    const project = (req.body as { project?: unknown } | null)?.project;
    if (!validProjectName(project)) return reply.code(400).send({ error: 'INVALID_PROJECT_NAME' });
    const [count] = await rows<Row & { total: number }>(db,
      'SELECT COUNT(*) AS total FROM api_keys WHERE user_id=? AND revoked_at IS NULL', [user.id]);
    if (count && Number(count.total) >= 5) return reply.code(409).send({ error: 'API_KEY_LIMIT' });
    return reply.code(201).send(await createApiKey(db, user.id, project));
  });
  app.delete('/api/account/api-keys/:id', async (req, reply) => {
    const user = await requireIdentity(db, req, reply);
    if (!user) return;
    const id = (req.params as { id: string }).id;
    if (!/^[a-f\d-]{36}$/i.test(id)) return reply.code(400).send({ error: 'INVALID_API_KEY_ID' });
    await execute(db, 'UPDATE api_keys SET revoked_at=UTC_TIMESTAMP(3) WHERE id=? AND user_id=? AND revoked_at IS NULL',
      [id, user.id]);
    return { ok: true };
  });
}
