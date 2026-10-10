<script setup lang="ts">
import { ref } from 'vue';
import { Check, FileImage, UploadCloud } from 'lucide-vue-next';

defineProps<{
  filename: string;
  readableSize: string;
  width: number;
  height: number;
  hasImage: boolean;
  error: string;
}>();
const emit = defineEmits<{ select: [file: File] }>();
const input = ref<HTMLInputElement | null>(null);
const dragOver = ref(false);

function handleFiles(files: FileList | null): void {
  const file = files?.item(0);
  if (file) emit('select', file);
}
function onChange(event: Event): void {
  handleFiles((event.target as HTMLInputElement).files);
  if (input.value) input.value.value = '';
}
function onDrop(event: DragEvent): void {
  dragOver.value = false;
  handleFiles(event.dataTransfer?.files ?? null);
}
</script>

<template>
  <section class="panel-section upload-section" aria-labelledby="upload-title">
    <div class="section-heading"><span class="section-index">01</span><h2 id="upload-title">源文件</h2></div>
    <div
      class="upload-dropzone" :class="{ 'is-dragging': dragOver, 'has-file': hasImage }"
      role="button" tabindex="0" aria-label="选择图片上传"
      @click="input?.click()" @keydown.enter.prevent="input?.click()" @keydown.space.prevent="input?.click()"
      @dragenter.prevent="dragOver = true" @dragover.prevent="dragOver = true"
      @dragleave.prevent="dragOver = false" @drop.prevent="onDrop"
    >
      <div class="dropzone-icon"><component :is="hasImage ? FileImage : UploadCloud" :size="24" :stroke-width="1.7" /></div>
      <template v-if="!hasImage">
        <div class="dropzone-title">拖入图片或点击上传</div>
        <div class="dropzone-description">支持 PNG、JPG、WebP</div>
        <div class="dropzone-limit">最大 25 MB · 3000 万像素</div>
      </template>
      <template v-else>
        <div class="dropzone-title">替换当前图片</div>
        <div class="dropzone-description">点击选择新的文件</div>
      </template>
    </div>
    <input ref="input" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" hidden @change="onChange" />
    <p v-if="error" class="inline-error" role="alert">{{ error }}</p>
    <div v-if="hasImage" class="file-info">
      <span class="file-ok"><Check :size="14" /></span>
      <div class="file-info-copy"><strong :title="filename">{{ filename }}</strong><span>{{ width }} × {{ height }} · {{ readableSize }}</span></div>
    </div>
  </section>
</template>
