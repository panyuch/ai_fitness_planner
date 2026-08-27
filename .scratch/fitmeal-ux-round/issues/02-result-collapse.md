# 02: 结果页信息密度：计算依据默认折叠 + 常驻一句话

**What to build:** 结果页默认只展示一句结论（目标+周期 + TDEE+每日热量），"计算依据"细节（BMR 方程、PAL 拆解、宏量占比、碳循环说明）收进可展开区，默认收起。用户点开仍可验证全部透明性。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] 结果页常驻展示：目标+周期 与 TDEE+训练日/休息日热量
- [ ] "计算依据"区块默认折叠，提供展开/收起交互
- [ ] 展开后内容与现有公式/表格一致（保留 Henry/Mifflin、PAL、宏量占比、peak week 等）
- [ ] 折叠态不喧宾夺主，展开态层次清晰
- [ ] 仅改 `app/page.js` 与 `app/globals.css`，不动计算逻辑
