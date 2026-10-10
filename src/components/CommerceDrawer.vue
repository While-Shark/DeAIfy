<script setup lang="ts">
import { ref,watch } from 'vue';
import { X, ShieldCheck, Wallet, ShoppingBag } from 'lucide-vue-next';
import { useCommerce } from '../composables/useCommerce';
import TurnstileChallenge from './TurnstileChallenge.vue';
import AdminPlans from './AdminPlans.vue';

const props=defineProps<{open:boolean}>();
const emit=defineEmits<{close:[]}>();
const billing=useCommerce();
type Section='account'|'register'|'plans'|'orders'|'admin';
const section=ref<Section>('account');
const email=ref(''),password=ref(''),code=ref(''),turnstile=ref('');
const formError=ref(''),message=ref('');
const checkoutLink=ref(''),qrLink=ref('');
const recentOrders=ref<any[]>([]);
const recentLedger=ref<any[]>([]);
const recentJobs=ref<any[]>([]);
const submitting=ref(false);
watch(()=>props.open,value=>{if(value)void billing.initialize();});
async function action(task:()=>Promise<unknown>,after?:()=>void) {
 submitting.value=true;formError.value='';message.value='';
 try{await task();after?.();}
 catch(error){formError.value=error instanceof Error?error.message:'操作失败';}
 finally{submitting.value=false;}
}
function login(){void action(()=>billing.login(email.value,password.value),()=>{password.value='';});}
function register(){void action(()=>billing.register(email.value,password.value,code.value),()=>{
  password.value='';code.value='';section.value='account';
});}
function sendCode(){void action(async()=>{
 await billing.sendCode(email.value,turnstile.value);
 message.value='验证码已发送，请查收邮件（有效期 10 分钟）。';
});}
function purchase(planId:string){void action(async()=>{
 const response=await billing.checkout(planId);
 checkoutLink.value=response.url??'';
 qrLink.value=response.qr??'';
 message.value='订单已创建，请通过支付服务商的付款页面完成支付。以异步通知到账为准。';
});}
function viewOrders(){void action(async()=>{
 recentOrders.value=await billing.orders();
 recentLedger.value=await billing.ledger();
 recentJobs.value=await billing.jobs();
 section.value='orders';
});}
function afterPayment(){void action(async()=>{
 await billing.refresh();
 recentOrders.value=await billing.orders();
 recentJobs.value=await billing.jobs();
 message.value='已刷新订单状态；付款完成后可能需要等待回调。';
});}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="commerce-overlay" @click.self="emit('close')" @keydown.esc="emit('close')">
      <section class="commerce-dialog" role="dialog" aria-modal="true" aria-label="DeAIfy 账号与积分">
        <header class="commerce-header">
          <div><span class="commerce-kicker">ACCOUNT & BILLING</span><h2>DeAIfy 账号与积分</h2></div>
          <button type="button" class="commerce-close" aria-label="关闭" @click="emit('close')"><X :size="20"/></button>
        </header>
        <nav v-if="billing.user.value" class="commerce-nav" aria-label="账户功能">
          <button type="button" :class="{active:section==='account'}" @click="section='account'">账户</button>
          <button type="button" :class="{active:section==='plans'}" @click="section='plans'">充值</button>
          <button type="button" :class="{active:section==='orders'}" @click="viewOrders">订单</button>
          <button v-if="billing.user.value?.role==='admin'" type="button" :class="{active:section==='admin'}" @click="section='admin'">管理后台</button>
        </nav>
        <main class="commerce-content">
          <p v-if="formError" class="inline-error" role="alert">{{ formError }}</p>
          <p v-if="message" class="commerce-message">{{ message }}</p>

          <template v-if="!billing.user.value">
            <h3>{{ section==='register'?'创建账户':'账号登录' }}</h3>
            <label class="commerce-field">电子邮箱 <input v-model.trim="email" type="email" autocomplete="email" placeholder="you@example.com"/></label>
            <label class="commerce-field">密码 <input v-model="password" type="password" :autocomplete="section==='register'?'new-password':'current-password'" placeholder="至少 12 位"/></label>
            <template v-if="section==='register'">
              <TurnstileChallenge @token="turnstile=$event"/>
              <div class="commerce-code">
                <input v-model.trim="code" inputmode="numeric" maxlength="6" placeholder="6 位邮箱验证码"/>
                <button type="button" :disabled="submitting||!turnstile" @click="sendCode">发送验证码</button>
              </div>
              <button type="button" class="commerce-primary" :disabled="submitting" @click="register">验证并注册</button>
              <button type="button" class="commerce-link" @click="section='account'">已有账号？返回登录</button>
            </template>
            <template v-else>
              <button type="button" class="commerce-primary" :disabled="submitting" @click="login">登录</button>
              <button v-if="billing.registrationEnabled.value" type="button" class="commerce-link" @click="section='register'">注册新账号</button>
              <p v-else class="commerce-help">公开注册尚未启用，请等待管理员配置邮件验证和安全校验。</p>
            </template>
          </template>

          <template v-else-if="section==='account'">
            <div class="commerce-welcome"><ShieldCheck :size="18"/> {{ billing.user.value.email }}</div>
            <div class="commerce-balance">
              <div><span>今日免费剩余</span><strong>{{ billing.wallet.value?.freeRemaining ?? '—' }} / {{ billing.wallet.value?.perDay ?? 5 }}</strong></div>
              <div><span>已购积分余额</span><strong>{{ billing.wallet.value?.credits ?? '—' }}</strong></div>
            </div>
            <p class="commerce-help">每日免费次数按照北京时间零点刷新。预览及参数调整不消耗额度，成功的完整分辨率导出消耗一次。</p>
            <button type="button" class="commerce-primary" @click="section='plans'"><Wallet :size="16"/> 充值积分</button>
            <button type="button" class="commerce-link" @click="billing.logout">退出当前账号</button>
          </template>

          <template v-else-if="section==='plans'">
            <h3>充值积分</h3>
            <p class="commerce-help">套餐、折扣及赠送积分均由服务器计算。未开通商户前不允许真实下单。</p>
            <div class="commerce-plans">
              <article v-for="plan in billing.plans.value" :key="plan.id" class="commerce-plan">
                <strong>{{ plan.title }}</strong>
                <div class="commerce-plan-price">¥{{ (plan.priceFen/100).toFixed(2) }}
                  <del v-if="plan.originalPriceFen!==plan.priceFen">¥{{ (plan.originalPriceFen/100).toFixed(2) }}</del>
                </div>
                <span>{{ plan.credited }} 积分 <small v-if="plan.bonusCredits">（赠 {{ plan.bonusCredits }}）</small></span>
                <button type="button" :disabled="submitting||!billing.paymentEnabled.value" @click="purchase(plan.id)">
                  {{ billing.paymentEnabled.value?'创建支付订单':'支付尚未开放' }}
                </button>
              </article>
            </div>
            <a v-if="checkoutLink" :href="checkoutLink" target="_blank" rel="noopener noreferrer" class="commerce-primary">前往虎皮椒安全付款</a>
            <a v-if="qrLink" :href="qrLink" target="_blank" rel="noopener noreferrer" class="commerce-link">查看扫码支付链接</a>
            <button v-if="checkoutLink||qrLink" type="button" class="commerce-link" @click="afterPayment">刷新付款状态</button>
          </template>

          <template v-else-if="section==='orders'">
            <h3>我的订单</h3>
            <button type="button" class="commerce-link" @click="afterPayment">刷新到账状态</button>
            <div v-for="order in recentOrders" :key="order.id" class="commerce-history">
              <strong>{{ order.title_snapshot }}</strong><span>¥{{ (order.price_fen/100).toFixed(2) }} · {{ order.state }}</span>
            </div>
            <h3>最近导出（30 分钟内可再次下载，不重复扣费）</h3>
            <div v-for="job in recentJobs" :key="job.id" class="commerce-history">
              <strong>{{ job.filename }}</strong>
              <button type="button" class="commerce-link"
                @click="void action(()=>billing.downloadJob(job.id,job.filename))">重新下载</button>
            </div>
            <h3>积分记录</h3>
            <div v-for="entry in recentLedger" :key="entry.reference_id+'-'+entry.kind" class="commerce-history">
              <strong>{{ entry.kind }}</strong><span>{{ entry.delta>0?'+':'' }}{{ entry.delta }} 积分</span>
            </div>
          </template>

          <AdminPlans v-else-if="section==='admin' && billing.user.value?.role==='admin'"/>
        </main>
        <footer class="commerce-footer"><ShoppingBag :size="14"/> 图片仅在明确导出时上传受保护的 VPS，临时结果约 30 分钟后删除。</footer>
      </section>
    </div>
  </Teleport>
</template>
