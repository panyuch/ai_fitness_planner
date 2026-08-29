# 02: Ollama provider 接入

**What to build:** 配置了本地 Ollama 后，AI 生成请求可以打到本机 qwen3:8b 并拿到结构合法的 JSON 计划；Ollama 未运行、模型缺失或超时时请求快速失败并回退本地引擎。这是 AI 模式的连通性基座——先验证最大技术风险（本机模型能否稳定返回 JSON）。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [x] provider 注册表增加 ollama（本机 OpenAI 兼容端点、模型 qwen3:8b）
- [x] provider 探测顺序：云端真实 key 优先，其次 Ollama
- [x] AI 调用超时提升至 90s；qwen3 请求体禁用 thinking
- [x] Ollama 未运行 / 模型缺失时快速失败，回退路径生效（响应仍完整）
- [~] Ollama 运行中：手动调用生成接口走 AI 路径返回 JSON 计划（连通性验证）

## 连通性验证记录（2026-08-30）

- **环境**：Ollama 0.30.4（本机 11434 已启动），qwen3:8b（5.2GB Q4_K_M，RTX 4060 Laptop 8GB）已拉取。
- **连通性 ✓**：`POST /v1/chat/completions`（复刻 callAI 请求体，含 `enable_thinking:false`）返回 HTTP 200，参数被接受，content 为可解析 JSON。
- **能力边界 ⚠**：生成**完整 7 天 PLAN_SCHEMA 计划实测 206s**，远超 90s 超时；且该次输出仅含 4 天（`days.length=4`），`normalizeAIPlan` 校验失败 → 整体回退本地。即**当前全量协议 + qwen3:8b 下，AI 路径 90s 内无法产出合法 7 天计划**。
- **回退路径 ✓**：超时/结构非法时响应仍完整（返回 7 天本地算法计划，usedAI:false）。
- **结论**：勾选项 5 的「返回 JSON 计划」在连通性层面达成、在完整计划层面未达成——这正是 spec 设计**受控选材（仅 id 输出，工单 03）**的原因：输出从 ~14KB（约 4000 token）降到数百 token 后，90s 内完成才现实。工单 03 落地前 AI 模式实际不可用（会一直回退），属预期中间态。
