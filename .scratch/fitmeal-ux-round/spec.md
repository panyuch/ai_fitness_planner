# FitMeal · 用户体验补课（UX Round）— 产品规格

> 版本：v1.0 · 类型：现有产品的 UX 增强增量（非 v1.0 替代品）
> 上游：`.scratch/fitmeal-ai-diet-generator/spec.md`（产品 v1.0 规格）
> 路由：grilling（对齐共识）→ to-spec（本文件）→ to-tickets（拆票）→ implement

---

## Problem Statement

当前 FitMeal Demo 已端到端跑通，但作为求职作品集展示时仍显"未完工"，用户体感有四块短板：

1. **用完即丢，没有闭环**：每次生成的计划刷新/重新生成后就无法再找回，没有历史记录，像一个一次性工具。
2. **结果页信息过载**：BMR / PAL / TDEE / 宏量公式一股脑堆在结果页，新用户一看就 intimidated，抓不住重点。
3. **视觉偏 demo 感**：配色、卡片层次、分隔处理较糙，不像可交付成品。
4. **新手不友好**：表单 12+ 字段专业术语多、不知怎么填；结果页术语（TDEE / 碳循环等）看不懂；首次进入不知道该点哪。

用户希望做一次**聚焦的 UX 补课**，把"闭环"补上、让产品显得完整——但**不做大改版、不碰营养算法引擎**。

---

## Solution

一轮聚焦的 UX 增强，交付四件事：

- **计划历史 / 版本管理（新能力）**：结果页加「保存此计划」按钮，**手动**存入历史；顶部「历史」按钮从右侧滑出面板，不离开主页面；每条可**重新打开**（载入主界面替换当前，可继续改/锁餐/再生成）、**删除**、**导出 Markdown**。本地存储限最近 20 条，并兼容迁移旧的单一计划 `STORE_KEY` 结构。
- **结果页信息密度控制**：「计算依据」默认折叠，常驻一句结论 = **目标+周期 + TDEE+每日热量**；方程名 / 宏量占比等细节收进可展开区，保留透明性。
- **视觉层次打磨**：精炼主色、卡片阴影、分隔线，去除 demo 感（不做整体换肤/品牌重塑）。
- **新手友好**：表单字段提示/示例；结果页术语白话解释；首次进入 1–2 步欢迎向导；高级字段默认收起、核心字段先显。

---

## User Stories

1. As a 用户, I want 点「保存此计划」把当前计划存进历史, so that 我之后能找回它而不必担心被覆盖。
2. As a 用户, I want 顶部「历史」按钮打开一个侧滑面板, so that 我能快速浏览过往计划而不离开主页面。
3. As a 用户, I want 历史列表每条显示生成时间、目标+周期、关键数值（TDEE/训练日热量）, so that 我一眼区分不同计划。
4. As a 用户, I want 点「重新打开」把某条历史载入主界面替换当前, so that 我能基于旧计划继续改、锁餐、再生成。
5. As a 用户, I want 删除某条历史, so that 我能清理不再需要的计划。
6. As a 用户, I want 把某条历史导出为 Markdown, so that 我能存档或分享。
7. As a 用户, I want 历史为空时有引导文案, so that 我知道怎么产生第一条记录。
8. As a 用户, I want 结果页默认只显示一句话结论（目标+周期 + TDEE+每日热量）, so that 我不被公式淹没。
9. As a 用户, I want 点开「计算依据」才看到 BMR 方程、宏量占比等细节, so that 需要时我能验证透明性、平时不被打扰。
10. As a 用户, I want 界面配色与卡片层次更精致, so that 产品看起来像成品而非 demo。
11. As a 新手用户, I want 每个表单字段有提示/示例（如"体重填 60–80kg"）, so that 我知道怎么填。
12. As a 新手用户, I want 结果页术语有白话解释（如"TDEE=你一天总消耗"）, so that 我看得懂。
13. As a 首次用户, I want 进来时有 1–2 步欢迎向导, so that 我立刻知道该做什么。
14. As a 新手用户, I want 高级字段默认收起、只先看到核心几项, so that 表单不压迫。
15. As a 用户, I want 历史在本地持久化且限 20 条, so that 不丢计划也不撑爆存储。
16. As a 老用户, I want 旧的单一计划数据自动迁移进历史, so that 我不会丢失之前存的东西。

---

## Implementation Decisions

- **新增单一模块 `lib/history.js`**：纯函数封装历史读写（add / list / get / remove / exportMarkdown），操作 localStorage，写入时上限 20 条（FIFO 淘汰最旧）、并做从旧 `STORE_KEY` 单计划结构的迁移。这是本次唯一的新建 seam，UI 仅消费它，便于单测。
- **UI 扩展集中在 `app/page.js`**：沿用现有 `DayCard` / `MealRow` 的"同文件内组件"风格，新增 `HistoryPanel`、`SaveButton`、`FieldHint`、`TermTip`、`FirstRunGuide`、高级字段折叠状态等。不拆文件、不重构现有组件。
- **样式扩展在 `app/globals.css`**：新增历史面板滑出、历史列表、字段提示、术语气泡、欢迎向导、层次 token 等类，复用现有 CSS 变量。
- **不动算法与 API**：`lib/nutrition.js`、`lib/generator.js`、`lib/foods.js`、`lib/prompt.js`、`app/api/generate/route.js` 均不修改。
- **保存触发 = 手动**：grilling 中用户从"自动存"翻转为"手动「保存此计划」按钮"，最终定为手动，保留用户掌控感。
- **设备**：桌面端优先；本 round 不做响应式/移动端适配。
- **历史面板交互语义**：重新打开 = 载入主界面并替换当前表单+结果（可继续编辑/锁餐/再生成）；不另开只读视图。

---

## Testing Decisions

- **`lib/history.js` 必须有单测**（`lib/history.test.js`），覆盖：写入后上限 20 条且 FIFO 淘汰、删除、按 id 取单条、导出 Markdown 内容、从旧 `STORE_KEY` 结构迁移。风格对齐现有 `lib/nutrition.test.js` / `lib/generator.test.js`。
- **UI 行为以浏览器手动验证为主**：仓库无组件测试 harness，交互/视觉变更在 `npm run dev` 下人工核对（含 dev server 的 `NODE_OPTIONS` 绕过，见项目 MEMORY）。
- 测试只验外部行为（存储结果、导出内容、上限），不测内部实现细节。

---

## Out of Scope

- 移动端 / 响应式布局。
- 历史之外的其他新能力（分享图片、进度追踪、计划对比）。
- 营养算法 / 引擎改动。
- 整体换肤 / 字体大修 / 独立于历史的空状态体系。
- 竞品前端调研（已延后，方向锁定：主流营养 App / 健身向计划生成器 / 国内同类的页面与交互设计）。

---

## Further Notes

- 本 round 是现有 FitMeal 产品的增量增强，不替代 v1.0 SPEC，而是互补。
- 竞品调研建议在本次交付后单独成轮，专为重点提升"用户体验"提供对标参考。
- 关键决策已沉淀于 `docs/adr/0001-ux-round-decisions.md`（保存触发=手动、历史本地限 20、结果默认折叠）。
