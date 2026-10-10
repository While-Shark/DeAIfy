import { effectScope } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useExportReview } from './useExportReview';
import type { ExportFormat, ProcessingParams } from '../types/editor';

vi.mock('../services/provenance', () => ({
  inspectProvenance: vi.fn(async (file: File) => ({
    status: file.name.endsWith('-deaify.png') ? 'none' : 'ai-declared',
    message: file.name.endsWith('-deaify.png') ? 'Not detected' : 'Source AI declared',
  })),
}));

const params: ProcessingParams = {
  strength: 30, grain: 12, warmth: 2, saturation: 1, contrast: 0, softness: 0, texture: 0,
};
const originalProvenance = { status: 'ai-declared', message: 'Source AI declared' } as const;
const input = () => ({ file: new File(['source'], 'source.jpg', { type: 'image/jpeg' }),
  params: { ...params }, format: 'image/png' as ExportFormat, sourceScore: 42, sourceProvenance: originalProvenance });
const settled = () => new Promise<void>(resolve => setTimeout(resolve, 0));

afterEach(() => vi.unstubAllGlobals());

describe('export review gate', () => {
  it('scores the exact full-resolution blob that is later downloaded', async () => {
    const blob = new Blob(['final-image'], { type: 'image/png' });
    const render = vi.fn(async () => blob);
    const assess = vi.fn(async (_file: Blob) => 71);
    const href = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    let filename = '';
    vi.stubGlobal('document', {
      activeElement: null,
      createElement: () => ({ href: '', download: '', click() { filename = this.download; }, remove() {} }),
      body: { append: () => {} },
    });
    const scope = effectScope();
    const gate = scope.run(() => useExportReview(assess, render))!;
    gate.startExportReview(input());
    await settled();
    expect(gate.reviewStage.value).toBe('ready');
    expect(render).toHaveBeenCalledWith(expect.any(File), params, 'image/png', undefined, []);
    expect(assess).toHaveBeenCalledTimes(1);
    expect(assess.mock.calls[0][0].size).toBe(blob.size);
    expect(gate.reviewReport.value?.delta).toBe(29);
    expect(gate.reviewReport.value?.exportedProvenance.status).toBe('none');
    gate.confirmExportReview();
    expect(href).toHaveBeenCalledWith(blob);
    expect(filename).toBe('source-deaify.png');
    expect(render).toHaveBeenCalledTimes(1);
    scope.stop();
    href.mockRestore();
    revoke.mockRestore();
  });

  it('discards an obsolete render after the review is closed', async () => {
    let finish!: (blob: Blob) => void;
    const render = () => new Promise<Blob>(resolve => { finish = resolve; });
    const assess = vi.fn(async () => 79);
    const scope = effectScope();
    const gate = scope.run(() => useExportReview(assess, render))!;
    vi.stubGlobal('document', { activeElement: null });
    gate.startExportReview(input());
    expect(gate.reviewStage.value).toBe('rendering');
    gate.cancelReview();
    finish(new Blob(['stale'], { type: 'image/png' }));
    await settled();
    expect(gate.reviewStage.value).toBe('idle');
    expect(gate.reviewOpen.value).toBe(false);
    expect(gate.reviewReport.value).toBeNull();
    expect(assess).not.toHaveBeenCalled();
    scope.stop();
  });

  it('records a scoring failure instead of fabricating a score', async () => {
    vi.stubGlobal('document', { activeElement: null });
    const scope = effectScope();
    const gate = scope.run(() => useExportReview(async () => { throw new Error('Model offline'); },
      async () => new Blob(['ready'], { type: 'image/png' })))!;
    gate.startExportReview(input());
    await settled();
    expect(gate.reviewStage.value).toBe('ready');
    expect(gate.reviewReport.value?.exportedScore).toBeNull();
    expect(gate.reviewReport.value?.delta).toBeNull();
    expect(gate.reviewReport.value?.exportedError).toBe('Model offline');
    scope.stop();
  });
});
