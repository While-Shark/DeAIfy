import { onScopeDispose, ref, shallowRef } from 'vue';
import { createExportReport, exportFilename } from '../engine/exportReview';
import { inspectProvenance } from '../services/provenance';
import type { ExportFormat, ExportReviewReport, ExportReviewStage, ProcessingParams, ProvenanceResult } from '../types/editor';

interface ExportInput {
  file: File;
  params: ProcessingParams;
  format: ExportFormat;
  sourceScore: number | null;
  sourceProvenance: ProvenanceResult;
}

type Assess = (file: Blob) => Promise<number>;
type Render = (file: Blob, params: ProcessingParams, mime: ExportFormat, maxSide?: number) => Promise<Blob>;

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown model error';
}

/** The exact blob scored for the report is downloaded after confirmation. */
export function useExportReview(assess: Assess, render: Render) {
  const reviewOpen = ref(false);
  const reviewStage = ref<ExportReviewStage>('idle');
  const reviewReport = shallowRef<ExportReviewReport | null>(null);
  const reviewError = ref('');
  let preparedBlob: Blob | null = null;
  let lastInput: ExportInput | null = null;
  let sequence = 0;
  let returnFocus: HTMLElement | null = null;

  function cancelReview(): void {
    ++sequence;
    preparedBlob = null;
    lastInput = null;
    reviewReport.value = null;
    reviewError.value = '';
    reviewStage.value = 'idle';
    reviewOpen.value = false;
    returnFocus?.focus();
    returnFocus = null;
  }

  async function performReview(input: ExportInput): Promise<void> {
    const id = ++sequence;
    preparedBlob = null;
    reviewReport.value = null;
    reviewError.value = '';
    reviewOpen.value = true;
    reviewStage.value = 'rendering';

    try {
      // Render only once at full resolution, using the user's selected export format.
      const output = await render(input.file, { ...input.params }, input.format);
      if (id !== sequence) return;
      preparedBlob = output;
      reviewStage.value = 'assessing';

      const filename = exportFilename(input.file.name, input.format);
      const exportedFile = new File([output], filename, { type: output.type });
      // Scoring errors are recorded individually so no fabricated scores appear.
      const [original, exported, originalProvenance, exportedProvenance] = await Promise.all([
        input.sourceScore !== null
          ? Promise.resolve({ score: input.sourceScore, error: '' })
          : assess(input.file).then(score => ({ score, error: '' })).catch(error => ({ score: null, error: errorText(error) })),
        assess(exportedFile).then(score => ({ score, error: '' })).catch(error => ({ score: null, error: errorText(error) })),
        input.sourceProvenance.status !== 'pending'
          ? Promise.resolve(input.sourceProvenance)
          : inspectProvenance(input.file),
        inspectProvenance(exportedFile),
      ]);
      if (id !== sequence) return;

      reviewReport.value = createExportReport({
        originalScore: original.score,
        exportedScore: exported.score,
        originalProvenance,
        exportedProvenance,
        originalError: original.error,
        exportedError: exported.error,
        filename,
        fileSize: output.size,
        format: input.format,
      });
      reviewStage.value = 'ready';
    } catch (error) {
      if (id !== sequence) return;
      preparedBlob = null;
      reviewError.value = errorText(error);
      reviewStage.value = 'error';
    }
  }

  function startExportReview(input: ExportInput): void {
    if (reviewOpen.value) return;
    returnFocus = typeof HTMLElement !== 'undefined' && document.activeElement instanceof HTMLElement
      ? document.activeElement : null;
    // Freeze parameters and source file while the confirmation dialog is open.
    lastInput = { ...input, params: { ...input.params } };
    void performReview(lastInput);
  }

  function retryExportReview(): void {
    if (lastInput && reviewStage.value !== 'rendering' && reviewStage.value !== 'assessing') {
      void performReview(lastInput);
    }
  }

  function confirmExportReview(): void {
    const report = reviewReport.value;
    if (reviewStage.value !== 'ready' || !preparedBlob || !report) return;
    const url = URL.createObjectURL(preparedBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = report.filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    cancelReview();
  }

  onScopeDispose(cancelReview);

  return {
    reviewOpen, reviewStage, reviewReport, reviewError,
    startExportReview, retryExportReview, confirmExportReview, cancelReview,
  };
}
