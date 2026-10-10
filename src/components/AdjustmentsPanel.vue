<script setup lang="ts">
import { Clapperboard, LoaderCircle, Mountain, ScanSearch, SlidersHorizontal, Sparkles, Sun, UserRound } from 'lucide-vue-next';
import { PRESETS } from '../engine/presets';
import type { PresetId, ProcessingParams } from '../types/editor';

const props = defineProps<{
  hasImage: boolean;
  presetId: PresetId;
  params: ProcessingParams;
  canScore: boolean;
  scoring: boolean;
  processedScore: number | null;
}>();
const emit = defineEmits<{
  'select-preset': [id: PresetId];
  'set-param': [key: keyof ProcessingParams, value: number];
  'score': [];
}>();

const icons = { natural: Mountain, portrait: UserRound, film: Clapperboard, documentary: Sparkles, softlight: Sun };
const controls: { key: keyof ProcessingParams; label: string; min: number; max: number; description: string }[] = [
  { key: 'strength', label: '自然化强度', min: 0, max: 100, description: '总体效果混合比例' },
  { key: 'grain', label: '真实颗粒', min: 0, max: 80, description: '细节噪声质感' },
  { key: 'softness', label: '柔和度', min: 0, max: 50, description: '降低过度锐利' },
  { key: 'texture', label: '纹理细节', min: 0, max: 60, description: '适量提升局部对比' },
  { key: 'saturation', label: '饱和度', min: -40, max: 40, description: '调整色彩强弱' },
  { key: 'contrast', label: '对比度', min: -40, max: 40, description: '调整画面层次' },
  { key: 'warmth', label: '色温', min: -40, max: 40, description: '冷暖色调偏移' },
];
function update(key: keyof ProcessingParams, event: Event): void {
  emit('set-param', key, Number((event.target as HTMLInputElement).value));
}
</script>

<template>
  <section class="panel-section adjustments-section" aria-labelledby="adjustments-title">
    <div class="section-heading"><span class="section-index">03</span><h2 id="adjustments-title">自然化工作台</h2></div>
    <div class="section-subheading"><Sparkles :size="14" /> 内置 5 套自然化方案 · 点击即可应用</div>
    <div class="preset-grid" :class="{ 'inactive-panel': !hasImage }">
      <button
        v-for="preset in PRESETS" :key="preset.id" class="preset-tile"
        :class="{ selected: presetId === preset.id }" type="button"
        :aria-pressed="presetId === preset.id" :disabled="!hasImage"
        @click="emit('select-preset', preset.id)"
      >
        <component :is="icons[preset.id]" :size="20" :stroke-width="1.5" />
        <strong>{{ preset.title }}</strong>
        <span>{{ preset.subtitle }}</span>
      </button>
    </div>
    <div class="preset-review-action">
      <button class="secondary-button preset-score-button" type="button"
        :disabled="!canScore || scoring" @click="emit('score')">
        <LoaderCircle v-if="scoring" class="spin" :size="15" />
        <ScanSearch v-else :size="15" />
        {{ scoring ? '正在评分…' : processedScore === null ? '检测当前处理效果' : '重新检测当前效果' }}
      </button>
      <p v-if="processedScore !== null" class="preset-score-hint">当前预览模型评分：<strong>{{ processedScore }} / 100</strong></p>
      <p v-else class="preset-score-hint">应用方案后手动评分；仅对当前预览图进行初筛。</p>
    </div>
    <div class="controls-heading"><SlidersHorizontal :size="15" /><span>精细调节</span><span class="controls-hint">ADVANCED</span></div>
    <div class="sliders-list" :class="{ 'inactive-panel': !hasImage }">
      <label v-for="control in controls" :key="control.key" class="slider-field">
        <span class="slider-label"><span>{{ control.label }}</span><output>{{ props.params[control.key] }}{{ control.key === 'strength' ? '%' : '' }}</output></span>
        <input type="range" :min="control.min" :max="control.max" :value="props.params[control.key]"
          :disabled="!hasImage" :aria-label="control.label" @input="update(control.key, $event)" />
        <span class="slider-description">{{ control.description }}</span>
      </label>
    </div>
  </section>
</template>
