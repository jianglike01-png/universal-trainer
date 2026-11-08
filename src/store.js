// 全局状态：内存镜像 + 派生统计（数据量小，全量加载最简单也最稳）
import { reactive, computed } from 'vue';
import * as D from './db.js';
import {
  scoreOne, overview as calcOverview, calibration as calcCalibration,
  biasByDomain as calcBias, trend as calcTrend, confidenceVerdict, detectSuspicious,
  OVERDUE_WEIGHT, SUSPICIOUS_WEIGHT,
} from './scoring.js';

export const state = reactive({
  domains: [],
  samples: [],
  predictions: [],
  outcomes: [],
  scores: [],
  settings: { includeOverdue: false, remind: true },
  ready: false,
  busy: false,
});

export const STATUS = {
  draft: { key: 'draft', label: '待预测', tone: 'warn' },
  locked: { key: 'locked', label: '已锁定', tone: 'muted' },
  pending_reveal: { key: 'pending_reveal', label: '待揭晓', tone: 'accent' },
  revealed: { key: 'revealed', label: '已揭晓', tone: 'ok' },
};

export function latestOutcomeBySample() {
  const map = new Map();
  for (const o of state.outcomes) {
    const cur = map.get(o.sample_id);
    if (!cur || (o.revision || 1) > (cur.revision || 1)) map.set(o.sample_id, o);
  }
  return map;
}

const predictionBySample = computed(() => new Map(state.predictions.map((p) => [p.sample_id, p])));

/** 把 locked 且已过揭晓时限的样本推进到 pending_reveal */
async function advanceDueSamples() {
  const now = Date.now();
  const due = state.samples.filter(
    (s) => s.status === 'locked' && s.reveal_deadline && new Date(s.reveal_deadline).getTime() <= now,
  );
  for (const s of due) {
    s.status = 'pending_reveal';
    await D.db.samples.update(s.id, { status: 'pending_reveal' });
  }
  return due.length;
}

function scoreFor(sample, prediction, outcome) {
  if (!prediction || !outcome) return null;
  const raw = scoreOne(
    {
      type: sample.prediction_type,
      predicted_value: prediction.predicted_value,
      confidence: prediction.confidence,
      tolerance: prediction.tolerance ?? sample.form_config?.tolerance,
      options: prediction.options ?? sample.form_config?.options,
    },
    { actual_value: outcome.actual_value, overdue: outcome.overdue },
  );
  return {
    id: 'sc-' + sample.id,
    sample_id: sample.id,
    prediction_id: prediction.id,
    outcome_id: outcome.id,
    score_type: raw.type,
    score_value: raw.brier,
    detail: raw,
    computed_at: new Date().toISOString(),
  };
}

/** 派生条目：样本 + 领域 + 预测 + 结果 + 评分 */
export const items = computed(() => {
  const outMap = latestOutcomeBySample();
  const pmap = predictionBySample.value;
  const list = state.samples.filter((s) => !s.voided).map((s) => {
    const prediction = pmap.get(s.id) || null;
    const outcome = outMap.get(s.id) || null;
    const score = scoreFor(s, prediction, outcome);
    return {
      ...s,
      domain: state.domains.find((d) => d.id === s.domain_id) || null,
      prediction,
      outcome,
      score: score ? score.detail : null,
      scoreRow: score,
    };
  });
  // 可疑样本降权（防线 5）
  const flagged = detectSuspicious(list);
  for (const it of list) {
    if (it.score && flagged.has(it.sample_id)) {
      it.suspicious = true;
      it.score = { ...it.score, weight: it.score.weight * SUSPICIOUS_WEIGHT };
    }
  }
  return list;
});

export const scoredItems = computed(() => items.value.filter((it) => it.score && it.outcome));

export const stats = computed(() => {
  const all = items.value;
  const revealed = all.filter((s) => s.status === 'revealed');
  return {
    total: all.length,
    draft: all.filter((s) => s.status === 'draft').length,
    locked: all.filter((s) => s.status === 'locked').length,
    pendingReveal: all.filter((s) => s.status === 'pending_reveal').length,
    revealed: revealed.length,
    contra: all.filter((s) => s.contra_flag).length,
    suspicious: all.filter((s) => s.suspicious).length,
    overview: calcOverview(revealed),
    calibration: calcCalibration(revealed, state.settings.includeOverdue),
    calibrationAll: calcCalibration(revealed, true),
    bias: calcBias(revealed, state.domains),
    trend: calcTrend(revealed, 30),
    verdict: confidenceVerdict(revealed),
  };
});

export const queue = computed(() =>
  items.value
    .filter((s) => s.status === 'draft' || s.status === 'pending_reveal')
    .sort((a, b) => {
      const rank = (s) => (s.status === 'pending_reveal' ? 0 : 1);
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      return new Date(a.reveal_deadline || 0) - new Date(b.reveal_deadline || 0);
    }),
);

