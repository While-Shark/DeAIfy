<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { DatabaseZap, HardDrive, LoaderCircle, RotateCcw, ShieldCheck } from 'lucide-vue-next';
import { clearModelCaches, inspectModelCache, requestPersistentStorage } from '../services/modelCache';
import type { ModelCacheInfo } from '../services/modelCache';

const loading = ref(false);
const cache = ref<ModelCacheInfo | null>(null);
const message = ref('');
const error = ref('');
const sizeText = (bytes: number | null) => bytes === null ? '未知' : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
async function refresh() {
  loading.value = true;
  error.value = '';
  try { cache.value = await inspectModelCache(); }
  catch (e) { error.value = e instanceof Error ? e.message : '无法获取缓存信息'; }
  finally { loading.value = false; }
}
async function persist() {
  try {
    const result = await requestPersistentStorage();
    message.value = result ? '浏览器已允许持久存储。' : '浏览器未授予持久存储，缓存仍可能正常使用。';
    await refresh();
  } catch (e) { error.value = e instanceof Error ? e.message : '浏览器不支持持久存储'; }
}
async function clear() {
  if (!window.confirm('确定清除浏览器中的 AI 模型缓存？下次使用需要重新下载。当前页面已加载的模型仍可能留在内存中，刷新后才会清除。')) return;
  try { const count = await clearModelCaches(); message.value = `已清除 ${count} 个模型缓存空间。`; await refresh(); }
  catch (e) { error.value = e instanceof Error ? e.message : '删除失败'; }
}
onMounted(() => { void refresh(); });
</script>

<template>
  <section class="advanced-section">
    <h3><HardDrive :size="17" /> 浏览器模型管理</h3>
    <p class="advanced-copy">模型下载到本机浏览器缓存；首次使用时联网，之后通常从缓存加载。刷新会重新初始化推理引擎，但正常不需要重新下载。</p>
    <div class="cache-card"><span>浏览器存储使用量（含其他网站数据）</span><strong>{{ sizeText(cache?.usage ?? null) }}</strong><small>估算可用额度：{{ sizeText(cache?.quota ?? null) }}</small></div>
    <div v-if="cache" class="cache-details">
      <p v-for="entry in cache.caches" :key="entry.name">{{ entry.name }} · {{ entry.entries }} 个缓存请求</p>
      <p v-if="!cache.caches.length">未发现 Transformers.js 的模型缓存。也可能由浏览器 HTTP 缓存提供。</p>
      <p>持久存储权限：{{ cache.persisted === null ? '浏览器不支持' : cache.persisted ? '已授予' : '未授予' }}</p>
    </div>
    <p v-if="message" class="advanced-copy">{{ message }}</p>
    <p v-if="error" role="alert" class="inline-error">{{ error }}</p>
    <div class="cache-actions">
      <button type="button" :disabled="loading" @click="refresh"><LoaderCircle v-if="loading" class="spin" :size="14" /><RotateCcw v-else :size="14" />刷新状态</button>
      <button type="button" :disabled="loading" @click="persist"><ShieldCheck :size="14" />申请持久存储</button>
      <button type="button" :disabled="loading" @click="clear"><DatabaseZap :size="14" />清理模型缓存</button>
    </div>
    <p class="advanced-copy">基础模型约 15 MB；可选交叉模型约 57 MB。清理仅处理识别出的模型 Cache Storage，不删除你的图片或评测数据。</p>
  </section>
</template>
