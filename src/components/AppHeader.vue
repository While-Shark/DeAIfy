<script setup lang="ts">
import { Aperture, ArrowUpRight, BookOpenText, RotateCcw, ShieldCheck, Wallet } from 'lucide-vue-next';
import type { AppView } from '../composables/useAppNavigation';

defineProps<{ hasImage: boolean; commercial?: boolean; view: AppView }>();
const emit = defineEmits<{ reset: []; account: []; navigate: [page: AppView] }>();
</script>

<template>
  <header class="app-header">
    <div class="brand-group">
      <a class="brand-home" href="/" aria-label="DeAIfy 工作台" @click.prevent="emit('navigate', 'studio')">
        <div class="brand-mark"><Aperture :size="23" :stroke-width="2" /></div>
        <div class="brand-text">De<span>AI</span>fy<span class="brand-dot">.</span></div>
      </a>
      <span class="version-tag">BETA / 0.6.3</span>
    </div>
    <nav class="header-actions" aria-label="顶部操作">
      <span class="header-privacy"><ShieldCheck :size="15" /> {{ commercial ? '本地预览 · VPS 安全导出' : 'Local-first · 图片不上传' }}</span>
      <a href="/docs" class="header-docs-link" :aria-current="view === 'docs' ? 'page' : undefined"
        @click.prevent="emit('navigate', 'docs')"><BookOpenText :size="16" /> Docs</a>
      <button v-if="commercial" class="icon-text-btn" type="button" @click="emit('account')"><Wallet :size="15" /> 账户 / 积分</button>
      <button v-if="hasImage && view === 'studio'" class="icon-text-btn" type="button" @click="emit('reset')">
        <RotateCcw :size="15" /> 重新开始
      </button>
      <a class="header-github" href="https://github.com/While-Shark/DeAIfy" target="_blank" rel="noopener noreferrer">
        GitHub <ArrowUpRight :size="15" />
      </a>
    </nav>
  </header>
</template>
