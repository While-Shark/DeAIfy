import { computed, onScopeDispose, reactive, ref, shallowRef, watch } from 'vue';
import { cloneParams, getPreset } from '../engine/presets';
import { inspectProvenance } from '../services/provenance';
import type { ExportFormat, NaturalnessMetrics, PresetId, ProcessingParams, ProvenanceResult, ScanStatus } from '../types/editor';
import { useCommerce } from './useCommerce';
import { useClassifier } from './useClassifier';
import { useExportReview } from './useExportReview';
import { useNaturalness } from './useNaturalness';
import { useProcessor } from './useProcessor';

const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_BYTES = 25 * 1024 * 1024;
const MAX_PIXELS = 30_000_000;

type QualityStatus = 'idle' | 'loading' | 'complete' | 'error';

export function useEditor() {
  const { assess } = useClassifier();
  const { analyze } = useNaturalness();
  const { render } = useProcessor();
  const commerce = useCommerce();
  const exportRender = (image: Blob, options: ProcessingParams, mime: ExportFormat, maxSide?: number): Promise<Blob> =>
    commerce.enabled ? commerce.process(image, options, mime) : render(image, options, mime, maxSide);
  const { reviewOpen, reviewStage, reviewReport, reviewError, startExportReview,
    retryExportReview, confirmExportReview, cancelReview } = useExportReview(assess, exportRender, analyze);

  const file = shallowRef<File | null>(null);
  const originalUrl = ref('');
  const previewUrl = ref('');
  const previewBlob = shallowRef<Blob | null>(null);
  const dimensions = reactive({ width: 0, height: 0 });
  const presetId = ref<PresetId>('natural');
  const params = reactive<ProcessingParams>(cloneParams(getPreset('natural').params));
  const comparePercent = ref(50);

  const score = ref<number | null>(null);
  const processedScore = ref<number | null>(null);
  const scanStatus = ref<ScanStatus>('idle');
  const processedScanStatus = ref<ScanStatus>('idle');
  const downloadProgress = ref<number | null>(null);
  const scanPhase = ref<'download' | 'evaluate'>('download');

  const sourceQuality = shallowRef<NaturalnessMetrics | null>(null);
  const processedQuality = shallowRef<NaturalnessMetrics | null>(null);
  const sourceQualityStatus = ref<QualityStatus>('idle');
  const processedQualityStatus = ref<QualityStatus>('idle');
  const sourceQualityError = ref('');
  const processedQualityError = ref('');

  const provenance = ref<ProvenanceResult>({ status: 'pending', message: '等待上传图片' });
  const uploadError = ref('');
  const scanError = ref('');
  const previewError = ref('');
  const isPreviewing = ref(false);
  const exportFormat = ref<ExportFormat>('image/png');
  let generation = 0;
  let previewGeneration = 0;
  let previewTimer: ReturnType<typeof setTimeout> | undefined;

  const canPreviewScore = computed(() => !!previewBlob.value && !isPreviewing.value);
  const filename = computed(() => file.value?.name ?? '未选择图片');
  const readableSize = computed(() => file.value
    ? (file.value.size / 1024 / 1024).toFixed(2) + ' MB' : '—');

  function clearObjectUrls(): void {
    if (originalUrl.value) URL.revokeObjectURL(originalUrl.value);
    if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
    originalUrl.value = '';
    previewUrl.value = '';
  }

  async function selectFile(candidate: File): Promise<void> {
    const current = ++generation;
    cancelReview();
    ++previewGeneration;
    if (previewTimer) clearTimeout(previewTimer);
    clearObjectUrls();
    file.value = null;
    previewBlob.value = null;
    score.value = null;
    processedScore.value = null;
    sourceQuality.value = null;
    processedQuality.value = null;
    scanStatus.value = 'idle';
    processedScanStatus.value = 'idle';
    sourceQualityStatus.value = 'idle';
    processedQualityStatus.value = 'idle';
    sourceQualityError.value = '';
    processedQualityError.value = '';
    uploadError.value = '';
    scanError.value = '';
    previewError.value = '';
    downloadProgress.value = null;
    dimensions.width = 0;
    dimensions.height = 0;
    comparePercent.value = 50;
    provenance.value = { status: 'pending', message: '正在检测来源凭证…' };

    if (!ALLOWED_TYPES.has(candidate.type)) {
      uploadError.value = '目前仅支持 JPG、PNG 和 WebP 图片。';
      return;
    }
    if (candidate.size > MAX_BYTES) {
      uploadError.value = '单张图片不能超过 25 MB。';
      return;
    }

    try {
      const bitmap = await createImageBitmap(candidate, { imageOrientation: 'from-image' });
      const { width, height } = bitmap;
      bitmap.close();
      if (current !== generation) return;
      if (width * height > MAX_PIXELS) {
        uploadError.value = '图片超过 3000 万像素，请先缩小图片。';
        return;
      }
      dimensions.width = width;
      dimensions.height = height;
      originalUrl.value = URL.createObjectURL(candidate);
      file.value = candidate;
      scanStatus.value = 'loading';
      sourceQualityStatus.value = 'loading';
      void runSourceAssessment(candidate, current);
      void runSourceQuality(candidate, current);
      void inspectProvenance(candidate).then((result) => {
        if (current === generation) provenance.value = result;
      });
    } catch {
      if (current === generation) uploadError.value = '图片无法解码，请检查文件是否损坏。';
    }
  }

  async function runSourceAssessment(candidate: File, current: number): Promise<void> {
    try {
      const result = await assess(candidate, (event) => {
        if (current !== generation) return;
        scanPhase.value = event.phase;
        scanStatus.value = event.phase === 'evaluate' ? 'evaluating' : 'loading';
        if (typeof event.progress === 'number') downloadProgress.value = Math.round(event.progress);
      });
      if (current !== generation) return;
      score.value = result;
      scanStatus.value = 'complete';
    } catch (error) {
      if (current !== generation) return;
      scanStatus.value = 'error';
      scanError.value = error instanceof Error ? error.message : '模型推理失败';
    }
  }

  async function runSourceQuality(candidate: File, current: number): Promise<void> {
    try {
      const result = await analyze(candidate);
      if (current !== generation) return;
      sourceQuality.value = result;
      sourceQualityStatus.value = 'complete';
    } catch (error) {
      if (current !== generation) return;
      sourceQualityStatus.value = 'error';
      sourceQualityError.value = error instanceof Error ? error.message : '画面分析失败';
    }
  }

  /** Only runs when the user clicks the manual review button. */
  async function rerunAssessment(): Promise<void> {
    const current = generation;
    const previewId = previewGeneration;
    const snapshot = previewBlob.value;
    if (!snapshot || isPreviewing.value || processedScanStatus.value === 'loading'
      || processedQualityStatus.value === 'loading') return;
    const isCurrent = () => current === generation && previewId === previewGeneration
      && snapshot === previewBlob.value;
    processedScore.value = null;
    processedQuality.value = null;
    processedScanStatus.value = 'loading';
    processedQualityStatus.value = 'loading';
    processedQualityError.value = '';

    await Promise.all([
      assess(snapshot).then((result) => {
        if (!isCurrent()) return;
        processedScore.value = result;
        processedScanStatus.value = 'complete';
      }).catch(() => {
        if (isCurrent()) processedScanStatus.value = 'error';
      }),
      analyze(snapshot).then((result) => {
        if (!isCurrent()) return;
        processedQuality.value = result;
        processedQualityStatus.value = 'complete';
      }).catch((error) => {
        if (!isCurrent()) return;
        processedQualityStatus.value = 'error';
        processedQualityError.value = error instanceof Error ? error.message : '画面分析失败';
      }),
    ]);
  }

  async function buildPreview(current: number): Promise<void> {
    const image = file.value;
    if (!image) return;
    previewError.value = '';
    try {
      const result = await render(image, { ...params }, 'image/webp', 1800);
      if (current !== previewGeneration) return;
      const newUrl = URL.createObjectURL(result);
      if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
      previewUrl.value = newUrl;
      previewBlob.value = result;
    } catch (error) {
      if (current === previewGeneration) {
        previewError.value = error instanceof Error ? error.message : '预览处理失败。';
      }
    } finally {
      if (current === previewGeneration) isPreviewing.value = false;
    }
  }

  function schedulePreview(): void {
    const current = ++previewGeneration;
    if (previewTimer) clearTimeout(previewTimer);
    previewBlob.value = null;
    processedScore.value = null;
    processedQuality.value = null;
    processedScanStatus.value = 'idle';
    processedQualityStatus.value = 'idle';
    processedQualityError.value = '';
    isPreviewing.value = Boolean(file.value);
    if (!file.value) return;
    previewTimer = setTimeout(() => { void buildPreview(current); }, 180);
  }

  watch(file, schedulePreview);
  watch(params, () => {
    if (reviewOpen.value) cancelReview();
    schedulePreview();
  }, { deep: true });
  watch(exportFormat, () => { if (reviewOpen.value) cancelReview(); });

  function selectPreset(id: PresetId): void {
    presetId.value = id;
    Object.assign(params, cloneParams(getPreset(id).params));
  }

  function reviewBeforeExport(): void {
    if (!file.value) return;
    startExportReview({
      file: file.value,
      params: { ...params },
      format: exportFormat.value,
      sourceScore: score.value,
      sourceQuality: sourceQuality.value,
      sourceProvenance: provenance.value,
    });
  }

  function reset(): void {
    cancelReview();
    ++generation;
    ++previewGeneration;
    if (previewTimer) clearTimeout(previewTimer);
    clearObjectUrls();
    file.value = null;
    previewBlob.value = null;
    score.value = null;
    processedScore.value = null;
    sourceQuality.value = null;
    processedQuality.value = null;
    scanStatus.value = 'idle';
    processedScanStatus.value = 'idle';
    sourceQualityStatus.value = 'idle';
    processedQualityStatus.value = 'idle';
    provenance.value = { status: 'pending', message: '等待上传图片' };
    uploadError.value = '';
    scanError.value = '';
    previewError.value = '';
  }

  onScopeDispose(() => {
    ++generation;
    ++previewGeneration;
    if (previewTimer) clearTimeout(previewTimer);
    clearObjectUrls();
  });

  return {
    file, filename, readableSize, originalUrl, previewUrl, dimensions, params, presetId,
    comparePercent, score, processedScore, scanStatus, processedScanStatus, downloadProgress,
    scanPhase, provenance, uploadError, scanError, previewError, isPreviewing,
    sourceQuality, processedQuality, sourceQualityStatus, processedQualityStatus,
    sourceQualityError, processedQualityError,
    canPreviewScore, exportFormat, selectFile, selectPreset, rerunAssessment, reviewBeforeExport, reset,
    reviewOpen, reviewStage, reviewReport, reviewError, retryExportReview,
    confirmExportReview, cancelReview,
  };
}
