# 02: 营养计算引擎

**What to build:** 系统能根据用户身体数据与目标，本地计算出 BMR、PAL、TDEE、阶段热量与三大宏量（训练日/休息日分化），纯函数、零依赖、可单测；计算口径与 SPEC §4 一致且对外部透明可解释。

**Blocked by:** 01 (项目脚手架与 teal/green 主题)

**Status:** ready-for-agent

- [ ] `lib/nutrition.js` 导出 computeBMR / computePAL / computeTDEE / computeMacros 等纯函数
- [ ] 单测覆盖 Henry 2005 年龄分组 BMR、PAL 钳制区间 `[1.2, 1.9]`、阶段热量缺口/盈余封顶、宏量碳循环
- [ ] 验证样例：26 男 75kg cut 5练 → 训练日 2220 kcal、休息日 2109 kcal、蛋白 165 g/天（与 §4.3 护栏一致）
- [ ] 备赛护栏生效：cut 缺口封顶 −20%，bulk 盈余封顶 +15%
