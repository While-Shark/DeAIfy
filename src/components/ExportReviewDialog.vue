<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { AlertCircle, ArrowRight, CheckCircle2, Download, FileCheck2, LoaderCircle, RefreshCw, ShieldAlert, X } from 'lucide-vue-next';
import { getScoreLabel, getVerdict } from '../engine/scoring';
import QualityBreakdown from './QualityBreakdown.vue';
import { reviewCopy as copy } from '../i18n/exportReview';
import type { ExportReviewReport, ExportReviewStage, ProvenanceResult } from '../types/editor';

const props = defineProps<{
  commercial?: boolean;
  stage: ExportReviewStage;
  report: ExportReviewReport | null;
  error: string;
}>();
const emit = defineEmits<{ close: []; retry: []; confirm: [] }>();
const dialog = ref<HTMLElement | null>(null);
const locked = computed(() => !!props.commercial &&
  (props.stage === 'rendering' || props.stage === 'assessing'));
function closeIfAllowed(): void {
  // Closing a paid operation mid-request can discard the final Blob after a
  // successful server debit. Do not offer a misleading cancel action.
  if (!locked.value) emit('close');
}
const incomplete = computed(() => !!props.report && (
  props.report.originalScore === null || props.report.exportedScore === null ||
  props.report.originalQuality === null || props.report.exportedQuality === null ||
  props.report.originalProvenance.status === 'unavailable' ||
  props.report.exportedProvenance.status === 'unavailable'
));
const credentialLost = computed(() => !!props.report &&
  ['c2pa', 'ai-declared'].includes(props.report.originalProvenance.status) &&
  props.report.exportedProvenance.status === 'none');

function displayScore(score: number | null): string {
  return score === null ? '--' : score.toFixed(2);
}
function scoreClass(score: number | null): string {
  return score === null ? 'unknown' : getVerdict(score);
}
function credentialClass(provenance: ProvenanceResult): string {
  return provenance.status === 'ai-declared' ? 'declared' : provenance.status;
}
function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeIfAllowed();
    return;
  }
  if (event.key !== 'Tab' || !dialog.value) return;
  const controls = [...dialog.value.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex="0"]')];
  if (!controls.length) return;
  const first = controls[0];
  const last = controls[controls.length - 1];
  if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.value)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
onMounted(() => dialog.value?.focus());
</script>

