<script setup>
import { ref, reactive, computed } from 'vue';
import { useRouter } from 'vue-router';
import { createDomain } from '../store.js';
import TopBar from '../components/TopBar.vue';
import { TYPES } from '../scoring.js';
import { toast } from '../ui.js';

const router = useRouter();

const form = reactive({
  name: '',
  prediction_type: 'binary',
  optionsText: 'A, B, C',
  tolerance: 20,
  unit: '天',
  noise_default: 'mid',
  deadline_days: 7,
});

const isMulti = computed(() => form.prediction_type === 'multi');
const isNum = computed(() => ['numeric', 'time'].includes(form.prediction_type));

const options = computed(() =>
  form.optionsText.split(/[,，\n]/).map((s) => s.trim()).filter(Boolean),
);
const canSave = computed(() => {
  if (!form.name.trim()) return false;
  if (isMulti.value && options.value.length < 2) return false;
  return true;
});

async function save() {
  if (!canSave.value) return toast(isMulti.value ? '多选至少要两个选项' : '填个名字');
  try {
    await createDomain({
      name: form.name.trim(),
      prediction_type: form.prediction_type,
      noise_default: form.noise_default,
      deadline_days: Number(form.deadline_days) || 7,
      icon: '◈',
      form_config: {
        ...(isMulti.value ? { options: options.value } : {}),
        ...(isNum.value ? { tolerance: Number(form.tolerance) / 100, unit: form.unit } : {}),
      },
    });
    toast('领域建好了');
    router.replace('/library');
  } catch (e) {
    toast('保存失败：' + (e?.message || e));
    console.error(e);
  }
}

const noiseOpts = [
  { k: 'low', label: '低' },
  { k: 'mid', label: '中' },
  { k: 'high', label: '高' },
];
</script>

<template>
  <div class="shell">
    <TopBar title="新建领域" sub="一张可配置的预测卡" />
    <button class="back-btn" style="margin-bottom: 14px;" @click="router.back()">
      <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
    </button>

    <div class="card">
      <div class="field">
        <label>领域名称</label>
        <input v-model="form.name" class="input" placeholder="比如：客户报价能不能成" maxlength="20" />
      </div>

      <div class="field">
        <label>预测类型</label>
        <select v-model="form.prediction_type" class="select">
          <option v-for="t in Object.values(TYPES)" :key="t.key" :value="t.key">{{ t.label }}</option>
        </select>
      </div>

      <div v-if="isMulti" class="field">
        <label>选项</label>
        <input v-model="form.optionsText" class="input" placeholder="用逗号分开：上行, 横盘, 下行" />
        <div class="hint">当前 {{ options.length }} 个：{{ options.join(' / ') }}</div>
      </div>

      <div v-if="isNum" class="field">
        <label>命中容差</label>
        <div style="display: flex; align-items: center; gap: 8px;">
          <input v-model.number="form.tolerance" type="number" class="input" style="flex: 1;" min="1" max="300" />
          <span class="muted">%</span>
        </div>
        <div class="hint">实际值落在「预测 ±{{ form.tolerance }}%」内算命中。猜点赞这种量级，±30% 比较现实。</div>
      </div>

      <div v-if="form.prediction_type === 'time'" class="field">
        <label>单位</label>
        <input v-model="form.unit" class="input" placeholder="天 / 小时" />
      </div>

      <div class="field" style="margin-bottom: 0;">
        <label>默认揭晓时限</label>
        <div style="display: flex; align-items: center; gap: 8px;">
          <input v-model.number="form.deadline_days" type="number" class="input" style="flex: 1;" min="1" />
          <span class="muted">天后</span>
        </div>
      </div>
    </div>

    <div class="card" style="margin-top: 12px;">
      <div class="eyebrow" style="margin-bottom: 10px;">默认噪声等级</div>
      <div class="three">
        <button
          v-for="n in noiseOpts" :key="n.k" class="choice two" :class="{ on: form.noise_default === n.k }"
          style="padding: 12px 0; font-size: 14px;" @click="form.noise_default = n.k">{{ n.label }}</button>
      </div>
    </div>

    <button class="btn primary" style="margin-top: 16px;" :disabled="!canSave" @click="save">保存领域</button>
    <div style="height: 20px;"></div>
  </div>
</template>

<style scoped>
.three { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
</style>
