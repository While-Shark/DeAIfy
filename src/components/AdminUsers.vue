<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useCommerce, type AdminUser } from '../composables/useCommerce';

const api = useCommerce();
const users = ref<AdminUser[]>([]);
const selected = ref<AdminUser | null>(null);
const amount = ref(100);
const operation = ref<'grant' | 'deduct'>('grant');
const reason = ref('');
const busy = ref(false);
const error = ref('');
const notice = ref('');
// Retain this request key after a network failure to make retries safe.
const pendingKey = ref('');

async function load(): Promise<void> {
  const previous = selected.value?.id;
  users.value = await api.getAdminUsers();
  selected.value = users.value.find(user => user.id === previous) ?? null;
}
function choose(user: AdminUser): void {
  selected.value = user;
  pendingKey.value = '';
  error.value = '';
  notice.value = '';
}
function resetRequest(): void { pendingKey.value = ''; }
async function submit(): Promise<void> {
  const target = selected.value;
  if (!target || busy.value) return;
  if (!Number.isSafeInteger(amount.value) || amount.value < 1 || amount.value > 1_000_000 ||
      reason.value.trim().length < 2 || reason.value.trim().length > 200) {
    error.value = '请输入 1–1,000,000 的整数积分和 2–200 字说明。';
    return;
  }
  const delta = operation.value === 'grant' ? amount.value : -amount.value;
  if (!window.confirm(`确定为 ${target.email} ${delta > 0 ? '充值' : '扣减'} ${amount.value} 积分？`)) return;
  if (!pendingKey.value) pendingKey.value = 'admin_' + crypto.randomUUID().replaceAll('-', '');
  busy.value = true;
  error.value = '';
  notice.value = '';
  try {
    const result = await api.adjustUserCredits(target.id, {
      delta, reason: reason.value.trim(), idempotencyKey: pendingKey.value,
    });
    notice.value = result.alreadyApplied
      ? '该笔操作此前已完成，没有重复调整积分。'
      : `操作成功，当前余额 ${result.credits} 积分，已写入账本与审计日志。`;
    pendingKey.value = '';
    try {
      await load();
      await api.refresh();
    } catch {
      notice.value += ' 列表刷新暂时失败，请重新打开用户管理查看。';
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '操作失败，请使用原请求重试。';
  } finally { busy.value = false; }
}
onMounted(() => { void load().catch(() => { error.value = '用户列表加载失败'; }); });
</script>

<template>
  <section class="admin-user-panel" aria-label="用户积分管理">
    <h3>用户积分管理</h3>
    <p class="commerce-help">选择账号充值或扣减积分，每笔操作均记录管理员、原因和积分流水；不能扣为负数。</p>
    <div class="admin-user-list">
      <button v-for="user in users" :key="user.id" type="button"
        :class="{ selected: selected?.id === user.id }" @click="choose(user)">
        <span>{{ user.email }} <small>{{ user.role === 'admin' ? '管理员' : '用户' }}</small></span>
        <strong>{{ Number(user.credits).toLocaleString('zh-CN') }} 积分</strong>
      </button>
    </div>
    <div v-if="selected" class="admin-user-form">
      <p>正在调整：<strong>{{ selected.email }}</strong></p>
      <div class="admin-edit-grid">
        <label class="commerce-field">调整方式
          <select v-model="operation" @change="resetRequest">
            <option value="grant">充值积分</option>
            <option value="deduct">扣减积分</option>
          </select>
        </label>
        <label class="commerce-field">积分数量
          <input v-model.number="amount" type="number" min="1" max="1000000" step="1"
            @input="resetRequest" />
        </label>
      </div>
      <label class="commerce-field">操作原因（必填）
        <input v-model="reason" maxlength="200" placeholder="例如：人工赠送测试额度" @input="resetRequest" />
      </label>
      <button type="button" class="commerce-primary" :disabled="busy" @click="submit">
        {{ busy ? '处理中…' : '确认调整积分' }}
      </button>
    </div>
    <p v-if="notice" class="commerce-message" role="status">{{ notice }}</p>
    <p v-if="error" class="inline-error" role="alert">{{ error }}</p>
  </section>
</template>

<style scoped>
.admin-user-panel { margin-top: 26px; padding-top: 18px; border-top: 1px solid #375245; }
.admin-user-list { display:grid; gap:8px; margin:12px 0 18px; max-height:250px; overflow:auto; }
.admin-user-list button { display:flex; justify-content:space-between; flex-wrap:wrap; gap:10px; text-align:left;
 padding:12px; border:1px solid #425d4d; border-radius:9px; color:#d1e6d6; background:#22362f; cursor:pointer; }
.admin-user-list button.selected { border-color:#c2ed8d; background:#32523b; }
.admin-user-list small { color:#9bb6a6; font-size:11px; }
.admin-user-list strong { color:#c8f39b; }
.admin-user-form { display:grid; gap:11px; }
.admin-user-form .commerce-field input, .admin-user-form .commerce-field select { width:100%; }
.admin-user-form p { margin:0; font-size:12px; }
</style>
