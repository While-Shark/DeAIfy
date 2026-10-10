import { computed, onMounted, onScopeDispose, reactive, ref, shallowRef, watch } from 'vue';
import { getPreset, cloneParams } from '../engine/presets';
import { inspectProvenance } from '../services/provenance';
import type { BrushStroke, BrushTool, ExportFormat, PresetId, ProcessingParams, ProvenanceResult, ScanStatus, StudioMode } from '../types/editor';
import { useClassifier } from './useClassifier';
import { useExportReview } from './useExportReview';
import { useProcessor } from './useProcessor';
import { useNaturalness } from './useNaturalness';
import { useAdvancedAnalysis } from './useAdvancedAnalysis';
import { useEvaluation } from './useEvaluation';

const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_BYTES = 25 * 1024 * 1024;
const MAX_PIXELS = 30_000_000;

export function useEditor() {
  const { assess, assessModel } = useClassifier();
  const { analyze } = useNaturalness();
  const advanced = useAdvancedAnalysis(assessModel, analyze);
  const evaluation = useEvaluation(assessModel);
  const { render } = useProcessor();
  const { reviewOpen, reviewStage, reviewReport, reviewError, startExportReview,
    retryExportReview, confirmExportReview, cancelReview } = useExportReview(assess, render);
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
  const provenance = ref<ProvenanceResult>({ status: 'pending', message: '等待上传图片' });
  const uploadError = ref('');
  const scanError = ref('');
  const previewError = ref('');
  const isPreviewing = ref(false);
  const exportFormat = ref<ExportFormat>('image/png');
  const mode = ref<StudioMode>('basic');
  const brushEnabled = ref(false);
  const brushTool = ref<BrushTool>('lighten');
  const brushRadius = ref(0.065);
  const brushAmount = ref(0.55);
  const strokes = ref<BrushStroke[]>([]);
  const includeSecondary = ref(false);
  onMounted(() => {
    try { if (localStorage.getItem('deaify-studio-mode') === 'advanced') mode.value = 'advanced'; }
    catch { /* Browser storage can be disabled. */ }
  });
  let generation = 0;
  let previewGeneration = 0;
  let previewTimer: ReturnType<typeof setTimeout> | undefined;

  const filename = computed(() => file.value?.name ?? '未选择图片');
  const readableSize = computed(() => file.value ? `${(file.value.size / 1024 / 1024).toFixed(2)} MB` : '—');

  function clearObjectUrls(): void {
    if (originalUrl.value) URL.revokeObjectURL(originalUrl.value);
    if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
    originalUrl.value = '';
    previewUrl.value = '';
  }

  async function selectFile(candidate: File): Promise<void> {
    const current = ++generation;
    cancelReview();
    advanced.invalidate();
    strokes.value = [];
    ++previewGeneration;
    if (previewTimer) clearTimeout(previewTimer);
    clearObjectUrls();
    file.value = null;
    previewBlob.value = null;
    score.value = null;
    processedScore.value = null;
    scanStatus.value = 'idle';
    processedScanStatus.value = 'idle';
    uploadError.value = '';
    scanError.value = '';
    previewError.value = '';
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
        uploadError.value = '图片超过 3000 万像素，为避免浏览器内存不足，请先缩小图片。';
        return;
      }
      dimensions.width = width;
      dimensions.height = height;
      originalUrl.value = URL.createObjectURL(candidate);
      file.value = candidate;
      scanStatus.value = 'loading';
      void runSourceAssessment(candidate, current);
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

  async function rerunAssessment(): Promise<void> {
    const current = generation;
    const currentPreview = previewGeneration;
    const snapshot = previewBlob.value;
    if (!snapshot || isPreviewing.value || processedScanStatus.value === 'loading') return;
    processedScore.value = null;
    processedScanStatus.value = 'loading';
    try {
      const result = await assess(snapshot);
      if (current === generation && currentPreview === previewGeneration && snapshot === previewBlob.value) {
        processedScore.value = result;
        processedScanStatus.value = 'complete';
      }
    } catch {
      if (current === generation && currentPreview === previewGeneration) processedScanStatus.value = 'error';
    }
  }

  async function buildPreview(current: number): Promise<void> {
    const image = file.value;
    if (!image) return;
    isPreviewing.value = true;
    previewError.value = '';
    try {
      const result = await render(image, { ...params }, 'image/webp', 1800, mode.value === 'advanced' ? strokes.value : []);
      if (current !== previewGeneration) return;
      const newUrl = URL.createObjectURL(result);
      if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
      previewUrl.value = newUrl;
      previewBlob.value = result;
      processedScore.value = null;
      processedScanStatus.value = 'idle';
    } catch (error) {
      if (current === previewGeneration) {
        previewError.value = error instanceof Error ? error.message : '预览处理失败。';
      }
    } finally {
      if (current === previewGeneration) isPreviewing.value = false;
    }
  }

  function schedulePreview(): void {
    // Invalidate preview and score immediately, including during debounce.
    const current = ++previewGeneration;
    if (previewTimer) clearTimeout(previewTimer);
    processedScore.value = null;
    processedScanStatus.value = 'idle';
    advanced.invalidate();
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
  watch(mode, () => {
    if (reviewOpen.value) cancelReview();
    if (mode.value !== 'advanced') brushEnabled.value = false;
    schedulePreview();
  });

  function selectMode(next: StudioMode): void {
    mode.value = next;
    try { localStorage.setItem('deaify-studio-mode', next); } catch { /* optional preference */ }
  }
  function addBrushStroke(point: BrushStroke): void {
    if (mode.value !== 'advanced' || !file.value || strokes.value.length >= 240) return;
    strokes.value.push(point);
  }
  function completeBrushStroke(): void { if (mode.value === 'advanced' && file.value) schedulePreview(); }
  function undoBrush(): void { if (strokes.value.length) { strokes.value.pop(); schedulePreview(); } }
  function clearBrush(): void { if (strokes.value.length) { strokes.value = []; schedulePreview(); } }
  async function runAdvancedAnalysis(): Promise<void> {
    const original = file.value;
    const processed = previewBlob.value;
    if (mode.value !== 'advanced' || !original || !processed || isPreviewing.value || advanced.busy.value) return;
    await advanced.run(original, processed, includeSecondary.value);
  }

  function selectPreset(id: PresetId): void {
    presetId.value = id;
    Object.assign(params, cloneParams(getPreset(id).params));
  }

  function reviewBeforeExport(): void {
    if (!file.value) return;
    startExportReview({
      file: file.value,
      params: { ...params },
      strokes: mode.value === 'advanced' ? [...strokes.value] : [],
      format: exportFormat.value,
      sourceScore: score.value,
      sourceProvenance: provenance.value,
    });
  }

  function reset(): void {
    cancelReview();
    advanced.invalidate();
    strokes.value = [];
    ++generation;
    ++previewGeneration;
    if (previewTimer) clearTimeout(previewTimer);
    clearObjectUrls();
    file.value = null;
    previewBlob.value = null;
    score.value = null;
    processedScore.value = null;
    scanStatus.value = 'idle';
    processedScanStatus.value = 'idle';
    provenance.value = { status: 'pending', message: '等待上传图片' };
    uploadError.value = '';
    scanError.value = '';
    previewError.value = '';
  }

  onScopeDispose(() => {
    advanced.invalidate();
    ++generation;
    ++previewGeneration;
    if (previewTimer) clearTimeout(previewTimer);
    clearObjectUrls();
  });

  return {
    file, filename, readableSize, originalUrl, previewUrl, dimensions, params, presetId,
    comparePercent, score, processedScore, scanStatus, processedScanStatus, downloadProgress,
    scanPhase, provenance, uploadError, scanError, previewError, isPreviewing,
    exportFormat, selectFile, selectPreset, rerunAssessment, reviewBeforeExport, reset,
    reviewOpen, reviewStage, reviewReport, reviewError, retryExportReview, confirmExportReview, cancelReview,
    mode, selectMode, brushEnabled, brushTool, brushRadius, brushAmount, strokes,
    addBrushStroke, completeBrushStroke, undoBrush, clearBrush,
    includeSecondary, advanced, runAdvancedAnalysis, evaluation,
  };
}
