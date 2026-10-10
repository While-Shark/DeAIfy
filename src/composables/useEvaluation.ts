import { computed, onScopeDispose, ref } from 'vue';
import { evaluateRecords } from '../engine/evaluation';
import { evaluationStore } from '../services/evaluationStore';
import type { DetectorModel, EvaluationRecord, ImageOriginLabel } from '../types/editor';

type Assess = (file: Blob, model: DetectorModel, precise: boolean) => Promise<number>;

/** Labels are explicit user inputs; evaluation never treats model predictions as ground truth. */
export function useEvaluation(assess: Assess) {
  const rows = ref<EvaluationRecord[]>([]);
  const busy = ref(false);
  const progress = ref('');
  const error = ref('');
  let generation = 0;
  const primaryStats = computed(() => evaluateRecords(rows.value, 'primary'));
  const secondaryStats = computed(() => evaluateRecords(rows.value, 'secondary'));

  async function reload(): Promise<void> {
    try { rows.value = await evaluationStore.list(); }
    catch (e) { error.value = e instanceof Error ? e.message : '浏览器不允许存储评测数据'; }
  }
  async function evaluateFiles(files: File[], label: ImageOriginLabel, includeSecondary: boolean): Promise<void> {
    if (busy.value || !files.length) return;
    const id = ++generation;
    busy.value = true;
    error.value = '';
    // Keep per-session bounds to avoid queuing hundreds of heavy WASM jobs.
    const selected = files.slice(0, 25).filter(f => /^image\/(png|jpeg|webp)$/.test(f.type) && f.size <= 25 * 1024 * 1024);
    if (selected.length < files.length) error.value = '仅处理本次前 25 张有效 JPG/PNG/WebP 文件（单张不超过 25 MB）。';
    try {
      for (let i = 0; i < selected.length; i++) {
        if (id !== generation) return;
        const file = selected[i]!;
        progress.value = `${i + 1} / ${selected.length} · ${file.name}`;
        let primary: number | null = null;
        let secondary: number | null = null;
        try { primary = await assess(file, 'primary', true); }
        catch (e) { error.value = `部分图像评分失败：${e instanceof Error ? e.message : 'unknown error'}`; }
        if (id !== generation) return;
        if (includeSecondary) {
          try { secondary = await assess(file, 'secondary', true); }
          catch (e) { error.value = `交叉模型部分评分失败：${e instanceof Error ? e.message : 'unknown error'}`; }
        }
        if (id !== generation) return;
        await evaluationStore.add({ name: file.name, label, primary, secondary, createdAt: Date.now() });
      }
      await reload();
    } catch (e) { error.value = e instanceof Error ? e.message : '保存评测结果失败'; }
    finally { if (id === generation) { busy.value = false; progress.value = ''; } }
  }
  async function clear(): Promise<void> {
    if (busy.value) return;
    try { await evaluationStore.clear(); await reload(); }
    catch (e) { error.value = e instanceof Error ? e.message : '无法删除评测记录'; }
  }
  function exportReport() {
    const data = { schema: 'deaify-eval-v1', createdAt: new Date().toISOString(), threshold: 60,
      disclaimer: 'Uncalibrated classifiers. Labels provided by the user.',
      primary: primaryStats.value, secondary: secondaryStats.value, records: rows.value };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'deaify-benchmark.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
  onScopeDispose(() => { generation++; });
  return { rows, busy, progress, error, primaryStats, secondaryStats, reload, evaluateFiles, clear, exportReport };
}
