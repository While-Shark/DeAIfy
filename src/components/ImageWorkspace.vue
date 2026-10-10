<script setup lang="ts">
import { computed, ref } from 'vue';
import { ImagePlus, Layers3, MoveHorizontal, Paintbrush, Sparkles } from 'lucide-vue-next';
import type { BrushStroke, BrushTool } from '../types/editor';

const props = defineProps<{
  hasImage: boolean;
  originalUrl: string;
  previewUrl: string;
  filename: string;
  compare: number;
  isProcessing: boolean;
  error: string;
  brushEnabled?: boolean;
  brushTool?: BrushTool;
  brushRadius?: number;
  brushAmount?: number;
}>();
const emit = defineEmits<{
  'update:compare': [value: number];
  'brush-stroke': [point: BrushStroke];
  'brush-complete': [];
}>();
const stage = ref<HTMLElement | null>(null);
const image = ref<HTMLImageElement | null>(null);
const painting = ref(false);
const cursor = ref<{ x: number; y: number; radius: number } | null>(null);
let previous: { x: number; y: number } | null = null;
const cropStyle = computed(() => ({ clipPath: `inset(0 ${100 - props.compare}% 0 0)` }));
const handleStyle = computed(() => ({ left: `${props.compare}%` }));
function updateCompare(event: Event): void {
  emit('update:compare', Number((event.target as HTMLInputElement).value));
}

/** Pointer-to-image mapping uses the actual object-fit:contain rectangle. */
function imageCoordinates(event: PointerEvent): { x: number; y: number; radius: number; dx: number; dy: number } | null {
  if (!stage.value || !image.value?.naturalWidth || !image.value.naturalHeight) return null;
  const bounds = stage.value.getBoundingClientRect();
  const ratio = Math.min(bounds.width / image.value.naturalWidth, bounds.height / image.value.naturalHeight);
  const w = image.value.naturalWidth * ratio;
  const h = image.value.naturalHeight * ratio;
  const offsetX = (bounds.width - w) / 2;
  const offsetY = (bounds.height - h) / 2;
  const px = event.clientX - bounds.left - offsetX;
  const py = event.clientY - bounds.top - offsetY;
  if (px < 0 || py < 0 || px > w || py > h) return null;
  return { x: px / w, y: py / h,
    dx: event.clientX, dy: event.clientY,
    radius: (props.brushRadius ?? 0.06) * Math.min(w, h) };
}
function mark(event: PointerEvent, force = false) {
  if (!props.brushEnabled || !props.hasImage) return;
  const point = imageCoordinates(event);
  if (!point) { cursor.value = null; return; }
  if (stage.value) {
    const rect = stage.value.getBoundingClientRect();
    cursor.value = { x: event.clientX - rect.left, y: event.clientY - rect.top, radius: point.radius };
  }
  if (!painting.value) return;
  if (previous && !force && Math.hypot(point.dx - previous.x, point.dy - previous.y) < 10) return;
  previous = { x: point.dx, y: point.dy };
  emit('brush-stroke', { x: point.x, y: point.y,
    radius: props.brushRadius ?? 0.06, amount: props.brushAmount ?? 0.5,
    tool: props.brushTool ?? 'lighten' });
}
function down(event: PointerEvent): void {
  if (!props.brushEnabled || !props.hasImage || event.button !== 0 || !imageCoordinates(event)) return;
  event.preventDefault();
  painting.value = true;
  previous = null;
  stage.value?.setPointerCapture(event.pointerId);
  mark(event, true);
}
function move(event: PointerEvent): void { mark(event); }
function up(event: PointerEvent): void {
  if (!painting.value) return;
  mark(event, true);
  painting.value = false;
  previous = null;
  if (stage.value?.hasPointerCapture(event.pointerId)) stage.value.releasePointerCapture(event.pointerId);
  emit('brush-complete');
}
function cancelPainting(event: PointerEvent) {
  if (!painting.value) return;
  painting.value = false;
  previous = null;
  if (stage.value?.hasPointerCapture(event.pointerId)) stage.value.releasePointerCapture(event.pointerId);
  emit('brush-complete');
}
</script>

<template>
  <section class="stage-panel" aria-label="图像编辑预览">
    <div class="stage-toolbar">
      <div class="stage-breadcrumb"><span>WORKSPACE</span><span class="breadcrumb-slash">/</span><strong>{{ hasImage ? filename : 'Untitled image' }}</strong></div>
      <span class="stage-status"><span class="status-dot"></span> {{ hasImage ? (isProcessing ? '本地处理中' : brushEnabled ? '局部画笔' : '本地预览') : 'READY TO CREATE' }}</span>
    </div>
    <div ref="stage" class="stage-view" :class="{ 'stage-view-filled': hasImage, 'brush-active': brushEnabled && hasImage }"
      @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="cancelPainting" @pointerleave="cursor=null">
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
        <img ref="image" class="stage-image" :src="previewUrl || originalUrl" alt="处理后的图像预览" draggable="false" />
        <img v-if="previewUrl && !brushEnabled" class="stage-image stage-before" :src="originalUrl" alt="处理前原始图像" :style="cropStyle" draggable="false" />
        <template v-if="previewUrl && !brushEnabled">
          <div class="compare-line" :style="handleStyle" aria-hidden="true"><span class="compare-knob"><MoveHorizontal :size="17" /></span></div>
          <span class="image-tag tag-before">BEFORE</span>
          <span class="image-tag tag-after">AFTER</span>
          <input class="compare-range" type="range" min="0" max="100" step="1" :value="compare" aria-label="拖动比较处理前后的图片" @input="updateCompare" />
        </template>
        <template v-if="brushEnabled">
          <span class="image-tag tag-before"><Paintbrush :size="12" /> 区域画笔</span>
          <div v-if="cursor" class="brush-cursor" aria-hidden="true" :style="{ left: `${cursor.x}px`, top: `${cursor.y}px`, width: `${cursor.radius * 2}px`, height: `${cursor.radius * 2}px` }"></div>
        </template>
        <div v-if="isProcessing" class="preview-activity"><span class="pulse-dot"></span> 正在更新效果</div>
        <p v-if="error" class="preview-error" role="alert">{{ error }}</p>
      </template>
    </div>
    <div class="stage-footer">
      <div><Layers3 :size="15" /><span>{{ hasImage ? brushEnabled ? '在照片内涂抹，松开鼠标后更新预览' : '左右拖动比较原图与处理结果' : '你的图片只在当前设备中处理' }}</span></div>
      <span class="stage-footer-right">DeAIfy STUDIO&nbsp; / &nbsp;01</span>
    </div>
  </section>
</template>
