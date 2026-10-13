# DeAIfy

**Local-first image naturalization and multi-dimensional quality diagnostics.**

DeAIfy is a single, lightweight Vue 3 photo studio. In the default build, images remain in the browser. An **optional VPS-backed commercial deployment** adds authenticated server exports.

## What it does

### Developer Docs

- A **Docs** menu in the website header opens the shareable `/docs` integration guide (also available on local-only sites for reference).
- The Chinese guide covers API key creation, server-only credentials, multipart upload and authenticated download, error codes, credits, privacy and idempotency retries.
- A live preset selector generates all seven required API parameters for five styles and three intensity levels, with copyable cURL, Node.js and Python samples.
- The HTTP API requires a separately configured commercial VPS backend; Vercel's static site does not host API endpoints.

### v0.6.3 frontend bundle hardening

- Production JavaScript now applies **selective obfuscation and encoded string tables to DeAIfy-owned application chunks**, keeping Vue, Hugging Face/ONNX inference, C2PA and WASM out of costly or fragile transformations. Small first-party image and photo-quality Web Workers receive the same moderate protection, but the large classifier Worker is untouched. Development builds stay readable.
- Production source maps are disabled, and CI fails if original TypeScript, Vue source, Source Maps or certain private build artifacts are found in `dist/`.
- Public Vite environment names containing backend secrets (Xunhu credentials, MySQL passwords, processor tokens, SMTP/OTP secrets) are rejected during production compilation.
- A headless Chromium test uploads an image and exercises a preset and parameter slider against the real production bundle.
- **Important:** obfuscation is not encryption or a copy-proof license. All shipped browser scripts remain retrievable, and the existing public source code cannot be hidden retroactively. Credits, paid image generation, payment signatures and real secrets must stay controlled by the VPS.


### v0.6.2 guided VPS installation

- One interactive command configures managed **or existing MySQL**, validates HTTPS origins and access credentials, and starts the VPS containers.
- Optional SMTP + Turnstile registration and Xunhu merchant details can be entered without opening source files. **Paid checkout remains disabled until independently approved and tested.**
- Configuration is private (0600), secrets are generated on first run and reused on subsequent runs, and the wizard never deletes database volumes. It also creates a starter Nginx HTTPS proxy snippet without touching an existing port 443.
- Docker and real-MySQL CI verify repeated schema bootstrap and both database modes.

### v0.6.1 commercial hardening

- Rechecking an already generated export now **reuses the same finished image**; pressing “重新检测” no longer starts another paid VPS job.
- In VPS mode, the export report clearly tells users that completed processing has already consumed an allowance/credit. The report cannot be closed while a paid job is being generated/analyzed; completed jobs remain available for a limited time in Account → Orders.
- A temporary API outage no longer silently signs users out; wallet state is refreshed after failed processing.
- The VPS handler preserves a successfully finalized encrypted result if its response/credit-balance refresh fails, instead of deleting a paid file.
- Optional email password recovery is available behind `RECOVERY_ENABLED=false` by default. Codes are valid 10 minutes with at most five guesses; a successful reset invalidates all previous sessions. Registration OTP guessing is also limited in the database.
- Admins get simple usage and order statistics; reverse-proxy CIDRs are explicitly configured, with no untrusted forwarded-IP headers by default.
- **Upgrading an existing v0.6.0 MySQL database** requires `002-password-recovery.sql` and `003-email-code-attempts.sql` from `server/sql/migrations`; back up first, and never reinitialize the production database volume.


- **AI visual screening:** one browser-side ONNX classifier, 0–100 model score with a product threshold at 60. Outputs are **not** calibrated probabilities or provenance proof.
- **Four independent image-quality indicators:** exposure, saturation balance, texture variation, and edge intensity, plus a heuristic composite index. These are about image characteristics—not whether an image is AI-generated.
- **Five one-click editing presets:** Natural, Portrait, Film, Documentary and Soft Light, each with Low / Medium / High intensity. Medium preserves the original look; moving a fine-tuning slider switches to a remembered Custom mode.
- **External project HTTP API (optional VPS mode):** create/revoke backend-only API keys in Account → API 密钥 and use the existing metered process/download endpoints. See [HTTP integration instructions](docs/external-http-api.md). MCP can be layered on top later.
- **Manual recheck:** after editing, press 检测当前处理效果 to re-run visual screening and compare all four quality dimensions. Changing sliders does not trigger a model inference.
- **Full-resolution export review:** the exact file that will be downloaded is scored and analyzed against the source; C2PA is checked separately. Confirm the export after reviewing results.
- **Default mode:** browser-only; no image uploads or accounts. Uses OffscreenCanvas, Web Workers and a quantized ONNX model.
- **Opt-in commercial mode (infrastructure required):** local previews plus authenticated VPS full-resolution export; secure image decoding, five free uses/day, credits, dynamic plans/discounts and optional Xunhu integration. Never activates live payments without a reviewed merchant configuration.

## Run locally

Requirements: Node.js 22.12+ and npm.

