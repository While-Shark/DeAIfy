<script setup lang="ts">
import { AlertTriangle, FlaskConical, LoaderCircle, ScanEye } from 'lucide-vue-next';
import type { AdvancedAnalysisReport, AdvancedImageScores } from '../types/editor';

defineProps<{
  hasImage: boolean;
  busy: boolean;
  ready: boolean;
  stage: string;
  error: string;
  report: AdvancedAnalysisReport | null;
  includeSecondary: boolean;
}>();
const emit = defineEmits<{ analyze: []; 'update:includeSecondary': [value: boolean] }>();
const scoreText = (n: number | null) => n === null ? '—' : n.toFixed(2);
const qualityText = (score: AdvancedImageScores) => score.naturalness?.index.toFixed(2) ?? '—';
</script>

<template>
  <section class="advanced-section">
    <h3><ScanEye :size="17" /> 双维度图像分析</h3>
    <p class="advanced-copy">视觉检测模型与自然度诊断分开计算。数值不是照片真实性的概率，也不能预测 X 的标签。</p>
    <label class="advanced-toggle"><input type="checkbox" :checked="includeSecondary" :disabled="busy"
      @change="emit('update:includeSecondary', ($event.target as HTMLInputElement).checked)" />
      <span>启用第二个检测模型 <small>首次额外下载约 57 MB · 桌面端推荐</small></span>
    </label>
    <button type="button" class="advanced-primary" :disabled="!hasImage || !ready || busy" @click="emit('analyze')">
      <LoaderCircle v-if="busy" class="spin" :size="16" /><FlaskConical v-else :size="16" />
      {{ busy ? `分析中：${stage}` : '分析当前原图与成品' }}
    </button>
    <p v-if="error" class="inline-error">{{ error }}</p>
    <template v-if="report">
      <div class="advanced-metric-head"><span>指标（0–100）</span><span>原图</span><span>处理后</span></div>
      <div class="advanced-metric-row"><span>基础模型 · 真实倾向</span><strong>{{ scoreText(report.original.primary) }}</strong><strong>{{ scoreText(report.processed.primary) }}</strong></div>
      <div v-if="report.hasSecondary" class="advanced-metric-row"><span>交叉模型 · 真实倾向</span><strong>{{ scoreText(report.original.secondary) }}</strong><strong>{{ scoreText(report.processed.secondary) }}</strong></div>
      <div class="advanced-metric-row"><span>自然度诊断指数</span><strong>{{ qualityText(report.original) }}</strong><strong>{{ qualityText(report.processed) }}</strong></div>
      <div v-if="report.processed.naturalness" class="advanced-diagnostics">
        <span>细节诊断</span>
        <p>亮暗裁切 {{ report.processed.naturalness.clippedPercent }}% · 饱和度 {{ report.processed.naturalness.averageSaturation }}% · 纹理指数 {{ report.processed.naturalness.textureIndex }}</p>
        <p v-for="note in report.processed.naturalness.notes" :key="note">• {{ note }}</p>
      </div>
      <p v-if="report.hasSecondary && report.original.primary !== null && report.original.secondary !== null && Math.abs(report.original.primary-report.original.secondary)>20" class="advanced-warn">
        <AlertTriangle :size="15" /> 两个模型对原图判断分歧较大，请勿将单个结果视为鉴定结论。
      </p>
      <p v-for="warning in report.warnings" :key="warning" class="advanced-warn">{{ warning }}</p>
    </template>
    <p v-else class="advanced-empty">先应用自然化参数，再点击分析。修改图片会自动清除过时的分析结果。</p>
  </section>
</template>
