<script setup lang="ts">
import { ref } from 'vue';
import { Brush, Database, HardDrive, ScanEye, SlidersHorizontal } from 'lucide-vue-next';
import AdjustmentsPanel from './AdjustmentsPanel.vue';
import AdvancedAnalysisPanel from './AdvancedAnalysisPanel.vue';
import BrushControls from './BrushControls.vue';
import EvaluationPanel from './EvaluationPanel.vue';
import ModelManager from './ModelManager.vue';
import type { ConfusionMatrix } from '../engine/evaluation';
import type { AdvancedAnalysisReport, BrushTool, EvaluationRecord, ImageOriginLabel, PresetId, ProcessingParams } from '../types/editor';

defineProps<{
  hasImage: boolean;
  presetId: PresetId;
  params: ProcessingParams;
  canScore: boolean;
  scoring: boolean;
  processedScore: number | null;
  advancedReport: AdvancedAnalysisReport | null;
  advancedBusy: boolean;
  advancedStage: string;
  advancedError: string;
  includeSecondary: boolean;
  brushEnabled: boolean;
  brushTool: BrushTool;
  brushRadius: number;
  brushAmount: number;
  brushCount: number;
  evalRows: EvaluationRecord[];
  evalBusy: boolean;
  evalProgress: string;
  evalError: string;
  primaryStats: ConfusionMatrix;
  secondaryStats: ConfusionMatrix;
}>();
const emit = defineEmits<{
  'select-preset': [value: PresetId]; 'set-param': [key: keyof ProcessingParams, value: number]; score: [];
  analyze: []; 'update:includeSecondary': [value: boolean];
  'update:brushEnabled': [value: boolean]; 'update:brushTool': [value: BrushTool];
  'update:brushRadius': [value: number]; 'update:brushAmount': [value: number];
  'undo-brush': []; 'clear-brush': [];
  'evaluate': [files: File[], label: ImageOriginLabel, secondary: boolean];
  'reload-eval': []; 'clear-eval': []; 'export-eval': [];
}>();
type Section = 'analysis' | 'adjustments' | 'brush' | 'evaluation' | 'cache';
const active = ref<Section>('analysis');
const sections: { id: Section; label: string; icon: typeof ScanEye }[] = [
  { id: 'analysis', label: '分析', icon: ScanEye },
  { id: 'adjustments', label: '调节', icon: SlidersHorizontal },
  { id: 'brush', label: '画笔', icon: Brush },
  { id: 'evaluation', label: '评测', icon: Database },
  { id: 'cache', label: '模型', icon: HardDrive },
];
</script>

<template>
  <div class="advanced-studio">
    <div class="advanced-tabs" role="tablist" aria-label="高级模式功能">
      <button v-for="section in sections" :key="section.id" type="button" role="tab"
        :aria-selected="active === section.id" :class="{ selected: active === section.id }"
        @click="active=section.id"><component :is="section.icon" :size="14" />{{ section.label }}</button>
    </div>
    <AdvancedAnalysisPanel v-if="active==='analysis'" :has-image="hasImage" :ready="canScore"
      :busy="advancedBusy" :stage="advancedStage" :error="advancedError"
      :report="advancedReport" :include-secondary="includeSecondary"
      @analyze="emit('analyze')" @update:include-secondary="emit('update:includeSecondary', $event)" />
    <AdjustmentsPanel v-else-if="active==='adjustments'" :has-image="hasImage" :preset-id="presetId" :params="params"
      :can-score="canScore" :scoring="scoring" :processed-score="processedScore"
      @score="emit('score')" @select-preset="emit('select-preset', $event)"
      @set-param="(key, value) => emit('set-param', key, value)" />
    <BrushControls v-else-if="active==='brush'" :has-image="hasImage" :enabled="brushEnabled"
      :tool="brushTool" :radius="brushRadius" :amount="brushAmount" :count="brushCount"
      @update:enabled="emit('update:brushEnabled', $event)" @update:tool="emit('update:brushTool', $event)"
      @update:radius="emit('update:brushRadius', $event)" @update:amount="emit('update:brushAmount', $event)"
      @undo="emit('undo-brush')" @clear="emit('clear-brush')" />
    <EvaluationPanel v-else-if="active==='evaluation'" :records="evalRows" :busy="evalBusy"
      :progress="evalProgress" :error="evalError" :include-secondary="includeSecondary"
      :primary-stats="primaryStats" :secondary-stats="secondaryStats"
      @evaluate="(files, label, secondary) => emit('evaluate', files, label, secondary)"
      @reload="emit('reload-eval')" @clear="emit('clear-eval')" @export="emit('export-eval')" />
    <ModelManager v-else-if="active==='cache'" />
  </div>
</template>
