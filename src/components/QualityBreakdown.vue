<script setup lang="ts">
import type { NaturalnessMetrics, QualityDimensions } from '../types/editor';

const props = withDefaults(defineProps<{
  source: NaturalnessMetrics | null;
  processed: NaturalnessMetrics | null;
  processedLabel?: string;
}>(), { processedLabel: '当前效果' });

type Axis = { key: keyof QualityDimensions; label: string; description: string };
const axes: Axis[] = [
  { key: 'exposure', label: '曝光层次', description: '高光与暗部裁切' },
  { key: 'color', label: '色彩平衡', description: '避免过高饱和度' },
  { key: 'texture', label: '纹理细节', description: '局部变化的适度性' },
  { key: 'edges', label: '边缘控制', description: '避免过强锐化' },
];

function value(metrics: NaturalnessMetrics | null, key: keyof QualityDimensions): string {
  return metrics ? metrics.dimensions[key].toFixed(1) : '—';
}
function difference(key: keyof QualityDimensions): number | null {
  if (!props.source || !props.processed) return null;
  return Math.round((props.processed.dimensions[key] - props.source.dimensions[key]) * 10) / 10;
}
</script>

<template>
  <div class="quality-breakdown">
    <div v-for="axis in axes" :key="axis.key" class="quality-axis">
      <div class="quality-axis-heading">
        <strong>{{ axis.label }}</strong>
        <span :aria-label="axis.description">{{ axis.description }}</span>
      </div>
      <div class="quality-axis-values">
        <span>原图 <b>{{ value(source, axis.key) }}</b></span>
        <span>{{ processedLabel }} <b>{{ value(processed, axis.key) }}</b></span>
        <span v-if="difference(axis.key) !== null" class="quality-axis-delta"
          :class="{ negative: difference(axis.key)! < 0 }">
          {{ difference(axis.key)! > 0 ? '+' : '' }}{{ difference(axis.key)!.toFixed(1) }}
        </span>
      </div>
      <div class="quality-axis-tracks" aria-hidden="true">
        <div class="quality-axis-track"><span class="quality-original-bar" :style="{ width: (source?.dimensions[axis.key] ?? 0) + '%' }"></span></div>
        <div class="quality-axis-track"><span class="quality-processed-bar" :style="{ width: (processed?.dimensions[axis.key] ?? 0) + '%' }"></span></div>
      </div>
    </div>
  </div>
</template>
