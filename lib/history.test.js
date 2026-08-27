// lib/history.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  add,
  list,
  get,
  remove,
  exportMarkdown,
  ensureMigrated,
  _setStorage,
  HISTORY_KEY,
  OLD_STORE_KEY,
  MAX_ENTRIES,
  DISCLAIMER,
} from "./history.js";

// 内存版 localStorage（可预置初始数据）
function makeStore(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

function makeDay(d) {
  return {
    day: d,
    isTrain: d % 2 === 0,
    label: `第${d + 1}天`,
    totals: { kcal: 1900, p: 165, c: 200, f: 60 },
    meals: [
      {
        key: `${d}-breakfast`,
        label: `第${d + 1}天 早餐`,
        kcal: 500,
        p: 40,
        c: 50,
        f: 10,
        items: [
          { id: "chicken", name: "鸡胸肉", grams: 150, macros: { p: 46, c: 0, f: 5, kcal: 248 } },
        ],
      },
    ],
  };
}

const SAMPLE_RESULT = {
  calc: {
    bmr: 1600,
    equation: "mifflin",
    pal: 1.55,
    tdee: 2480,
    goal: "cut",
    phaseAdjustPct: -0.2,
    phaseKcal: 1984,
    restKcal: 1885,
    proteinPerKg: 2.2,
    proteinG: 165,
    train: { carbPct: 0.45, fatPct: 0.25 },
    rest: { carbPct: 0.3, fatPct: 0.35 },
    peakWeek: null,
  },
  plan: { days: [0, 1, 2, 3, 4, 5, 6].map(makeDay) },
  usedAI: false,
};

test("add：entry 结构完整（id/savedAt/form/result/summary），最新在前", () => {
  _setStorage(makeStore());
  const entry = add({ goal: "cut", timelineWeeks: 8 }, SAMPLE_RESULT);
  assert.ok(entry.id.startsWith("h_"));
  assert.ok(!Number.isNaN(Date.parse(entry.savedAt)));
  assert.equal(entry.form.goal, "cut");
  assert.deepEqual(entry.summary, {
    goal: "cut",
    timelineWeeks: 8,
    tdee: 2480,
    phaseKcal: 1984,
    restKcal: 1885,
  });
  const items = list();
  assert.equal(items.length, 1);
  assert.equal(items[0].id, entry.id);
});

test(`上限 ${MAX_ENTRIES} 条：第 ${MAX_ENTRIES + 1} 条写入时 FIFO 淘汰最旧`, () => {
  _setStorage(makeStore());
  for (let i = 0; i < MAX_ENTRIES + 1; i++) {
    add(
      { goal: "cut", timelineWeeks: 8 },
      { ...SAMPLE_RESULT, calc: { ...SAMPLE_RESULT.calc, tdee: 2000 + i } }
    );
  }
  const items = list();
  assert.equal(items.length, MAX_ENTRIES);
  assert.equal(items[0].summary.tdee, 2000 + MAX_ENTRIES, "最新在最前");
  assert.equal(items[MAX_ENTRIES - 1].summary.tdee, 2001, "最旧（第 1 条 2000）已被淘汰");
});

test("get / remove：按 id 取单条与删除", () => {
  _setStorage(makeStore());
  const a = add({ goal: "cut" }, SAMPLE_RESULT);
  const b = add({ goal: "bulk" }, SAMPLE_RESULT);
  assert.equal(get(a.id).id, a.id);
  assert.equal(get("nonexist"), null);
  assert.equal(remove(b.id), true);
  assert.equal(get(b.id), null);
  assert.equal(remove(b.id), false, "重复删除应返回 false");
  assert.equal(list().length, 1);
});

test("exportMarkdown：含标题/计算依据/7 天计划/免责声明", () => {
  const entry = add(
    { sex: "male", age: 26, weight: 75, height: 178, goal: "cut", timelineWeeks: 8 },
    SAMPLE_RESULT
  );
  const md = exportMarkdown(entry);
  assert.ok(md.includes("# FitMeal 周饮食计划"));
  assert.ok(md.includes("BMR 方程：Mifflin-St Jeor（含身高）"));
  assert.ok(md.includes("## 二、7 天饮食计划"));
  assert.ok(md.includes("### 第1天"));
  assert.ok(md.includes("### 第7天"));
  assert.ok(md.includes("## 三、免责声明"));
  assert.ok(md.includes(DISCLAIMER));
});

test("迁移：旧 STORE_KEY 单计划结构迁移为历史首条（含 locked）并清理旧 key", () => {
  const locked = {
    "0-breakfast": { key: "0-breakfast", label: "第1天 早餐", kcal: 500, items: [], locked: true },
  };
  const store = makeStore({
    [OLD_STORE_KEY]: JSON.stringify({
      form: { goal: "bulk", timelineWeeks: 12 },
      locked,
      result: { ...SAMPLE_RESULT, calc: { ...SAMPLE_RESULT.calc, goal: "bulk" } },
    }),
  });
  _setStorage(store);
  const { migrated, entry } = ensureMigrated();
  assert.equal(migrated, true);
  assert.equal(store.getItem(OLD_STORE_KEY), null, "旧 key 应被清理");
  assert.equal(entry.form.goal, "bulk");
  assert.equal(entry.summary.tdee, 2480);
  assert.deepEqual(entry.locked, locked, "旧锁餐数据不应丢失");
  const items = list();
  assert.equal(items.length, 1);
  assert.equal(items[0].summary.goal, "bulk");
  // 幂等：再次调用不重复迁移
  const again = ensureMigrated();
  assert.equal(again.migrated, false);
  assert.equal(list().length, 1);
});

test("迁移：历史已有条目时不再迁移，仅清理旧 key", () => {
  const store = makeStore({
    [HISTORY_KEY]: JSON.stringify([
      {
        id: "h_existing",
        savedAt: new Date().toISOString(),
        form: { goal: "maintain", timelineWeeks: 6 },
        result: SAMPLE_RESULT,
        summary: { goal: "cut", timelineWeeks: 8, tdee: 2480, phaseKcal: 1984, restKcal: 1885 },
      },
    ]),
    [OLD_STORE_KEY]: JSON.stringify({ form: { goal: "bulk" }, locked: {}, result: SAMPLE_RESULT }),
  });
  _setStorage(store);
  const { migrated, entry } = ensureMigrated();
  assert.equal(migrated, false);
  assert.equal(entry, null);
  assert.equal(store.getItem(OLD_STORE_KEY), null, "旧 key 应被清理");
  assert.equal(list().length, 1, "历史不应被重复迁移");
});

test("迁移：无旧数据 / 非对象结构时清理并跳过", () => {
  _setStorage(makeStore());
  assert.equal(ensureMigrated().migrated, false);
  const bad = makeStore({ [OLD_STORE_KEY]: JSON.stringify({ foo: 1 }) });
  _setStorage(bad);
  assert.equal(ensureMigrated().migrated, false, "无 form/result 的结构不迁移");
  assert.equal(bad.getItem(OLD_STORE_KEY), null, "无效旧结构也应被清理");
});

test("exportMarkdown：无 result 时返回 null", () => {
  _setStorage(makeStore());
  assert.equal(exportMarkdown({ form: {}, savedAt: new Date().toISOString() }), null);
  assert.equal(exportMarkdown(null), null);
});

test("无 localStorage 环境（内存降级）不抛错", () => {
  _setStorage(null);
  const entry = add({ goal: "maintain", timelineWeeks: 6 }, SAMPLE_RESULT);
  assert.ok(entry.id.startsWith("h_"));
  remove(entry.id);
});
