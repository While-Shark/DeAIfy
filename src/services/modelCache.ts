export interface ModelCacheInfo {
  available: boolean;
  caches: { name: string; entries: number }[];
  usage: number | null;
  quota: number | null;
  persisted: boolean | null;
}
const isModelCache = (name: string) => /transformers|huggingface|onnx/i.test(name);

export async function inspectModelCache(): Promise<ModelCacheInfo> {
  const available = typeof caches !== 'undefined';
  const names = available ? (await caches.keys()).filter(isModelCache) : [];
  const matching = await Promise.all(names.map(async name => ({ name, entries: (await (await caches.open(name)).keys()).length })));
  const estimate = await navigator.storage?.estimate?.();
  const persisted = await navigator.storage?.persisted?.();
  return {
    available, caches: matching,
    usage: estimate?.usage ?? null,
    quota: estimate?.quota ?? null,
    persisted: typeof persisted === 'boolean' ? persisted : null,
  };
}
export async function requestPersistentStorage(): Promise<boolean> {
  return (await navigator.storage?.persist?.()) ?? false;
}
export async function clearModelCaches(): Promise<number> {
  if (typeof caches === 'undefined') return 0;
  const names = (await caches.keys()).filter(isModelCache);
  let removed = 0;
  for (const name of names) if (await caches.delete(name)) removed++;
  return removed;
}
