<script setup>
import { ref, reactive, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { state, createSample } from '../store.js';
import TopBar from '../components/TopBar.vue';
import { TYPES } from '../scoring.js';
import { toast, localInputToISO, isoToLocalInput } from '../ui.js';

const route = useRoute();
const router = useRouter();

const form = reactive({
  domain_id: '',
  title: '',
  content: '',
  prediction_type: 'binary',
  reveal_deadline: '',
  noise_level: 'mid',
});

function applyDomain(id) {
  const d = state.domains.find((x) => x.id === id);
  if (!d) return;
  form.domain_id = d.id;
  form.prediction_type = d.prediction_type;
  form.noise_level = d.noise_default || 'mid';
  form.reveal_deadline = isoToLocalInput(new Date(Date.now() + (d.deadline_days || 7) * 86400000).toISOString());
}

// 初始化
const qDomain = route.query.domain;
applyDomain(qDomain || state.domains[0]?.id);
if (route.query.title) form.title = String(route.query.title);

const domain = computed(() => state.domains.find((d) => d.id === form.domain_id));
const options = computed(() => domain.value?.form_config?.options || []);

const canSave = computed(() => form.title.trim().length > 0 && form.domain_id);

async function save() {
  if (!canSave.value) return toast('标题总得写一个');
  try {
    const s = await createSample({
      domain_id: form.domain_id,
      title: form.title.trim(),
      content: form.content.trim(),
      prediction_type: form.prediction_type,
      reveal_deadline: localInputToISO(form.reveal_deadline),
      noise_level: form.noise_level,
      form_config: {
        tolerance: domain.value?.form_config?.tolerance,
        options: domain.value?.form_config?.options,
        unit: domain.value?.form_config?.unit,
      },
    });
    toast('建好了，去下注');
    router.replace(`/s/${s.id}`);
  } catch (e) {
    toast('保存失败：' + (e?.message || e));
    console.error(e);
  }
}

const noiseOpts = [
  { k: 'low', label: '低噪声', hint: '规则清楚' },
  { k: 'mid', label: '中噪声', hint: '看运气' },
  { k: 'high', label: '高噪声', hint: '基本随机' },
];
</script>

<template>
  <div class="shell">
    <TopBar title="新建样本" sub="先写材料，再下注" />
    <button class="back-btn" style="margin-bottom: 14px;" @click="router.back()">
      <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
    </button>

    <div class="card">
      <div class="field">
        <label>领域</label>
        <select class="select" :value="form.domain_id" @change="applyDomain($event.target.value)">
          <option v-for="d in state.domains" :key="d.id" :value="d.id">{{ d.icon }} {{ d.name }}</option>
        </select>
        <div class="hint" v-if="domain?.form_config?.hint">{{ domain.form_config.hint }}</div>
      </div>

      <div class="field">
        <label>标题</label>
        <input v-model="form.title" class="input" placeholder="一句话说清要猜什么" maxlength="60" />
      </div>

      <div class="field">
        <label>材料 / 背景</label>
        <textarea v-model="form.content" class="textarea" placeholder="看的东西贴这儿：视频标题、简历要点、任务范围…（留空也行）"></textarea>
      </div>

      <div class="field">
        <label>揭晓时限</label>
        <input v-model="form.reveal_deadline" type="datetime-local" class="input" />
        <div class="hint">到这个时间点你应该已经能查到答案。超时录入会被降权。</div>
      </div>

      <div class="field" style="margin-bottom: 0;">
        <label>预测类型</label>
        <select v-model="form.prediction_type" class="select">
          <option v-for="t in Object.values(TYPES)" :key="t.key" :value="t.key">{{ t.label }} — {{ t.valueLabel }}</option>
        </select>
      </div>
    </div>

    <div class="card" style="margin-top: 12px;">
      <div class="eyebrow" style="margin-bottom: 10px;">噪声等级</div>
      <div class="three">
        <button
          v-for="n in noiseOpts" :key="n.k" class="choice two" :class="{ on: form.noise_level === n.k }"
          style="flex-direction: column; gap: 2px; padding: 12px 4px; font-size: 13px;"
          @click="form.noise_level = n.k">
          <span>{{ n.label }}</span>
          <span class="tiny" style="font-weight: 500; opacity: .7;">{{ n.hint }}</span>
        </button>
      </div>
      <div class="hint" style="margin-top: 10px;">噪声高的领域，直觉本来就难准，偏差报告会分开看。</div>
    </div>

    <button class="btn primary" style="margin-top: 16px;" :disabled="!canSave" @click="save">建好，去下注</button>
    <router-link to="/new-domain" class="btn ghost" style="margin-top: 10px;">没有合适的领域？新建一个</router-link>
    <div style="height: 20px;"></div>
  </div>
</template>

<style scoped>
.three { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
</style>
