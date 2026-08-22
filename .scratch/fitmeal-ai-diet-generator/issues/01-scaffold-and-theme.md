# 01: 项目脚手架与 teal/green 主题

**What to build:** 用户执行 `npm run dev`（沙箱内先清空 `NODE_OPTIONS` 注入）后，浏览器打开 <http://localhost:3000> 看到带 teal/green 主题的应用外壳（根布局、全局样式、空主区域），无运行时报错。这是后续所有切片落地的容器。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `npm run dev`（`NODE_OPTIONS=""`）启动成功，:3000 可访问，控制台无错误
- [ ] 根布局与 `globals.css` 应用 teal/green 主题（配色 CSS 变量就位）
- [ ] `package.json` 固定 next 14.2.15 + react 18.3.1，含 dev/build 脚本
- [ ] 全中文界面骨架（`<html lang="zh">`，基础排版与字体）

