<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useCommerce } from '../composables/useCommerce';

const api = useCommerce();
interface ApiKeySummary { id: string; project: string; created_at: string; revoked_at: string | null }
const keys = ref<ApiKeySummary[]>([]);
const project = ref('');
const newToken = ref('');
const error = ref('');
const busy = ref(false);

async function reload(): Promise<void> {
  try { keys.value = await api.listApiKeys(); }
  catch { error.value = '无法读取 API Key 列表，请稍后重试。'; }
}
async function create(): Promise<void> {
  if (busy.value) return;
  busy.value = true; error.value = ''; newToken.value = '';
  try {
    const result = await api.createApiKey(project.value.trim());
    newToken.value = result.token;
    project.value = '';
    await reload();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '创建失败';
  } finally { busy.value = false; }
}
async function revoke(id: string): Promise<void> {
  if (busy.value || !window.confirm('确定吊销此密钥？使用它的外部项目将立即失去访问权限。')) return;
  busy.value = true; error.value = '';
  try { await api.revokeApiKey(id); await reload(); }
  catch { error.value = '吊销失败，请稍后重试。'; }
  finally { busy.value = false; }
}
function copyKey(): void { void navigator.clipboard.writeText(newToken.value).catch(() => { error.value = '复制失败，请手动复制密钥。'; }); }
onMounted(() => { void reload(); });
</script>

<template>
  <section aria-labelledby="api-keys-title">
    <h3 id="api-keys-title">外部项目 API Key</h3>
    <p class="commerce-help">每个项目创建独立密钥；仅在创建时显示。密钥只允许保存在后端服务器，绝不能放在网页前端。</p>
    <p v-if="error" class="inline-error" role="alert">{{ error }}</p>
    <label class="commerce-field">项目名称
      <input v-model="project" maxlength="64" placeholder="例如 IdeaWeave" autocomplete="off" />
    </label>
    <button class="commerce-primary" type="button" :disabled="busy || project.trim().length < 2" @click="create">
      {{ busy ? '请稍候…' : '创建 API Key' }}
    </button>
    <div v-if="newToken" class="commerce-history">
      <strong>请立即复制并安全保存（仅显示这一次）</strong>
      <code class="api-key-secret">{{ newToken }}</code>
      <button type="button" class="commerce-link" @click="copyKey">复制密钥</button>
      <button type="button" class="commerce-link" @click="newToken = ''">关闭密钥展示</button>
    </div>
    <h3>已有密钥</h3>
    <div v-for="key in keys" :key="key.id" class="commerce-history">
      <strong>{{ key.project }}</strong>
      <span>{{ key.revoked_at ? '已吊销' : '使用中' }} · {{ new Date(key.created_at).toLocaleDateString() }}</span>
      <button v-if="!key.revoked_at" type="button" class="commerce-link" :disabled="busy" @click="revoke(key.id)">吊销</button>
    </div>
    <p class="commerce-help">独立密钥共享当前账户的积分余额；每次成功处理计费一次。详见项目 docs/external-http-api.md。</p>
  </section>
</template>

<style scoped>
.api-key-secret { overflow-wrap: anywhere; display: block; padding: 10px; border: 1px solid #465d4c; border-radius: 6px; }
</style>
