# 03: 本地食材库

**What to build:** 系统拥有 29 种离线食材库（每 100g 的 kcal/p/c/f），按 carb/protein/veg/fat/fruit/dairy 分池，供生成器与 UI 引用，无外部 API、不收集用户数据。

**Blocked by:** 01 (项目脚手架与 teal/green 主题)

**Status:** ready-for-agent

- [ ] `lib/foods.js` 含 29 条食材，字段 kcal/p/c/f 完整
- [ ] POOLS 分类（carb 7 / protein 8 / veg 5 / fat 3 / fruit 3 / dairy 3）可被生成器按类别取用
- [ ] 数据来源标注（中国食物成分表 / USDA），无运行时网络依赖
