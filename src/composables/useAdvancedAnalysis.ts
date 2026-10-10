import { onScopeDispose, ref, shallowRef } from 'vue';
import type { AdvancedAnalysisReport, AdvancedImageScores, DetectorModel, NaturalnessMetrics } from '../types/editor';

type Detect = (file: Blob, model: DetectorModel, precise: boolean) => Promise<number>;
type Analyze = (file: Blob) => Promise<NaturalnessMetrics>;

const emptyScores = (): AdvancedImageScores => ({ primary: null, secondary: null, naturalness: null });

/** Manual-only advanced analysis. Results are invalidated when the pixels change. */
export function useAdvancedAnalysis(detect: Detect, analyze: Analyze) {
  const report = shallowRef<AdvancedAnalysisReport | null>(null);
  const busy = ref(false);
  const stage = ref('');
  const error = ref('');
  let generation = 0;

  function invalidate(): void {
    generation++;
    report.value = null;
    stage.value = '';
    error.value = '';
    busy.value = false;
  }
  async function run(original: Blob, processed: Blob, includeSecondary: boolean): Promise<void> {
    const id = ++generation;
    report.value = null;
    busy.value = true;
    error.value = '';
    const originalScores = emptyScores();
    const processedScores = emptyScores();
    const warnings: string[] = [];
    async function tryScore(file: Blob, model: DetectorModel, dest: AdvancedImageScores, description: string) {
      stage.value = description;
      try { dest[model] = await detect(file, model, true); }
      catch (e) { warnings.push(`${description}：${e instanceof Error ? e.message : '模型不可用'}`); }
    }
    try {
      stage.value = '分析纹理与色彩';
      const [first, second] = await Promise.allSettled([analyze(original), analyze(processed)]);
      if (first.status === 'fulfilled') originalScores.naturalness = first.value;
      else warnings.push('原图自然度诊断失败');
      if (second.status === 'fulfilled') processedScores.naturalness = second.value;
      else warnings.push('成品自然度诊断失败');
      if (id !== generation) return;
      await tryScore(original, 'primary', originalScores, '基础模型 · 原图');
      if (id !== generation) return;
      await tryScore(processed, 'primary', processedScores, '基础模型 · 处理后');
      if (id !== generation) return;
      if (includeSecondary) {
        await tryScore(original, 'secondary', originalScores, '交叉模型 · 原图');
        if (id !== generation) return;
        await tryScore(processed, 'secondary', processedScores, '交叉模型 · 处理后');
        if (id !== generation) return;
      }
      if (id === generation) {
        report.value = { original: originalScores, processed: processedScores, warnings, hasSecondary: includeSecondary };
      }
    } catch (e) {
      if (id === generation) error.value = e instanceof Error ? e.message : '分析失败';
    } finally {
      if (id === generation) { busy.value = false; stage.value = ''; }
    }
  }
  onScopeDispose(invalidate);
  return { report, busy, stage, error, run, invalidate };
}
