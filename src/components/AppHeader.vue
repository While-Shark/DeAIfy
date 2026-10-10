<script setup lang="ts">
import { Aperture, ArrowUpRight, RotateCcw, ShieldCheck } from 'lucide-vue-next';

defineProps<{ hasImage: boolean }>();
const emit = defineEmits<{ reset: [] }>();
</script>

<template>
  <header class="app-header">
    <div class="brand-group">
      <div class="brand-mark"><Aperture :size="23" :stroke-width="2" /></div>
      <div class="brand-text">De<span>AI</span>fy<span class="brand-dot">.</span></div>
      <span class="version-tag">BETA / 0.1.1</span>
    </div>
    <nav class="header-actions" aria-label="顶部操作">
      <span class="header-privacy"><ShieldCheck :size="15" /> Local-first · 图片不上传</span>
      <button v-if="hasImage" class="icon-text-btn" type="button" @click="emit('reset')">
        <RotateCcw :size="15" /> 重新开始
      </button>
      <a class="header-github" href="https://github.com/While-Shark/DeAIfy" target="_blank" rel="noopener noreferrer">
        GitHub <ArrowUpRight :size="15" />
      </a>
    </nav>
  </header>
</template>
