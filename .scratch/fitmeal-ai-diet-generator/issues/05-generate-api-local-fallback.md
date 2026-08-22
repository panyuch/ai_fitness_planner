# 05: 生成接口与本地兜底

**What to build:** 前端调用 `POST /api/generate` 传入 `{input,locked}`，接口在**无 AI key** 时也能用本地生成器产出 `{calc,plan,usedAI:false}`，整链路零外部依赖即可演示。

**Blocked by:** 04 (周计划生成器)

**Status:** ready-for-agent

- [ ] `app/api/generate/route.js` 接收 `{input,locked}`，返回 `{calc,plan,usedAI}`
- [ ] 无 key 路径调用本地 `generateWeek`，`usedAI=false`
- [ ] 入参校验失败返回明确错误，不崩溃
- [ ] 可用 curl / 前端直接验证：给定示例输入得到完整 7 天计划
