/// <reference lib="webworker" />
import { pipeline, RawImage } from '@huggingface/transformers';
import { calculateRealityScore } from '../engine/scoring';
import type { ClassifierWorkerRequest, ClassifierWorkerResponse, Prediction } from '../types/editor';

const MODEL_ID = 'onnx-community/ai-image-detect-distilled-ONNX';
const scope = self as DedicatedWorkerGlobalScope;

function send(event: ClassifierWorkerResponse): void {
  scope.postMessage(event);
}

function createDetector(id: number) {
  return pipeline('image-classification', MODEL_ID, {
    dtype: 'q8',
    device: 'wasm',
    progress_callback: (data) => {
      const event = data as { status?: string; progress?: number };
      if (event.status === 'progress' && typeof event.progress === 'number') {
        send({ type: 'progress', id, progress: Math.max(0, Math.min(100, event.progress)), phase: 'download' });
      }
    },
  });
}

let detectorPromise: ReturnType<typeof createDetector> | null = null;

scope.addEventListener('message', async (message: MessageEvent<ClassifierWorkerRequest>) => {
  const { id, file } = message.data;
  if (message.data.type !== 'assess') return;

  try {
    // Reuse the same model for all local images. A failed load may be retried.
    detectorPromise ??= createDetector(id).catch((error: unknown) => {
      detectorPromise = null;
      throw error;
    });
    const detector = await detectorPromise;
    send({ type: 'progress', id, phase: 'evaluate' });
    const image = await RawImage.fromBlob(file);
    const rawPredictions = await detector(image, { top_k: 2 });
    const predictions = rawPredictions as Prediction[];
    const score = calculateRealityScore(predictions);
    send({ type: 'result', id, score });
  } catch (error) {
    send({
      type: 'error', id,
      message: error instanceof Error ? error.message : '本地模型推理失败，请重试。',
    });
  }
});
