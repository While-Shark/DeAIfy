<script setup lang="ts">
import { BarChart3, LoaderCircle } from 'lucide-vue-next';
import QualityBreakdown from './QualityBreakdown.vue';
import type { NaturalnessMetrics } from '../types/editor';

defineProps<{
  hasImage: boolean;
  source: NaturalnessMetrics | null;
  processed: NaturalnessMetrics | null;
  sourceStatus: 'idle' | 'loading' | 'complete' | 'error';
  processedStatus: 'idle' | 'loading' | 'complete' | 'error';
  sourceError: string;
  processedError: string;
}>();
</script>

<template>
  <section class="panel-section quality-section" aria-labelledby="quality-title">
    <div class="section-heading">
      <span class="section-index">03</span>
      <h2 id="quality-title">多维度画质评分</h2>
      <span class="section-chip">LOCAL</span>
    </div>
    <div v-if="!hasImage" class="quality-empty"><BarChart3 :size="22" />上传图片后查看四项画质指标。</div>
    <div v-else>
      <div v-if="sourceStatus === 'loading'" class="quality-loading"><LoaderCircle :size="14" class="spin" />正在分析原图画面…</div>
      <p v-else-if="sourceStatus === 'error'" class="inline-error">{{ sourceError }}</p>
      <template v-if="source">
        <div class="quality-total">
          <div><span>原图参考指数</span><strong>{{ source.index.toFixed(1) }}</strong></div>
          <span class="quality-total-arrow">→</span>
          <div><span>处理后参考指数</span><strong>{{ processed ? processed.index.toFixed(1) : '—' }}</strong></div>
        </div>
        <QualityBreakdown :source="source" :processed="processed" />
        <p v-if="processedStatus === 'loading'" class="quality-loading"><LoaderCircle :size="13" class="spin" />正在分析处理后画面…</p>
        <p v-else-if="processedStatus === 'error'" class="inline-error">{{ processedError }}</p>
        <p v-else-if="!processed" class="quality-help">调整方案后，点击右侧“检测当前处理效果”查看对比。</p>
        <p v-else class="quality-help">{{ processed.notes[0] }}</p>
      </template>
    </div>
    <p class="quality-disclaimer">这四项是曝光、色彩与纹理等画质启发式指标，不是 AI 生成概率，也不保证分数越高就越好。</p>
  </section>
</template>
