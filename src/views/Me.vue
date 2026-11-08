<script setup>
import { ref, computed } from 'vue';
import { state, removeSample, updateSettings, loadAll } from '../store.js';
import { exportAll, importAll, wipeAll } from '../db.js';
import { verifyChain } from '../hash.js';
import TopBar from '../components/TopBar.vue';
import { toast, ask, fmtDate } from '../ui.js';
import { injectDemoData } from '../demo.js';

const chainResult = ref(null);
const checking = ref(false);
const busy = ref(false);
const fileInput = ref(null);

const demoCount = computed(() => state.samples.filter((s) => s.demo && !s.voided).length);

async function checkChain() {
  checking.value = true;
  chainResult.value = null;
  try {
    const all = [...state.predictions, ...state.outcomes];
    const res = await verifyChain(all);
    chainResult.value = res;
    if (res.ok) toast('链完整，没有被改过');
  } catch (e) {
    toast('校验失败：' + e.message);
  } finally {
    checking.value = false;
  }
}

async function doExport() {
  busy.value = true;
  try {
    const dump = await exportAll();
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `训练器数据-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast(`已导出 ${dump.samples.length} 个样本`);
  } catch (e) {
    toast('导出失败：' + e.message);
  } finally {
    busy.value = false;
  }
}

function pickFile() {
  fileInput.value?.click();
}

async function onFile(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const ok = await ask({
    title: '导入会覆盖当前全部数据',
    body: `把「${file.name}」里的数据恢复进来？现在这台设备上的记录会被替换（建议先导出一份备份）。`,
    okText: '覆盖导入',
    danger: true,
  });
  e.target.value = '';
  if (!ok) return;
  try {
    const text = await file.text();
    const dump = JSON.parse(text);
    await importAll(dump);
    await loadAll();
    toast(`已导入 ${dump.samples?.length || 0} 个样本`);
    chainResult.value = null;
  } catch (err) {
    toast('导入失败：' + err.message);
  }
}

async function loadDemo() {
  const ok = await ask({
    title: '载入 20 条演示数据？',
    body: '会写入 20 个人造的「简历录取」样本（含预测和结果），用来验证校准曲线。看完可以在下面一键作废。',
    okText: '载入',
  });
  if (!ok) return;
  busy.value = true;
  try {
    const { count } = await injectDemoData();
    toast(`已载入 ${count} 条演示数据`);
  } catch (e) {
    toast('载入失败：' + e.message);
  } finally {
    busy.value = false;
  }
}

async function clearDemo() {
  const demos = state.samples.filter((s) => s.demo && !s.voided);
  if (!demos.length) return toast('没有演示数据');
  const ok = await ask({
    title: `作废 ${demos.length} 条演示样本？`,
    body: '作废后不再计入统计和列表，但哈希链记录保留（删记录会让链断裂）。',
    okText: '作废',
    danger: true,
  });
  if (!ok) return;
  for (const s of demos) await removeSample(s.id);
  toast('已作废');
}

async function doWipe() {
  const ok = await ask({
    title: '清空所有数据？',
    body: '样本、预测、结果、哈希链全部删除，无法恢复。先导出一份备份比较保险。',
    okText: '全部清空',
    danger: true,
  });
  if (!ok) return;
  await wipeAll();
  await loadAll();
  chainResult.value = null;
  toast('已清空');
}

async function toggleOverdue() {
  await updateSettings({ includeOverdue: !state.settings.includeOverdue });
}

async function toggleRemind() {
  if (!('Notification' in window)) return toast('这个浏览器不支持通知');
  if (state.settings.remind) {
    await updateSettings({ remind: false });
    return toast('已关闭到点提醒');
  }
  const perm = await Notification.requestPermission();
  if (perm === 'granted') {
    await updateSettings({ remind: true });
    toast('已开启：添加到主屏后，打开应用时会提醒');
  } else {
    toast('通知权限没给，提醒只能在应用内显示');
  }
}

const storageInfo = ref('');
(async () => {
  try {
    if (navigator.storage?.estimate) {
      const { usage, quota } = await navigator.storage.estimate();
      storageInfo.value = `本地已用 ${(usage / 1024 / 1024).toFixed(1)} MB`;
    }
  } catch {}
})();
</script>

<template>
  <div class="shell">
    <TopBar title="我的" :sub="`本地存储 · 数据不出设备`" />

    <!-- 存证 -->
    <div class="card">
      <div class="eyebrow">防伪存证</div>
      <p class="small muted" style="margin: 8px 0 12px; line-height: 1.55;">
        每条预测和结果都用 SHA-256 串成哈希链，改任何一个字都会断链。点下面自检。
      </p>
      <button class="btn ghost" :disabled="checking" @click="checkChain">
        {{ checking ? '正在逐条校验…' : '验证链完整性' }}
      </button>
      <div v-if="chainResult" class="chain-result" :class="chainResult.ok ? 'ok' : 'bad'">
        <template v-if="chainResult.ok">
          <b>链完整</b> · 共 {{ chainResult.total }} 条记录（{{ state.predictions.length }} 预测 + {{ state.outcomes.length }} 结果）
          <div class="mono" style="margin-top: 6px; opacity: .7;">head {{ (chainResult.head || '').slice(0, 24) }}…</div>
        </template>
        <template v-else>
          <b>断链！</b> 第 {{ chainResult.brokenAt }} 条：{{ chainResult.reason }}
        </template>
      </div>
      <div class="tiny muted" style="margin-top: 10px; line-height: 1.55;">
        诚实说明：这套存证挡得住「事后手动改数据糊弄自己」，挡不住把整库删掉重算。对手本来就是自己的自欺。
      </div>
    </div>

    <!-- 数据 -->
    <div class="card tight" style="margin-top: 12px;">
      <div class="row-item" style="cursor: pointer;" @click="doExport">
        <div class="row-top">
          <span class="row-title">导出全部数据</span>
          <span class="tag muted">JSON</span>
        </div>
        <div class="row-meta">备份到「文件」App，换手机/换浏览器时用</div>
      </div>
      <div class="row-item" style="cursor: pointer;" @click="pickFile">
        <div class="row-top"><span class="row-title">从文件导入</span></div>
        <div class="row-meta">会覆盖当前设备的数据</div>
      </div>
      <input ref="fileInput" type="file" accept="application/json,.json" style="display: none;" @change="onFile" />
      <div class="row-item" style="cursor: default;">
        <div class="row-top"><span class="row-title">本地占用</span><span class="tag">{{ storageInfo || '—' }}</span></div>
        <div class="row-meta">{{ state.samples.length }} 个样本 · {{ state.predictions.length }} 条预测</div>
      </div>
    </div>

    <!-- 设置 -->
    <div class="card tight" style="margin-top: 12px;">
      <div class="row-item" style="cursor: pointer;" @click="toggleOverdue">
        <div class="row-top">
          <span class="row-title">校准曲线包含逾期样本</span>
          <span class="tag" :class="state.settings.includeOverdue ? 'accent' : 'muted'">{{ state.settings.includeOverdue ? '开' : '关' }}</span>
        </div>
        <div class="row-meta">关 = 逾期录入的样本降权到 0.3 且不进核心曲线</div>
      </div>
      <div class="row-item" style="cursor: pointer;" @click="toggleRemind">
        <div class="row-top">
          <span class="row-title">到点提醒</span>
          <span class="tag" :class="state.settings.remind ? 'accent' : 'muted'">{{ state.settings.remind ? '开' : '关' }}</span>
        </div>
        <div class="row-meta">打开应用时提醒该揭晓的样本（PWA 没有后台推送）</div>
      </div>
    </div>

    <!-- 演示数据 -->
    <div class="card" style="margin-top: 12px;">
      <div class="eyebrow">演示数据</div>
      <p class="small muted" style="margin: 8px 0 12px; line-height: 1.55;">
        20 条人造样本，命中率已知（整体 70%，平均把握 75%）。用来验证曲线对不对、看看仪表盘长什么样。
      </p>
      <div class="btn-row">
        <button class="btn ghost sm" style="flex: 1;" :disabled="busy" @click="loadDemo">载入 20 条</button>
        <button class="btn ghost sm" style="flex: 1;" :disabled="!demoCount" @click="clearDemo">作废演示数据</button>
      </div>
      <div v-if="demoCount" class="tiny muted" style="margin-top: 8px;">当前有 {{ demoCount }} 条演示样本在库</div>
    </div>

    <!-- 危险区 -->
    <div class="card" style="margin-top: 12px;">
      <div class="eyebrow">危险区</div>
      <p class="small muted" style="margin: 8px 0 12px;">清空后无法恢复，先导出备份。</p>
      <button class="btn danger" @click="doWipe">清空所有数据</button>
    </div>

    <!-- 关于 -->
    <div class="card" style="margin-top: 12px;">
      <div class="eyebrow">安装到手机</div>
      <p class="small muted" style="margin: 8px 0 0; line-height: 1.6;">
        iPhone 必须用 <b>Safari</b> 打开 → 点底部「分享」→「添加到主屏幕」。<br />
        别用 Via／微信／Chrome 打开后添加，iOS 只允许 Safari 装成独立 App，否则数据容易被清、离线也打不开。
      </p>
    </div>

    <p class="tiny muted center" style="margin: 20px 0 10px; line-height: 1.7;">
      通用训练器 v1.0 · 数据只在这台设备上<br />
      提交即封存，改不了答案，只改得了自己
    </p>
    <div style="height: 12px;"></div>
  </div>
</template>

<style scoped>
.chain-result {
  margin-top: 12px; padding: 11px 13px; border-radius: 11px; font-size: 12.5px; line-height: 1.5;
}
.chain-result.ok { background: var(--ok-soft); color: var(--ok); }
.chain-result.bad { background: var(--bad-soft); color: var(--bad); }
</style>
