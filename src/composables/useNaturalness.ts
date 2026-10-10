import { onScopeDispose } from 'vue';
import type { NaturalnessMetrics } from '../types/editor';

type Result = { id: number; result?: NaturalnessMetrics; error?: string };
export function useNaturalness() {
  let worker: Worker | null = null;
  let nextId = 0;
  const pending = new Map<number, { resolve: (r: NaturalnessMetrics) => void; reject: (e: Error) => void }>();
  function ensureWorker(): Worker {
    if (worker) return worker;
    worker = new Worker(new URL('../workers/naturalness.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<Result>) => {
      const response = event.data;
      const item = pending.get(response.id);
      if (!item) return;
      pending.delete(response.id);
      if (response.error || !response.result) item.reject(new Error(response.error || 'Analysis unavailable'));
      else item.resolve(response.result);
    };
    worker.onerror = () => {
      for (const task of pending.values()) task.reject(new Error('图像分析 Worker 出错'));
      pending.clear();
      worker?.terminate();
      worker = null;
    };
    return worker;
  }
  function analyze(file: Blob): Promise<NaturalnessMetrics> {
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      try { ensureWorker().postMessage({ id, file }); }
      catch (e) { pending.delete(id); reject(e); }
    });
  }
  onScopeDispose(() => {
    for (const task of pending.values()) task.reject(new Error('分析任务已取消'));
    pending.clear();
    worker?.terminate();
    worker = null;
  });
  return { analyze };
}
