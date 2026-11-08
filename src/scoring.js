// 评分与统计核心 —— 纯函数，无副作用，方便单测和「手算对账」。
//
// 记分口径（务必与 README 一致）：
//  二元     Brier = (P(是) - 实际0/1)²，P(是) 由「选择 × 置信度」推出
//  多选     多分类 Brier：忠实概率分给选项，剩余 (1-c) 在其余选项上均摊
//  数值     log 误差 = |ln(预测/实际)|；命中判定 = 落在 ±tolerance 区间内
//  时间     同数值（单位：天）
//  统一口径：每条预测都产出一个 Brier 分（用于校准曲线），数值/时间额外产出相对误差（用于偏差报告）

export const TYPES = {
  numeric: { key: 'numeric', label: '数值型', valueLabel: '预测数值', errLabel: '对数相对误差' },
  binary: { key: 'binary', label: '二元型', valueLabel: '是 / 否', errLabel: 'Brier 分数' },
  multi: { key: 'multi', label: '多选型', valueLabel: '选项', errLabel: '多分类 Brier' },
  time: { key: 'time', label: '时间型', valueLabel: '预计天数', errLabel: '对数相对误差' },
};

export const NOISE_LABEL = { high: '高噪声', mid: '中噪声', low: '低噪声' };

// 逾期录入的降权系数（文档 3.3 / 验收 4）
export const OVERDUE_WEIGHT = 0.3;
// 可疑样本降权（文档 防线5）
export const SUSPICIOUS_WEIGHT = 0.5;

const EPS = 1e-12;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function logRatio(pred, actual) {
  const p = Number(pred);
  const a = Number(actual);
  if (!isFinite(p) || !isFinite(a)) return null;
  if (p > 0 && a > 0) return Math.log(p / a);
  // 兜底：加一平滑，避免 0 / 负数导致 ln 无定义
  return Math.log((Math.abs(p) + 1) / (Math.abs(a) + 1));
}

/**
 * 单条预测评分
 * @param {object} p  { type, predicted_value, confidence, tolerance }
 * @param {object} o  { actual_value, overdue }
 */
export function scoreOne(p, o) {
  const type = p.type;
  const c = clamp(Number(p.confidence), 0.5, 0.99);
  const weight = o?.overdue ? OVERDUE_WEIGHT : 1;

  if (type === 'binary') {
    const choice = p.predicted_value?.choice;
    const actual = o?.actual_value?.value;
    const pYes = choice === 'yes' ? c : 1 - c;
    const actual01 = actual === 'yes' ? 1 : 0;
    const brier = (pYes - actual01) ** 2;
    const hit = (pYes >= 0.5 ? 1 : 0) === actual01 ? 1 : 0;
    return {
      type, brier, hit, rel_err: null,
      signed_err: null, // 二元用「过度自信」而非符号误差
      overconfidence: c - (hit ? 1 : 0),
      p_yes: pYes,
      weight,
      claimed: c,
    };
  }

  if (type === 'multi') {
    const choice = p.predicted_value?.choice;
    const actual = o?.actual_value?.choice;
    const options = (p.options || p.predicted_value?.options || []).map((x) => (typeof x === 'string' ? x : x.value));
    const k = Math.max(2, options.length);
    const spread = (1 - c) / (k - 1);
    const hit = choice === actual ? 1 : 0;
    let brier;
    if (hit) {
      brier = (c - 1) ** 2 + (k - 1) * spread ** 2;
    } else {
      brier = c ** 2 + (k - 2) * spread ** 2 + (spread - 1) ** 2;
    }
    return {
      type, brier, hit, rel_err: null, signed_err: null,
      overconfidence: c - hit, weight, claimed: c,
    };
  }

  // numeric / time
  const predV = type === 'time' ? p.predicted_value?.days : p.predicted_value?.value;
  const actV = type === 'time' ? o?.actual_value?.days : o?.actual_value?.value;
  const tol = Number.isFinite(Number(p.tolerance)) ? Number(p.tolerance) : 0.2;
  const lr = logRatio(predV, actV);
  const rel = lr === null ? null : Math.abs(lr);
  const band = Math.log(1 + Math.max(0, tol));
  const hit = rel === null ? 0 : rel <= band + EPS ? 1 : 0;
  const brier = (c - hit) ** 2;
  return {
    type, brier, hit, rel_err: rel, signed_err: lr,
    overconfidence: c - hit,
    weight, claimed: c, tolerance: tol,
  };
}

/** 从置信度分档：50-59 / 60-69 / 70-79 / 80-89 / 90-99 */
export const BINS = [
  { lo: 0.5, hi: 0.6, label: '50–59%', center: 0.55 },
  { lo: 0.6, hi: 0.7, label: '60–69%', center: 0.65 },
  { lo: 0.7, hi: 0.8, label: '70–79%', center: 0.75 },
  { lo: 0.8, hi: 0.9, label: '80–89%', center: 0.85 },
  { lo: 0.9, hi: 0.9900001, label: '90–99%', center: 0.95 },
];

/**
 * 校准曲线
 * @param items 已评分条目 [{ score, ... }]
 * @param includeOverdue 是否纳入逾期样本（默认 false = 只算核心样本）
 */
