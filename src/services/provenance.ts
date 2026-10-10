import type { ProvenanceResult } from '../types/editor';

const C2PA_AI_SOURCE = /trainedAlgorithmicMedia|compositeSynthetic|algorithmicMedia|c2pa\.generated/i;

/** C2PA is a separate signal; absence of credentials does NOT prove an image is real. */
export async function inspectProvenance(file: File): Promise<ProvenanceResult> {
  try {
    const [{ createC2pa }, wasmModule] = await Promise.all([
      import('@contentauth/c2pa-web'),
      import('@contentauth/c2pa-web/resources/c2pa.wasm?url'),
    ]);
    const c2pa = await createC2pa({ wasmSrc: wasmModule.default });
    const reader = await c2pa.reader.fromBlob(file.type, file);
    if (!reader) return { status: 'none', message: '未发现可读取的 C2PA 内容凭证' };

    try {
      const store = await reader.manifestStore();
      if (!store || Object.keys(store).length === 0) {
        return { status: 'none', message: '未发现可读取的 C2PA 内容凭证' };
      }
      const containsAiDeclaration = C2PA_AI_SOURCE.test(JSON.stringify(store));
      return containsAiDeclaration
        ? { status: 'ai-declared', message: '发现 C2PA AI 来源声明（不等于已核验签名）' }
        : { status: 'c2pa', message: '发现 C2PA 来源凭证，请结合签名状态核验' };
    } finally {
      await reader.free();
    }
  } catch {
    return { status: 'unavailable', message: 'C2PA 未能读取；这不代表图片没有来源标识' };
  }
}
