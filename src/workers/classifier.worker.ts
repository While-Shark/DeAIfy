/// <reference lib="webworker" />
import { pipeline, RawImage } from '@huggingface/transformers';
import { calculateRealityScore } from '../engine/scoring';
import type { ClassifierWorkerRequest, ClassifierWorkerResponse, DetectorModel, Prediction } from '../types/editor';

const MODELS: Record<DetectorModel, { id: string; dtype: 'q8' | 'q4' }> = {
  primary: { id: 'onnx-community/ai-image-detect-distilled-ONNX', dtype: 'q8' },
  // Independent CIFAKE model, optional. Quantized weights download ~57 MB.
  secondary: { id: 'onnx-community/ai-image-detection-ONNX', dtype: 'q4' },
};
const scope = self as DedicatedWorkerGlobalScope;

function send(event: ClassifierWorkerResponse): void {
  scope.postMessage(event);
}

function createDetector(id: number, model: DetectorModel) {
  const spec = MODELS[model];
  return pipeline('image-classification', spec.id, {
    dtype: spec.dtype,
    device: 'wasm',
    progress_callback: (data) => {
      const event = data as { status?: string; progress?: number };
      if (event.status === 'progress' && typeof event.progress === 'number') {
        send({ type: 'progress', id, progress: Math.max(0, Math.min(100, event.progress)), phase: 'download' });
      }
    },
  });
}

const detectors: Partial<Record<DetectorModel, ReturnType<typeof createDetector>>> = {};

scope.addEventListener('message', async (message: MessageEvent<ClassifierWorkerRequest>) => {
  const { id, file, model = 'primary', precise = false } = message.data;
  if (message.data.type !== 'assess') return;

  try {
    // Reuse the same model for all local images. A failed load may be retried.
    if (!detectors[model]) {
      detectors[model] = createDetector(id, model).catch((error: unknown) => {
        delete detectors[model];
        throw error;
      });
    }
    const detector = await detectors[model]!;
    send({ type: 'progress', id, phase: 'evaluate' });
    const image = await RawImage.fromBlob(file);
    const rawPredictions = await detector(image, { top_k: 2 });
    const predictions = rawPredictions as Prediction[];
    const score = calculateRealityScore(predictions, precise ? 2 : 0);
    send({ type: 'result', id, score });
  } catch (error) {
    send({
      type: 'error', id,
      message: error instanceof Error ? error.message : '本地模型推理失败，请重试。',
    });
  }
});
