<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { queue, stats } from '../store.js';

const route = useRoute();

const tabs = [
  { name: 'today', to: '/', label: '盲测',
    d: 'M12 3v3M12 18v3M3 12h3M18 12h3M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z' },
  { name: 'library', to: '/library', label: '样本库',
    d: 'M4 7.5 12 3.5l8 4-8 4-8-4zM4 12.2l8 4 8-4M4 16.8l8 4 8-4' },
  { name: 'dashboard', to: '/dashboard', label: '仪表盘',
    d: 'M4 20V9M10 20V4M16 20v-7M22 20H2' },
  { name: 'me', to: '/me', label: '我的',
    d: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-3.6 3.6-6.2 8-6.2s8 2.6 8 6.2' },
];

const badges = computed(() => ({
  today: queue.value.length,
  library: stats.value.pendingReveal,
}));

const active = (name) => route.name === name;
</script>

<template>
  <nav class="tabbar">
    <div class="tabbar-inner">
      <router-link v-for="t in tabs" :key="t.name" :to="t.to" class="tab" :class="{ active: active(t.name) }">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <path :d="t.d" />
        </svg>
        <span>{{ t.label }}</span>
        <span v-if="badges[t.name]" class="dot">{{ badges[t.name] > 99 ? '99+' : badges[t.name] }}</span>
      </router-link>
    </div>
  </nav>
</template>
