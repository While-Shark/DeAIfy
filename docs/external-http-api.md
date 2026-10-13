# DeAIfy HTTP API v1 (self-hosted VPS)

HTTP REST is the canonical integration for Node, Java, Python, and automation tools. An MCP server, if added later, should call these same endpoints rather than duplicate image processing.

## Security & deployment

1. Deploy the commercial Fastify API and isolated Sharp worker via the existing VPS instructions. Never publish the worker's internal port or shared token.
2. **Upgrading an existing database:** back up MySQL and execute `server/sql/migrations/004-external-api-keys.sql` before enabling API keys. Fresh installs include the table in `server/sql/schema.sql`.
3. Authenticate as a user to create a project-labelled API key. Store it in the **calling backend's secret manager only**; never embed it in browser JS. The token is returned once, stored as SHA-256 on the server, and can be revoked.
4. Per-user billing rules and processing limits are identical to web exports. One successful full-resolution image uses one daily free allowance or credit; failures are reversed. Image bytes are sent to **your configured VPS**, never to a third-party model.

## Account management (login session token only)

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/account/api-keys` | JSON `{"project":"IdeaWeave"}` creates a new key; returns `{id,project,token}` exactly once |
| `GET` | `/api/account/api-keys` | List projects, key IDs and revoke state (never key secret) |
| `DELETE` | `/api/account/api-keys/{id}` | Revoke an API key immediately |

Each account is limited to five active keys; key generation is rate-limited to four attempts per hour per caller. Keys share their owning account's credit balance and processing history. **The project name is an identification label, not a separate tenant boundary:** for now, use separate accounts if projects require fully isolated assets or billing.

## Image processing

Send `POST /api/process` as `multipart/form-data`:

| Field / header | Value |
| --- | --- |
| `Authorization` | `Bearer dak_<64 hexadecimal characters>` |
| `Idempotency-Key` | Unique, 16–80 ASCII alphanumeric, underscore or hyphen characters per job |
| `image` | JPEG, PNG or WebP (max 25 MiB; max 30 million pixels) |
| `params` | JSON object with all seven validated fields |
| `format` | `image/png`, `image/jpeg` or `image/webp` |

Use the same `params` produced by the web preset calculator. For example, the current **natural / medium** preset:

```json
{"strength":70,"grain":18,"warmth":3,"saturation":-8,"contrast":-4,"softness":8,"texture":10}
```

Response: HTTP 201 with `jobId`, relative `downloadUrl`, `wallet` and `retentionMinutes`. Call `GET /api/jobs/{jobId}/download` using the **same API key**; downloads are private and expire after about 30 minutes. Retry ambiguous jobs using the **same** idempotency key; never automatically switch to a new key after a timeout, which could double-charge.

```bash
curl -fS -X POST 'https://your-api.example/api/process' \
  -H 'Authorization: Bearer dak_YOUR_PRIVATE_TOKEN' \
  -H 'Idempotency-Key: projectA_job_1234567890123' \
  -F 'image=@sample.jpg;type=image/jpeg' \
  -F 'params={"strength":70,"grain":18,"warmth":3,"saturation":-8,"contrast":-4,"softness":8,"texture":10}' \
  -F 'format=image/jpeg'
```

Common errors: 401 `API_KEY_INVALID`, 400 `IDEMPOTENCY_KEY_REQUIRED`, 402 `NO_CREDITS`, 409 `JOB_IN_PROGRESS`, 410 `RESULT_EXPIRED`, 422 `INVALID_IMAGE_OR_PARAMS` or `PROCESSING_FAILED_AND_QUOTA_REFUNDED`, 429 `RATE_LIMIT_EXCEEDED`. Do not treat a 503 response as proof that a processing charge was reversed: check job history or retry with the same idempotency key.

## Next iteration

Add an account dashboard for key creation/revocation, per-project usage logs and credit ledger attribution, and an optional server-side `preset + level` contract with a versioned shared preset registry. In this first version, clients submit validated numeric params so the existing processor stays compatible. Add a thin MCP adapter only when AI agents need tool discovery/calling. Browser-only integrations should use the local Worker/SDK instead of embedding server API keys.

**Scope disclaimer:** DeAIfy adjusts image appearance; it does not guarantee removal of visible/invisible provenance, SynthID watermarks, or platform AI labeling. Do not misrepresent synthetic images as authentic.
