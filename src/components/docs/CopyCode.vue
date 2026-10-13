<script setup lang="ts">
import { onUnmounted, ref } from 'vue';
import { Check, Copy } from 'lucide-vue-next';

const props = defineProps<{ code: string; label?: string }>();
const status = ref<'idle' | 'copied' | 'error'>('idle');
let reset: ReturnType<typeof setTimeout> | undefined;

async function copyCode(): Promise<void> {
  if (reset) clearTimeout(reset);
  try {
    await navigator.clipboard.writeText(props.code);
    status.value = 'copied';
  } catch {
    status.value = 'error';
  }
  reset = setTimeout(() => { status.value = 'idle'; }, 2500);
}
onUnmounted(() => { if (reset) clearTimeout(reset); });
</script>

<template>
  <div class="doc-code">
    <div class="doc-code-toolbar">
      <span>{{ label || '示例代码' }}</span>
      <button type="button" @click="copyCode">
        <Check v-if="status === 'copied'" :size="14" />
        <Copy v-else :size="14" />
        {{ status === 'copied' ? '已复制' : status === 'error' ? '复制失败' : '复制' }}
      </button>
    </div>
    <pre><code>{{ code }}</code></pre>
  </div>
</template>
