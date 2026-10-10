import type { ExportFormat, ExportReviewReport, ProvenanceResult } from '../types/editor';

/** The 0-100 values are model outputs, not calibrated probabilities. */
export function scoreDelta(original: number | null, exported: number | null): number | null {
  return original === null || exported === null ? null : Math.round((exported - original) * 100) / 100;
}

export function exportFilename(originalName: string, format: ExportFormat): string {
  const extension = format === 'image/jpeg' ? 'jpg' : format.split('/')[1];
  const basename = originalName.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_').trim() || 'image';
  return `${basename}-deaify.${extension}`;
}

export function createExportReport(input: {
  originalScore: number | null;
  exportedScore: number | null;
  originalProvenance: ProvenanceResult;
  exportedProvenance: ProvenanceResult;
  originalError: string;
  exportedError: string;
  filename: string;
  fileSize: number;
  format: ExportFormat;
}): ExportReviewReport {
  return { ...input, delta: scoreDelta(input.originalScore, input.exportedScore) };
}
