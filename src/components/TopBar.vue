<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
defineProps({ title: String, sub: String, mark: { type: Boolean, default: false } });
const scrolled = ref(false);
const onScroll = () => (scrolled.value = window.scrollY > 4);
onMounted(() => window.addEventListener('scroll', onScroll, { passive: true }));
onUnmounted(() => window.removeEventListener('scroll', onScroll));
</script>

<template>
  <header class="topbar" :class="{ scrolled }">
    <div class="topbar-row">
      <div style="min-width: 0;">
        <div v-if="mark" class="brand" style="margin-bottom: 2px;">
          <span class="brand-mark">
            <svg viewBox="0 0 24 24" fill="none" stroke="#f4f2ee" stroke-width="2" stroke-linecap="round">
              <path d="M4 19 L9 14.5 L13 16.5 L20 6" />
            </svg>
          </span>
          <span class="brand-txt">Universal Trainer</span>
        </div>
        <h1 class="page-title">{{ title }}</h1>
        <div v-if="sub" class="page-sub">{{ sub }}</div>
      </div>
      <div class="topbar-action"><slot name="action" /></div>
    </div>
  </header>
</template>
