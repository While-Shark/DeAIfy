<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ArrowRight, Check, Minus, Plus, Search, ShieldCheck, UsersRound, Wallet } from 'lucide-vue-next';
import { useCommerce, type AdminUser } from '../composables/useCommerce';

const api = useCommerce();
const users = ref<AdminUser[]>([]);
const selected = ref<AdminUser | null>(null);
const search = ref('');
const amount = ref(100);
const operation = ref<'grant' | 'deduct'>('grant');
const reason = ref('');
const busy = ref(false);
const error = ref('');
const notice = ref('');
// Keep the same idempotency key after a network failure, until the inputs change.
const pendingKey = ref('');
const quickAmounts = [100, 500, 1000, 10000] as const;
const formatCredits = (value: number) => value.toLocaleString('zh-CN');
const filteredUsers = computed(() => users.value.filter(user =>
  user.email.toLowerCase().includes(search.value.trim().toLowerCase()),
));
const currentBalance = computed(() => Number(selected.value?.credits ?? 0));
const validAmount = computed(() => Number.isSafeInteger(amount.value) &&
  amount.value >= 1 && amount.value <= 1_000_000);
const delta = computed(() => (operation.value === 'grant' ? 1 : -1) * amount.value);
const nextBalance = computed(() => {
  if (!selected.value || !validAmount.value) return null;
  const next = currentBalance.value + delta.value;
  return Number.isSafeInteger(next) && next >= 0 && next <= 1_000_000_000 ? next : null;
});
const validReason = computed(() => reason.value.trim().length >= 2 && reason.value.trim().length <= 200);
const canSubmit = computed(() => Boolean(selected.value) && !busy.value &&
  validAmount.value && nextBalance.value !== null && validReason.value);

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
function resetRequest(): void {
  pendingKey.value = '';
  error.value = '';
  notice.value = '';
}
function changeOperation(value: 'grant' | 'deduct'): void {
  if (busy.value || value === operation.value) return;
  operation.value = value;
  resetRequest();
}
function changeAmount(value: number): void {
  if (busy.value) return;
  amount.value = value;
  resetRequest();
}
async function submit(): Promise<void> {
  const target = selected.value;
  if (!target || busy.value) return;
  if (!canSubmit.value) {
    error.value = nextBalance.value === null && validAmount.value
      ? '调整后的余额超出允许范围，请检查扣减数量。'
      : '请输入 1–1,000,000 的整数积分和 2–200 字操作原因。';
    return;
  }
  const change = delta.value;
  const verb = change > 0 ? '充值' : '扣减';
  if (!window.confirm('确定为 ' + target.email + ' ' + verb + ' ' +
      formatCredits(amount.value) + ' 积分？')) return;
  if (!pendingKey.value) pendingKey.value = 'admin_' + crypto.randomUUID().replaceAll('-', '');
  busy.value = true;
  error.value = '';
  notice.value = '';
  try {
    const result = await api.adjustUserCredits(target.id, {
      delta: change, reason: reason.value.trim(), idempotencyKey: pendingKey.value,
    });
    notice.value = result.alreadyApplied
      ? '该笔操作此前已完成，没有重复调整积分。'
      : '操作成功，当前余额 ' + formatCredits(result.credits) + ' 积分，已写入账本与审计日志。';
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
onMounted(() => { void load().catch(() => { error.value = '用户列表加载失败，请重新打开页面。'; }); });
</script>

<template>
  <section class="admin-users" aria-label="用户积分管理">
    <header class="admin-users-header">
      <div>
        <div class="admin-users-eyebrow"><UsersRound :size="14" /> ACCOUNT MANAGEMENT</div>
        <h3>用户与积分管理</h3>
        <p>选择目标用户，调整积分额度。操作将记录原因与审计流水。</p>
      </div>
      <span class="admin-users-count">{{ users.length }} 位用户</span>
    </header>

    <div class="admin-users-toolbar">
      <label class="admin-users-search">
        <Search :size="16" aria-hidden="true" />
        <input v-model="search" type="search" autocomplete="off" placeholder="搜索用户邮箱" aria-label="搜索用户邮箱" />
      </label>
      <span class="admin-users-toolbar-hint">选择一个账号进行操作</span>
    </div>
    <div class="admin-users-list" role="group" aria-label="选择用户账号">
      <button v-for="user in filteredUsers" :key="user.id" type="button"
        class="admin-users-item" :class="{ 'is-selected': selected?.id === user.id }"
        :disabled="busy" :aria-pressed="selected?.id === user.id" @click="choose(user)">
        <span class="admin-users-avatar" aria-hidden="true">{{ user.email[0]?.toUpperCase() }}</span>
        <span class="admin-users-identity">
          <strong :title="user.email">{{ user.email }}</strong>
          <small>{{ user.role === 'admin' ? '管理员' : '普通用户' }}</small>
        </span>
        <span class="admin-users-item-balance">
          <strong>{{ formatCredits(Number(user.credits)) }}</strong>
          <small>积分</small>
        </span>
        <Check v-if="selected?.id === user.id" class="admin-users-item-check" :size="15" aria-hidden="true" />
      </button>
    </div>
    <p v-if="filteredUsers.length === 0" class="admin-users-empty">没有找到匹配的用户</p>

    <section v-if="selected" class="admin-users-adjust" aria-label="积分调整">
      <header class="admin-users-adjust-header">
        <div class="admin-users-current">
          <span>当前操作账号</span>
          <strong :title="selected.email">{{ selected.email }}</strong>
        </div>
        <div class="admin-users-current-balance">
          <span><Wallet :size="14" /> 当前余额</span>
          <strong>{{ formatCredits(currentBalance) }} <small>积分</small></strong>
        </div>
      </header>

      <div class="admin-users-adjust-body">
        <span class="admin-users-label" id="credit-operation-label">调整方式</span>
        <div class="admin-users-switch" role="group" aria-labelledby="credit-operation-label">
          <button type="button" :disabled="busy" :aria-pressed="operation === 'grant'"
            :class="{ 'is-grant': operation === 'grant' }" @click="changeOperation('grant')">
            <Plus :size="17" /> 充值积分
          </button>
          <button type="button" :disabled="busy" :aria-pressed="operation === 'deduct'"
            :class="{ 'is-deduct': operation === 'deduct' }" @click="changeOperation('deduct')">
            <Minus :size="17" /> 扣减积分
          </button>
        </div>

        <div class="admin-users-amount-row">
          <label class="admin-users-amount-field">
            <span class="admin-users-label">积分数量</span>
            <span class="admin-users-input-wrap">
              <input v-model.number="amount" type="number" min="1" max="1000000" step="1"
                :disabled="busy" aria-label="积分数量" @input="resetRequest" />
              <span>积分</span>
            </span>
          </label>
          <div class="admin-users-quick" role="group" aria-label="快捷积分数量">
            <button v-for="value in quickAmounts" :key="value" type="button" :disabled="busy"
              :aria-pressed="amount === value" :class="{ 'is-active': amount === value }"
              @click="changeAmount(value)">{{ formatCredits(value) }}</button>
          </div>
        </div>

        <label class="admin-users-reason">
          <span class="admin-users-label">操作原因 <em>必填</em></span>
          <input v-model="reason" maxlength="200" :disabled="busy" type="text"
            autocomplete="off" placeholder="例如：活动赠送积分、人工调整余额"
            aria-label="操作原因（必填）" @input="resetRequest" />
        </label>

        <div class="admin-users-preview" aria-live="polite">
          <div>
            <span>预计调整后余额</span>
            <div class="admin-users-preview-values">
              <strong>{{ formatCredits(currentBalance) }}</strong>
              <ArrowRight :size="16" aria-hidden="true" />
              <strong :class="{ 'is-deduct': operation === 'deduct', 'is-invalid': nextBalance === null }">
                {{ nextBalance === null ? '—' : formatCredits(nextBalance) }}
              </strong>
            </div>
          </div>
          <span class="admin-users-change" :class="{ 'is-deduct': operation === 'deduct' }">
            {{ validAmount ? (delta > 0 ? '+' : '') + formatCredits(delta) : '—' }} 积分
          </span>
        </div>
        <p v-if="nextBalance === null && validAmount" class="admin-users-warning" role="alert">
          调整后余额必须在 0–1,000,000,000 积分之间。
        </p>

        <button class="admin-users-submit" :class="{ 'is-deduct': operation === 'deduct' }"
          type="button" :disabled="!canSubmit" @click="submit">
          {{ busy ? '处理中…' : operation === 'grant' ? '确认充值积分' : '确认扣减积分' }}
          <ArrowRight v-if="!busy" :size="16" aria-hidden="true" />
        </button>
        <p class="admin-users-footnote"><ShieldCheck :size="14" aria-hidden="true" />
          需要二次确认 · 余额不可为负数 · 每笔变更均保留操作记录
        </p>
      </div>
    </section>

    <div v-else class="admin-users-placeholder">
      <Wallet :size="20" aria-hidden="true" />
      <p>从上方选择一个用户，即可查看余额并调整积分</p>
    </div>
    <p v-if="notice" class="commerce-message" role="status">{{ notice }}</p>
    <p v-if="error" class="inline-error" role="alert">{{ error }}</p>
  </section>
</template>
