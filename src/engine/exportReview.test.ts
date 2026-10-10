import { describe, expect, it } from 'vitest';
import { createExportReport, exportFilename, scoreDelta } from './exportReview';

const provenance = { status: 'none', message: 'No readable credentials' } as const;

describe('export review', () => {
  it('compares the model scores without pretending to provide confidence', () => {
    expect(scoreDelta(42, 71)).toBe(29);
    expect(scoreDelta(75, 42)).toBe(-33);
    expect(scoreDelta(60, 60)).toBe(0);
    expect(scoreDelta(0, 100)).toBe(100);
    expect(scoreDelta(null, 77)).toBeNull();
    expect(scoreDelta(12, null)).toBeNull();
  });
  it('compares source and final output credential signals independently', () => {
    const report = createExportReport({
      originalScore: 42, exportedScore: 71, originalProvenance: { status: 'ai-declared', message: 'AI source' },
      exportedProvenance: provenance, originalError: '', exportedError: '',
      filename: 'example-deaify.png', fileSize: 800, format: 'image/png',
    });
    expect(report.delta).toBe(29);
    expect(report.originalProvenance.status).toBe('ai-declared');
    expect(report.exportedProvenance.status).toBe('none');
  });
  it('preserves unavailable outcomes rather than inventing numeric results', () => {
    const report = createExportReport({
      originalScore: 91, exportedScore: null, originalProvenance: provenance,
      exportedProvenance: provenance, originalError: '', exportedError: 'Model unavailable',
      filename: 'image-deaify.jpg', fileSize: 700, format: 'image/jpeg',
    });
    expect(report.delta).toBeNull();
    expect(report.exportedError).toBe('Model unavailable');
  });
  it('builds safe filenames for the selected actual export format', () => {
    expect(exportFilename('photo.png', 'image/jpeg')).toBe('photo-deaify.jpg');
    expect(exportFilename('photo.webp', 'image/png')).toBe('photo-deaify.png');
    expect(exportFilename('path\\name.jpeg', 'image/webp')).toBe('path_name-deaify.webp');
  });
  it('rounds fractional advanced-mode score deltas', () => {
    expect(scoreDelta(68.12, 71.37)).toBe(3.25);
  });

});
