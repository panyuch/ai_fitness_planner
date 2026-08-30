// lib/prompt.js
// LLM provider 注册表 + 提示词 + 输出 JSON Schema 构造 + AI 输出校验。
// DeepSeek / 阿里通义 / 本机 Ollama 均兼容 OpenAI chat completions 协议，仅 baseURL 与 model 不同。
// Ollama 无需 API key（envKey 缺省），连接失败由调用方快速回退算法引擎。
// ticket 03：AI 采用「受控选材」协议——LLM 只输出食材 id 清单（不含克数/宏量），
// 分量由算法引擎分配；输出校验（resolveAIIds）保证食材全部来自本地食材库。

import { POOLS } from "./foods.js";

export const PROVIDERS = {
  deepseek: {
    name: "DeepSeek",
    baseURL: "https://api.deepseek.com/chat/completions",
    model: "deepseek-chat",
    envKey: "DEEPSEEK_API_KEY",
  },
  dashscope: {
    name: "阿里通义",
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    model: "qwen-plus",
    envKey: "DASHSCOPE_API_KEY",
  },
  ollama: {
    name: "Ollama(本机)",
    baseURL: "http://localhost:11434/v1/chat/completions",
    model: "qwen3:8b",
    // 无 envKey：本机服务不需要鉴权
    // qwen3 显式关闭 thinking：避免思考过程混入输出破坏 JSON 解析
    enableThinking: false,
  },
};

// 探测顺序：云端真实 key（DeepSeek → 通义）优先，其次本机 Ollama。
// 无云端 key 时回落 ollama——Ollama 未运行/模型缺失由调用方快速失败并回退算法引擎。
export function detectProvider(env = process.env) {
  if (env.DEEPSEEK_API_KEY) return "deepseek";
  if (env.DASHSCOPE_API_KEY) return "dashscope";
  return "ollama";
}

// ticket 03：受控选材输出 Schema——仅食材 id 清单（决策-rich 短输出，
// 本地 8b 模型可在 90s 超时内完成，避免全量 JSON 计划的超时/截断问题）。
export const ID_SCHEMA = {
  type: "object",
  properties: {
    days: {
      type: "array",
      minItems: 7,
      maxItems: 7,
      items: {
        type: "object",
        properties: {
          meals: {
            type: "array",
            minItems: 4,
            maxItems: 4,
            items: {
              type: "object",
              properties: {
                items: {
                  type: "array",
                  minItems: 1,
                  items: {
                    type: "object",
                    properties: { id: { type: "string" } },
                    required: ["id"],
                  },
                },
              },
              required: ["items"],
            },
          },
        },
        required: ["meals"],
      },
    },
  },
  required: ["days"],
};

const POOL_LABELS = {
  protein: "主蛋白",
  carb: "碳水主食",
  veg: "蔬菜",
  fat: "健康脂肪",
  fruit: "水果",
  dairy: "乳制品",
};

// 食材库候选清单（按池分组，格式「id 名称」），供 LLM 受控选材。
// 直接复用 foods.js 的 POOLS 分组（数据单一来源）。
function foodCatalog() {
  return Object.entries(POOLS)
    .map(([pool, list]) => `${POOL_LABELS[pool] || pool}（${pool}）：${list.map((f) => `${f.id} ${f.name}`).join("、")}`)
    .join("\n");
}

// 已锁定餐次摘要（如「第1天 早餐 已锁定：鸡胸肉 150g + 米饭 200g」），无锁餐返回 null
function lockedSummary(locked) {
  if (!locked || !Object.keys(locked).length) return null;
  return Object.values(locked)
    .map((m) => `${m.label} 已锁定：${m.items.map((it) => `${it.name} ${Math.round(it.grams)}g`).join(" + ")}`)
    .join("\n");
}

export function buildMessages(input, calc, locked = {}) {
  const schemaText =
    "输出 JSON 必须严格符合以下 Schema（仅输出该对象，不要任何额外文字）：\n" +
    JSON.stringify(ID_SCHEMA, null, 2);

  const system =
    "你是一名持有运动营养专业知识的营养师，擅长为健身 / 备赛人群设计科学、可执行的周饮食计划。\n" +
    "你的职责是「选食材」：从下方食材库中为每餐挑选食材 id，不要发明库外食材，不要输出克数或宏量（分量由服务端算法分配）。\n" +
    "每餐建议选择 4-5 个 id：一个主蛋白、一个碳水主食、一份蔬菜、一份健康脂肪（加餐可选水果或乳制品）。\n" +
    "搭配自然、贴近真实饮食，同一餐内避免重复食材，训练日高碳、休息日低碳。\n\n" +
    "食材库候选清单（按池分组，格式：id 名称）：\n" +
    foodCatalog() +
    "\n\n" +
    schemaText;

  const summary = {
    goal: calc.goal,
    阶段热量: { 训练日: calc.phaseKcal, 休息日: calc.restKcal },
    每日蛋白目标g: calc.proteinG,
    PAL: calc.pal,
    TDEE: calc.tdee,
    碳循环: {
      训练日: { 碳水占比: calc.train.carbPct, 脂肪占比: calc.train.fatPct },
      休息日: { 碳水占比: calc.rest.carbPct, 脂肪占比: calc.rest.fatPct },
    },
  };

  let user =
    "用户身体数据与目标（JSON）：\n" +
    JSON.stringify(input, null, 2) +
    "\n\n计算依据（必须遵循）：\n" +
    JSON.stringify(summary, null, 2) +
    "\n\n请生成 7 天 × 4 餐（早餐/午餐/晚餐/加餐）的食材选择计划：" +
    "每天输出 4 个 meals，每餐 items 只含食材 id（必须从上方清单中选）。" +
    "只输出 id 清单，克数与宏量由服务端算法按目标分配，你无需计算。";

  const lockText = lockedSummary(locked);
  if (lockText) user += "\n\n已锁定餐次（请勿重复安排这些餐次，生成后会被锁定内容覆盖）：\n" + lockText;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

// ticket 03 接缝 3：AI 输出（仅 id 清单）的校验与映射。
// - 库外 id → 整体抛错（防幻觉食材，绝不产出坏结果）
// - 缺 id 的残缺项 → 忽略（qwen3 偶发输出缺 id 项，整体结构正确时容错，
//   食材仍 100% 来自库内；剩余有效食材为 0 才抛错）
// 返回 { days: [{ meals: [{ items: [food, ...] }] }] }，food 为食材库对象。
export function resolveAIIds(plan, foods) {
  if (!plan || !Array.isArray(plan.days) || plan.days.length !== 7)
    throw new Error("AI plan.days 缺失或长度非 7");
  const byId = new Map(foods.map((f) => [f.id, f]));
  return plan.days.map((d, di) => {
    if (!d || !Array.isArray(d.meals) || d.meals.length !== 4)
      throw new Error(`第 ${di + 1} 天餐次异常（应 4 餐，实际 ${d?.meals?.length ?? 0}）`);
    return {
      meals: d.meals.map((m, mi) => {
        if (!m || !Array.isArray(m.items) || m.items.length === 0)
          throw new Error(`第 ${di + 1} 天第 ${mi + 1} 餐 items 异常`);
        const items = [];
        for (const it of m.items) {
          const id = it?.id;
          if (!id) continue; // 容错：缺 id 的残缺项忽略
          const food = byId.get(id);
          if (!food) throw new Error(`库外食材 id: ${id}`);
          items.push(food);
        }
        if (items.length === 0)
          throw new Error(`第 ${di + 1} 天第 ${mi + 1} 餐无有效食材`);
        return { items };
      }),
    };
  });
}
