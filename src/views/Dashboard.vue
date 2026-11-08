<script setup>
import { computed } from 'vue';
import { stats, scoredItems, state, updateSettings } from '../store.js';
import TopBar from '../components/TopBar.vue';
import CalibrationChart from '../components/CalibrationChart.vue';
import TrendChart from '../components/TrendChart.vue';
import { TYPES } from '../scoring.js';
import { pct, fmtNum, toast } from '../ui.js';

const ov = computed(() => stats.value.overview);
const cov = computed(() => stats.value.calibration);
const bias = computed(() => stats.value.bias);
const trendPts = computed(() => stats.value.trend);
const verdict = computed(() => stats.value.verdict);

const byType = computed(() => {
  const groups = new Map();
  for (const it of scoredItems.value) {
    if (!groups.has(it.prediction_type)) groups.set(it.prediction_type, []);
    groups.get(it.prediction_type).push(it);
  }
  return [...groups.entries()].map(([type, list]) => {
    const core = list.filter((x) => x.score.weight === 1);
    const use = core.length ? core : list;
    return {
      type,
      label: TYPES[type]?.label || type,
      n: use.length,
      brier: use.reduce((s, x) => s + x.score.brier, 0) / use.length,
      hit: use.reduce((s, x) => s + x.score.hit, 0) / use.length,
    };
  }).sort((a, b) => b.n - a.n);
});

const maxBias = computed(() => Math.max(0.15, ...bias.value.map((b) => Math.min(1, b.magnitude || 0))));
const barW = (b) => Math.min(100, ((b.magnitude || 0) / maxBias.value) * 100);

async function toggleOverdue() {
  await updateSettings({ includeOverdue: !state.settings.includeOverdue });
  toast(state.settings.includeOverdue ? '已把逾期样本纳入曲线' : '已排除逾期样本');
}

const brierTone = computed(() => {
  const v = ov.value.brierCore;
  if (v === null || v === undefined) return '';
  return v < 0.12 ? 'ok' : v < 0.25 ? '' : 'bad';
});
</script>

