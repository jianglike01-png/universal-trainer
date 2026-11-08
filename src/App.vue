<script setup>
import { ref, computed, onMounted } from 'vue';
import { state, loadAll, queue, stats } from './store.js';
import { toastMsg, dialog, resolveDialog } from './ui.js';
import TabBar from './components/TabBar.vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const bootError = ref('');
const showTabs = computed(() => ['today', 'library', 'dashboard', 'me'].includes(route.name));

function notifyDue() {
  if (!state.settings.remind) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const n = stats.value.pendingReveal;
  if (!n) return;
  try {
    new Notification('训练器 · 该对账了', {
      body: `${n} 条预测已到揭晓时间，逾期会降权`,
      tag: 'ut-due',
      icon: 'icons/icon-192.png',
    });
  } catch {}
}

onMounted(async () => {
  try {
    await loadAll();
    notifyDue();
  } catch (e) {
    bootError.value = String(e?.message || e);
    console.error(e);
  }
});
</script>

<template>
  <router-view v-slot="{ Component }">
    <component :is="Component" class="page" />
  </router-view>

  <TabBar v-if="showTabs && state.ready" />

  <transition name="fade">
    <div v-if="toastMsg" class="toast">{{ toastMsg }}</div>
  </transition>

  <div v-if="dialog.open" class="sheet-mask" @click.self="resolveDialog(false)">
    <div class="sheet">
      <h3>{{ dialog.title }}</h3>
      <p v-if="dialog.body" class="small muted" style="margin: 4px 0 18px; line-height: 1.55;">{{ dialog.body }}</p>
      <div class="btn-row" style="margin-top: 8px;">
        <button class="btn ghost" @click="resolveDialog(false)">{{ dialog.cancelText }}</button>
        <button class="btn" :class="dialog.danger ? 'primary' : ''" @click="resolveDialog(true)">{{ dialog.okText }}</button>
      </div>
    </div>
  </div>

  <div v-if="bootError" class="sheet-mask">
    <div class="sheet">
      <h3>数据打不开</h3>
      <p class="small muted">{{ bootError }}<br />如果是 Safari 隐私模式或存储被清理，关掉隐私模式重新打开试试。</p>
    </div>
  </div>
</template>

<style>
.fade-enter-active, .fade-leave-active { transition: opacity .2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