<template>
  <div class="review-overlay" @click.self="closeIfAllowed">
    <section ref="dialog" class="review-dialog" role="dialog" aria-modal="true" aria-labelledby="review-title" tabindex="-1" @keydown="onKeydown">
      <header class="review-header">
        <div class="review-title-group">
          <span class="review-kicker">{{ commercial ? 'EXPORT VERIFICATION / VPS' : 'EXPORT VERIFICATION / LOCAL' }}</span>
          <h2 id="review-title">{{ copy.title }}</h2>
          <p>{{ copy.subtitle }}</p>
        </div>
        <button class="review-icon-button" type="button" :aria-label="copy.close" :disabled="locked" @click="closeIfAllowed"><X :size="19" /></button>
      </header>

      <div v-if="stage === 'rendering' || stage === 'assessing'" class="review-progress" aria-live="polite">
        <div class="review-loading-icon"><LoaderCircle class="spin" :size="30" /></div>
        <strong>{{ stage === 'rendering' ? copy.loadingTitle : copy.analyzingTitle }}</strong>
        <p>{{ stage === 'rendering' ? copy.loadingHint : copy.analyzingHint }}</p>
        <p v-if="commercial" class="review-charge-notice" role="status">
          已确认在 VPS 处理：生成成功会占用一次免费额度或积分。请等待处理与复检完成；需要重新检测时不会重复扣费。
        </p>
        <div class="review-progress-line"><span :class="stage"></span></div>
      </div>

      <div v-else-if="stage === 'error'" class="review-failure" role="alert">
        <AlertCircle :size="27" />
        <strong>{{ copy.stageError }}</strong>
        <p>{{ error }}</p>
      </div>

      <div v-else-if="stage === 'ready' && report" class="review-body">
        <p v-if="commercial" class="review-charge-notice" role="status">
          本次 VPS 图片处理已完成并计次。重新检测只运行评分，不会再次处理或扣除积分；关闭报告后可在账户的导出记录中限时免费下载。
        </p>
        <div class="review-output-meta">
          <FileCheck2 :size="17" />
          <div><strong>{{ report.filename }}</strong><span>{{ (report.fileSize / 1024 / 1024).toFixed(2) }} MB</span></div>
          <span class="review-ready-dot"><CheckCircle2 :size="15" /></span>
        </div>
        <div class="review-score-heading"><strong>{{ copy.scoreLabel }}</strong><span>{{ copy.threshold }}</span></div>
        <div class="review-scores">
          <article class="review-score-item" :class="scoreClass(report.originalScore)">
            <span class="review-field-title">{{ copy.sourceTitle }}</span>
            <div class="review-number">{{ displayScore(report.originalScore) }}<small>/ 100</small></div>
            <p>{{ report.originalScore === null ? copy.unavailable : getScoreLabel(report.originalScore) }}</p>
            <div class="review-score-track"><span :style="{ width: `${report.originalScore ?? 0}%` }"></span></div>
          </article>
          <div class="review-score-arrow"><ArrowRight :size="19" /></div>
          <article class="review-score-item" :class="scoreClass(report.exportedScore)">
            <span class="review-field-title">{{ copy.outputTitle }}</span>
            <div class="review-number">{{ displayScore(report.exportedScore) }}<small>/ 100</small></div>
            <p>{{ report.exportedScore === null ? copy.unavailable : getScoreLabel(report.exportedScore) }}</p>
            <div class="review-score-track"><span :style="{ width: `${report.exportedScore ?? 0}%` }"></span></div>
          </article>
        </div>
        <div class="review-delta" aria-live="polite">
          <span>{{ copy.scoreDelta }}</span>
          <strong v-if="report.delta !== null" :class="{ 'delta-positive': report.delta > 0, 'delta-negative': report.delta < 0 }">
            {{ report.delta > 0 ? '+' : '' }}{{ report.delta.toFixed(2) }} {{ copy.points }}
          </strong>
          <strong v-else>{{ copy.noDelta }}</strong>
        </div>
        <div v-if="report.originalError || report.exportedError" class="review-incomplete" role="status">
          <AlertCircle :size="16" />
          <div>
            <p v-if="report.originalError">{{ copy.failedSource }}: {{ report.originalError }}</p>
            <p v-if="report.exportedError">{{ copy.failedOutput }}: {{ report.exportedError }}</p>
            <p>{{ copy.reportUnavailable }}</p>
          </div>
        </div>

        <section class="review-quality" aria-labelledby="review-quality-title">
          <div class="review-score-heading">
            <strong id="review-quality-title">多维度画质评分</strong>
            <span>本地图像诊断 · 非 AI 概率</span>
          </div>
          <div class="review-quality-indexes">
            <span>原图指数：<strong>{{ report.originalQuality ? report.originalQuality.index.toFixed(1) : '—' }}</strong></span>
            <span>导出指数：<strong>{{ report.exportedQuality ? report.exportedQuality.index.toFixed(1) : '—' }}</strong></span>
          </div>
          <QualityBreakdown :source="report.originalQuality" :processed="report.exportedQuality"
            processed-label="导出图" />
          <p v-if="report.originalQualityError || report.exportedQualityError" class="inline-error" role="status">
            {{ report.originalQualityError || report.exportedQualityError }}
          </p>
          <p class="review-quality-note">曝光、色彩、纹理、边缘均为启发式观感指标，仅适合对同一张图的前后版本做参考比较。分数变高不代表非 AI 生成。</p>
        </section>
        <section class="review-provenance" aria-labelledby="review-provenance-title">
          <h3 id="review-provenance-title"><ShieldAlert :size="17" /> {{ copy.provenanceTitle }}</h3>
          <div class="review-provenance-grid">
            <div><span>{{ copy.sourceProvenance }}</span><p :class="credentialClass(report.originalProvenance)">{{ report.originalProvenance.message }}</p></div>
            <div><span>{{ copy.exportProvenance }}</span><p :class="credentialClass(report.exportedProvenance)">{{ report.exportedProvenance.message }}</p></div>
          </div>
          <p v-if="credentialLost" class="review-credential-caution">{{ copy.credentialCaution }}</p>
        </section>
        <p class="review-legal">{{ copy.caution }}</p>
      </div>

      <footer class="review-actions">
        <button type="button" class="review-secondary" :disabled="locked" @click="closeIfAllowed">
          {{ commercial && stage === 'ready' ? '返回工作台（本次已计次）' : copy.cancel }}
        </button>
        <template v-if="stage === 'ready'">
          <button type="button" class="review-secondary" @click="emit('retry')"><RefreshCw :size="14" /> {{ copy.retry }}</button>
          <button type="button" class="review-confirm" @click="emit('confirm')"><Download :size="16" />{{ incomplete ? copy.confirmIncomplete : copy.confirm }}</button>
        </template>
        <button v-else-if="stage === 'error'" type="button" class="review-confirm" @click="emit('retry')"><RefreshCw :size="16" />{{ copy.retryRender }}</button>
      </footer>
    </section>
  </div>
</template>
