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
  model?: DetectorModel;
  precise?: boolean;
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
  strokes?: BrushStroke[];
};

export type ProcessorWorkerResponse =
  | { id: number; type: 'result'; blob: Blob; width: number; height: number }
  | { id: number; type: 'error'; message: string };

export type ExportReviewStage = 'idle' | 'rendering' | 'assessing' | 'ready' | 'error';

export interface ExportReviewReport {
  originalScore: number | null;
  exportedScore: number | null;
  delta: number | null;
  originalProvenance: ProvenanceResult;
  exportedProvenance: ProvenanceResult;
  originalError: string;
  exportedError: string;
  filename: string;
  fileSize: number;
  format: ExportFormat;
}

/** Basic preserves v0.1.2 behavior. Advanced features are opt-in and remain local. */
export type StudioMode = 'basic' | 'advanced';
export type DetectorModel = 'primary' | 'secondary';
export type BrushTool = 'lighten' | 'darken' | 'warm' | 'detail';
export interface BrushStroke {
  /** Coordinates and radius are relative to the actual image, never the letterboxed viewport. */
  x: number;
  y: number;
  radius: number;
  amount: number;
  tool: BrushTool;
}
export interface NaturalnessMetrics {
  /** Heuristic quality index. NOT a probability of real photography. */
  index: number;
  clippedPercent: number;
  averageSaturation: number;
  textureIndex: number;
  notes: string[];
}
export interface AdvancedImageScores {
  primary: number | null;
  secondary: number | null;
  naturalness: NaturalnessMetrics | null;
}
export interface AdvancedAnalysisReport {
  original: AdvancedImageScores;
  processed: AdvancedImageScores;
  warnings: string[];
  hasSecondary: boolean;
}
export type ImageOriginLabel = 'real' | 'ai';
export interface EvaluationRecord {
  id?: number;
  name: string;
  label: ImageOriginLabel;
  primary: number | null;
  secondary: number | null;
  createdAt: number;
}
