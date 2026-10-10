<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Database, Download, LoaderCircle, Trash2, Upload } from 'lucide-vue-next';
import type { ConfusionMatrix } from '../engine/evaluation';
import type { EvaluationRecord, ImageOriginLabel } from '../types/editor';

const props = defineProps<{
  records: EvaluationRecord[];
  busy: boolean;
  progress: string;
  error: string;
  includeSecondary: boolean;
  primaryStats: ConfusionMatrix;
  secondaryStats: ConfusionMatrix;
}>();
const emit = defineEmits<{
  evaluate: [files: File[], label: ImageOriginLabel, secondary: boolean];
  reload: []; clear: []; export: [];
}>();
const label = ref<ImageOriginLabel>('real');
const input = ref<HTMLInputElement | null>(null);
onMounted(() => emit('reload'));
function importFiles(event: Event): void {
  const el = event.target as HTMLInputElement;
  const files = [...(el.files ?? [])];
  if (files.length) emit('evaluate', files, label.value, props.includeSecondary);
  if (input.value) input.value.value = '';
}
const format = (value: number | null) => value === null ? '—' : `${value.toFixed(1)}%`;
function confirmClear(): void { if (window.confirm('确定删除本地所有评测记录？')) emit('clear'); }
</script>

<template>
  <section class="advanced-section">
    <h3><Database :size="17" /> 本地模型评测集</h3>
    <p class="advanced-copy">由你提供真实来源标签，模型再推理。仅持久化文件名、分数和人工标签，不保存图片文件。</p>
    <label class="advanced-field">本次导入的真实标签
      <select v-model="label" :disabled="busy" class="advanced-select">
        <option value="real">真实拍摄（已知来源）</option>
        <option value="ai">AI 生成（已知来源）</option>
      </select>
    </label>
    <label class="advanced-upload" :class="{ disabled: busy }">
      <LoaderCircle v-if="busy" class="spin" :size="16" /><Upload v-else :size="16" />
      {{ busy ? '正在逐张评测…' : '选择图片并开始本地评测' }}
      <input ref="input" type="file" accept="image/png,image/jpeg,image/webp" multiple :disabled="busy" @change="importFiles" />
    </label>
    <p v-if="busy" role="status" class="advanced-copy">{{ progress }}</p>
    <p v-if="error" role="alert" class="inline-error">{{ error }}</p>
    <div class="eval-result">
      <div class="eval-metric"><span>基础模型准确率</span><strong>{{ format(primaryStats.accuracy) }}</strong><small>已评测 {{ primaryStats.classified }} 张</small></div>
      <div class="eval-metric"><span>真实图误报率</span><strong>{{ format(primaryStats.falsePositiveRate) }}</strong><small>误认为 AI</small></div>
      <div class="eval-metric"><span>AI 图漏报率</span><strong>{{ format(primaryStats.falseNegativeRate) }}</strong><small>误认为真实</small></div>
      <div v-if="secondaryStats.classified" class="eval-metric"><span>交叉模型准确率</span><strong>{{ format(secondaryStats.accuracy) }}</strong><small>已评测 {{ secondaryStats.classified }} 张</small></div>
    </div>
    <div class="advanced-row-actions">
      <span>{{ records.length }} 条本地记录</span>
      <button type="button" :disabled="!records.length || busy" @click="emit('export')"><Download :size="14" /> 报告</button>
      <button type="button" :disabled="!records.length || busy" @click="records.length && confirmClear()"><Trash2 :size="14" /> 清空</button>
    </div>
    <p class="advanced-copy">请同时使用真实照片与 AI 样本；只有一个类别时，无法完整评估误报与漏报。每次最多 25 张，本地缓存可能被浏览器回收。</p>
  </section>
</template>
