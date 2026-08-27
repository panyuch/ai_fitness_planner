// lib/history.js
// 计划历史存储：手动保存的计划快照，localStorage 持久化，上限 20 条（FIFO 淘汰最旧）。
// 纯函数、与 React / DOM 解耦（localStorage 可注入），便于单测。
// UX Round ticket 01：add / list / get / remove / exportMarkdown + 旧 STORE_KEY 迁移。

export const HISTORY_KEY = "fitmeal:history";
export const OLD_STORE_KEY = "fitmeal:v1"; // v1 的单一计划结构 { form, locked, result }
export const MAX_ENTRIES = 20;

export const DISCLAIMER =
  "本计划为通用营养参考，不构成医疗 / 临床营养建议；特殊健康状况、孕期、慢病等请遵医嘱；备赛 / 脱水等高风险操作需专业监督。";

// ---------------------------------------------------------------------------
// 存储层：优先使用注入的 storage（测试），其次 window.localStorage（浏览器）。
// 两者皆无（SSR / 隐私模式）时返回 null，读写操作被 try/catch 静默兜底。
// ---------------------------------------------------------------------------
let storageOverride = null;

export function _setStorage(s) {
  storageOverride = s;
}

function store() {
  if (storageOverride) return storageOverride;
  if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  return null;
}

