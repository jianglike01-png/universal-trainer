<script setup>
import { computed } from 'vue';

const props = defineProps({
  type: { type: String, required: true },
  options: { type: Array, default: () => [] },
  modelValue: { type: Object, default: () => ({}) },
  unit: { type: String, default: '' },
});
const emit = defineEmits(['update:modelValue']);

const val = computed(() => props.modelValue || {});
const letters = 'ABCDEFGH';

function pick(choice) {
  emit('update:modelValue', { ...val.value, choice });
}
function setNumber(key, raw) {
  const n = raw === '' ? null : Number(raw);
  emit('update:modelValue', { ...val.value, [key]: n === null || isNaN(n) ? null : n });
}
const numKey = computed(() => (props.type === 'time' ? 'days' : 'value'));
const numValue = computed(() => (val.value[numKey.value] ?? ''));
</script>

<template>
  <div>
    <!-- 二元 -->
    <div v-if="type === 'binary'" class="choice-grid two-col">
      <button class="choice two" :class="{ on: val.choice === 'yes' }" @click="pick('yes')">是</button>
      <button class="choice two" :class="{ on: val.choice === 'no' }" @click="pick('no')">否</button>
    </div>

    <!-- 多选 -->
    <div v-else-if="type === 'multi'" class="choice-grid">
      <button
        v-for="(o, i) in options" :key="o" class="choice" :class="{ on: val.choice === o }" @click="pick(o)">
        <span>{{ o }}</span><span class="k">{{ letters[i] }}</span>
      </button>
    </div>

    <!-- 数值 / 时间 -->
    <div v-else>
      <input
        class="input num-input" type="number" inputmode="decimal" step="any"
        :value="numValue" placeholder="填一个数"
        @input="setNumber(numKey, $event.target.value)" />
      <div class="hint" style="font-size: 11.5px; color: var(--muted); margin-top: 6px;">
        <template v-if="type === 'time'">单位：{{ unit || '天' }}（从今天开工起算）</template>
        <template v-else>直接填你猜的数字，单位随意但要前后一致</template>
      </div>
    </div>
  </div>
</template>
