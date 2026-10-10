import { onScopeDispose } from 'vue';
import type { ClassifierWorkerRequest, ClassifierWorkerResponse, DetectorModel } from '../types/editor';

interface Job {
  resolve: (score: number) => void;
  reject: (error: Error) => void;
  onProgress?: (event: Extract<ClassifierWorkerResponse, { type: 'progress' }>) => void;
}

export function useClassifier() {
  let worker: Worker | null = null;
  let nextId = 0;
  const pending = new Map<number, Job>();

  function getWorker(): Worker {
    if (worker) return worker;
    worker = new Worker(new URL('../workers/classifier.worker.ts', import.meta.url), { type: 'module' });
    worker.addEventListener('message', (message: MessageEvent<ClassifierWorkerResponse>) => {
      const event = message.data;
      const job = pending.get(event.id);
      if (!job) return;
      if (event.type === 'progress') {
        job.onProgress?.(event);
      } else {
        pending.delete(event.id);
        if (event.type === 'result') job.resolve(event.score);
        else job.reject(new Error(event.message));
      }
    });
    worker.addEventListener('error', () => {
      for (const job of pending.values()) job.reject(new Error('检测 Worker 启动失败，请刷新页面重试。'));
      pending.clear();
      worker?.terminate();
      worker = null;
    });
    return worker;
  }

  function assessModel(file: Blob, model: DetectorModel = 'primary', precise = false, onProgress?: Job['onProgress']): Promise<number> {
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject, onProgress });
      const event: ClassifierWorkerRequest = { type: 'assess', id, file, model, precise };
      try { getWorker().postMessage(event); }
      catch (error) { pending.delete(id); reject(error); }
    });
  }

  function assess(file: Blob, onProgress?: Job['onProgress']): Promise<number> {
    return assessModel(file, 'primary', false, onProgress);
  }

  onScopeDispose(() => {
    pending.forEach((job) => job.reject(new Error('检测任务已取消。')));
    pending.clear();
    worker?.terminate();
    worker = null;
  });

  return { assess, assessModel };
}
