<script setup lang="ts">
import { onMounted,onBeforeUnmount,ref } from 'vue';
const emit=defineEmits<{token:[value:string]}>();
const node=ref<HTMLDivElement|null>(null);
const siteKey=String(import.meta.env.VITE_TURNSTILE_SITE_KEY||'');
let widgetId:string|undefined;
interface Turnstile{
 render(node:HTMLElement,options:{sitekey:string;callback:(token:string)=>void;'expired-callback':()=>void}):string;
 remove(id:string):void;
}
declare global {interface Window{turnstile?:Turnstile;}}
function mountWidget() {
 if(!node.value||!window.turnstile||!siteKey)return;
 widgetId=window.turnstile.render(node.value,{
  sitekey:siteKey,callback:token=>emit('token',token),'expired-callback':()=>emit('token',''),
 });
}
onMounted(()=>{
 if(!siteKey)return;
 if(window.turnstile){mountWidget();return;}
 const script=document.createElement('script');
 script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
 script.async=true;script.defer=true;script.onload=mountWidget;
 document.head.append(script);
});
onBeforeUnmount(()=>{if(widgetId)window.turnstile?.remove(widgetId);});
</script>
<template>
  <div>
    <div ref="node"></div>
    <p v-if="!siteKey" class="commerce-help">注册验证尚未配置，管理员需要先设置 Turnstile Site Key。</p>
  </div>
</template>
