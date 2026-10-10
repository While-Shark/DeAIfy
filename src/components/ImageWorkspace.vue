<script setup lang="ts">
import { computed } from 'vue';
import { ImagePlus, Layers3, MoveHorizontal, Sparkles } from 'lucide-vue-next';

const props = defineProps<{
  hasImage: boolean;
  originalUrl: string;
  previewUrl: string;
  filename: string;
  compare: number;
  isProcessing: boolean;
  error: string;
}>();
const emit = defineEmits<{ 'update:compare': [value: number] }>();
const cropStyle = computed(() => ({ clipPath: `inset(0 ${100 - props.compare}% 0 0)` }));
const handleStyle = computed(() => ({ left: `${props.compare}%` }));
function updateCompare(event: Event): void {
  emit('update:compare', Number((event.target as HTMLInputElement).value));
}
</script>

<template>
  <section class="stage-panel" aria-label="图像编辑预览">
    <div class="stage-toolbar">
      <div class="stage-breadcrumb"><span>WORKSPACE</span><span class="breadcrumb-slash">/</span><strong>{{ hasImage ? filename : 'Untitled image' }}</strong></div>
      <span class="stage-status"><span class="status-dot"></span> {{ hasImage ? (isProcessing ? '本地处理中' : '本地预览') : 'READY TO CREATE' }}</span>
    </div>
    <div class="stage-view" :class="{ 'stage-view-filled': hasImage }">
      <template v-if="!hasImage">
        <div class="stage-empty-background"><div class="stage-glow"></div><div class="empty-orbit orbit-one"></div><div class="empty-orbit orbit-two"></div></div>
        <div class="stage-empty-content">
          <div class="stage-empty-mark"><ImagePlus :size="31" :stroke-width="1.5" /></div>
          <p class="stage-eyebrow">THE ART OF REALISM</p>
          <h1>Make it feel<br /><em>real.</em></h1>
          <p class="stage-description">让每一张图片，拥有更自然的质感。<br />无需上传服务器，直接在浏览器中完成。</p>
          <span class="stage-empty-hint"><Sparkles :size="14" /> 从左侧上传图片开始</span>
        </div>
      </template>
      <template v-else>
        <img class="stage-image" :src="previewUrl || originalUrl" alt="处理后的图像预览" draggable="false" />
        <img v-if="previewUrl" class="stage-image stage-before" :src="originalUrl" alt="处理前原始图像" :style="cropStyle" draggable="false" />
        <template v-if="previewUrl">
          <div class="compare-line" :style="handleStyle" aria-hidden="true"><span class="compare-knob"><MoveHorizontal :size="17" /></span></div>
          <span class="image-tag tag-before">BEFORE</span>
          <span class="image-tag tag-after">AFTER</span>
          <input class="compare-range" type="range" min="0" max="100" step="1" :value="compare" aria-label="拖动比较处理前后的图片" @input="updateCompare" />
        </template>
        <div v-if="isProcessing" class="preview-activity"><span class="pulse-dot"></span> 正在更新效果</div>
        <p v-if="error" class="preview-error" role="alert">{{ error }}</p>
      </template>
    </div>
    <div class="stage-footer">
      <div><Layers3 :size="15" /><span>{{ hasImage ? '左右拖动比较原图与处理结果' : '你的图片只在当前设备中处理' }}</span></div>
      <span class="stage-footer-right">DeAIfy STUDIO&nbsp; / &nbsp;01</span>
    </div>
  </section>
</template>
