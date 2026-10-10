/// <reference lib="webworker" />
import { adjustPixels } from '../engine/pixels';
import type { ProcessorWorkerRequest, ProcessorWorkerResponse } from '../types/editor';

const scope = self as DedicatedWorkerGlobalScope;

scope.addEventListener('message', async (message: MessageEvent<ProcessorWorkerRequest>) => {
  const { id, file, params, maxSide, mime, quality } = message.data;
  let bitmap: ImageBitmap | null = null;

  try {
    if (typeof OffscreenCanvas === 'undefined') {
      throw new Error('当前浏览器不支持离屏图像处理，请使用新版 Chrome 或 Edge。');
    }
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const ratio = maxSide ? Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height)) : 1;
    const width = Math.max(1, Math.round(bitmap.width * ratio));
    const height = Math.max(1, Math.round(bitmap.height * ratio));
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('无法创建图像处理画布。');

    // JPEG has no alpha channel; make transparency explicitly white.
    if (mime === 'image/jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    const pixels = ctx.getImageData(0, 0, width, height);
    adjustPixels(pixels.data, width, height, params);
    ctx.putImageData(pixels, 0, 0);

    const blob = await canvas.convertToBlob({ type: mime, quality });
    const result: ProcessorWorkerResponse = { id, type: 'result', blob, width, height };
    scope.postMessage(result);
  } catch (error) {
    const result: ProcessorWorkerResponse = {
      id, type: 'error', message: error instanceof Error ? error.message : '本地图片处理失败。',
    };
    scope.postMessage(result);
  } finally {
    bitmap?.close();
  }
});
