// app/api/generate/route.js
// POST /api/generate  { input, locked, seed?, useAI? } -> { calc, plan, usedAI }
// 双模式路由：useAI 缺省/为 false → 直接走本地生成器（seed 生效）；
// useAI=true → 探测 LLM（云端 key 优先，其次本机 Ollama），失败/超时回退本地（usedAI:false）。

import { NextResponse } from "next/server";
import { generateWeek } from "../../../lib/generator.js";
import { computeMacros } from "../../../lib/nutrition.js";
import { PROVIDERS, detectProvider, buildMessages } from "../../../lib/prompt.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GOALS = ["cut", "bulk", "maintain"];
// ticket 02：本地 8b 模型生成需 30-90s，AI 调用超时上限（此前为 15s）
const AI_TIMEOUT_MS = 90_000;

function validateInput(input) {
  if (!input || typeof input !== "object") return "缺少输入对象";
  if (!GOALS.includes(input.goal)) return "goal 必须是 cut / bulk / maintain 之一";
  if (typeof input.weight !== "number" || input.weight <= 0) return "weight 必须为正数";
  if (typeof input.age !== "number" || input.age <= 0) return "age 必须为正数";
  if (typeof input.trainFreq !== "number" || input.trainFreq < 0 || input.trainFreq > 7)
    return "trainFreq 须在 0–7 之间";
  if (input.height != null && (typeof input.height !== "number" || input.height <= 0))
    return "height 必须为正数";
  return null;
}

// 校验并规整 AI 返回的 plan 结构；异常则抛出以便回退本地
function normalizeAIPlan(plan) {
  if (!plan || !Array.isArray(plan.days) || plan.days.length !== 7)
    throw new Error("AI plan 缺少 7 天数据");
  plan.days.forEach((d, i) => {
    if (!d || !Array.isArray(d.meals) || d.meals.length !== 4)
      throw new Error(`第 ${i + 1} 天餐次异常`);
    d.meals.forEach((m) => {
      if (!Array.isArray(m.items) || m.items.length === 0)
        throw new Error(`第 ${i + 1} 天存在空餐次`);
    });
  });
  // 容错：补齐 totals / 宏量默认值，避免上层渲染白屏
  plan.days.forEach((d) => {
    if (!d.totals) {
      d.totals = d.meals.reduce(
        (a, m) => {
          a.kcal += m.kcal || 0;
          a.p += m.p || 0;
          a.c += m.c || 0;
          a.f += m.f || 0;
          return a;
        },
        { kcal: 0, p: 0, c: 0, f: 0 }
      );
    }
    d.meals.forEach((m) => {
      m.p = m.p || 0;
      m.c = m.c || 0;
      m.f = m.f || 0;
      m.kcal = m.kcal || 0;
      m.items = m.items || [];
    });
  });
  const schedule = Array.isArray(plan.schedule)
    ? plan.schedule
    : plan.days.map((d) => (d.isTrain ? 1 : 0));
  return { schedule, days: plan.days };
}

// 把锁定餐次覆盖到 AI 生成的 plan 上（本地路径已在 generateWeek 内处理锁定）。
// AI 返回的 plan 餐次通常没有 key 字段，需按「天序-餐序」补上 key 才能命中锁定。
function overlayLocked(plan, locked) {
  if (!locked || !Object.keys(locked).length) return plan;
  const MEAL_KEYS = ["breakfast", "lunch", "dinner", "snack"];
  plan.days.forEach((day, d) => {
    day.meals.forEach((meal, mi) => {
      const key = `${d}-${MEAL_KEYS[mi] ?? meal.key}`;
      meal.key = key;
      const lk = locked[key];
      if (lk) Object.assign(meal, lk, { locked: true, key });
    });
  });
  return plan;
}

async function callAI(providerKey, input, calc, signal) {
  const p = PROVIDERS[providerKey];
  const headers = { "Content-Type": "application/json" };
  // 云端 provider 需要 API key；Ollama 本机服务无需鉴权，不带 Authorization
  if (p.envKey && process.env[p.envKey]) {
    headers.Authorization = `Bearer ${process.env[p.envKey]}`;
  }
  const messages = buildMessages(input, calc);
  const body = {
    model: p.model,
    messages,
    response_format: { type: "json_object" },
    temperature: 0.6,
  };
  // provider 配置驱动的附加参数（如 ollama 的 enable_thinking:false），
  // 保持「新增 provider 只改注册表一行」的接入原则
  if (p.enableThinking === false) body.enable_thinking = false;
  const res = await fetch(p.baseURL, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`${p.name} HTTP ${res.status}`);
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error(`${p.name} 返回空`);
  const plan = JSON.parse(content);
  return normalizeAIPlan(plan);
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const { input = {}, locked = {}, useAI = false } = body || {};
  // 仅接受有限数字 seed（重生成携带）；缺省/非法 → undefined → 默认 seed 与 v1.0 一致
  const seed = typeof body?.seed === "number" && Number.isFinite(body.seed) ? body.seed : undefined;
  const err = validateInput(input);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  const calc = computeMacros(input);

  // 双模式路由：useAI=true 才探测 LLM（云端 key 优先，其次本机 Ollama）。
  // 任何失败/超时 → 回退本地引擎；Ollama 未运行/模型缺失时连接被拒快速失败，响应仍完整。
  let plan = null;
  let usedAI = false;

  if (useAI) {
    const providerKey = detectProvider();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
    try {
      plan = await callAI(providerKey, input, calc, controller.signal);
      usedAI = true;
    } catch (e) {
      console.warn(`[generate] AI(${providerKey}) 失败，回退本地：${e.message}`);
      plan = null;
    } finally {
      clearTimeout(timer);
    }
  }

  if (!plan) {
    // seed：首次生成不携带 → 默认 seed（与 v1.0 一致）；重生成携带新 seed 启用随机化
    plan = generateWeek(input, locked, seed);
    usedAI = false;
  } else if (usedAI && locked && Object.keys(locked).length) {
    // AI 模式下同样尊重锁餐：用本地锁定餐次覆盖 AI 结果
    plan = overlayLocked(plan, locked);
  }

  return NextResponse.json({ calc, plan, usedAI });
}
