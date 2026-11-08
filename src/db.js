// 本地持久层：Dexie / IndexedDB + 哈希链写入
import Dexie from 'dexie';
import { GENESIS, computeHash } from './hash.js';
import { BUILTIN_DOMAINS } from './domains.js';

export const db = new Dexie('universal-trainer');

db.version(1).stores({
  domains: 'id, name, builtin',
  samples: 'id, domain_id, status, prediction_type, created_at, reveal_deadline',
  predictions: 'id, &sample_id, seq, created_at', // &sample_id 唯一 → 一个样本只能有一条预测
  outcomes: 'id, sample_id, revision, seq, recorded_at',
  scores: 'id, &sample_id, computed_at',
  meta: 'key',
});

// ---- 链锁：所有写链操作串行，避免并发拿到同一个 seq ----
let queue = Promise.resolve();
function locked(fn) {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

async function chainHead() {
  const [ps, os] = await Promise.all([db.predictions.toArray(), db.outcomes.toArray()]);
  const all = [...ps, ...os].sort((a, b) => (a.seq || 0) - (b.seq || 0));
  const last = all[all.length - 1];
  return last ? { seq: last.seq, hash: last.hash } : { seq: 0, hash: GENESIS };
}

export const uid = () =>
  crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);

// IndexedDB 无法结构化克隆 Vue 的响应式 Proxy，写库前一律转成纯对象
export const plain = (v) => JSON.parse(JSON.stringify(v ?? null));

/** 追加预测（只读记录，写完无法再写第二条） */
export function appendPrediction(input) {
  return locked(async () => {
    const head = await chainHead();
    const rec = {
      id: uid(),
      kind: 'prediction',
      seq: head.seq + 1,
      prev_hash: head.hash,
      sample_id: input.sample_id,
      predicted_value: input.predicted_value,
      confidence: input.confidence,
      reasoning: input.reasoning,
      options: input.options ?? null,
      tolerance: input.tolerance ?? null,
      created_at: new Date().toISOString(),
    };
    rec.hash = await computeHash(rec);
    const stored = plain(rec);
    await db.transaction('rw', db.predictions, db.samples, async () => {
      await db.predictions.add(stored); // 唯一约束：同一 sample 第二次写入会直接抛错
      await db.samples.update(rec.sample_id, { status: 'locked' });
    });
    return stored;
  });
}

/** 追加结果（修订留痕：修改结果会新增一条 revision+1，旧记录保留） */
export function appendOutcome(input) {
  return locked(async () => {
    const head = await chainHead();
    const prev = await db.outcomes.where('sample_id').equals(input.sample_id).toArray();
    const revision = prev.reduce((m, r) => Math.max(m, r.revision || 1), 0) + 1;
    const rec = {
      id: uid(),
      kind: 'outcome',
      seq: head.seq + 1,
      prev_hash: head.hash,
      sample_id: input.sample_id,
      actual_value: input.actual_value,
      evidence_note: input.evidence_note ?? '',
      recorded_at: new Date().toISOString(),
      overdue: !!input.overdue,
      revision,
    };
    rec.hash = await computeHash(rec);
    const stored = plain(rec);
    await db.transaction('rw', db.outcomes, db.samples, async () => {
      await db.outcomes.add(stored);
      await db.samples.update(rec.sample_id, { status: 'revealed' });
    });
    return stored;
  });
}

export async function saveScore(score) {
  await db.scores.put(plain(score));
}

export async function ensureSeed() {
  const count = await db.domains.count();
  if (count === 0) {
    await db.domains.bulkAdd(BUILTIN_DOMAINS.map((d) => ({ ...d, created_at: new Date().toISOString() })));
  }
}

export async function getSettings() {
  const row = await db.meta.get('settings');
  return row?.value || { includeOverdue: false, remind: true };
}

export async function setSettings(patch) {
  const cur = await getSettings();
  const next = { ...cur, ...patch };
  await db.meta.put({ key: 'settings', value: next });
  return next;
}

export async function exportAll() {
  const [domains, samples, predictions, outcomes, scores, meta] = await Promise.all([
    db.domains.toArray(), db.samples.toArray(), db.predictions.toArray(),
    db.outcomes.toArray(), db.scores.toArray(), db.meta.toArray(),
  ]);
  return {
    app: 'universal-trainer', version: 1,
    exported_at: new Date().toISOString(),
    domains, samples, predictions, outcomes, scores, meta,
  };
}

export async function importAll(dump) {
  if (!dump || dump.app !== 'universal-trainer') throw new Error('不是本应用导出的数据文件');
  await db.transaction('rw', db.domains, db.samples, db.predictions, db.outcomes, db.scores, db.meta, async () => {
    await Promise.all([
      db.domains.clear(), db.samples.clear(), db.predictions.clear(),
      db.outcomes.clear(), db.scores.clear(), db.meta.clear(),
    ]);
    await db.domains.bulkAdd(dump.domains || []);
    await db.samples.bulkAdd(dump.samples || []);
    await db.predictions.bulkAdd(dump.predictions || []);
    await db.outcomes.bulkAdd(dump.outcomes || []);
    await db.scores.bulkAdd(dump.scores || []);
    await db.meta.bulkAdd(dump.meta || []);
  });
}

export async function wipeAll() {
  await db.transaction('rw', db.domains, db.samples, db.predictions, db.outcomes, db.scores, db.meta, async () => {
    await Promise.all([
      db.domains.clear(), db.samples.clear(), db.predictions.clear(),
      db.outcomes.clear(), db.scores.clear(), db.meta.clear(),
    ]);
  });
  await ensureSeed();
}
