import { computed, onScopeDispose, reactive, ref, shallowRef, watch } from 'vue';
import { getPreset, cloneParams } from '../engine/presets';
import { inspectProvenance } from '../services/provenance';
import type { ExportFormat, PresetId, ProcessingParams, ProvenanceResult, ScanStatus } from '../types/editor';
import { useClassifier } from './useClassifier';
import { useProcessor } from './useProcessor';

const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_BYTES = 25 * 1024 * 1024;
const MAX_PIXELS = 30_000_000;

export function useEditor() {
  const { assess } = useClassifier();
  const { render } = useProcessor();
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
  const isExporting = ref(false);
  const exportError = ref('');
  const exportFormat = ref<ExportFormat>('image/png');
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
    const snapshot = previewBlob.value;
    if (!snapshot || processedScanStatus.value === 'loading') return;
    processedScore.value = null;
    processedScanStatus.value = 'loading';
    try {
      const result = await assess(snapshot);
      if (current === generation && snapshot === previewBlob.value) {
        processedScore.value = result;
        processedScanStatus.value = 'complete';
      }
    } catch {
      if (current === generation) processedScanStatus.value = 'error';
    }
  }

  async function buildPreview(): Promise<void> {
    const image = file.value;
    if (!image) return;
    const current = ++previewGeneration;
    isPreviewing.value = true;
    previewError.value = '';
    try {
      const result = await render(image, { ...params }, 'image/webp', 1800);
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
    if (previewTimer) clearTimeout(previewTimer);
    if (!file.value) return;
    previewTimer = setTimeout(() => { void buildPreview(); }, 180);
  }

  watch(file, schedulePreview);
  watch(params, schedulePreview, { deep: true });

  function selectPreset(id: PresetId): void {
    presetId.value = id;
    Object.assign(params, cloneParams(getPreset(id).params));
  }

  async function exportImage(): Promise<void> {
    if (!file.value || isExporting.value) return;
    isExporting.value = true;
    exportError.value = '';
    try {
      const output = await render(file.value, { ...params }, exportFormat.value);
      const url = URL.createObjectURL(output);
      const extension = exportFormat.value.split('/')[1] === 'jpeg' ? 'jpg' : exportFormat.value.split('/')[1];
      const base = file.value.name.replace(/\.[^.]+$/, '');
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${base}-deaify.${extension}`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (error) {
      exportError.value = error instanceof Error ? error.message : '图片导出失败。';
    } finally {
      isExporting.value = false;
    }
  }

  function reset(): void {
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
    exportError.value = '';
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
    scanPhase, provenance, uploadError, scanError, previewError, isPreviewing, isExporting,
    exportError, exportFormat, selectFile, selectPreset, rerunAssessment, exportImage, reset,
  };
}
