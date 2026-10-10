<script setup lang="ts">
import { onMounted,ref } from 'vue';
import { useCommerce, type AdminPlan } from '../composables/useCommerce';

const api=useCommerce();
const items=ref<AdminPlan[]>([]);
const users=ref<any[]>([]);
const orders=ref<any[]>([]);
const error=ref(''),note=ref(''),saving=ref(false);
const blank=()=>({title:'',basePriceFen:990,discountBps:10000,
 credits:20,bonusCredits:0,startsAt:null as string|null,endsAt:null as string|null,
 active:true,sortOrder:10,version:1,id:''});
const form=ref(blank());
async function load() {
 error.value='';
 try{
  const [plans,u,o]=await Promise.all([api.getAdminPlans(),api.getAdminUsers(),api.getAdminOrders()]);
  items.value=plans;users.value=u;orders.value=o;
 }catch(e){error.value=e instanceof Error?e.message:'后台数据加载失败';}
}
function edit(item:AdminPlan) {
 form.value={
  id:item.id,title:item.title,basePriceFen:item.base_price_fen,
  discountBps:item.discount_bps,credits:item.credits,bonusCredits:item.bonus_credits,
  startsAt:item.discount_starts_at?new Date(item.discount_starts_at).toISOString():null,
  endsAt:item.discount_ends_at?new Date(item.discount_ends_at).toISOString():null,
  active:Boolean(item.active),sortOrder:item.sort_order,version:item.version,
 };
}
async function save(){
 saving.value=true;error.value='';note.value='';
 try{
  const {id,...payload}=form.value;
  await api.saveAdminPlan(payload,id||undefined);
  note.value='套餐已保存。既有订单按创建时的价格快照结算。';
  form.value=blank();
  await load();
 }catch(e){error.value=e instanceof Error?e.message:'保存失败';}
 finally{saving.value=false;}
}
onMounted(()=>void load());
</script>
<template>
  <section class="admin-plans">
    <h3>套餐、折扣和用户管理</h3>
    <p class="commerce-help">折扣按万分比设置：10000 为原价，9000 为 9 折。支付报价始终以服务端为准。</p>
    <p v-if="error" class="inline-error">{{ error }}</p>
    <p v-if="note" class="commerce-message">{{ note }}</p>
    <div class="admin-plan-list">
      <button v-for="p in items" :key="p.id" type="button" @click="edit(p)">
        {{ p.title }} · ¥{{ (p.base_price_fen/100).toFixed(2) }} · {{ p.credits+p.bonus_credits }} 积分 · {{ p.active?'上架':'下架' }}
      </button>
    </div>
    <div class="admin-edit-grid">
      <label class="commerce-field">名称 <input v-model.trim="form.title" maxlength="60"/></label>
      <label class="commerce-field">原价（分） <input v-model.number="form.basePriceFen" type="number" min="1"/></label>
      <label class="commerce-field">折扣万分比 <input v-model.number="form.discountBps" type="number" min="100" max="10000"/></label>
      <label class="commerce-field">基础积分 <input v-model.number="form.credits" type="number" min="1"/></label>
      <label class="commerce-field">赠送积分 <input v-model.number="form.bonusCredits" type="number" min="0"/></label>
      <label class="commerce-field">排序 <input v-model.number="form.sortOrder" type="number" min="0"/></label>
      <label class="commerce-field">折扣起始时间（ISO UTC） <input v-model.trim="form.startsAt" placeholder="2026-10-01T00:00:00Z"/></label>
      <label class="commerce-field">折扣结束时间（ISO UTC） <input v-model.trim="form.endsAt" placeholder="2026-10-31T23:59:59Z"/></label>
      <label class="commerce-field"><input v-model="form.active" type="checkbox"/> 套餐上架</label>
    </div>
    <div class="admin-actions">
      <button type="button" :disabled="saving" class="commerce-primary" @click="save">{{ saving?'保存中…':'保存套餐' }}</button>
      <button type="button" class="commerce-link" @click="form=blank()">新增套餐</button>
    </div>
    <div class="admin-summary"><span>用户：{{ users.length }}（最多展示 100）</span><span>订单：{{ orders.length }}（最多展示 100）</span></div>
    <div v-for="o in orders.slice(0,8)" :key="o.id" class="commerce-history">
      <strong>{{ o.email }} · {{ o.state }}</strong>
      <span>¥{{ (o.price_fen/100).toFixed(2) }}</span>
    </div>
  </section>
</template>
