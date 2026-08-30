// lib/prompt.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { PROVIDERS, detectProvider, buildMessages, resolveAIIds } from "./prompt.js";
import { FOODS } from "./foods.js";

// ---- ticket 02: Ollama provider 注册与探测顺序 ----

test("detectProvider: 云端 key 优先于 Ollama（deepseek > dashscope > ollama）", () => {
  assert.equal(detectProvider({ DEEPSEEK_API_KEY: "x" }), "deepseek");
  assert.equal(detectProvider({ DASHSCOPE_API_KEY: "x" }), "dashscope");
  assert.equal(detectProvider({ DEEPSEEK_API_KEY: "x", DASHSCOPE_API_KEY: "x" }), "deepseek");
  // 无云端 key → 回落到本机 Ollama（连接失败由调用方快速回退算法引擎）
  assert.equal(detectProvider({}), "ollama");
  assert.equal(detectProvider({ DEEPSEEK_API_KEY: "", DASHSCOPE_API_KEY: "" }), "ollama");
});

test("detectProvider: 默认使用 process.env", () => {
  const orig = process.env;
  try {
    process.env = {};
    assert.equal(detectProvider(), "ollama");
  } finally {
    process.env = orig;
  }
});

test("PROVIDERS.ollama: 本机 OpenAI 兼容端点 + qwen3:8b，无需 API key", () => {
  const p = PROVIDERS.ollama;
  assert.ok(p, "应注册 ollama provider");
  assert.equal(p.baseURL, "http://localhost:11434/v1/chat/completions");
  assert.equal(p.model, "qwen3:8b");
  assert.equal(p.envKey, undefined, "Ollama 不需要 envKey");
  assert.equal(p.enableThinking, false, "qwen3 需显式关闭 thinking");
});

// ---- ticket 03: AI 受控选材协议 ----

const CALC_STUB = {
  goal: "cut",
  phaseKcal: 2220,
  restKcal: 2109,
  proteinG: 165,
  pal: 1.55,
  tdee: 2790,
  train: { carbPct: 0.55, fatPct: 0.25 },
  rest: { carbPct: 0.45, fatPct: 0.3 },
};

test("buildMessages: 提示词含食材库候选清单（id + 名称，按池分组）", () => {
  const msgs = buildMessages({ goal: "cut", weight: 75 }, CALC_STUB, {});
  const all = msgs.map((m) => m.content).join("\n");
  assert.ok(all.includes("chicken"), "应含食材 id（chicken）");
  assert.ok(all.includes("鸡胸肉"), "应含食材名称（鸡胸肉）");
  assert.ok(all.includes("protein") || all.includes("蛋白"), "应按池分组列出");
  assert.ok(all.includes("rice"), "应含碳水食材 id");
  assert.ok(all.includes("broccoli"), "应含蔬菜食材 id");
});

test("buildMessages: 有锁餐时提示词含锁定餐次摘要", () => {
  const locked = {
    "0-breakfast": {
      key: "0-breakfast",
      label: "第1天 早餐",
      kcal: 500,
      p: 40, c: 50, f: 10,
      items: [{ id: "chicken", name: "鸡胸肉", grams: 150, macros: { p: 46, c: 0, f: 5, kcal: 248 } }],
      locked: true,
    },
  };
  const msgs = buildMessages({ goal: "cut", weight: 75 }, CALC_STUB, locked);
  const all = msgs.map((m) => m.content).join("\n");
  assert.ok(all.includes("已锁定"), "应含「已锁定」标记");
  assert.ok(all.includes("第1天 早餐"), "应含锁定餐次描述");
  assert.ok(all.includes("鸡胸肉"), "应含锁定餐食材名");
});

test("buildMessages: 无锁餐时提示词不含锁定摘要", () => {
  const msgs = buildMessages({ goal: "cut", weight: 75 }, CALC_STUB, {});
  const all = msgs.map((m) => m.content).join("\n");
  assert.ok(!all.includes("已锁定"), "无锁餐不应出现锁定摘要");
});

// ---- resolveAIIds：AI 输出（仅 id 清单）校验与映射 ----

