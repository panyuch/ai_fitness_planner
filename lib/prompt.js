// lib/prompt.js
// LLM provider 注册表 + 提示词 + 输出 JSON Schema 构造。
// DeepSeek / 阿里通义 / 本机 Ollama 均兼容 OpenAI chat completions 协议，仅 baseURL 与 model 不同。
// Ollama 无需 API key（envKey 缺省），连接失败由调用方快速回退本地引擎。

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
// 无云端 key 时回落 ollama——Ollama 未运行/模型缺失由调用方快速失败并回退本地引擎。
export function detectProvider(env = process.env) {
  if (env.DEEPSEEK_API_KEY) return "deepseek";
  if (env.DASHSCOPE_API_KEY) return "dashscope";
  return "ollama";
}

export const PLAN_SCHEMA = {
  type: "object",
  properties: {
    schedule: { type: "array", items: { type: "integer", enum: [0, 1] }, minItems: 7, maxItems: 7 },
    days: {
      type: "array",
      minItems: 7,
      maxItems: 7,
      items: {
        type: "object",
        properties: {
          day: { type: "integer" },
          isTrain: { type: "boolean" },
          totals: {
            type: "object",
            properties: {
              kcal: { type: "number" },
              p: { type: "number" },
              c: { type: "number" },
              f: { type: "number" },
            },
            required: ["kcal", "p", "c", "f"],
          },
          meals: {
            type: "array",
            minItems: 4,
            maxItems: 4,
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                kcal: { type: "number" },
                p: { type: "number" },
                c: { type: "number" },
                f: { type: "number" },
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      name: { type: "string" },
                      grams: { type: "number" },
                      macros: {
                        type: "object",
                        properties: {
                          p: { type: "number" },
                          c: { type: "number" },
                          f: { type: "number" },
                          kcal: { type: "number" },
                        },
                      },
                    },
                    required: ["id", "name", "grams"],
                  },
                },
              },
              required: ["label", "kcal", "items"],
            },
          },
        },
        required: ["day", "isTrain", "totals", "meals"],
      },
    },
  },
  required: ["schedule", "days"],
};

export function buildMessages(input, calc) {
  const schemaText =
    "输出 JSON 必须严格符合以下 Schema（仅输出该对象，不要任何额外文字）：\n" +
    JSON.stringify(PLAN_SCHEMA, null, 2);

  const system =
    "你是一名持有运动营养专业知识的营养师，擅长为健身 / 备赛人群设计科学、可执行的周饮食计划。" +
    "你必须严格依据用户提供的「计算依据」来安排宏量，使每份计划的每日热量与蛋白接近目标值。" +
    "请优先使用中国食物成分表中的常见食材，搭配自然、贴近真实饮食。" +
    "只输出 JSON，不要包含任何解释性文字。\n\n" +
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

  const user =
    "用户身体数据与目标（JSON）：\n" +
    JSON.stringify(input, null, 2) +
    "\n\n计算依据（必须遵循）：\n" +
    JSON.stringify(summary, null, 2) +
    "\n\n请生成 7 天 × 4 餐（早餐/午餐/晚餐/加餐）的饮食计划。" +
    "每天按 schedule 数组标注训练日(1)/休息日(0)。" +
    "每餐含若干食材（name + grams 克数 + 该食材 macros: p/c/f/kcal），并给出单餐 kcal/p/c/f 与全天 totals。" +
    "碳水日训练日高碳、休息日低碳。输出严格符合给定 JSON Schema。";

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
