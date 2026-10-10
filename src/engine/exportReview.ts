import type { ExportFormat, ExportReviewReport, NaturalnessMetrics, ProvenanceResult } from '../types/editor';

export function scoreDelta(original: number | null, exported: number | null): number | null {
  return original === null || exported === null
    ? null : Math.round((exported - original) * 100) / 100;
}

export function exportFilename(originalName: string, format: ExportFormat): string {
  const extension = format === 'image/jpeg' ? 'jpg' : format.split('/')[1];
  const basename = originalName.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_').trim() || 'image';
  return basename + '-deaify.' + extension;
}

export function createExportReport(input: {
  originalScore: number | null;
  exportedScore: number | null;
  originalProvenance: ProvenanceResult;
  exportedProvenance: ProvenanceResult;
  originalError: string;
  exportedError: string;
  originalQuality?: NaturalnessMetrics | null;
  exportedQuality?: NaturalnessMetrics | null;
  originalQualityError?: string;
  exportedQualityError?: string;
  filename: string;
  fileSize: number;
  format: ExportFormat;
}): ExportReviewReport {
  return {
    ...input,
    originalQuality: input.originalQuality ?? null,
    exportedQuality: input.exportedQuality ?? null,
    originalQualityError: input.originalQualityError ?? '',
    exportedQualityError: input.exportedQualityError ?? '',
    delta: scoreDelta(input.originalScore, input.exportedScore),
  };
}