export function calibration(items, includeOverdue = false) {
  const core = items.filter((it) => includeOverdue || it.score.weight === 1);
  return BINS.map((b) => {
    const inBin = core.filter((it) => it.score.claimed >= b.lo && it.score.claimed < b.hi);
    const n = inBin.length;
    const hits = inBin.reduce((s, it) => s + it.score.hit, 0);
    const confSum = inBin.reduce((s, it) => s + it.score.claimed, 0);
    return {
      ...b,
      n,
      hits,
      avgConfidence: n ? confSum / n : b.center,
      hitRate: n ? hits / n : null,
      gap: n ? confSum / n - hits / n : null, // >0 过度自信
    };
  });
}

/** 总览指标 */
export function overview(items) {
  const scored = items.filter((it) => it.score);
  const n = scored.length;
  if (!n) {
    return { n: 0, brierMean: null, brierCore: null, hitRate: null, avgConfidence: null, overdueCount: 0 };
  }
  const wSum = scored.reduce((s, it) => s + it.score.weight, 0);
  const brierMean = scored.reduce((s, it) => s + it.score.brier * it.score.weight, 0) / (wSum || 1);
  const coreList = scored.filter((it) => it.score.weight === 1);
  const coreW = coreList.length;
  const brierCore = coreW ? coreList.reduce((s, it) => s + it.score.brier, 0) / coreW : null;
  const hitRate = coreW ? coreList.reduce((s, it) => s + it.score.hit, 0) / coreW : null;
  const avgConfidence = coreW ? coreList.reduce((s, it) => s + it.score.claimed, 0) / coreW : null;
  return {
    n,
    brierMean,
    brierCore,
    hitRate,
    avgConfidence,
    overdueCount: scored.filter((it) => it.score.weight !== 1).length,
    coreCount: coreW,
  };
}

/** 分领域偏差：给出可读结论 */
export function biasByDomain(items, domains) {
  const groups = new Map();
  for (const it of items) {
    if (!it.score) continue;
    const key = it.domain_id || 'unknown';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it);
  }
  const out = [];
  for (const [domainId, list] of groups) {
    const domain = domains.find((d) => d.id === domainId);
    const core = list.filter((it) => it.score.weight === 1);
    const use = core.length ? core : list;
    const type = use[0].prediction_type || use[0].type || use[0].score?.type;
    const brierMean = use.reduce((s, it) => s + it.score.brier, 0) / use.length;
    let text = '';
    let direction = 'flat';
    let magnitude = 0;

    if (type === 'numeric' || type === 'time') {
      const signed = use.map((it) => it.score.signed_err).filter((x) => x !== null && isFinite(x));
      if (signed.length) {
        const mean = signed.reduce((a, b) => a + b, 0) / signed.length;
        magnitude = Math.abs(Math.expm1(mean));
        direction = mean > 0 ? 'over' : 'under';
        const pct = Math.round(magnitude * 100);
        text = direction === 'over' ? `平均高估 ${pct}%` : `平均低估 ${pct}%`;
      }
    } else {
      const meanConf = use.reduce((s, it) => s + it.score.claimed, 0) / use.length;
      const rate = use.reduce((s, it) => s + it.score.hit, 0) / use.length;
      magnitude = Math.abs(meanConf - rate);
      direction = meanConf > rate ? 'over' : meanConf < rate ? 'under' : 'flat';
      const gap = Math.round(magnitude * 100);
      text = direction === 'over' ? `过度自信 ${gap} 个百分点` : direction === 'under' ? `偏保守 ${gap} 个百分点` : '校准良好';
    }

    out.push({
      domainId,
      name: domain?.name || '未分类',
      type,
      n: use.length,
      brierMean,
      text,
      direction,
      magnitude,
    });
  }
  return out.sort((a, b) => b.n - a.n);
}

/** 最近 N 天趋势（按天聚合平均 Brier） */
export function trend(items, days = 30, now = new Date()) {
  const buckets = new Map();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));
  for (const it of items) {
    if (!it.score) continue;
    const t = new Date(it.outcome?.recorded_at || it.score.computed_at);
    if (isNaN(t) || t < start) continue;
    const key = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    if (!buckets.has(key)) buckets.set(key, { key, sum: 0, n: 0 });
    const b = buckets.get(key);
    b.sum += it.score.brier;
    b.n += 1;
  }
  return [...buckets.values()]
    .sort((a, b) => (a.key < b.key ? -1 : 1))
    .map((b) => ({ date: b.key, brier: b.sum / b.n, n: b.n }));
}

/** 置信度可靠性一句话结论 */
export function confidenceVerdict(items) {
  const core = items.filter((it) => it.score && it.score.weight === 1);
  const top = core.filter((it) => it.score.claimed >= 0.8);
  if (!top.length) return null;
  const hits = top.reduce((s, it) => s + it.score.hit, 0);
  const rate = hits / top.length;
  const claim = top.reduce((s, it) => s + it.score.claimed, 0) / top.length;
  return {
    n: top.length,
    hits,
    rate,
    claim,
    gap: claim - rate,
    text: `你说有 ${Math.round(claim * 100)}% 把握的 ${top.length} 件事，实际发生了 ${hits} 次（${Math.round(rate * 100)}%）`,
  };
}

/** 可疑样本标记：连续 ≥N 条高置信(≥0.9)且零误差 */
export function detectSuspicious(items, threshold = 6) {
  const seq = items
    .filter((it) => it.score && it.outcome)
    .sort((a, b) => new Date(a.outcome.recorded_at) - new Date(b.outcome.recorded_at));
  let run = 0;
  const flagged = new Set();
  for (const it of seq) {
    if (it.score.claimed >= 0.9 && it.score.hit === 1) {
      run += 1;
      if (run >= threshold) flagged.add(it.sample_id);
    } else {
      run = 0;
    }
  }
  return flagged;
}
