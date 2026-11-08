<script setup>
import { ref, computed } from 'vue';
import { items, state, stats, STATUS } from '../store.js';
import TopBar from '../components/TopBar.vue';
import { TYPES } from '../scoring.js';
import { fmtDate, daysUntil } from '../ui.js';

const statusFilter = ref('all');
const domainFilter = ref('all');
const q = ref('');

const statusOptions = computed(() => {
  const counts = { all: items.value.length };
  for (const k of Object.keys(STATUS)) counts[k] = items.value.filter((s) => s.status === k).length;
  return [
    { key: 'all', label: '全部', n: counts.all },
    { key: 'draft', label: '待预测', n: counts.draft },
    { key: 'locked', label: '已锁定', n: counts.locked },
    { key: 'pending_reveal', label: '待揭晓', n: counts.pending_reveal },
    { key: 'revealed', label: '已揭晓', n: counts.revealed },
  ];
});

const domainOptions = computed(() => {
  const used = new Map();
  for (const s of items.value) used.set(s.domain_id, (used.get(s.domain_id) || 0) + 1);
  return state.domains
    .filter((d) => used.has(d.id))
    .map((d) => ({ id: d.id, name: d.name, icon: d.icon, n: used.get(d.id) }));
});

const list = computed(() => {
  let arr = items.value;
  if (statusFilter.value !== 'all') arr = arr.filter((s) => s.status === statusFilter.value);
  if (domainFilter.value !== 'all') arr = arr.filter((s) => s.domain_id === domainFilter.value);
  if (q.value.trim()) {
    const k = q.value.trim().toLowerCase();
    arr = arr.filter((s) => (s.title + ' ' + (s.content || '')).toLowerCase().includes(k));
  }
  const rank = { pending_reveal: 0, draft: 1, locked: 2, revealed: 3 };
  return [...arr].sort((a, b) => {
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    return new Date(b.created_at) - new Date(a.created_at);
  });
});

const statusOf = (s) => STATUS[s.status] || STATUS.draft;

function scoreBit(s) {
  if (!s.score) return '';
  return s.score.brier.toFixed(3);
}
function verdict(s) {
  if (!s.score) return null;
  return s.score.hit ? 'hit' : 'miss';
}
</script>

<template>
  <div class="shell">
    <TopBar title="样本库" :sub="`${items.length} 个样本 · ${stats.revealed} 条已对账`">
      <template #action>
        <router-link to="/new" class="add-btn" aria-label="新建样本">+</router-link>
      </template>
    </TopBar>

    <input v-model="q" class="input" placeholder="搜标题或内容…" style="margin-bottom: 12px;" />

    <div class="chips">
      <button
        v-for="o in statusOptions" :key="o.key" class="chip" :class="{ on: statusFilter === o.key }"
        @click="statusFilter = o.key">
        {{ o.label }}<span class="c">{{ o.n }}</span>
      </button>
    </div>
    <div v-if="domainOptions.length" class="chips" style="margin-top: 2px;">
      <button class="chip" :class="{ on: domainFilter === 'all' }" @click="domainFilter = 'all'">所有领域</button>
      <button
        v-for="d in domainOptions" :key="d.id" class="chip" :class="{ on: domainFilter === d.id }"
        @click="domainFilter = d.id">
        {{ d.icon }} {{ d.name }}<span class="c">{{ d.n }}</span>
      </button>
    </div>

    <div v-if="list.length" class="card tight" style="margin-top: 12px;">
      <router-link v-for="s in list" :key="s.id" :to="`/s/${s.id}`" class="row-item">
        <div class="row-top">
          <span class="row-title">{{ s.title }}</span>
          <span class="tag" :class="statusOf(s).tone">{{ statusOf(s).label }}</span>
        </div>
        <div class="row-meta">
          <span>{{ s.domain?.icon }} {{ s.domain?.name || '未分类' }}</span>
          <span>·</span>
          <span>{{ TYPES[s.prediction_type]?.label }}</span>
          <span v-if="s.status !== 'revealed' && s.reveal_deadline">·</span>
          <span v-if="s.status !== 'revealed' && s.reveal_deadline">
            {{ daysUntil(s.reveal_deadline) < 0 ? '已过期' : fmtDate(s.reveal_deadline) + ' 揭晓' }}
          </span>
          <span v-if="s.contra_flag" class="tag warn" style="padding: 1px 5px;">反例</span>
        </div>
        <div v-if="s.score" class="score-line">
          <span class="dot-ind" :class="verdict(s)"></span>
          <span class="num">Brier {{ scoreBit(s) }}</span>
          <span v-if="s.score.type === 'numeric' || s.score.type === 'time'" class="num">
            · 相对误差 {{ (s.score.rel_err * 100).toFixed(0) }}%
          </span>
        </div>
      </router-link>
    </div>

    <div v-else class="card empty" style="margin-top: 12px;">
      <div class="glyph">⌕</div>
      <h4>没有匹配的样本</h4>
      <p>换个筛选条件，或者新建一条。</p>
      <router-link to="/new" class="btn ghost" style="max-width: 200px; margin: 0 auto;">新建样本</router-link>
    </div>

    <div class="btn-row" style="margin-top: 14px;">
      <router-link to="/new" class="btn ghost">新建样本</router-link>
      <router-link to="/new-domain" class="btn ghost">新建领域</router-link>
    </div>

    <div class="sect">
      <div class="sect-head"><span class="eyebrow">领域模板</span></div>
      <div class="card tight">
        <div v-for="d in state.domains" :key="d.id" class="row-item" style="cursor: default;">
          <div class="row-top">
            <span class="row-title">{{ d.icon }} {{ d.name }}</span>
            <span class="tag muted">{{ TYPES[d.prediction_type]?.label }}</span>
          </div>
          <div class="row-meta">
            <span>{{ d.builtin ? '内置' : '自建' }}</span>
            <span>·</span>
            <span>默认揭晓 {{ d.deadline_days }} 天</span>
            <span v-if="d.form_config?.tolerance">· 容差 ±{{ Math.round(d.form_config.tolerance * 100) }}%</span>
          </div>
        </div>
      </div>
    </div>
    <div style="height: 12px;"></div>
  </div>
</template>

<style scoped>
.add-btn {
  width: 38px; height: 38px; border-radius: 12px; background: var(--accent); color: #fff;
  display: grid; place-items: center; font-size: 24px; font-weight: 400; line-height: 1;
  text-decoration: none; padding-bottom: 3px;
}
.score-line { display: flex; align-items: center; gap: 6px; margin-top: 7px; font-size: 11.5px; color: var(--ink-2); }
.dot-ind { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }
.dot-ind.hit { background: var(--ok); }
.dot-ind.miss { background: var(--bad); }
</style>
