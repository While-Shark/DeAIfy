# DeAIfy

**Make AI images feel more natural.** A private, local-first image studio built with Vue 3 and browser-side WebAssembly.

DeAIfy lets you upload a JPG/PNG/WebP image, receive a **preliminary 0–100 reality score** from a locally-running ONNX classifier, adjust its photographic texture with presets, compare before/after, and export at the original resolution. Images are **not uploaded to the DeAIfy server**.

> **Important:** The score is an uncalibrated output of a fallible classifier — **not** the probability an image is genuine. A score under 60 is labeled *suspected AI*; 60+ means only that the image passes this model's initial screening. This doesn't verify provenance or predict X's *Made with AI* labeling.

## Features

- **Real browser AI inference:** Transformers.js + 8-bit ONNX ViT, run in a Web Worker. No fake/demo scores.
- **60-point threshold:** model-derived numeric result and honest failure states.
- **Separate C2PA check:** locally inspect Content Credentials. No credentials ≠ genuine photography; a signed claim and a visual score are separate signals.
- **5 one-click presets:** Natural, Portrait, Film, Documentary, Soft Light. Choose a preset to instantly refresh the preview, then **manually run a preview score** from the presets panel; changing settings never automatically triggers scoring. Fine-tune grain, softness, texture, warmth, contrast, saturation, and blend strength.
- **Compare & export:** drag the before/after divider; review original-versus-final score and C2PA before confirming full-resolution PNG, JPEG, or WebP export. The final file is scored once and downloaded unchanged.
- **No backend or database:** works as a static site. The ML model and C2PA WASM are downloaded by the browser when needed.

## Presets & on-demand preview scoring (v0.1.2)

Five built-in styles are applied with one click: **Natural**, **Portrait**, **Film**, **Documentary**, and **Soft Light**. Applying a preset or moving a slider changes the preview only; it does **not** start a second model inference. When the preview is ready, choose **检测当前处理效果** in the presets panel to manually rescore it. Any later edit clears the previous preview score so it cannot be mistaken for the new result. The full-resolution export review remains automatic **only after** clicking **检测并导出**.

The favicon is available at `/favicon.svg` and used in browser tabs.

## Export-time verification (v0.1.1)

The **Check & Export** button renders the actual, full-resolution export in the
selected PNG/JPEG/WebP format, then automatically analyzes **those exact bytes**.
A confirmation dialog compares the original and final image model scores and
separately displays the C2PA credential inspection results. The delta is a
model-output difference, **not** a calibrated change in probability or evidence
that synthetic content became genuine photography.

The confirmation download reuses the already-inspected Blob rather than
re-encoding it. Cancel or retry to generate a new candidate. Changing image,
parameters, or export format invalidates the pending review. If the model cannot
score an image, the dialog reports an unavailable score and requires the user
to explicitly confirm an incomplete review. Image rendering failures cannot be
confirmed for download.

**C2PA / SynthID:** Canvas encoding may remove or invalidate original C2PA
claims. Absence of C2PA does not mean an image is authentic; SynthID is not
inspected, and platform labeling remains independent of this report.

## Quick start

Requirements: Node.js 22.12+ and npm.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. For checks:

```bash
npm run typecheck
npm test
npm run build
npm run preview
```

### Deploy to Vercel

Import this GitHub repository as a Vite project. Build command: `npm run build`; output: `dist` (also defined in `vercel.json`). The app can run as a static deployment; there are no secrets or API keys.

## How the score works

