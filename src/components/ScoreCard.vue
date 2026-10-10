<script setup lang="ts">
import { computed } from 'vue';
import { AlertCircle, BadgeCheck, CheckCircle2, CircleHelp, LoaderCircle, RefreshCw, ScanSearch, ShieldAlert } from 'lucide-vue-next';
import { getScoreLabel, getVerdict, PASS_SCORE } from '../engine/scoring';
import type { ProvenanceResult, ScanStatus } from '../types/editor';

const props = defineProps<{
  hasImage: boolean;
  score: number | null;
  processedScore: number | null;
  status: ScanStatus;
  processedStatus: ScanStatus;
  progress: number | null;
  phase: 'download' | 'evaluate';
  provenance: ProvenanceResult;
  error: string;
  canRescore: boolean;
}>();
const emit = defineEmits<{ rescore: [] }>();
const verdict = computed(() => props.score === null ? 'unknown' : getVerdict(props.score));
const ringDasharray = computed(() => `${(props.score ?? 0) * 2.513} 251.3`);
const scanning = computed(() => ['loading', 'evaluating'].includes(props.status));
</script>

<template>
  <section class="panel-section score-section" aria-labelledby="score-title">
    <div class="section-heading"><span class="section-index">02</span><h2 id="score-title">AI 真实度初筛</h2><span class="section-chip">LOCAL AI</span></div>
    <div class="score-card">
      <template v-if="!hasImage">
        <div class="score-empty-icon"><ScanSearch :size="28" :stroke-width="1.3" /></div>
        <div class="score-empty-title">等待检测</div>
        <p class="score-muted">上传图片后自动调用本地模型，对真实摄影特征进行初步评分。</p>
      </template>
      <template v-else>
        <div class="score-readout">
          <div class="score-gauge" :class="verdict">
            <svg viewBox="0 0 100 100" aria-hidden="true">
              <circle class="gauge-track" cx="50" cy="50" r="40" />
              <circle v-if="score !== null" class="gauge-fill" cx="50" cy="50" r="40" :stroke-dasharray="ringDasharray" transform="rotate(-90 50 50)" />
            </svg>
            <div class="gauge-value">
              <template v-if="score !== null"><strong>{{ score }}</strong><span>/ 100</span></template>
              <LoaderCircle v-else-if="scanning" class="spin" :size="27" />
              <span v-else class="score-unknown">—</span>
            </div>
          </div>
          <div class="score-copy">
            <template v-if="score !== null">
              <span class="score-overline">REALITY SCORE</span>
              <strong :class="verdict === 'passed' ? 'passed-text' : 'suspected-text'">{{ getScoreLabel(score) }}</strong>
              <p>{{ verdict === 'passed' ? '达到 60 分初筛阈值' : '低于 60 分初筛阈值' }}</p>
            </template>
            <template v-else-if="scanning">
              <span class="score-overline">ANALYZING</span>
              <strong>{{ phase === 'download' ? '正在加载模型' : '正在分析图像' }}</strong>
              <p>{{ phase === 'download' ? (progress !== null ? `模型下载中 ${progress}%` : '首次使用需下载约 15 MB 模型') : '通过 WebAssembly 本地推理' }}</p>
            </template>
            <template v-else>
              <span class="score-overline">UNAVAILABLE</span>
              <strong>检测未完成</strong>
              <p>请检查网络或重新上传</p>
            </template>
          </div>
        </div>
        <div v-if="scanning" class="scan-progress"><div :style="{ width: `${phase === 'evaluate' ? 95 : (progress ?? 12)}%` }"></div></div>
        <p v-if="status === 'error'" class="inline-error" role="alert">{{ error }}</p>
        <div v-if="score !== null" class="score-scale">
          <div class="scale-ramp"><span :style="{ left: `${PASS_SCORE}%` }"></span></div>
          <div class="scale-labels"><span>疑似 AI</span><span>及格线 60</span><span>模型倾向真实</span></div>
        </div>
        <div class="credential-box">
          <component :is="provenance.status === 'ai-declared' ? ShieldAlert : provenance.status === 'c2pa' ? BadgeCheck : CircleHelp" :size="16" />
          <span>{{ provenance.message }}</span>
        </div>
        <div v-if="processedScore !== null" class="rescore-result">
          <CheckCircle2 :size="15" /> 处理后模型评分 <strong>{{ processedScore }} / 100</strong>
        </div>
        <button class="secondary-button rescore-button" type="button" :disabled="!canRescore || processedStatus === 'loading'" @click="emit('rescore')">
          <LoaderCircle v-if="processedStatus === 'loading'" class="spin" :size="14" />
          <RefreshCw v-else :size="14" />
          {{ processedStatus === 'loading' ? '正在重新检测…' : '检测处理后的图片' }}
        </button>
        <p v-if="processedStatus === 'error'" class="subtle-note"><AlertCircle :size="13" /> 重新检测失败，可稍后重试。</p>
      </template>
    </div>
    <p class="score-disclaimer">模型评分并非真实概率或来源证明；即使超过 60 分也可能是 AI 图片。C2PA 检测与视觉评分彼此独立。</p>
  </section>
</template>
