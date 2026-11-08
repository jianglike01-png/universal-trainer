// 演示数据：20 条二元样本，命中率已知，用于验收「校准曲线与手算一致」
// 设计：5 个置信档 × 4 条，命中数 [2,3,2,4,3] → 整体 70% 命中、平均把握 75%
import { createSample, lockPrediction, revealSample, state } from './store.js';

export const DEMO_PATTERN = [
  { confidence: 0.55, hits: 2 },
  { confidence: 0.65, hits: 3 },
  { confidence: 0.75, hits: 2 },
  { confidence: 0.85, hits: 4 },
  { confidence: 0.95, hits: 3 },
];

// 手算基准（验收标准 3 用）
export const DEMO_EXPECTED = {
  total: 20,
  hits: 14,
  hitRate: 0.7,
  avgConfidence: 0.75,
  brierMean: (() => {
    let s = 0, n = 0;
    for (const { confidence, hits } of DEMO_PATTERN) {
      const miss = 4 - hits;
      s += hits * (confidence - 1) ** 2 + miss * confidence ** 2;
      n += 4;
    }
    return s / n;
  })(),
  bins: DEMO_PATTERN.map(({ confidence, hits }) => ({ confidence, hits, n: 4, hitRate: hits / 4 })),
};

export async function injectDemoData() {
  const domain = state.domains.find((d) => d.prediction_type === 'binary') || state.domains[0];
  let idx = 0;
  const created = [];
  for (const { confidence, hits } of DEMO_PATTERN) {
    for (let i = 0; i < 4; i++) {
      idx += 1;
      const isHit = i < hits;
      const deadline = new Date(Date.now() + 3 * 86400000).toISOString();
      const sample = await createSample({
        domain_id: domain.id,
        title: `演示样本 #${idx}`,
        content: `置信度 ${Math.round(confidence * 100)}% 的一组里第 ${i + 1} 条；这条${isHit ? '命中' : '未命中'}。用来校验校准曲线。`,
        prediction_type: 'binary',
        reveal_deadline: deadline,
        noise_level: 'mid',
        demo: 1,
        form_config: domain.form_config,
      });
      await lockPrediction(sample.id, {
        predicted_value: { choice: 'yes' },
        confidence,
        reasoning: '演示数据：固定理由，用于校验曲线。',
      });
      await revealSample(sample.id, {
        actual_value: { value: isHit ? 'yes' : 'no' },
        evidence_note: '演示数据',
      });
      created.push(sample.id);
    }
  }
  return { count: created.length, expected: DEMO_EXPECTED };
}
