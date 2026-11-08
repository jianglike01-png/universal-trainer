<script setup>
import { ref, reactive, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { itemOf, lockPrediction, revealSample, toggleContra, removeSample, stats } from '../store.js';
import TypeInput from '../components/TypeInput.vue';
import ConfidencePicker from '../components/ConfidencePicker.vue';
import { TYPES } from '../scoring.js';
import { toast, ask, fmtDate, daysUntil, pct, fmtNum } from '../ui.js';

const route = useRoute();
const router = useRouter();

const sample = computed(() => itemOf(route.params.id));
const status = computed(() => sample.value?.status);
const type = computed(() => sample.value?.prediction_type);
const options = computed(() => sample.value?.form_config?.options || []);
const unit = computed(() => sample.value?.form_config?.unit || '');
const typeLabel = computed(() => TYPES[type.value]?.label || type.value);

/* ---------- 预测表单 ---------- */
const form = reactive({ value: {}, confidence: 0.7, reasoning: '' });
const locking = ref(false);
const lockInfo = ref(null);

function resetForm() {
  form.value = type.value === 'multi' ? {} : type.value === 'binary' ? {} : {};
  form.confidence = sample.value?.noise_level === 'high' ? 0.6 : 0.7;
  form.reasoning = '';
}
resetForm();
watch(() => route.params.id, resetForm);

const valueFilled = computed(() => {
  if (type.value === 'binary' || type.value === 'multi') return !!form.value.choice;
  const k = type.value === 'time' ? 'days' : 'value';
  return form.value[k] !== null && form.value[k] !== undefined && isFinite(form.value[k]);
});

const reasoningOk = computed(() => form.reasoning.trim().length >= 2);
const canSubmit = computed(() => valueFilled.value && reasoningOk.value && !locking.value);

async function submitPrediction() {
  if (!canSubmit.value) {
    if (!valueFilled.value) return toast('先把预测填了');
    if (!reasoningOk.value) return toast('理由必填 —— 这是事后对账的唯一线索');
  }
  const ok = await ask({
    title: '封存这条预测？',
    body: '提交后写进哈希链，只读，没有任何修改入口。这就是这个工具的全部意义，别手滑。',
    okText: '确认封存',
  });
  if (!ok) return;

  locking.value = true;
  try {
    const rec = await lockPrediction(sample.value.id, {
      predicted_value: { ...form.value },
      confidence: form.confidence,
      reasoning: form.reasoning.trim(),
    });
    lockInfo.value = rec;
    setTimeout(() => (lockInfo.value = null), 1500);
  } catch (e) {
    toast('封存失败：' + e.message);
  } finally {
    locking.value = false;
  }
}

/* ---------- 揭晓 ---------- */
const revealOpen = ref(false);
const revealForm = reactive({ value: {}, note: '' });
const lastResult = ref(null);

const actualFilled = computed(() => {
  if (type.value === 'binary' || type.value === 'multi') return !!revealForm.value.choice;
  const k = type.value === 'time' ? 'days' : 'value';
  const v = revealForm.value[k];
  return v !== null && v !== undefined && isFinite(v);
});

async function submitReveal() {
  if (!actualFilled.value) return toast('真实结果还没填');
  try {
    const res = await revealSample(sample.value.id, {
      actual_value: { ...revealForm.value },
      evidence_note: revealForm.note.trim(),
    });
    lastResult.value = res;
    revealOpen.value = false;
    toast(res.weighted < 1 ? '已录入（逾期，已降权）' : '已录入，对账完成');
  } catch (e) {
    toast('录入失败：' + e.message);
  }
}

/* ---------- 展示 ---------- */
const predictedText = computed(() => {
  const p = sample.value?.prediction;
  if (!p) return '—';
  const v = p.predicted_value || {};
  if (type.value === 'binary') return v.choice === 'yes' ? '是' : '否';
  if (type.value === 'multi') return v.choice || '—';
  if (type.value === 'time') return `${v.days ?? '—'} ${unit.value || '天'}`;
  return `${v.value ?? '—'}`;
});

const actualText = computed(() => {
  const o = sample.value?.outcome;
  if (!o) return '—';
  const v = o.actual_value || {};
  if (type.value === 'binary') return v.value === 'yes' ? '是' : '否';
  if (type.value === 'multi') return v.choice || '—';
  if (type.value === 'time') return `${v.days ?? '—'} ${unit.value || '天'}`;
  return `${v.value ?? '—'}`;
});

const score = computed(() => sample.value?.score || lastResult.value?.score || null);

const relText = computed(() => {
  if (!score.value?.signed_err && score.value?.signed_err !== 0) return null;
  const s = score.value.signed_err;
  const p = Math.abs(Math.expm1(s)) * 100;
  return { pct: p, dir: s > 0 ? '高估' : '低估' };
});

const domainBias = computed(() => stats.value.bias.find((b) => b.domainId === sample.value?.domain_id) || null);
const overdueTip = computed(() => (sample.value?.outcome?.overdue ? '逾期录入，权重 0.3，不计入核心曲线' : ''));

async function onContra() {
  await toggleContra(sample.value.id);
  toast(sample.value.contra_flag ? '已标记为反例' : '已取消反例标记');
}

async function onRemove() {
  const hasChain = !!sample.value.prediction;
  const ok = await ask({
    title: hasChain ? '作废这个样本？' : '删除这个样本？',
    body: hasChain
      ? '已封存的预测不能删（删了哈希链就断了）。作废后它不再出现在列表和统计里，存证保留。'
      : '这个样本还没提交过预测，可以直接删掉。',
    okText: hasChain ? '作废' : '删除',
    danger: true,
  });
  if (!ok) return;
  const res = await removeSample(sample.value.id);
  toast(res.mode === 'deleted' ? '已删除' : '已作废');
  router.replace('/library');
}

function goBack() {
  if (window.history.length > 1) router.back();
  else router.replace('/');
}
</script>

<template>
  <div class="shell">
    <div class="detail-head">
      <button class="back-btn" @click="goBack" aria-label="返回">
        <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 5l-7 7 7 7" />
        </svg>
      </button>
      <div style="flex: 1; min-width: 0;">
        <div class="eyebrow">{{ sample?.domain?.name || '未分类' }} · {{ typeLabel }}</div>
      </div>
      <button class="back-btn" @click="onRemove" aria-label="更多">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
          <path d="M6 12h.01M12 12h.01M18 12h.01" />
        </svg>
      </button>
    </div>

    <div v-if="!sample" class="card empty">
      <h4>样本不存在</h4>
      <p>可能被删掉了。</p>
      <router-link to="/library" class="btn ghost" style="max-width: 200px; margin: 0 auto;">回样本库</router-link>
    </div>

    <template v-else>
      <h1 class="detail-title">{{ sample.title }}</h1>
      <div class="row-meta" style="margin: 8px 0 14px; flex-wrap: wrap;">
        <span class="tag" :class="sample.status === 'revealed' ? 'ok' : sample.status === 'pending_reveal' ? 'accent' : 'muted'">
          {{ sample.status === 'draft' ? '待预测' : sample.status === 'locked' ? '已锁定' : sample.status === 'pending_reveal' ? '待揭晓' : '已揭晓' }}
        </span>
        <span>{{ sample.noise_level === 'high' ? '高噪声' : sample.noise_level === 'low' ? '低噪声' : '中噪声' }}</span>
        <span v-if="sample.reveal_deadline">·</span>
        <span v-if="sample.reveal_deadline">{{ fmtDate(sample.reveal_deadline, true) }} 揭晓</span>
        <span v-if="sample.contra_flag" class="tag warn">反例</span>
      </div>

      <!-- 内容 -->
      <div class="card">
        <div class="eyebrow" style="margin-bottom: 8px;">材料</div>
        <div class="content-body">{{ sample.content || '（没写内容）' }}</div>
      </div>

      <!-- ============ 待预测表单 ============ -->
      <template v-if="status === 'draft'">
        <div class="card" style="margin-top: 12px;">
          <div class="eyebrow" style="margin-bottom: 12px;">① 先下注</div>
          <TypeInput
            :type="type" :options="options" :unit="unit"
            :model-value="form.value" @update:model-value="(v) => (form.value = v)" />

          <div style="margin-top: 16px;">
            <div class="eyebrow" style="margin-bottom: 8px;">② 你有几分把握</div>
            <ConfidencePicker v-model="form.confidence" />
          </div>

          <div class="field" style="margin-top: 16px; margin-bottom: 0;">
            <label>③ 为什么这么猜（必填）</label>
            <textarea v-model="form.reasoning" class="textarea" placeholder="一句话说清你的判断依据。事后对账时，这里是最值钱的东西。"></textarea>
            <div class="hint">提交后整张卡封存，改不了。写完再点。</div>
          </div>
        </div>

        <button class="btn primary" style="margin-top: 14px;" :disabled="!canSubmit" @click="submitPrediction">
          封存预测
        </button>
        <p class="tiny muted center" style="margin-top: 10px;">封存 = 写进哈希链，只剩只读</p>
      </template>

      <!-- ============ 已锁定：预测只读展示 ============ -->
      <template v-else>
        <div class="card" style="margin-top: 12px;">
          <div class="sect-head" style="margin-bottom: 10px;">
            <span class="eyebrow">已封存的预测</span>
            <span class="tag muted">只读</span>
          </div>
          <div class="pred-box">
            <div class="pred-val">{{ predictedText }}</div>
            <div class="pred-conf">把握 <b class="num">{{ pct(sample.prediction?.confidence) }}</b></div>
          </div>
          <div class="tiny muted" style="margin-top: 14px; font-weight: 650; letter-spacing: .02em;">理由</div>
          <p class="small" style="margin: 4px 0 10px; line-height: 1.6; color: var(--ink-2);">{{ sample.prediction?.reasoning }}</p>
          <div class="kv">
            <span class="k">封存时间</span>
            <span class="v num">{{ fmtDate(sample.prediction?.created_at, true) }}</span>
          </div>
          <div class="kv">
            <span class="k">链序号</span>
            <span class="v num">#{{ sample.prediction?.seq }}</span>
          </div>
          <div style="margin-top: 10px;">
            <div class="tiny muted" style="margin-bottom: 4px;">SHA-256</div>
            <div class="hash-line">{{ sample.prediction?.hash }}</div>
          </div>
        </div>
      </template>

      <!-- ============ 揭晓录入 ============ -->
      <template v-if="status === 'pending_reveal' || (status === 'locked' && !sample.outcome)">
        <div v-if="!revealOpen && status === 'locked'" class="card" style="margin-top: 12px;">
          <div class="sect-head" style="margin-bottom: 8px;">
            <span class="eyebrow">还没到揭晓时间</span>
          </div>
          <p class="small muted" style="margin: 0 0 12px;">
            还有 {{ Math.max(0, daysUntil(sample.reveal_deadline) ?? 0) }} 天。已经知道结果了？也可以现在录。
          </p>
          <button class="btn ghost" @click="revealOpen = true">提前揭晓</button>
        </div>

        <div v-if="revealOpen || status === 'pending_reveal'" class="card" style="margin-top: 12px;">
          <div class="sect-head" style="margin-bottom: 12px;">
            <span class="eyebrow">录入真实结果</span>
            <span v-if="daysUntil(sample.reveal_deadline) < 0" class="tag bad">已逾期</span>
          </div>
          <TypeInput
            :type="type" :options="options" :unit="unit"
            :model-value="revealForm.value" @update:model-value="(v) => (revealForm.value = v)" />
          <div class="field" style="margin: 14px 0 0;">
            <label>证据备注（选填）</label>
            <input v-model="revealForm.note" class="input" placeholder="截图、链接、谁说的…" />
          </div>
        </div>

        <button
          v-if="revealOpen || status === 'pending_reveal'"
          class="btn" style="margin-top: 14px;" :disabled="!actualFilled" @click="submitReveal">
          确认结果，开始对账
        </button>
      </template>

      <!-- ============ 已揭晓 ============ -->
      <template v-if="status === 'revealed' && score">
        <div class="result-banner" :class="score.hit ? 'hit' : 'miss'" style="margin-top: 14px;">
          <div class="big">{{ score.hit ? '这次对了' : '这次偏了' }}</div>
          <div class="sub">
            Brier <b class="num">{{ fmtNum(score.brier, 3) }}</b>
            <template v-if="relText"> · {{ relText.dir }} {{ relText.pct.toFixed(0) }}%</template>
          </div>
        </div>

        <div class="card" style="margin-top: 12px;">
          <div class="kv"><span class="k">你的预测</span><span class="v">{{ predictedText }}</span></div>
          <div class="kv"><span class="k">真实结果</span><span class="v">{{ actualText }}</span></div>
          <div class="kv"><span class="k">你的把握</span><span class="v num">{{ pct(sample.prediction?.confidence) }}</span></div>
          <div class="kv">
            <span class="k">Brier 分数</span>
            <span class="v num">{{ fmtNum(score.brier, 4) }}</span>
          </div>
          <div v-if="relText" class="kv">
            <span class="k">对数误差</span>
            <span class="v num">{{ fmtNum(sample.score.rel_err, 3) }}</span>
          </div>
          <div v-if="overdueTip" class="kv">
            <span class="k">权重</span>
            <span class="v" style="color: var(--warn);">0.3 · 逾期</span>
          </div>
          <div v-if="sample.outcome?.evidence_note" class="kv">
            <span class="k">证据</span><span class="v">{{ sample.outcome.evidence_note }}</span>
          </div>
          <div class="kv">
            <span class="k">录入时间</span>
            <span class="v num">{{ fmtDate(sample.outcome?.recorded_at, true) }}</span>
          </div>
        </div>

        <div v-if="domainBias" class="card" style="margin-top: 12px;">
          <div class="eyebrow">这个领域上的你</div>
          <p style="margin: 8px 0 0; font-size: 14.5px; line-height: 1.55;">
            {{ domainBias.name }}：{{ domainBias.text }}（{{ domainBias.n }} 条，平均 Brier {{ fmtNum(domainBias.brierMean, 3) }}）
          </p>
        </div>

        <button class="btn ghost" style="margin-top: 12px;" :class="{ 'on': sample.contra_flag }" @click="onContra">
          {{ sample.contra_flag ? '★ 已标记为反例' : '☆ 标记为「打破了直觉」' }}
        </button>

        <div v-if="revealOpen" class="card" style="margin-top: 12px;">
          <div class="eyebrow" style="margin-bottom: 10px;">修正结果（会留痕）</div>
          <TypeInput
            :type="type" :options="options" :unit="unit"
            :model-value="revealForm.value" @update:model-value="(v) => (revealForm.value = v)" />
          <button class="btn sm" style="margin-top: 10px; width: 100%;" :disabled="!actualFilled" @click="submitReveal">保存修正</button>
        </div>
        <button v-else class="link-btn" @click="revealOpen = true">结果录错了？修正一下</button>
      </template>

      <div style="height: 24px;"></div>
    </template>

    <!-- 封存动画 -->
    <transition name="fade">
      <div v-if="lockInfo" class="lock-flash">
        <div class="inner">
          <div class="seal">🔒</div>
          <div class="t1">已封存</div>
          <div class="t2 mono" style="margin-top: 8px;">{{ lockInfo.hash.slice(0, 32) }}…</div>
          <div class="t2">要改？只能改自己了</div>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.detail-title { font-size: 23px; line-height: 1.3; letter-spacing: -0.02em; }
.pred-box {
  background: var(--accent-soft); border-radius: 13px; padding: 16px; text-align: center;
}
.pred-val { font-size: 30px; font-weight: 750; letter-spacing: -0.03em; color: var(--accent); line-height: 1.1; }
.pred-conf { font-size: 12px; color: var(--accent); opacity: .85; margin-top: 5px; }
.link-btn {
  display: block; margin: 14px auto 0; background: none; border: 0; padding: 0; cursor: pointer;
  color: var(--muted); font-size: 12px; text-decoration: underline; text-underline-offset: 3px;
}
.btn.ghost.on { border-color: var(--warn); color: var(--warn); background: var(--warn-soft); }
</style>
