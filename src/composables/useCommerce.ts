import { computed, ref } from 'vue';
import type { ExportFormat, ProcessingParams } from '../types/editor';

const apiBase=String(import.meta.env.VITE_COMMERCIAL_API_URL||'').replace(/\/+$/,'');
const token=ref('');
const user=ref<{id:string;email:string;role:'user'|'admin'}|null>(null);
const wallet=ref<{credits:number;freeRemaining:number;perDay:number;day:string}|null>(null);
const plans=ref<CreditPlan[]>([]);
const paymentEnabled=ref(false);
const paymentProvider=ref<'xunhu'|'creem'>('xunhu');
const registrationEnabled=ref(false);
const recoveryEnabled=ref(false);
const busy=ref(false);
const error=ref('');
let catalogReady=false;
let initialization: Promise<void> | null = null;
class ApiError extends Error {
 constructor(readonly status: number, code: string) { super(code); }
}
const jobKeys=new Map<string,string>();
export interface CreditPlan {
 id:string;title:string;priceFen:number;originalPriceFen:number;
 amountMinor:number|null;currency:string|null;available:boolean;
 discountBps:number;credits:number;bonusCredits:number;credited:number;
}
export interface AdminOverview {
 users:number;activePlans:number;paidOrders:number;pendingOrders:number;refundedOrders:number;
 paidOrderValueFen:number;completed24h:number;reversed24h:number;free24h:number;credits24h:number;
}
export interface AdminPlan {
 id:string;title:string;base_price_fen:number;discount_bps:number;
 credits:number;bonus_credits:number;discount_starts_at:string|null;
 discount_ends_at:string|null;active:number;sort_order:number;version:number;
}
async function call(path:string,init:RequestInit={}):Promise<any> {
 if(!apiBase)throw new Error('商业化 API 尚未配置');
 const headers=new Headers(init.headers);
 if(token.value)headers.set('Authorization','Bearer '+token.value);
 if(init.body && !(init.body instanceof FormData))headers.set('Content-Type','application/json');
 const response=await fetch(apiBase+path,{...init,headers,cache:'no-store'});
 const data=await response.json().catch(()=>({error:'INVALID_API_RESPONSE'}));
 if(!response.ok)throw new ApiError(response.status,String(data.error??'API_ERROR'));
 return data;
}
async function refresh() {
 if(!token.value){user.value=null;wallet.value=null;return;}
 try{
  const data=await call('/api/auth/me');
  user.value=data.user;
  wallet.value=data.wallet;
  error.value='';
 }catch(failure){
  // A temporary VPS outage is not an invalid login. Only a definitive 401
  // expires the local session; retain the token so refresh can be retried.
  if(failure instanceof ApiError && failure.status===401){
   token.value='';
   sessionStorage.removeItem('deaify-auth');
   user.value=null;wallet.value=null;
  }else{
   error.value='账号服务暂不可用，请稍后重试。';
  }
 }
}
function initialize(): Promise<void> {
 if(!apiBase || catalogReady)return Promise.resolve();
 if(initialization)return initialization;
 token.value=sessionStorage.getItem('deaify-auth')??'';
 initialization=(async()=>{
  try{
   const [catalog,options]=await Promise.all([call('/api/plans'),call('/api/auth/options')]);
   plans.value=catalog.plans??[];
   paymentProvider.value=catalog.paymentProvider==='creem'?'creem':'xunhu';
   paymentEnabled.value=Boolean(options.payments);
   registrationEnabled.value=Boolean(options.registration);
   recoveryEnabled.value=Boolean(options.recovery);
   catalogReady=true;
  }catch{
   error.value='套餐服务暂不可用，可稍后重新打开账户面板重试。';
  }
  await refresh();
 })().finally(()=>{initialization=null;});
 return initialization;
}
async function login(email:string,password:string) {
 busy.value=true;error.value='';
 try{
  const r=await call('/api/auth/login',{method:'POST',body:JSON.stringify({email,password})});
  token.value=String(r.token);
  sessionStorage.setItem('deaify-auth',token.value);
  await refresh();
 }finally{busy.value=false;}
}
async function register(email:string,password:string,code:string) {
 busy.value=true;
 try{
  const r=await call('/api/auth/register',{method:'POST',body:JSON.stringify({email,password,code})});
  token.value=String(r.token);
  sessionStorage.setItem('deaify-auth',token.value);
  await refresh();
 }finally{busy.value=false;}
}
async function sendCode(email:string,turnstileToken:string) {
 return call('/api/auth/send-code',{method:'POST',body:JSON.stringify({email,turnstileToken})});
}
async function requestRecovery(email: string, turnstileToken: string): Promise<void> {
 await call('/api/auth/recovery/request',{
  method:'POST',body:JSON.stringify({email,turnstileToken}),
 });
}
async function confirmRecovery(email: string, code: string, newPassword: string): Promise<void> {
 await call('/api/auth/recovery/confirm',{
  method:'POST',body:JSON.stringify({email,code,newPassword}),
 });
}
async function logout() {
 try{await call('/api/auth/logout',{method:'POST'});}catch{/* Local logout always revokes the client token. */}
 token.value='';sessionStorage.removeItem('deaify-auth');user.value=null;wallet.value=null;
}
async function checkout(planId:string) {
 return call('/api/checkout',{method:'POST',body:JSON.stringify({planId})}) as Promise<{
  orderId:string;priceFen:number;credits:number;url?:string;qr?:string;
 }>;
}
async function orders() {return (await call('/api/account/orders')).orders;}
async function ledger() {return (await call('/api/account/ledger')).entries;}
async function jobs() {return (await call('/api/account/jobs')).jobs;}
async function downloadJob(id:string,filename:string):Promise<void> {
 if(!/^[a-f0-9-]{36}$/i.test(id))throw new Error('Invalid job');
 const response=await fetch(apiBase+'/api/jobs/'+id+'/download',{
  headers:{Authorization:'Bearer '+token.value},cache:'no-store',
 });
 if(!response.ok)throw new Error('Result expired or unavailable');
 const blob=await response.blob();
 const href=URL.createObjectURL(blob);
 const anchor=document.createElement('a');
 anchor.href=href;anchor.download=filename;document.body.append(anchor);anchor.click();anchor.remove();
 setTimeout(()=>URL.revokeObjectURL(href),30000);
}
async function getAdminPlans():Promise<AdminPlan[]>{return (await call('/api/admin/plans')).plans;}
async function saveAdminPlan(plan:Record<string,unknown>,id?:string){
 return call(id?'/api/admin/plans/'+encodeURIComponent(id):'/api/admin/plans',{
  method:id?'PUT':'POST',body:JSON.stringify(plan),
 });
}
async function getAdminOverview():Promise<AdminOverview>{return call('/api/admin/overview');}
async function getAdminOrders(){return (await call('/api/admin/orders')).orders;}
async function getAdminUsers(){return (await call('/api/admin/users')).users;}
async function getAdminAudit(){return (await call('/api/admin/audit')).events;}
/** The server reserves exactly one allowance/credit, creates a 30-minute encrypted result and returns it. */
async function process(file:Blob,params:ProcessingParams,format:ExportFormat):Promise<Blob>{
 if(!user.value)throw new Error('请先登录，再使用 VPS 完整分辨率导出');
 const bytes=await file.arrayBuffer();
 const paramText=JSON.stringify(params);
 const suffix=new TextEncoder().encode(paramText+format);
 const material=new Uint8Array(bytes.byteLength+suffix.byteLength);
 material.set(new Uint8Array(bytes),0);material.set(suffix,bytes.byteLength);
 const fingerprint=await crypto.subtle.digest('SHA-256',material);
 const fingerprintHex=Array.from(new Uint8Array(fingerprint)).map(n=>n.toString(16).padStart(2,'0')).join('');
 const key=jobKeys.get(fingerprintHex)??crypto.randomUUID().replaceAll('-','');
 jobKeys.set(fingerprintHex,key);
 const form=new FormData();
 form.set('params',paramText);
 form.set('format',format);
 const mime=file.type==='image/jpeg'||file.type==='image/png'||file.type==='image/webp'
  ? file.type:'image/png';
 form.set('image',new File([file],'input.'+(mime==='image/jpeg'?'jpg':mime.split('/')[1]),{
  type:mime,
 }));
 let created;
 try {
  created=await call('/api/process',{method:'POST',headers:{'Idempotency-Key':key},body:form});
 }catch(err) {
  const message=err instanceof Error?err.message:'PROCESSING_FAILED';
  if(['PROCESSING_FAILED_AND_QUOTA_REFUNDED','INVALID_IMAGE_OR_PARAMS',
      'JOB_REVERSED','RESULT_EXPIRED'].includes(message))jobKeys.delete(fingerprintHex);
  // A rejected or ambiguous job may already have adjusted the wallet in the
  // background. Refreshing is best-effort and must not conceal the original error.
  await refresh().catch(()=>{});
  throw err;
 }
 if(created.wallet)wallet.value=created.wallet;
 const response=await fetch(apiBase+created.downloadUrl,{
  headers:{Authorization:'Bearer '+token.value},cache:'no-store',
 });
 if(!response.ok) {
  if(response.status===404||response.status===410)jobKeys.delete(fingerprintHex);
  await refresh().catch(()=>{});
  throw new Error('处理成功但当前文件已过期或下载失败。请查看账户历史；过期重做可能重新计次。');
 }
 const result=await response.blob();
 // A later explicit export is a new operation; retain the job ID in account history
 // for free re-downloads rather than indefinitely reusing an expired idempotency key.
 jobKeys.delete(fingerprintHex);
 return result;
}
export function useCommerce() {
 return {
  enabled:!!apiBase,user,wallet,plans,paymentEnabled,paymentProvider,registrationEnabled,recoveryEnabled,busy,error,
  authenticated:computed(()=>!!user.value),initialize,refresh,login,register,sendCode,requestRecovery,confirmRecovery,
  logout,checkout,orders,ledger,jobs,downloadJob,getAdminPlans,saveAdminPlan,getAdminOverview,getAdminOrders,getAdminUsers,getAdminAudit,process,
 };
}
