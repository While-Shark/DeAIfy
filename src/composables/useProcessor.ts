import { onScopeDispose } from 'vue';
import type { ExportFormat, ProcessingParams, ProcessorWorkerRequest, ProcessorWorkerResponse } from '../types/editor';

interface PendingJob {
  resolve: (blob: Blob) => void;
  reject: (error: Error) => void;
}

export function useProcessor() {
  let worker: Worker | null = null;
  let nextId = 0;
  const pending = new Map<number, PendingJob>();

  function getWorker(): Worker {
    if (worker) return worker;
    worker = new Worker(new URL('../workers/image.worker.ts', import.meta.url), { type: 'module' });
    worker.addEventListener('message', (message: MessageEvent<ProcessorWorkerResponse>) => {
      const event = message.data;
      const job = pending.get(event.id);
      if (!job) return;
      pending.delete(event.id);
      if (event.type === 'result') job.resolve(event.blob);
      else job.reject(new Error(event.message));
    });
    worker.addEventListener('error', () => {
      for (const job of pending.values()) job.reject(new Error('图像处理 Worker 启动失败。'));
      pending.clear();
      worker?.terminate();
      worker = null;
    });
    return worker;
  }

  function render(file: Blob, params: ProcessingParams, mime: ExportFormat, maxSide?: number): Promise<Blob> {
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      const event: ProcessorWorkerRequest = { id, file, params, maxSide, mime, quality: 0.94 };
      try { getWorker().postMessage(event); }
      catch (error) { pending.delete(id); reject(error); }
    });
  }

  onScopeDispose(() => {
    pending.forEach((job) => job.reject(new Error('处理任务已取消。')));
    pending.clear();
    worker?.terminate();
    worker = null;
  });
  return { render };
}