function idPlan(days) {
  return { days: days.map((meals) => ({ meals: meals.map((ids) => ({ items: ids.map((id) => ({ id })) })) })) };
}

const AI_DAY = [["chicken", "rice", "broccoli", "oliveoil"], ["beef", "potato", "spinach", "avocado"], ["salmon", "sweetpotato", "tomato", "oliveoil"], ["egg", "rice", "cucumber", "oliveoil", "apple"]];

test("resolveAIIds: 合法 id 清单 → 映射为库内食材对象（7 天 × 4 餐）", () => {
  const plan = idPlan(Array(7).fill(AI_DAY));
  const days = resolveAIIds(plan, FOODS);
  assert.equal(days.length, 7);
  for (const d of days) {
    assert.equal(d.meals.length, 4);
    for (const m of d.meals) {
      assert.ok(m.items.length >= 3, "每餐应有食材");
      for (const it of m.items) {
        assert.equal(typeof it.name, "string", "应映射出食材名称");
        assert.ok(it.kcal > 0, "应映射出完整食材数据（kcal）");
      }
    }
  }
});

test("resolveAIIds: 库外 id → 整体抛错", () => {
  const plan = idPlan(Array(7).fill([["chicken", "not_a_food", "rice"], ["beef", "potato", "spinach", "avocado"], ["salmon", "sweetpotato", "tomato", "oliveoil"], ["egg", "rice", "cucumber", "oliveoil", "apple"]]));
  assert.throws(() => resolveAIIds(plan, FOODS), /not_a_food/);
});

test("resolveAIIds: 天数 ≠ 7 → 抛错", () => {
  assert.throws(() => resolveAIIds(idPlan([AI_DAY]), FOODS), /7/);
});

test("resolveAIIds: 餐数 ≠ 4 → 抛错", () => {
  const plan = idPlan(Array(7).fill([["chicken", "rice", "broccoli", "oliveoil"]]));
  assert.throws(() => resolveAIIds(plan, FOODS), /4/);
});

test("resolveAIIds: 空 items / 非数组 → 抛错", () => {
  const empty = { days: Array(7).fill({ meals: Array(4).fill({ items: [] }) }) };
  assert.throws(() => resolveAIIds(empty, FOODS), /items/);
  assert.throws(() => resolveAIIds({ days: "x" }, FOODS), /days/);
  assert.throws(() => resolveAIIds(null, FOODS), /days/);
});

test("resolveAIIds: 缺 id 的残缺项忽略，其余合法 id 保留", () => {
  const plan = {
    days: Array(7).fill({
      meals: [
        { items: [{ id: "chicken" }, {}, { name: "米饭" }, { id: "rice" }, { id: "broccoli" }, { id: "oliveoil" }] },
        { items: [{ id: "beef" }, { id: "potato" }, { id: "spinach" }, { id: "avocado" }] },
        { items: [{ id: "salmon" }, { id: "sweetpotato" }, { id: "tomato" }, { id: "oliveoil" }] },
        { items: [{ id: "egg" }, { id: "rice" }, { id: "cucumber" }, { id: "oliveoil" }, { id: "apple" }] },
      ],
    }),
  };
  const days = resolveAIIds(plan, FOODS);
  const ids = days[0].meals[0].items.map((f) => f.id);
  assert.deepEqual(ids, ["chicken", "rice", "broccoli", "oliveoil"], "残缺项应被忽略、合法 id 保留");
});

test("resolveAIIds: 一餐全部缺 id → 抛错（无有效食材）", () => {
  const plan = {
    days: Array(7).fill({
      meals: [
        { items: [{}, { name: "x" }] },
        { items: [{ id: "beef" }, { id: "potato" }, { id: "spinach" }, { id: "avocado" }] },
        { items: [{ id: "salmon" }, { id: "sweetpotato" }, { id: "tomato" }, { id: "oliveoil" }] },
        { items: [{ id: "egg" }, { id: "rice" }, { id: "cucumber" }, { id: "oliveoil" }, { id: "apple" }] },
      ],
    }),
  };
  assert.throws(() => resolveAIIds(plan, FOODS), /无有效食材/);
});