export async function loadAll() {
  await D.ensureSeed();
  const [domains, samples, predictions, outcomes, scores] = await Promise.all([
    D.db.domains.toArray(),
    D.db.samples.toArray(),
    D.db.predictions.toArray(),
    D.db.outcomes.toArray(),
    D.db.scores.toArray(),
  ]);
  state.domains = domains;
  state.samples = samples;
  state.predictions = predictions;
  state.outcomes = outcomes;
  state.scores = scores;
  state.settings = await D.getSettings();
  await advanceDueSamples();
  await persistMissingScores();
  state.ready = true;
}

/** 评分结果入库（文档要求的 Score 表），公式改动后自动覆盖 */
async function persistMissingScores() {
  const outMap = latestOutcomeBySample();
  const pmap = predictionBySample.value;
  for (const s of state.samples) {
    const p = pmap.get(s.id);
    const o = outMap.get(s.id);
    if (!p || !o) continue;
    const sc = scoreFor(s, p, o);
    const exist = state.scores.find((x) => x.sample_id === s.id);
    if (!exist || Math.abs((exist.score_value || 0) - sc.score_value) > 1e-12) {
      await D.saveScore(sc);
      if (exist) Object.assign(exist, sc);
      else state.scores.push(sc);
    }
  }
}

export function domainOf(id) {
  return state.domains.find((d) => d.id === id) || null;
}

export function itemOf(id) {
  return items.value.find((s) => s.id === id) || null;
}

/* ---------------- 写操作 ---------------- */

export async function createDomain(domain) {
  const rec = D.plain({
    id: D.uid(),
    created_at: new Date().toISOString(),
    builtin: 0,
    ...domain,
  });
  await D.db.domains.add(rec);
  state.domains.push(rec);
  return rec;
}

export async function createSample(sample) {
  const rec = D.plain({
    id: D.uid(),
    created_at: new Date().toISOString(),
    status: 'draft',
    contra_flag: 0,
    voided: 0,
    ...sample,
  });
  await D.db.samples.add(rec);
  state.samples.push(rec);
  return rec;
}

export async function lockPrediction(sampleId, { predicted_value, confidence, reasoning }) {
  const sample = state.samples.find((s) => s.id === sampleId);
  if (!sample) throw new Error('样本不存在');
  if (sample.status !== 'draft') throw new Error('该样本已锁定，不能再次预测');
  const rec = await D.appendPrediction({
    sample_id: sampleId,
    predicted_value,
    confidence,
    reasoning,
    options: sample.form_config?.options ?? null,
    tolerance: sample.form_config?.tolerance ?? null,
  });
  state.predictions.push(rec);
  sample.status = 'locked';
  return rec;
}

export async function revealSample(sampleId, { actual_value, evidence_note }) {
  const sample = state.samples.find((s) => s.id === sampleId);
  if (!sample) throw new Error('样本不存在');
  const overdue = sample.reveal_deadline ? Date.now() > new Date(sample.reveal_deadline).getTime() : false;
  const weighted = overdue ? OVERDUE_WEIGHT : 1;
  const rec = await D.appendOutcome({ sample_id: sampleId, actual_value, evidence_note, overdue });
  state.outcomes.push(rec);
  sample.status = 'revealed';
  const p = predictionBySample.value.get(sampleId);
  const sc = scoreFor(sample, p, rec);
  if (sc) {
    await D.saveScore(sc);
    const exist = state.scores.find((x) => x.sample_id === sampleId);
    if (exist) Object.assign(exist, sc);
    else state.scores.push(sc);
  }
  return { outcome: rec, score: sc?.detail, weighted };
}

export async function toggleContra(sampleId) {
  const s = state.samples.find((x) => x.id === sampleId);
  if (!s) return;
  s.contra_flag = s.contra_flag ? 0 : 1;
  await D.db.samples.update(sampleId, { contra_flag: s.contra_flag });
}

/** 未锁定样本可彻底删除；已锁定/已揭晓只允许作废（保留哈希链） */
export async function removeSample(sampleId) {
  const s = state.samples.find((x) => x.id === sampleId);
  if (!s) return { mode: 'none' };
  const hasChain = state.predictions.some((p) => p.sample_id === sampleId) ||
    state.outcomes.some((o) => o.sample_id === sampleId);
  if (!hasChain) {
    await D.db.samples.delete(sampleId);
    state.samples = state.samples.filter((x) => x.id !== sampleId);
    return { mode: 'deleted' };
  }
  s.voided = 1;
  await D.db.samples.update(sampleId, { voided: 1 });
  return { mode: 'voided' };
}

export async function updateSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  await D.setSettings(patch);
}