For local API + MySQL + Sharp Worker, run the safe PowerShell setup script:

~~~powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\init-local-env.ps1
~~~

This creates Git-ignored .env.commercial.local (random local secrets) and .env.development.local (public API URL), leaving any existing files unchanged. Start the services using docker-compose.commercial.yml and docker-compose.local.yml. Production has its own non-secret reference templates in config/ and independent VPS secrets generated by scripts/setup.sh. See [local & production configurations](docs/environments.md).

1. Run `npm install`.
2. Run `npm run dev`.
3. Run `npm run typecheck`, `npm test` and `npm run build` before merging.

## Deploy

Build command: `npm run build` · Output: `dist` · Framework: Vite.
The repository is connected to Vercel; production deployments come from `master`.

## One-command VPS setup (optional)

On a VPS with Docker Engine and Docker Compose V2:

```bash
git clone https://github.com/While-Shark/DeAIfy.git
cd DeAIfy
bash scripts/setup.sh
```

The interactive installer asks for your HTTPS API origin, bundled vs. existing MySQL host/credentials, optional SMTP/Turnstile, and optional Xunhu merchant information. It generates encryption secrets, checks Compose, bootstraps the schema, starts the isolated API/processor and can initialize an admin account. Re-running keeps the existing database and secrets. **Live payments stay disabled by default**. See [step-by-step VPS setup](docs/commercial-deployment.md) and use `bash scripts/setup.sh --check` to inspect status without showing secrets.

## Commercial VPS mode (optional; not yet configured on production)

The repository now includes a Fastify + MySQL commercial backend and Docker-isolated Sharp image processor. When `VITE_COMMERCIAL_API_URL` is **not** set, the original local-only Vercel experience remains unchanged; the website does **not** collect payments.

- Accounts require SMTP email verification, Turnstile, and an administrator-created bootstrap account.
- Each account receives **five free successful high-resolution exports per Beijing calendar day**, then spends one purchased credit per successful export. Retries and asynchronous payment callbacks use idempotency checks backed by MySQL transactions.
- Administrators can add or edit tiered prices, time-limited discount percentages, bonus credits, and availability; previous orders keep frozen price/credit snapshots.
- Xunhu API v1.1 checkout and callback signature handling are included, but `PAYMENTS_ENABLED=false`, `REGISTRATION_ENABLED=false` and `MERCHANT_APPROVED=false` by default. Official merchant onboarding and live callback tests are still required.
- Original uploads are passed to a restricted VPS image processor only for a **user-confirmed server export**, never for merely browsing or adjusting the local preview. Encrypted temporary exports expire after about 30 minutes.
- This repository is public: **existing client image algorithms and copies included in public source code are not trade secrets**. Billing protects hosted services and new private server-only capabilities, not historical open-source code.
- Full deployment and operations checklist: [docs/commercial-deployment.md](docs/commercial-deployment.md). Do not make the API public before staging E2E tests, secure DNS/TLS, recovery flows, and merchant approval.

## Understanding the scores

**AI 初筛:** the classifier compares `real` and `fake` labels and displays a 0–100 score to two decimals. Under 60 means *suspected AI* by that model only. This detector has not been validated for current Gemini / Nano Banana generations. Its outcome is not the probability the image is genuine.

**画质评分:** the four 0–100 values are explainable, hand-tuned heuristics for image characteristics. Their weighted index is an uncalibrated *image-quality reference*, not a judge of style, aesthetics, AI origin or platform labeling. Intentionally dark photographs, smooth backgrounds, and artistic editing can receive low values. Compare the same image before/after; do not use the index to compare unrelated scenes.

**C2PA:** credential inspection is separate from both scores. Re-encoding may invalidate or omit source credentials. Missing C2PA does not prove a photograph is real, and SynthID is not detected. DeAIfy does not guarantee any social platform's AI labels will change; disclose synthetic media where required.

Model weights may be cached in the browser's Cache API; cache availability and persistence depend on browser settings. Recommended: recent Chrome/Edge. File limit: 25 MB and 30 million pixels.

## 简体中文

DeAIfy 现已恢复为**单一图片工作台**，不再提供基础/高级切换或额外工具 Tab。保留原来的五套一键预设、手动复测、原图对比和导出前确认。

新增**多维度画质评分**：曝光层次、色彩平衡、纹理细节和边缘控制。原图自动分析，处理后的预览图需点击“检测当前处理效果”才重新分析。导出时会再次检查实际高清文件并显示前后变化。

可选 VPS 商业化模式新增账户、每日 5 次免费额度、积分充值套餐、后台折扣管理与安全图片处理。该模式必须由管理员部署并配置 API 域名，当前未提供正式支付。未启用 VPS 配置时，网站仍保持本地处理功能。

**重要：** AI 视觉初筛、画质参考评分、C2PA 来源凭证是三个独立维度。评分提升不等于图片真实来源改变，也不能证明社交平台不会添加 AI 标签。

## License

MIT. Dependencies and AI models retain their own licenses.
