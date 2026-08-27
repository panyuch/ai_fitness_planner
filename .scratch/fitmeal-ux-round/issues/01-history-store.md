# 01: 历史存储模块 lib/history.js（含迁移 + 上限 20 + 单测）

**What to build:** 一个纯函数模块，封装计划历史的本地读写：写入新计划、列出全部、按 id 取单条、删除、导出为 Markdown；写入时上限 20 条（超出 FIFO 淘汰最旧）；首次运行时把旧的单一计划 `STORE_KEY` 结构迁移进历史。该模块是后续历史 UI 的唯一数据源，与 React/DOM 解耦以便单测。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] 提供 add / list / get(id) / remove(id) / exportMarkdown(entry) 纯函数
- [ ] 写入时若超过 20 条，淘汰最旧（FIFO）
- [ ] 读取时若检测到旧 `STORE_KEY` 单计划结构，迁移为历史首条并清理旧 key
- [ ] 所有函数不依赖 React / DOM，仅用 localStorage（注入或守卫）
- [ ] 配套 `lib/history.test.js`，覆盖上限淘汰、删除、取单条、导出内容、迁移
- [ ] 不动 `lib/nutrition.js` / `lib/generator.js` 等引擎
