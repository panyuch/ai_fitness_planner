# 02: Ollama provider 接入

**What to build:** 配置了本地 Ollama 后，AI 生成请求可以打到本机 qwen3:8b 并拿到结构合法的 JSON 计划；Ollama 未运行、模型缺失或超时时请求快速失败并回退本地引擎。这是 AI 模式的连通性基座——先验证最大技术风险（本机模型能否稳定返回 JSON）。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] provider 注册表增加 ollama（本机 OpenAI 兼容端点、模型 qwen3:8b）
- [ ] provider 探测顺序：云端真实 key 优先，其次 Ollama
- [ ] AI 调用超时提升至 90s；qwen3 请求体禁用 thinking
- [ ] Ollama 未运行 / 模型缺失时快速失败，回退路径生效（响应仍完整）
- [ ] Ollama 运行中：手动调用生成接口走 AI 路径返回 JSON 计划（连通性验证）
