import { effectScope } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useExportReview } from './useExportReview';
import type { ExportFormat, NaturalnessMetrics, ProcessingParams } from '../types/editor';

vi.mock('../services/provenance', () => ({
  inspectProvenance: vi.fn(async (file: File) => ({
    status: file.name.endsWith('-deaify.png') ? 'none' : 'ai-declared',
    message: file.name.endsWith('-deaify.png') ? 'Not detected' : 'Source AI declared',
  })),
}));

const params: ProcessingParams = {
  strength: 30, grain: 12, warmth: 2, saturation: 1, contrast: 0, softness: 0, texture: 0,
};
const fakeQuality: NaturalnessMetrics = {
  index: 84, clippedPercent: 1, averageSaturation: 25, textureIndex: 30, edgeRatio: 9,
  dimensions: { exposure: 99, color: 100, texture: 90, edges: 95 }, notes: ['Sample'],
};
const sourceProvenance = { status: 'ai-declared', message: 'Source AI declared' } as const;
const input = () => ({
  file: new File(['source'], 'source.jpg', { type: 'image/jpeg' }),
  params: { ...params }, format: 'image/png' as ExportFormat,
  sourceScore: 42, sourceProvenance,
});
const settled = () => new Promise<void>(resolve => setTimeout(resolve, 0));

afterEach(() => vi.unstubAllGlobals());

describe('export review gate', () => {
  it('scores and analyzes the exact final blob later downloaded without re-encoding', async () => {
    const blob = new Blob(['final-image'], { type: 'image/png' });
    const render = vi.fn(async () => blob);
    const assess = vi.fn(async (_file: Blob) => 71.32);
    const analyze = vi.fn(async (_file: Blob) => fakeQuality);
    const href = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    let filename = '';
    vi.stubGlobal('document', {
      activeElement: null,
      createElement: () => ({ href: '', download: '', click() { filename = this.download; }, remove() {} }),
      body: { append: () => {} },
    });
    const scope = effectScope();
    const gate = scope.run(() => useExportReview(assess, render, analyze))!;
    gate.startExportReview(input());
    await settled();
    expect(gate.reviewStage.value).toBe('ready');
    expect(render).toHaveBeenCalledWith(expect.any(File), params, 'image/png');
    expect(assess).toHaveBeenCalledTimes(1);
    expect(analyze).toHaveBeenCalledTimes(2);
    expect(assess.mock.calls[0][0].size).toBe(blob.size);
    expect(analyze.mock.calls[1][0].size).toBe(blob.size);
    expect(gate.reviewReport.value?.delta).toBe(29.32);
    expect(gate.reviewReport.value?.originalQuality?.index).toBe(84);
    expect(gate.reviewReport.value?.exportedQuality?.dimensions.texture).toBe(90);
    gate.confirmExportReview();
    expect(href).toHaveBeenCalledWith(blob);
    expect(filename).toBe('source-deaify.png');
    expect(render).toHaveBeenCalledTimes(1);
    scope.stop();
    href.mockRestore();
    revoke.mockRestore();
  });


  it('rechecks a paid export without calling the expensive render step again', async () => {
    vi.stubGlobal('document', { activeElement: null });
    const image = new Blob(['paid-image'], { type: 'image/png' });
    const render = vi.fn(async () => image);
    const assess = vi.fn()
      .mockResolvedValueOnce(71.23)
      .mockResolvedValueOnce(72.34);
    const analyze = vi.fn(async () => fakeQuality);
    const scope = effectScope();
    const gate = scope.run(() => useExportReview(assess, render, analyze))!;

    gate.startExportReview(input());
    await settled();
    expect(gate.reviewStage.value).toBe('ready');
    expect(gate.reviewReport.value?.exportedScore).toBe(71.23);
    gate.retryExportReview();
    await settled();

    expect(gate.reviewStage.value).toBe('ready');
    expect(gate.reviewReport.value?.exportedScore).toBe(72.34);
    expect(render).toHaveBeenCalledTimes(1);
    expect(assess).toHaveBeenCalledTimes(2);
    expect(analyze).toHaveBeenCalledTimes(4);
    expect(assess.mock.calls[0]![0].size).toBe(image.size);
    expect(assess.mock.calls[1]![0].size).toBe(image.size);
    scope.stop();
  });

  it('retries rendering only if no output file was ever created', async () => {
    vi.stubGlobal('document', { activeElement: null });
    const render = vi.fn().mockRejectedValueOnce(new Error('temporary VPS timeout'))
      .mockResolvedValueOnce(new Blob(['retry-success'], { type: 'image/png' }));
    const scope = effectScope();
    const gate = scope.run(() => useExportReview(
      async () => 64, render, async () => fakeQuality,
    ))!;
    gate.startExportReview(input());
    await settled();
    expect(gate.reviewStage.value).toBe('error');
    gate.retryExportReview();
    await settled();
    expect(render).toHaveBeenCalledTimes(2);
    expect(gate.reviewStage.value).toBe('ready');
    scope.stop();
  });

  it('discards an obsolete result after cancellation', async () => {
    let finish!: (blob: Blob) => void;
    const render = () => new Promise<Blob>(resolve => { finish = resolve; });
    vi.stubGlobal('document', { activeElement: null });
    const assess = vi.fn(async () => 79);
    const analyze = vi.fn(async () => fakeQuality);
    const scope = effectScope();
    const gate = scope.run(() => useExportReview(assess, render, analyze))!;
    gate.startExportReview(input());
    gate.cancelReview();
    finish(new Blob(['stale'], { type: 'image/png' }));
    await settled();
    expect(gate.reviewStage.value).toBe('idle');
    expect(gate.reviewReport.value).toBeNull();
    expect(assess).not.toHaveBeenCalled();
    expect(analyze).not.toHaveBeenCalled();
    scope.stop();
  });

  it('shows independent failures instead of fabricated score values', async () => {
    vi.stubGlobal('document', { activeElement: null });
    const scope = effectScope();
    const gate = scope.run(() => useExportReview(
      async () => { throw new Error('Model offline'); },
      async () => new Blob(['ready'], { type: 'image/png' }),
      async () => { throw new Error('Canvas unavailable'); },
    ))!;
    gate.startExportReview(input());
    await settled();
    expect(gate.reviewStage.value).toBe('ready');
    expect(gate.reviewReport.value?.exportedScore).toBeNull();
    expect(gate.reviewReport.value?.delta).toBeNull();
    expect(gate.reviewReport.value?.exportedQuality).toBeNull();
    expect(gate.reviewReport.value?.exportedQualityError).toContain('Canvas unavailable');
    scope.stop();
  });
});
