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
        send({ type: 'progress', id, phase: 'download',
          progress: Math.max(0, Math.min(100, event.progress)) });
      }
    },
  });
}

let detectorPromise: ReturnType<typeof createDetector> | null = null;

scope.addEventListener('message', async (message: MessageEvent<ClassifierWorkerRequest>) => {
  if (message.data.type !== 'assess') return;
  const { id, file } = message.data;

  try {
    // The same single model stays resident until the tab closes; browser Cache API handles persisted weights.
    detectorPromise ??= createDetector(id).catch((error: unknown) => {
      detectorPromise = null;
      throw error;
    });
    const detector = await detectorPromise;
    send({ type: 'progress', id, phase: 'evaluate' });
    const image = await RawImage.fromBlob(file);
    const predictions = await detector(image, { top_k: 2 }) as Prediction[];
    send({ type: 'result', id, score: calculateRealityScore(predictions, 2) });
  } catch (error) {
    send({ type: 'error', id,
      message: error instanceof Error ? error.message : '本地模型推理失败，请重试。' });
  }
});
