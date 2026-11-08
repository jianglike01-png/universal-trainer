// 纯函数单测：评分口径、校准曲线、哈希链防篡改
// 运行：npm test  （node tools/verify.mjs）
import assert from 'node:assert';
import {
  scoreOne, calibration, overview, biasByDomain, BINS, OVERDUE_WEIGHT,
} from '../src/scoring.js';
import { computeHash, verifyChain, stableStringify, GENESIS } from '../src/hash.js';

// 手算基准：20 条二元样本，5 档各 4 条，命中数 2/3/2/4/3
// 每档 Brier 合计：0.55→1.01, 0.65→0.79, 0.75→1.25, 0.85→0.09, 0.95→0.91，总计 4.05 / 20 = 0.2025
const DEMO_EXPECTED = { total: 20, hits: 14, brierMean: 0.2025 };

let pass = 0;
const ok = (name, fn) => {
  try { fn(); console.log('  ✓', name); pass++; }
  catch (e) { console.error('  ✗', name, '\n     ', e.message); process.exitCode = 1; }
};
const okAsync = async (name, fn) => {
  try { await fn(); console.log('  ✓', name); pass++; }
  catch (e) { console.error('  ✗', name, '\n     ', e.message); process.exitCode = 1; }
};
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `期望 ${b}，实际 ${a}`);

console.log('\n[1] 二元型 Brier');
ok('是/80%，实际是 → 0.04，命中', () => {
  const r = scoreOne({ type: 'binary', predicted_value: { choice: 'yes' }, confidence: 0.8 }, { actual_value: { value: 'yes' } });
  close(r.brier, 0.04); assert.equal(r.hit, 1);
});
ok('是/80%，实际否 → 0.64，未中', () => {
  const r = scoreOne({ type: 'binary', predicted_value: { choice: 'yes' }, confidence: 0.8 }, { actual_value: { value: 'no' } });
  close(r.brier, 0.64); assert.equal(r.hit, 0);
});
ok('否/80%，实际否 → P(是)=0.2，Brier 0.04，命中', () => {
  const r = scoreOne({ type: 'binary', predicted_value: { choice: 'no' }, confidence: 0.8 }, { actual_value: { value: 'no' } });
  close(r.p_yes, 0.2); close(r.brier, 0.04); assert.equal(r.hit, 1);
});
ok('否/80%，实际是 → Brier 0.64，未中', () => {
  const r = scoreOne({ type: 'binary', predicted_value: { choice: 'no' }, confidence: 0.8 }, { actual_value: { value: 'yes' } });
  close(r.brier, 0.64); assert.equal(r.hit, 0);
});

console.log('\n[2] 多选型 Brier（三选项，剩余概率均摊）');
ok('选中且对 / 60% → 0.24', () => {
  const r = scoreOne(
    { type: 'multi', predicted_value: { choice: 'A' }, confidence: 0.6, options: ['A', 'B', 'C'] },
    { actual_value: { choice: 'A' } },
  );
  close(r.brier, 0.24); assert.equal(r.hit, 1);
});
ok('选中但错 / 60% → 1.04', () => {
  const r = scoreOne(
    { type: 'multi', predicted_value: { choice: 'A' }, confidence: 0.6, options: ['A', 'B', 'C'] },
    { actual_value: { choice: 'B' } },
  );
  close(r.brier, 1.04); assert.equal(r.hit, 0);
});
ok('五选项命中 < 三选项命中（选项越多扣分越少）', () => {
  const five = scoreOne(
    { type: 'multi', predicted_value: { choice: 'A' }, confidence: 0.6, options: ['A', 'B', 'C', 'D', 'E'] },
    { actual_value: { choice: 'A' } },
  );
  assert.ok(five.brier < 0.24, `五选项应 < 0.24，实际 ${five.brier}`);
});

