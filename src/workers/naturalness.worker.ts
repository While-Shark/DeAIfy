/// <reference lib="webworker" />
import { analyzeNaturalness } from '../engine/naturalness';
import type { NaturalnessMetrics } from '../types/editor';

const scope = self as DedicatedWorkerGlobalScope;
type Request = { id: number; file: Blob };
type Response = { id: number; result?: NaturalnessMetrics; error?: string };
scope.addEventListener('message', async (message: MessageEvent<Request>) => {
  const { id, file } = message.data;
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 640 / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(3, Math.round(bitmap.width * scale));
    const height = Math.max(3, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Cannot create analysis canvas');
    ctx.drawImage(bitmap, 0, 0, width, height);
    const rgba = ctx.getImageData(0, 0, width, height).data;
    const response: Response = { id, result: analyzeNaturalness(rgba, width, height) };
    scope.postMessage(response);
  } catch (e) {
    const response: Response = { id, error: e instanceof Error ? e.message : '本地图像分析失败' };
    scope.postMessage(response);
  } finally { bitmap?.close(); }
});
