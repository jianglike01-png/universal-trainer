<script setup>
import { computed } from 'vue';

const props = defineProps({
  bins: { type: Array, default: () => [] },
});

const W = 340, H = 200, padL = 30, padR = 12, padT = 14, padB = 30;
const plotW = W - padL - padR;
const plotH = H - padT - padB;

const x = (conf) => padL + ((conf - 0.5) / 0.5) * plotW;
const y = (rate) => padT + (1 - rate) * plotH;

const hasData = computed(() => props.bins.some((b) => b.n > 0));

const gridV = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0].map((c) => ({ c, x: x(c) }));
const gridH = [0, 0.25, 0.5, 0.75, 1].map((r) => ({ r, y: y(r) }));

const pts = computed(() =>
  props.bins.filter((b) => b.n > 0).map((b) => ({
    ...b,
    cx: x(b.avgConfidence),
    cy: y(b.hitRate),
    r: 4 + Math.min(6, b.n) * 0.5,
  })),
);

const linePath = computed(() => (pts.value.length ? pts.value.map((p, i) => `${i ? 'L' : 'M'}${p.cx.toFixed(1)},${p.cy.toFixed(1)}`).join(' ') : ''));

const areaPath = computed(() => {
  if (pts.value.length < 2) return '';
  const base = y(0);
  return `${linePath.value} L${pts.value[pts.value.length - 1].cx.toFixed(1)},${base} L${pts.value[0].cx.toFixed(1)},${base} Z`;
});
</script>

<template>
  <div>
    <div class="chart-wrap">
      <svg :viewBox="`0 0 ${W} ${H}`" width="100%" role="img" aria-label="校准曲线">
        <!-- 网格 -->
        <g stroke="var(--line-2)" stroke-width="1">
          <line v-for="g in gridH" :key="'h' + g.r" :x1="padL" :x2="W - padR" :y1="g.y" :y2="g.y" />
          <line v-for="g in gridV" :key="'v' + g.c" :x1="g.x" :x2="g.x" :y1="padT" :y2="H - padB" />
        </g>
        <!-- 完美校准对角线 -->
        <line :x1="x(0.5)" :y1="y(0.5)" :x2="x(1)" :y2="y(1)" stroke="var(--muted)" stroke-width="1.2" stroke-dasharray="4 4" opacity=".7" />
        <!-- 面积 + 折线 -->
        <path v-if="areaPath" :d="areaPath" fill="var(--accent)" opacity=".07" />
        <path v-if="linePath" :d="linePath" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
        <!-- 点 -->
        <g v-for="p in pts" :key="p.label">
          <circle :cx="p.cx" :cy="p.cy" :r="p.r" fill="var(--card)" stroke="var(--accent)" stroke-width="2.2" />
          <text :x="p.cx" :y="p.cy - p.r - 5" text-anchor="middle" font-size="9" fill="var(--muted)" font-weight="600">
            {{ Math.round(p.hitRate * 100) }}%
          </text>
        </g>
        <!-- 轴标签 -->
        <g fill="var(--muted)" font-size="9.5" font-weight="600">
          <text v-for="g in gridV" :key="'lx' + g.c" :x="g.x" :y="H - padB + 14" text-anchor="middle">
            {{ Math.round(g.c * 100) }}
          </text>
          <text v-for="g in gridH" :key="'ly' + g.r" :x="padL - 7" :y="g.y + 3" text-anchor="end">
            {{ Math.round(g.r * 100) }}
          </text>
          <text :x="W - padR" :y="H - 4" text-anchor="end" font-size="9" opacity=".8">你声称的把握度 %</text>
          <text :x="padL - 7" :y="padT - 5" text-anchor="end" font-size="9" opacity=".8">实际命中</text>
        </g>
      </svg>
      <div v-if="!hasData" class="center small muted" style="margin-top: -60px; margin-bottom: 40px;">
        还没有已揭晓的样本，曲线等数据
      </div>
    </div>
    <div class="chart-legend">
      <span><i style="background: var(--accent);"></i>你的实际表现</span>
      <span><i style="background: var(--muted);"></i>完美校准</span>
      <span class="muted">点在虚线下方 = 过度自信</span>
    </div>
  </div>
</template>