Model: [`onnx-community/ai-image-detect-distilled-ONNX`](https://huggingface.co/onnx-community/ai-image-detect-distilled-ONNX), 8-bit variant (`q8`, approximately 15 MB), licensed MIT. Its labels are `real` and `fake`. The displayed score is `round(100 × real / (real + fake))` and the product threshold is 60.

The model was trained on datasets involving older versions of Midjourney and Stable Diffusion and has **not been validated against current Gemini / Nano Banana generations**. Real photos can score poorly, and AI-generated images can score highly. Benchmark the threshold on a representative labeled dataset before making strong claims. If model download or inference fails, DeAIfy shows an error — never a placeholder score. The first model load requires a network connection; after that, model caching depends on browser settings.

C2PA inspection uses [`@contentauth/c2pa-web`](https://github.com/contentauth/c2pa-js). It is separate from classification. **SynthID is not inspected** by this project. Content Credentials might be absent, incomplete, or invalid; only a dedicated trust verification can establish validity.

## Privacy and provenance

- Images stay in browser memory. The app does not POST them to a server.
- Browser requests to Hugging Face download public model files; your browser may contact that host. The original image is **not** sent with those requests.
- Re-encoding an image through Canvas generally does not preserve original EXIF / C2PA credentials. **Keep your source files** and disclose AI origins when required. DeAIfy is not a provenance-erasure guarantee or a way to prove synthetic media is authentic.
- Limit per file: 25 MB / 30 megapixels, to protect local memory.
- Some older browsers may lack OffscreenCanvas. Chrome/Edge current versions are recommended.

## Tech stack

Vue 3 · TypeScript · Vite · Transformers.js · ONNX Runtime Web · Web Workers · OffscreenCanvas · C2PA Web. No backend. Tests use Vitest.

## 简体中文

DeAIfy 是一个**图片本地处理**的轻量化网页工作台：上传图片后自动运行真实的 ONNX 模型，给出 0–100 分初筛结果。**低于 60 分显示“疑似 AI 生成”**，60 分及以上仅表示通过该模型的初筛，不代表一定是真实照片。

支持自然摄影、真实人像、胶片、纪实、清透日常 **5 套一键预设**。方案应用后可手动触发预览图评分，不会自动评分；导出前会自动复检实际高清文件并展示前后分数与 C2PA 差异，确认后下载同一份文件。支持前后对比和原始分辨率导出。图片不会被上传到项目后端，但首次运行需要从 Hugging Face 下载模型。额外检查 C2PA 凭证，与视觉评分独立；暂不支持 SynthID 检测。

```bash
npm install && npm run dev
```

**这不是 AI 来源鉴定工具：** 无论处理后评分如何变化，都不应据此声称图片来自真实拍摄。

## License

MIT. Model and dependencies have their own respective licenses. Contributions welcome.

## Studio Modes (v0.4)

**Basic (default):** Preserves the original v0.1.2 experience: five presets, manual re-scoring and export verification. Uses only the existing ~15 MB quantized classifier. Does not download the second model.

**Advanced (optional):** Switch from the tab above the editor. All processing is on the user's device:

- **Two independent image classifiers:** primary ONNX ViT (`ai-image-detect-distilled-ONNX`, q8) and optional `onnx-community/ai-image-detection-ONNX` (q4, approx. 57 MB), trained primarily on older generators. Advanced results use two decimal places and list **independent outputs**; there is no misleading ensemble-confidence number. Selecting Advanced does not trigger the optional download; enabling the checkbox and starting analysis does.
- **Naturalness / texture diagnostics:** lightweight OffscreenCanvas Web Worker with clipped highlight/shadow, saturation, spatial variation and edge checks. This is a *heuristic image-quality indicator*, not AI provenance detection and not a probability of genuine photography. Scores should only be compared on similar images.
- **Local brush:** lighten, darken, warm and detail adjustments on the actual image coordinates (correctly mapped through object-fit/letterboxing), with radius/intensity, undo and clear. Edits are applied both in preview and to the exact full-resolution exported image. Switching to Basic does not apply brush effects, but retains the strokes until you reset or upload another image.
- **User-labeled benchmark:** import known-real or known-AI examples, then run the detector(s). Store **only filename, category, score, timestamp** in local IndexedDB; never store image bytes. Get accuracy / false-positive and false-negative rates against user-provided labels, download JSON, or clear records. Small/one-class sample sets do not establish general accuracy or calibrate the 60-point threshold.
- **Model cache manager:** browser Cache Storage inspection, usage estimate, persistent storage request, and explicit cache removal. Browsers can still evict cached models; some caches live under the HTTP cache and are not directly enumerable. No server database or GPU service is used.

> Neither model has been verified for the latest Gemini/Nano Banana generations. Source C2PA and X platform labels are still separate from visual detector scores. DeAIfy makes no guarantee that changes prevent social-platform AI labeling. Preserve originals and disclose synthetic origin as appropriate.

Advanced tools lazy-load when clicked. Large images and multiple models can use substantial device memory; on mobile, consider leaving secondary detection disabled.