<template>
  <div class="shell">
    <TopBar title="仪表盘" :sub="ov.n ? `${ov.n} 条已对账 · 校准画像` : '还没有数据，先去盲测几条'" />

    <div v-if="!ov.n" class="card empty">
      <div class="glyph">∿</div>
      <h4>曲线要等第一条揭晓才有</h4>
      <p>预测 → 锁定 → 揭晓 → 这里就会长出你的校准曲线。第一次用可以先在「我的」里载入 20 条演示数据看看效果。</p>
      <router-link to="/" class="btn primary" style="max-width: 220px; margin: 0 auto;">去盲测</router-link>
    </div>

    <template v-else>
      <!-- 总览 -->
      <div class="metrics">
        <div class="metric">
          <div class="k">整体 Brier</div>
          <div class="v num" :class="brierTone">{{ fmtNum(ov.brierCore, 3) }}</div>
          <div class="s">越低越准 · 0 是完美</div>
        </div>
        <div class="metric">
          <div class="k">命中率</div>
          <div class="v num">{{ pct(ov.hitRate) }}</div>
          <div class="s">{{ ov.coreCount }} 条核心样本</div>
        </div>
        <div class="metric">
          <div class="k">平均把握</div>
          <div class="v num">{{ pct(ov.avgConfidence) }}</div>
          <div class="s">你自我感觉的水平</div>
        </div>
        <div class="metric">
          <div class="k">已揭晓 / 总数</div>
          <div class="v num">{{ ov.n }}<span style="font-size: 15px; color: var(--muted); font-weight: 600;"> / {{ stats.total }}</span></div>
          <div class="s" v-if="ov.overdueCount">{{ ov.overdueCount }} 条逾期已降权</div>
          <div class="s" v-else>没有逾期记录</div>
        </div>
      </div>

      <!-- 可靠性一句话 -->
      <div v-if="verdict" class="card" style="margin-top: 12px;">
        <div class="eyebrow">置信度可靠性</div>
        <p style="margin: 8px 0 0; font-size: 15px; line-height: 1.55;">{{ verdict.text }}</p>
        <div class="rel-bar">
          <div class="rel-seg">
            <span class="tiny muted">声称</span>
            <div class="bar-track"><div class="bar-fill" :style="{ width: pct(verdict.claim), background: 'var(--muted)' }"></div></div>
            <b class="num tiny">{{ pct(verdict.claim) }}</b>
          </div>
          <div class="rel-seg">
            <span class="tiny muted">实际</span>
            <div class="bar-track"><div class="bar-fill" :style="{ width: pct(verdict.rate), background: verdict.gap > 0.05 ? 'var(--bad)' : 'var(--ok)' }"></div></div>
            <b class="num tiny">{{ pct(verdict.rate) }}</b>
          </div>
        </div>
        <div class="tiny muted" style="margin-top: 9px;">
          {{ verdict.gap > 0.05 ? `平均多说了 ${Math.round(verdict.gap * 100)} 个百分点 —— 典型过度自信` : verdict.gap < -0.05 ? '实际比你说的更准，你偏保守' : '声称和实际基本对得上' }}
        </div>
      </div>

      <!-- 校准曲线 -->
      <div class="card" style="margin-top: 12px;">
        <div class="sect-head" style="margin-bottom: 2px;">
          <span class="eyebrow">校准曲线</span>
          <span class="tiny muted">n = {{ ov.coreCount }} 核心样本</span>
        </div>
        <CalibrationChart :bins="cov" />
        <div v-if="state.settings.includeOverdue" class="tiny warn-note">当前已把逾期样本纳入曲线</div>
        <button v-else-if="ov.overdueCount" class="link-btn" @click="toggleOverdue">
          {{ ov.overdueCount }} 条逾期样本已排除（点此纳入）
        </button>
      </div>

      <!-- 分领域偏差 -->
      <div class="card" style="margin-top: 12px;">
        <div class="eyebrow" style="margin-bottom: 12px;">分领域偏差</div>
        <div v-for="b in bias" :key="b.domainId" class="bias-row">
          <div class="bias-head">
            <span class="strong" style="font-size: 14px;">{{ b.name }}</span>
            <span class="tag" :class="b.direction === 'over' ? 'bad' : b.direction === 'under' ? 'warn' : 'ok'">
              {{ b.text }}
            </span>
          </div>
          <div class="bar-track" style="margin-top: 7px;">
            <div class="bar-fill" :style="{ width: barW(b) + '%', background: b.direction === 'over' ? 'var(--bad)' : b.direction === 'under' ? 'var(--warn)' : 'var(--ok)' }"></div>
          </div>
          <div class="tiny muted" style="margin-top: 5px;">
            {{ b.n }} 条 · 平均 Brier {{ fmtNum(b.brierMean, 3) }}
          </div>
        </div>
        <div v-if="!bias.length" class="small muted">暂无数据</div>

        <div class="divider"></div>
        <div class="eyebrow" style="margin-bottom: 10px;">分类型</div>
        <div v-for="t in byType" :key="t.type" class="kv">
          <span class="k">{{ t.label }}</span>
          <span class="v num">{{ t.n }} 条 · Brier {{ fmtNum(t.brier, 3) }} · 命中 {{ pct(t.hit) }}</span>
        </div>
      </div>

      <!-- 趋势 -->
      <div class="card" style="margin-top: 12px;">
        <div class="sect-head" style="margin-bottom: 6px;">
          <span class="eyebrow">最近 30 天误差趋势</span>
        </div>
        <TrendChart :points="trendPts" />
        <div v-if="trendPts.length < 2" class="tiny muted center" style="margin-top: 8px;">
          至少两个揭晓日才会连成趋势
        </div>
      </div>

      <p class="tiny muted center" style="margin: 18px 0 6px; line-height: 1.6;">
        Brier 分数衡量的是「你说的把握」和「实际命中」的差，<br />不看单次对错，只看长期是否高估自己。
      </p>
    </template>
    <div style="height: 12px;"></div>
  </div>
</template>

<style scoped>
.rel-bar { display: grid; gap: 7px; margin-top: 13px; }
.rel-seg { display: grid; grid-template-columns: 30px 1fr 40px; align-items: center; gap: 8px; }
.bias-row + .bias-row { margin-top: 15px; }
.bias-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.warn-note { color: var(--warn); margin-top: 8px; }
.link-btn {
  margin-top: 8px; background: none; border: 0; padding: 0; cursor: pointer;
  color: var(--warn); font-size: 11.5px; text-decoration: underline; text-underline-offset: 2px;
}
.metric .v.bad { color: var(--bad); }
.metric .v.ok { color: var(--ok); }
</style>
