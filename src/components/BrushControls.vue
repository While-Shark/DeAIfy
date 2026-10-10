<script setup lang="ts">
import { Brush, RotateCcw, Trash2 } from 'lucide-vue-next';
import type { BrushTool } from '../types/editor';

defineProps<{ hasImage: boolean; enabled: boolean; tool: BrushTool; radius: number; amount: number; count: number }>();
const emit = defineEmits<{
  'update:enabled': [value: boolean]; 'update:tool': [value: BrushTool];
  'update:radius': [value: number]; 'update:amount': [value: number];
  undo: []; clear: [];
}>();
const tools: { value: BrushTool; title: string }[] = [
  { value: 'lighten', title: '局部提亮' }, { value: 'darken', title: '局部压暗' },
  { value: 'warm', title: '局部暖色' }, { value: 'detail', title: '局部细节' },
];
</script>

<template>
  <section class="advanced-section">
    <h3><Brush :size="17" /> 局部区域画笔</h3>
    <p class="advanced-copy">画笔仅修改选中的图像区域，保留原始分辨率导出。基础模式不会应用画笔效果。</p>
    <label class="advanced-toggle"><input type="checkbox" :checked="enabled" :disabled="!hasImage"
      @change="emit('update:enabled', ($event.target as HTMLInputElement).checked)" />
      <span>开启画笔模式 <small>开启后在中央图片上按住并绘制</small></span>
    </label>
    <div class="brush-options">
      <button v-for="opt in tools" :key="opt.value" type="button" :disabled="!hasImage"
        :class="{ selected: tool===opt.value }" @click="emit('update:tool', opt.value)">{{ opt.title }}</button>
    </div>
    <label class="advanced-range">笔刷半径 <output>{{ Math.round(radius * 100) }}%</output>
      <input type="range" min="2" max="18" step="1" :value="radius*100" :disabled="!hasImage"
        @input="emit('update:radius', Number(($event.target as HTMLInputElement).value)/100)" />
    </label>
    <label class="advanced-range">局部强度 <output>{{ Math.round(amount * 100) }}%</output>
      <input type="range" min="10" max="100" step="5" :value="amount*100" :disabled="!hasImage"
        @input="emit('update:amount', Number(($event.target as HTMLInputElement).value)/100)" />
    </label>
    <div class="advanced-row-actions">
      <span>已记录 {{ count }} 个笔触（最多 240）</span>
      <button type="button" :disabled="count===0" @click="emit('undo')"><RotateCcw :size="14" /> 撤销</button>
      <button type="button" :disabled="count===0" @click="emit('clear')"><Trash2 :size="14" /> 清空</button>
    </div>
    <p class="advanced-copy">提示：小范围多次涂抹会叠加效果。将画笔关闭可恢复前后对比拖动。</p>
  </section>
</template>
