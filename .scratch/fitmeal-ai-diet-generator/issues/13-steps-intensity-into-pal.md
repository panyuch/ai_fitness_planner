# 13: 步数 / 强度 / 分化进入 PAL

**What to build:** §3 当前仅用于展示的 `steps` / `intensity` / `splitType` 进入 PAL/热量计算，使活动量更精细；展示文案与计算一致（呼应 §13.3）。

**Blocked by:** 02 (营养计算引擎)

**Status:** ready-for-agent

- [ ] `computePAL` 纳入 steps / intensity（按 SPEC 兼容字段名 cardioFreq / cardio.freq）
- [ ] 单测验证 PAL 随活动量变化且仍在 `[1.2, 1.9]` 钳制内
- [ ] UI 展示与计算结果一致
