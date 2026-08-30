# 04: AI 模式 UI 与降级反馈

**What to build:** 表单区出现「AI 生成」开关，开启后生成请求走 AI 模式；等待期间显示进度文案（本地模型生成中，约需 1 分钟…）；AI 不可用（Ollama 未启动 / 模型缺失 / 超时）时自动回退本地引擎，并在结果页明示「本次由本地引擎生成」，让用户知道发生了什么。算法模式的既有 UI 与行为不变。

**Blocked by:** 03 (AI 受控选材闭环)

**Status:** ready-for-agent

- [x] 表单「AI 生成」开关，生成请求携带 AI 模式标记
- [x] AI 模式 loading 文案区分于算法模式
- [x] AI 回退时结果页提示条「本次由本地引擎生成」
- [x] 算法模式 UI、锁餐、重生成交互与既有行为一致

## 端到端实测（2026-08-30，dev server + curl）

- 场景 A（算法模式）：`useAI` 缺省 → 0.74s 秒回，`usedAI:false` / `degraded:false`，7 天计划。
- 场景 B（AI 失败降级）：`useAI:true` + Ollama 端点不可达 → **0.17s 快速失败**，`usedAI:false` / `degraded:true`，回退完整（7 天本地计划）——结果页显示「本次由本地引擎生成」提示条。
- 场景 C（AI 成功）：`useAI:true` → 63.9s 返回，`usedAI:true` / `degraded:false`，第 1 天早餐鸡胸 102g 等库内食材。
- 测试 61/61 全绿、`next build` 通过。
