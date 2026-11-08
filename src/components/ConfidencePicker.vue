<script setup>
import { computed } from 'vue';

const props = defineProps({
  modelValue: { type: Number, default: 0.7 },
  label: { type: String, default: '置信度' },
});
const emit = defineEmits(['update:modelValue']);

const pctVal = computed(() => Math.round(props.modelValue * 100));
const fill = computed(() => `${((props.modelValue - 0.5) / 0.49) * 100}%`);

const WORD = [
  [0.5, 0.6, '基本瞎猜'],
  [0.6, 0.7, '略有感觉'],
  [0.7, 0.8, '比较有把握'],
  [0.8, 0.9, '很有把握'],
  [0.9, 1.01, '几乎是确定'],
];
const word = computed(() => (WORD.find(([lo, hi]) => props.modelValue >= lo && props.modelValue < hi) || WORD[0])[2]);

const presets = [55, 65, 75, 85, 95];
function setPct(v) {
  emit('update:modelValue', Math.min(0.99, Math.max(0.5, v / 100)));
}
function onRange(e) {
  setPct(Number(e.target.value));
}
</script>

<template>
  <div class="conf-panel">
    <div class="conf-head">
      <div>
        <div class="eyebrow">{{ label }}</div>
        <div class="conf-word" style="margin-top: 4px;">{{ word }} · 十次里大约对 {{ Math.round(pctVal / 10) }} 次</div>
      </div>
      <div class="conf-val num">{{ pctVal }}<span style="font-size: 16px; font-weight: 600;">%</span></div>
    </div>
    <input
      type="range" min="50" max="99" step="1" :value="pctVal"
      :style="{ '--fill': fill }" @input="onRange" aria-label="置信度" />
    <div class="conf-presets">
      <button v-for="p in presets" :key="p" :class="{ on: pctVal === p }" @click="setPct(p)">{{ p }}%</button>
    </div>
  </div>
</template>
