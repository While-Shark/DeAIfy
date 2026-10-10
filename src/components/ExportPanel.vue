<script setup lang="ts">
import { Download, FileOutput, LoaderCircle, ShieldAlert } from 'lucide-vue-next';
import type { ExportFormat } from '../types/editor';

defineProps<{ hasImage: boolean; exporting: boolean; error: string; format: ExportFormat }>();
const emit = defineEmits<{ export: []; 'update:format': [value: ExportFormat] }>();
function chooseFormat(event: Event): void {
  emit('update:format', (event.target as HTMLSelectElement).value as ExportFormat);
}
</script>

<template>
  <section class="panel-section export-section" aria-labelledby="export-title">
    <div class="section-heading"><span class="section-index">04</span><h2 id="export-title">导出图片</h2></div>
    <label class="format-label" for="output-format"><FileOutput :size="15" /> 输出格式</label>
    <select id="output-format" class="format-select" :value="format" :disabled="!hasImage" @change="chooseFormat">
      <option value="image/png">PNG · 无损 / 透明背景</option>
      <option value="image/jpeg">JPG · 高质量 / 轻量</option>
      <option value="image/webp">WebP · 高质量 / 高压缩</option>
    </select>
    <button type="button" class="export-primary" :disabled="!hasImage || exporting" @click="emit('export')">
      <LoaderCircle v-if="exporting" class="spin" :size="18" />
      <Download v-else :size="18" />
      {{ exporting ? '正在导出原始分辨率…' : '导出高清图片' }}
    </button>
    <p v-if="error" class="inline-error" role="alert">{{ error }}</p>
    <p class="export-warning"><ShieldAlert :size="15" /> 重新编码可能导致原始来源凭证丢失；请保留原图并按平台要求披露 AI 来源。</p>
  </section>
</template>
