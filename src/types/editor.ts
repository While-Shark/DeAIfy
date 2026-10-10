export interface ProcessingParams {
  strength: number;
  grain: number;
  warmth: number;
  saturation: number;
  contrast: number;
  softness: number;
  texture: number;
}

export type PresetId = 'natural' | 'portrait' | 'film' | 'documentary' | 'softlight';
export type ExportFormat = 'image/png' | 'image/jpeg' | 'image/webp';

export interface Preset {
  id: PresetId;
  title: string;
  subtitle: string;
  params: ProcessingParams;
}

export interface Prediction {
  label: string;
  score: number;
}

export type ScanStatus = 'idle' | 'loading' | 'evaluating' | 'complete' | 'error';

export interface ProvenanceResult {
  status: 'pending' | 'none' | 'c2pa' | 'ai-declared' | 'unavailable';
  message: string;
}

export type ClassifierWorkerRequest = {
  type: 'assess';
  id: number;
  file: Blob;
};

export type ClassifierWorkerResponse =
  | { type: 'progress'; id: number; progress?: number; phase: 'download' | 'evaluate' }
  | { type: 'result'; id: number; score: number }
  | { type: 'error'; id: number; message: string };

export type ProcessorWorkerRequest = {
  id: number;
  file: Blob;
  params: ProcessingParams;
  maxSide?: number;
  mime: ExportFormat;
  quality: number;
};

export type ProcessorWorkerResponse =
  | { id: number; type: 'result'; blob: Blob; width: number; height: number }
  | { id: number; type: 'error'; message: string };

export type ExportReviewStage = 'idle' | 'rendering' | 'assessing' | 'ready' | 'error';

export interface QualityDimensions {
  exposure: number;
  color: number;
  texture: number;
  edges: number;
}

/** Heuristic image-quality diagnostics, unrelated to image provenance. */
export interface NaturalnessMetrics {
  index: number;
  clippedPercent: number;
  averageSaturation: number;
  textureIndex: number;
  edgeRatio: number;
  dimensions: QualityDimensions;
  notes: string[];
}

export interface ExportReviewReport {
  originalScore: number | null;
  exportedScore: number | null;
  delta: number | null;
  originalQuality: NaturalnessMetrics | null;
  exportedQuality: NaturalnessMetrics | null;
  originalQualityError: string;
  exportedQualityError: string;
  originalProvenance: ProvenanceResult;
  exportedProvenance: ProvenanceResult;
  originalError: string;
  exportedError: string;
  filename: string;
  fileSize: number;
  format: ExportFormat;
}