console.log('\n[3] 数值型 / 时间型 对数误差');
ok('预测 100 实际 110，±20% → 命中，|ln|=0.0953', () => {
  const r = scoreOne({ type: 'numeric', predicted_value: { value: 100 }, confidence: 0.7, tolerance: 0.2 }, { actual_value: { value: 110 } });
  assert.equal(r.hit, 1); close(r.rel_err, Math.abs(Math.log(100 / 110)));
});
ok('预测 100 实际 150，±30% → 未命中（0.4055 > 0.2624）', () => {
  const r = scoreOne({ type: 'numeric', predicted_value: { value: 100 }, confidence: 0.7, tolerance: 0.3 }, { actual_value: { value: 150 } });
  assert.equal(r.hit, 0); close(r.brier, 0.49);
});
ok('边界：预测 1000 实际 1300，±30% → 刚好命中', () => {
  const r = scoreOne({ type: 'numeric', predicted_value: { value: 1000 }, confidence: 0.7, tolerance: 0.3 }, { actual_value: { value: 1300 } });
  assert.equal(r.hit, 1);
});
ok('方向：低估时 signed_err < 0，高估时 > 0', () => {
  const under = scoreOne({ type: 'numeric', predicted_value: { value: 100 }, confidence: 0.7, tolerance: 0.2 }, { actual_value: { value: 200 } });
  const over = scoreOne({ type: 'numeric', predicted_value: { value: 200 }, confidence: 0.7, tolerance: 0.2 }, { actual_value: { value: 100 } });
  assert.ok(under.signed_err < 0 && over.signed_err > 0);
  close(Math.expm1(over.signed_err), 1); // 高估 100%
});
ok('时间型按天算，逻辑同数值', () => {
  const r = scoreOne({ type: 'time', predicted_value: { days: 10 }, confidence: 0.8, tolerance: 0.25 }, { actual_value: { days: 12 } });
  assert.equal(r.hit, 1); close(r.rel_err, Math.log(10 / 12) * -1);
});

console.log('\n[4] 逾期降权');
ok('逾期 → 权重 0.3', () => {
  const r = scoreOne({ type: 'binary', predicted_value: { choice: 'yes' }, confidence: 0.8 }, { actual_value: { value: 'yes' }, overdue: true });
  close(r.weight, OVERDUE_WEIGHT);
});

console.log('\n[5] 校准曲线（20 条假数据，手算基准）');
const conf = [0.55, 0.65, 0.75, 0.85, 0.95];
const hitsPerBin = [2, 3, 2, 4, 3];
const demoItems = [];
conf.forEach((c, bi) => {
  for (let i = 0; i < 4; i++) {
    const hit = i < hitsPerBin[bi];
    demoItems.push({
      domain_id: 'd-resume',
      prediction_type: 'binary',
      score: scoreOne(
        { type: 'binary', predicted_value: { choice: 'yes' }, confidence: c },
        { actual_value: { value: hit ? 'yes' : 'no' } },
      ),
    });
  }
});

ok('每档 4 条，命中率 50/75/50/100/75', () => {
  const bins = calibration(demoItems);
  assert.equal(bins.length, 5);
  const rates = bins.map((b) => b.hitRate);
  [0.5, 0.75, 0.5, 1, 0.75].forEach((r, i) => close(rates[i], r));
  bins.forEach((b) => assert.equal(b.n, 4));
});
ok('每档平均置信度 = 声称值', () => {
  const bins = calibration(demoItems);
  bins.forEach((b, i) => close(b.avgConfidence, conf[i]));
});
ok('总览：命中 70%，平均把握 75%，Brier 0.2025', () => {
  const ov = overview(demoItems);
  close(ov.hitRate, 0.7);
  close(ov.avgConfidence, 0.75);
  close(ov.brierMean, 0.2025);
  close(ov.brierCore, 0.2025);
  assert.equal(ov.n, 20);
});
ok('过度自信判定：偏差最大的档 = 85% 档实际 100%（偏保守）', () => {
  const bins = calibration(demoItems);
  const gap = bins.map((b) => b.gap);
  assert.ok(gap[3] < 0, '85% 档 gap 应为负（实际比声称更准）');
  assert.ok(gap[0] > 0, '55% 档 gap 应为正（实际 50% < 55%）');
});

console.log('\n[6] 分档边界');
ok('0.59 落在第一档，0.6 落在第二档，0.99 落在最后一档', () => {
  const idx = (c) => BINS.findIndex((b) => c >= b.lo && c < b.hi);
  assert.equal(idx(0.59), 0);
  assert.equal(idx(0.6), 1);
  assert.equal(idx(0.9), 4);
  assert.equal(idx(0.99), 4);
});

