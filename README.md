# DeAIfy

**Local-first image naturalization and multi-dimensional quality diagnostics.**

DeAIfy is a single, lightweight Vue 3 photo studio. Images stay in the browser.

## What it does

- **AI visual screening:** one browser-side ONNX classifier, 0–100 model score with a product threshold at 60. Outputs are **not** calibrated probabilities or provenance proof.
- **Four independent image-quality indicators:** exposure, saturation balance, texture variation, and edge intensity, plus a heuristic composite index. These are about image characteristics—not whether an image is AI-generated.
- **Five one-click editing presets:** Natural, Portrait, Film, Documentary and Soft Light. Tune seven image parameters manually if preferred.
- **Manual recheck:** after editing, press 检测当前处理效果 to re-run visual screening and compare all four quality dimensions. Changing sliders does not trigger a model inference.
- **Full-resolution export review:** the exact file that will be downloaded is scored and analyzed against the source; C2PA is checked separately. Confirm the export after reviewing results.
- **Privacy:** no server-side image uploads, database, GPU server, accounts, or API keys. Uses OffscreenCanvas, Web Workers and a small quantized ONNX model.

## Run locally

Requirements: Node.js 22.12+ and npm.

1. Run `npm install`.
2. Run `npm run dev`.
3. Run `npm run typecheck`, `npm test` and `npm run build` before merging.

## Deploy

Build command: `npm run build` · Output: `dist` · Framework: Vite.
The repository is connected to Vercel; production deployments come from `master`.

## Understanding the scores

**AI 初筛:** the classifier compares `real` and `fake` labels and displays a 0–100 score to two decimals. Under 60 means *suspected AI* by that model only. This detector has not been validated for current Gemini / Nano Banana generations. Its outcome is not the probability the image is genuine.

**画质评分:** the four 0–100 values are explainable, hand-tuned heuristics for image characteristics. Their weighted index is an uncalibrated *image-quality reference*, not a judge of style, aesthetics, AI origin or platform labeling. Intentionally dark photographs, smooth backgrounds, and artistic editing can receive low values. Compare the same image before/after; do not use the index to compare unrelated scenes.

**C2PA:** credential inspection is separate from both scores. Re-encoding may invalidate or omit source credentials. Missing C2PA does not prove a photograph is real, and SynthID is not detected. DeAIfy does not guarantee any social platform's AI labels will change; disclose synthetic media where required.

Model weights may be cached in the browser's Cache API; cache availability and persistence depend on browser settings. Recommended: recent Chrome/Edge. File limit: 25 MB and 30 million pixels.

## 简体中文

DeAIfy 现已恢复为**单一图片工作台**，不再提供基础/高级切换或额外工具 Tab。保留原来的五套一键预设、手动复测、原图对比和导出前确认。

新增**多维度画质评分**：曝光层次、色彩平衡、纹理细节和边缘控制。原图自动分析，处理后的预览图需点击“检测当前处理效果”才重新分析。导出时会再次检查实际高清文件并显示前后变化。

**重要：** AI 视觉初筛、画质参考评分、C2PA 来源凭证是三个独立维度。评分提升不等于图片真实来源改变，也不能证明社交平台不会添加 AI 标签。

## License

MIT. Dependencies and AI models retain their own licenses.
