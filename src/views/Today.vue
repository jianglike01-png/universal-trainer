<script setup>
import { computed } from 'vue';
import { items, stats, state } from '../store.js';
import TopBar from '../components/TopBar.vue';
import { TYPES } from '../scoring.js';
import { daysUntil, fmtDate } from '../ui.js';

const pending = computed(() => items.value.filter((s) => s.status === 'pending_reveal'));
const drafts = computed(() =>
  items.value
    .filter((s) => s.status === 'draft')
    .sort((a, b) => new Date(a.reveal_deadline || 0) - new Date(b.reveal_deadline || 0)),
);
const locked = computed(() => items.value.filter((s) => s.status === 'locked'));
const typeLabel = (t) => TYPES[t]?.label || t;

function deadlineText(s) {
  const d = daysUntil(s.reveal_deadline);
  if (d === null) return '无期限';
  if (d < 0) return `已过期 ${-d} 天`;
  if (d === 0) return '今天到期';
  return `${d} 天后揭晓`;
}
</script>

<template>
  <div class="shell">
    <TopBar mark title="盲测" :sub="pending.length ? `${pending.length} 条到点该揭晓了` : `${drafts.length} 条待预测 · 先下注，再看答案`" />

    <!-- 到点提醒 -->
    <div v-if="pending.length" class="due-banner">
      <div class="due-icon">!</div>
      <div style="flex: 1;">
        <div class="strong" style="font-size: 14px;">{{ pending.length }} 条预测已到揭晓时间</div>
        <div class="tiny" style="opacity: .8;">现在录入结果，逾期会降权</div>
      </div>
      <router-link :to="`/s/${pending[0].id}`" class="btn sm" style="background: var(--bad); color: #fff;">去揭晓</router-link>
    </div>

    <!-- 待揭晓列表 -->
    <div v-if="pending.length" class="sect" style="margin-top: 14px;">
      <div class="sect-head"><span class="eyebrow">已到揭晓窗口</span></div>
      <div class="stack">
        <router-link v-for="s in pending" :key="s.id" :to="`/s/${s.id}`" class="card today-card reveal">
          <div class="row-top">
            <span class="tag accent">{{ s.domain?.icon }} {{ s.domain?.name || '未分类' }}</span>
            <span class="tag warn" v-if="s.outcome">已录入</span>
          </div>
          <h3 class="t-title">{{ s.title }}</h3>
          <div class="row-meta">
            <span>锁定于 {{ fmtDate(s.prediction?.created_at) }}</span>
            <span>·</span>
            <span>把握 {{ Math.round((s.prediction?.confidence || 0) * 100) }}%</span>
          </div>
          <div class="cta">录入真实结果 →</div>
        </router-link>
      </div>
    </div>

    <!-- 待预测 -->
    <div class="sect">
      <div class="sect-head">
        <span class="eyebrow">待预测</span>
        <router-link to="/new" class="tiny" style="font-weight: 650;">+ 新建样本</router-link>
      </div>

      <div v-if="!state.ready" class="card center muted small" style="padding: 30px;">读取本地数据…</div>

      <div v-else-if="!drafts.length && !pending.length" class="card empty">
        <div class="glyph">◎</div>
        <h4>还没有待预测的样本</h4>
        <p>先建一个：看视频前猜点赞、看简历前猜录用、开工前猜工期，或者猜一件事的走向。</p>
        <router-link to="/new" class="btn primary" style="max-width: 240px; margin: 0 auto;">建第一个样本</router-link>
      </div>

      <div v-else-if="!drafts.length" class="card empty" style="padding: 26px 20px;">
        <div class="small muted">今天要预测的都做完了。等揭晓吧。</div>
      </div>

      <div v-else class="stack">
        <router-link v-for="s in drafts" :key="s.id" :to="`/s/${s.id}`" class="card today-card">
          <div class="row-top">
            <span class="tag">{{ s.domain?.icon }} {{ s.domain?.name || '未分类' }}</span>
            <span class="tag muted">{{ typeLabel(s.prediction_type) }}</span>
            <span v-if="s.noise_level === 'high'" class="tag warn" style="margin-left: auto;">高噪声</span>
          </div>
          <h3 class="t-title">{{ s.title }}</h3>
          <p v-if="s.content" class="t-content">{{ s.content }}</p>
          <div class="row-meta" style="margin-top: 10px;">
            <span>{{ deadlineText(s) }}</span>
            <span v-if="s.reveal_deadline">· {{ fmtDate(s.reveal_deadline, true) }}</span>
          </div>
          <div class="cta">先下注 →</div>
        </router-link>
      </div>
    </div>

    <!-- 已锁定（等时间） -->
    <div v-if="locked.length" class="sect">
      <div class="sect-head"><span class="eyebrow">已锁定 · 等揭晓</span></div>
      <div class="card tight">
        <router-link v-for="s in locked" :key="s.id" :to="`/s/${s.id}`" class="row-item">
          <div class="row-top">
            <span class="row-title">{{ s.title }}</span>
            <span class="tag muted">{{ deadlineText(s) }}</span>
          </div>
          <div class="row-meta">
            <span>{{ s.domain?.name }}</span><span>·</span>
            <span>把握 {{ Math.round((s.prediction?.confidence || 0) * 100) }}%</span>
          </div>
        </router-link>
      </div>
    </div>

    <div style="height: 20px;"></div>
  </div>
</template>

<style scoped>
.due-banner {
  display: flex; align-items: center; gap: 11px;
  background: var(--bad-soft); color: var(--bad);
  border-radius: 14px; padding: 12px 14px;
}
.due-icon {
  width: 26px; height: 26px; border-radius: 50%; flex: 0 0 auto;
  border: 1.5px solid currentColor; display: grid; place-items: center;
  font-weight: 800; font-size: 14px;
}
.stack > * + * { margin-top: 11px; }
.today-card { display: block; color: inherit; text-decoration: none; transition: transform .12s; }
.today-card:active { transform: scale(.99); }
.today-card.reveal { border-color: color-mix(in srgb, var(--bad) 35%, var(--line)); }
.t-title { font-size: 16.5px; line-height: 1.32; margin-top: 9px; }
.t-content {
  font-size: 13px; color: var(--muted); line-height: 1.5; margin: 6px 0 0;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.cta {
  margin-top: 12px; font-size: 13px; font-weight: 680; color: var(--accent);
  display: flex; align-items: center; gap: 4px;
}
</style>