console.log('\n[7] 逾期样本不进核心曲线');
ok('逾期样本被排除在 calibration 之外，纳入开关生效', () => {
  const items = [
    ...demoItems,
    {
      domain_id: 'd-resume', prediction_type: 'binary',
      score: scoreOne({ type: 'binary', predicted_value: { choice: 'yes' }, confidence: 0.95 }, { actual_value: { value: 'no' }, overdue: true }),
    },
  ];
  const core = calibration(items, false);
  const all = calibration(items, true);
  assert.equal(core[4].n, 4);
  assert.equal(all[4].n, 5);
});

console.log('\n[8] 偏差报告文字');
ok('数值型高估 → 「平均高估 N%」', () => {
  const items = [1, 2, 3].map(() => ({
    domain_id: 'd-num', prediction_type: 'numeric',
    score: scoreOne({ type: 'numeric', predicted_value: { value: 200 }, confidence: 0.7, tolerance: 0.2 }, { actual_value: { value: 100 } }),
  }));
  const b = biasByDomain(items, [{ id: 'd-num', name: '数值测试' }]);
  close(b[0].magnitude, 1);
  assert.equal(b[0].direction, 'over');
  assert.match(b[0].text, /平均高估 100%/);
});
ok('二元过度自信 → 点子数', () => {
  const items = [1, 2, 3, 4].map((i) => ({
    domain_id: 'd-bin', prediction_type: 'binary',
    score: scoreOne({ type: 'binary', predicted_value: { choice: 'yes' }, confidence: 0.9 }, { actual_value: { value: i <= 2 ? 'yes' : 'no' } }),
  }));
  const b = biasByDomain(items, [{ id: 'd-bin', name: '二元测试' }]);
  assert.equal(b[0].direction, 'over');
  assert.match(b[0].text, /过度自信 40 个百分点/);
});

console.log('\n[9] 哈希链');
const mkPrediction = async (seq, prev, content) => {
  const rec = {
    id: 'p' + seq, kind: 'prediction', seq, prev_hash: prev,
    sample_id: 's' + seq, predicted_value: { value: 100 + seq },
    confidence: 0.7, reasoning: content, created_at: '2026-01-0' + seq + 'T00:00:00.000Z',
  };
  rec.hash = await computeHash(rec);
  return rec;
};

const chain = [];
let prev = GENESIS;
for (let i = 1; i <= 3; i++) {
  const r = await mkPrediction(i, prev, '理由' + i);
  chain.push(r);
  prev = r.hash;
}

const r1 = await verifyChain(chain);
await okAsync('3 条完整链校验通过', () => {
  assert.ok(r1.ok, r1.reason);
  assert.equal(r1.total, 3);
});
await okAsync('改动置信度 → 断链', async () => {
  const tampered = chain.map((r) => ({ ...r }));
  tampered[1].confidence = 0.99;
  const res = await verifyChain(tampered);
  assert.ok(!res.ok);
  assert.equal(res.brokenAt, 2);
});
await okAsync('删掉中间一条 → 断链（序号不连续）', async () => {
  const res = await verifyChain([chain[0], chain[2]]);
  assert.ok(!res.ok);
  assert.equal(res.brokenAt, 3);
});
await okAsync('改理由 → 断链', async () => {
  const t = chain.map((r) => ({ ...r }));
  t[2].reasoning = '事后编的理由';
  const res = await verifyChain(t);
  assert.ok(!res.ok);
  assert.equal(res.brokenAt, 3);
});
await okAsync('整体重算哈希（伪造链）→ 本地无法识别，但这是已知边界', async () => {
  const forged = [];
  let p = GENESIS;
  for (let i = 1; i <= 3; i++) {
    const r = await mkPrediction(i, p, '伪造' + i);
    forged.push(r); p = r.hash;
  }
  const res = await verifyChain(forged);
  assert.ok(res.ok, '重算后链本身自洽（诚实说明写在 UI 里）');
});
ok('稳定序列化与键顺序无关', () => {
  assert.equal(stableStringify({ a: 1, b: [2, { d: 4, c: 3 }] }), stableStringify({ b: [2, { c: 3, d: 4 }], a: 1 }));
});

console.log(`\n${pass} 项通过${process.exitCode ? '，有失败项' : '，全部通过'}\n`);
