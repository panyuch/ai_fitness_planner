# 10: 本地持久化

**What to build:** 生成结果自动存入浏览器 localStorage，刷新或误关页面后自动恢复 plan/calc，不再丢失（呼应 §13.5）。不涉及账号/云端。

**Blocked by:** 07 (输入表单 + 结果展示 + 原理面板)

**Status:** ready-for-agent

- [ ] 生成成功后写入 localStorage（plan + calc + 输入）
- [ ] 页面加载时若存在缓存则自动恢复展示
- [ ] 重新生成 / 清除时同步更新缓存
