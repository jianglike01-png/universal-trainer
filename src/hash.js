// 哈希链核心：SHA-256 + 稳定序列化
// 纯 ESM，浏览器（Web Crypto）与 Node 22（globalThis.crypto）通用，便于单测。

const encoder = new TextEncoder();

export async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', encoder.encode(str));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// 稳定序列化：键排序，保证同样内容永远得到同样字符串
export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
}

// 一条记录参与哈希的字段（顺序无关，由 stableStringify 保证）
export const HASHED_FIELDS = {
  prediction: ['id', 'kind', 'seq', 'sample_id', 'prev_hash', 'predicted_value', 'confidence', 'reasoning', 'created_at'],
  outcome: ['id', 'kind', 'seq', 'sample_id', 'prev_hash', 'actual_value', 'evidence_note', 'recorded_at', 'overdue'],
};

export function payloadOf(record) {
  const fields = HASHED_FIELDS[record.kind] || [];
  const out = {};
  for (const f of fields) out[f] = record[f] ?? null;
  return out;
}

// hash = SHA256( prev_hash | seq | 稳定序列化的记录体 )
export async function computeHash(record) {
  const body = stableStringify(payloadOf(record));
  return sha256Hex(`${record.prev_hash || ''}|${record.seq}|${body}`);
}

export const GENESIS = '0'.repeat(64);

// 校验整条链：返回 { ok, total, brokenAt, reason }
export async function verifyChain(records) {
  const sorted = [...records].sort((a, b) => (a.seq || 0) - (b.seq || 0));
  let prev = GENESIS;
  let expectSeq = 1;
  for (const rec of sorted) {
    if (rec.seq !== expectSeq) {
      return { ok: false, total: sorted.length, brokenAt: rec.seq, reason: `序号不连续（期望 ${expectSeq}，实际 ${rec.seq}）` };
    }
    if (rec.prev_hash !== prev) {
      return { ok: false, total: sorted.length, brokenAt: rec.seq, reason: '上一条哈希对不上（疑似记录被删除或改动）' };
    }
    const h = await computeHash(rec);
    if (h !== rec.hash) {
      return { ok: false, total: sorted.length, brokenAt: rec.seq, reason: '内容与自身哈希不符（记录被改写）', recordId: rec.id };
    }
    prev = rec.hash;
    expectSeq += 1;
  }
  return { ok: true, total: sorted.length, head: prev };
}
