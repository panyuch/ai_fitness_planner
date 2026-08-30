// app/api/generate/route.js
// POST /api/generate  { input, locked, seed?, useAI? } -> { calc, plan, usedAI }
// 双模式路由：useAI 缺省/为 false → 直接走本地生成器（seed 生效）；
// useAI=true → LLM 受控选材（仅 id）→ resolveAIIds 校验 → buildWeekFromIds 算法定克数；
// 任何失败/超时/非法输出 → 回退本地引擎（usedAI:false），绝不产出坏结果。

import { NextResponse } from "next/server";
import { generateWeek, buildSchedule, buildWeekFromIds } from "../../../lib/generator.js";
import { computeMacros } from "../../../lib/nutrition.js";
import { FOODS } from "../../../lib/foods.js";
import { PROVIDERS, detectProvider, buildMessages, resolveAIIds } from "../../../lib/prompt.js";

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

async function callAI(providerKey, input, calc, locked, signal) {
  const p = PROVIDERS[providerKey];
  const headers = { "Content-Type": "application/json" };
  // 云端 provider 需要 API key；Ollama 本机服务无需鉴权，不带 Authorization
  if (p.envKey && process.env[p.envKey]) {
    headers.Authorization = `Bearer ${process.env[p.envKey]}`;
  }
  const messages = buildMessages(input, calc, locked);
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
  return JSON.parse(content); // 原始 id 清单 plan，校验交给 resolveAIIds
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
  // 受控选材闭环：LLM 只选 id → resolveAIIds 校验（库外/结构异常整体抛错）
  // → buildWeekFromIds 按宏量目标分配分量（schedule 由算法确定，不依赖 AI）。
  let plan = null;
  let usedAI = false;

  if (useAI) {
    const providerKey = detectProvider();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
    try {
      const aiPlan = await callAI(providerKey, input, calc, locked, controller.signal);
      const aiDays = resolveAIIds(aiPlan, FOODS);
      plan = buildWeekFromIds(calc, buildSchedule(input.trainFreq), aiDays, locked);
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
  }

  return NextResponse.json({ calc, plan, usedAI });
}
