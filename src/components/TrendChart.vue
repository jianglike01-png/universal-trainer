<script setup>
import { computed } from 'vue';

const props = defineProps({ points: { type: Array, default: () => [] } });

const W = 340, H = 84, padL = 4, padR = 4, padT = 12, padB = 16;
const plotW = W - padL - padR;
const plotH = H - padT - padB;

const maxY = computed(() => {
  const m = Math.max(0.05, ...props.points.map((p) => p.brier));
  return Math.max(0.25, m * 1.2);
});

const coords = computed(() => {
  const n = props.points.length;
  if (!n) return [];
  const step = n > 1 ? plotW / (n - 1) : 0;
  return props.points.map((p, i) => ({
    ...p,
    cx: padL + (n > 1 ? i * step : plotW / 2),
    cy: padT + (1 - p.brier / maxY.value) * plotH,
  }));
});

const line = computed(() => coords.value.map((p, i) => `${i ? 'L' : 'M'}${p.cx.toFixed(1)},${p.cy.toFixed(1)}`).join(' '));
const area = computed(() => {
  if (coords.value.length < 2) return '';
  const base = H - padB;
  return `${line.value} L${coords.value[coords.value.length - 1].cx.toFixed(1)},${base} L${coords.value[0].cx.toFixed(1)},${base} Z`;
});
const last = computed(() => (props.points.length ? props.points[props.points.length - 1] : null));
const first = computed(() => (props.points.length ? props.points[0] : null));
const delta = computed(() => {
  if (props.points.length < 2) return null;
  return last.value.brier - first.value.brier; // 负 = 误差在变小 = 变准
});
</script>

<template>
  <div>
    <svg :viewBox="`0 0 ${W} ${H}`" width="100%" role="img" aria-label="近期误差趋势">
      <line :x1="padL" :x2="W - padR" :y1="H - padB" :y2="H - padB" stroke="var(--line-2)" stroke-width="1" />
      <line :x1="padL" :x2="W - padR" :y1="padT" :y2="padT" stroke="var(--line-2)" stroke-width="1" stroke-dasharray="3 3" />
      <path v-if="area" :d="area" fill="var(--accent)" opacity=".08" />
      <path v-if="line" :d="line" fill="none" stroke="var(--accent)" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" />
      <circle v-if="last" :cx="last.cx" :cy="last.cy" r="3.4" fill="var(--accent)" />
    </svg>
    <div style="display: flex; justify-content: space-between; margin-top: 4px;" class="tiny muted">
      <span>{{ first ? first.date.slice(5) : '—' }}</span>
      <span v-if="delta !== null">
        {{ delta < 0 ? '误差在收窄' : delta > 0 ? '误差在扩大' : '基本持平' }}
        <b class="num">{{ Math.abs(delta).toFixed(3) }}</b>
      </span>
      <span>{{ last ? last.date.slice(5) : '—' }}</span>
    </div>
  </div>
</template>