function readAll() {
  try {
    const raw = store().getItem(HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeAll(list) {
  try {
    store().setItem(HISTORY_KEY, JSON.stringify(list));
  } catch {
    /* 隐私模式 / 配额超限时静默降级：仅本次会话内存态 */
  }
  return list;
}

function makeId() {
  return `h_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function buildSummary(form, result) {
  const calc = (result && result.calc) || {};
  return {
    goal: calc.goal || (form && form.goal) || "maintain",
    timelineWeeks: (form && form.timelineWeeks) ?? 8,
    tdee: calc.tdee ?? 0,
    phaseKcal: calc.phaseKcal ?? 0,
    restKcal: calc.restKcal ?? 0,
  };
}

function makeEntry(form, result, locked) {
  const entry = {
    id: makeId(),
    savedAt: new Date().toISOString(),
    form: form || null,
    result: result || null,
    summary: buildSummary(form, result),
  };
  if (locked) entry.locked = locked;
  return entry;
}

// ---------------------------------------------------------------------------
// 迁移：检测旧 v1 单一计划结构 `fitmeal:v1`（形如 { form, locked, result }）。
//   历史为空且旧数据有效 → 迁移为历史首条（含 locked，保证旧数据不丢）并清理旧 key；
//   历史已有条目 / 旧结构无效   → 仅清理旧 key（不重复迁移、不留残留）。
// ---------------------------------------------------------------------------
export function ensureMigrated() {
  const cur = readAll();
  const s = store();
  if (!s) return { migrated: false, entry: null };
  const raw = s.getItem(OLD_STORE_KEY);
  if (!raw) return { migrated: false, entry: null };
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return { migrated: false, entry: null };
  }
  const hasPlan =
    data && typeof data === "object" && !Array.isArray(data) && (data.form || data.result);
  if (!hasPlan || cur.length > 0) {
    try {
      s.removeItem(OLD_STORE_KEY);
    } catch {
      /* ignore */
    }
    return { migrated: false, entry: null };
  }
  const entry = makeEntry(data.form || null, data.result || null, data.locked || null);
  writeAll([entry]);
  try {
    s.removeItem(OLD_STORE_KEY);
  } catch {
    /* ignore */
  }
  return { migrated: true, entry };
}

// ---------------------------------------------------------------------------
// 公开 API
// ---------------------------------------------------------------------------

// 写入一条新历史（最新在前）；超出 MAX_ENTRIES 时淘汰最旧（列表尾部）。
export function add(form, result) {
  ensureMigrated();
  const entry = makeEntry(form, result);
  const next = [entry, ...readAll()];
  writeAll(next.slice(0, MAX_ENTRIES));
  return entry;
}

export function list() {
  ensureMigrated();
  return readAll();
}

export function get(id) {
  ensureMigrated();
  return readAll().find((e) => e.id === id) || null;
}

export function remove(id) {
  ensureMigrated();
  const cur = readAll();
  const next = cur.filter((e) => e.id !== id);
  if (next.length === cur.length) return false;
  writeAll(next);
  return true;
}

// ---------------------------------------------------------------------------
// Markdown 导出：把一条历史（或 { form, result, savedAt }）渲染为完整 Markdown。
// 内容与结果页一致：计算依据 + 7 天计划 + 免责声明。
// ---------------------------------------------------------------------------
export const pct = (x) => `${Math.round(x * 100)}%`;
export const goalText = (g) => ({ cut: "减脂", bulk: "增肌", maintain: "维持" }[g] || g);

function fmtSavedAt(savedAt) {
  try {
    return new Date(savedAt).toLocaleString("zh-CN");
  } catch {
    return String(savedAt || "");
  }
}

export function exportMarkdown(entry) {
  if (!entry || !entry.result) return null;
  const form = entry.form || {};
  const { calc, plan } = entry.result;
  const L = [];
  L.push(`# FitMeal 周饮食计划`);
  L.push("");
  L.push(`> 生成时间：${fmtSavedAt(entry.savedAt)} · 本地计算 · 非商业 Demo`);
  L.push("");
  L.push(`## 一、计算依据`);
  L.push("");
  L.push(`- 性别/年龄/体重/身高：${form.sex === "female" ? "女" : "男"} / ${form.age ?? ""}岁 / ${form.weight ?? ""}kg / ${form.height ?? ""}cm`);
  L.push(`- BMR 方程：${calc.equation === "mifflin" ? "Mifflin-St Jeor（含身高）" : "Henry 2005"} → **${calc.bmr} kcal**`);
  L.push(`- PAL：${calc.pal}（钳制 [1.2,1.9]）`);
  L.push(`- TDEE：${calc.tdee} kcal`);
  L.push(`- 目标：${goalText(calc.goal)} · 周期 ${form.timelineWeeks ?? ""} 周 · 阶段调整 ${Math.round(calc.phaseAdjustPct * 100)}%`);
  L.push(`- 每日热量：训练日 **${calc.phaseKcal} kcal** / 休息日 **${calc.restKcal} kcal**`);
  L.push(`- 每日蛋白：${calc.proteinG} g（${calc.proteinPerKg} g/kg）`);
  L.push(`- 宏量占比：训练日 碳水 ${pct(calc.train.carbPct)} / 脂肪 ${pct(calc.train.fatPct)}；休息日 碳水 ${pct(calc.rest.carbPct)} / 脂肪 ${pct(calc.rest.fatPct)}`);
  if (calc.peakWeek) {
    L.push("");
    L.push(`- 备赛充碳周提示：`);
    calc.peakWeek.forEach((s) => L.push(`  - ${s}`));
  }
  L.push("");
  L.push(`## 二、7 天饮食计划`);
  L.push("");
  plan.days.forEach((day) => {
    L.push(`### ${day.label}（${day.isTrain ? "训练日" : "休息日"}）`);
    L.push("");
    L.push(`全天：${day.totals.kcal} kcal ｜ 蛋白 ${Math.round(day.totals.p)}g ｜ 碳水 ${Math.round(day.totals.c)}g ｜ 脂肪 ${Math.round(day.totals.f)}g`);
    L.push("");
    day.meals.forEach((m) => {
      const foods = m.items.map((it) => `${it.name} ${Math.round(it.grams)}g`).join(" + ");
      L.push(`- **${m.label}**：${foods}`);
      L.push(`  - 单餐 ${m.kcal} kcal ｜ 蛋白 ${Math.round(m.p)}g ｜ 碳水 ${Math.round(m.c)}g ｜ 脂肪 ${Math.round(m.f)}g`);
    });
    L.push("");
  });
  L.push(`## 三、免责声明`);
  L.push("");
  L.push(DISCLAIMER);
  L.push("");
  return L.join("\n");
}

export default { add, list, get, remove, exportMarkdown, ensureMigrated };
