# 06: AI 引擎集成

**What to build:** 配置 `DEEPSEEK_API_KEY` 或 `DASHSCOPE_API_KEY` 后，生成接口改走对应国内 LLM 的 chat completions，按 `lib/prompt.js` 构造提示词 + JSON Schema 产出计划；任何失败自动回退本地并正确标注 `usedAI`。

**Blocked by:** 05 (生成接口与本地兜底)

**Status:** ready-for-agent

- [ ] 探测顺序 DEEPSEEK → DASHSCOPE，命中即用对应模型
- [ ] `lib/prompt.js` 构造 system/user 提示词 + 输出 JSON Schema
- [ ] 调用失败/超时/无 key → 回退本地生成，`usedAI` 准确（true / false）
- [ ] 前端能区分并显示 AI 模式 vs 本地模式
