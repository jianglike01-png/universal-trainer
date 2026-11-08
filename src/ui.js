// 轻量交互原语：toast / 确认弹窗 / 时间格式
import { reactive, ref } from 'vue';

export const toastMsg = ref('');
let toastTimer = null;
export function toast(msg, ms = 1900) {
  toastMsg.value = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastMsg.value = ''), ms);
}

export const dialog = reactive({
  open: false,
  title: '',
  body: '',
  okText: '确认',
  cancelText: '取消',
  danger: false,
  _resolve: null,
});

export function ask({ title, body = '', okText = '确认', cancelText = '取消', danger = false }) {
  return new Promise((resolve) => {
    Object.assign(dialog, { open: true, title, body, okText, cancelText, danger, _resolve: resolve });
  });
}

export function resolveDialog(ok) {
  dialog.open = false;
  const r = dialog._resolve;
  dialog._resolve = null;
  if (r) r(ok);
}

/* ---------- 时间 ---------- */
export function fmtDate(iso, withTime = false) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  const p = (n) => String(n).padStart(2, '0');
  const base = `${d.getMonth() + 1}月${d.getDate()}日`;
  return withTime ? `${base} ${p(d.getHours())}:${p(d.getMinutes())}` : base;
}

export function daysUntil(iso) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.ceil(ms / 86400000);
}

export function relTime(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} 天前`;
  return fmtDate(iso);
}

export function localInputToISO(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d) ? null : d.toISOString();
}

export function isoToLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function pct(x, digits = 0) {
  if (x === null || x === undefined || !isFinite(x)) return '—';
  return (x * 100).toFixed(digits) + '%';
}

export function fmtNum(x, digits = 2) {
  if (x === null || x === undefined || !isFinite(x)) return '—';
  return Number(x).toFixed(digits);
}
