# FitMeal 领域语言

FitMeal 是一个面向进阶 / 备赛健身人群的中文 AI 周饮食计划生成器：Next.js 全栈、本地营养计算引擎 + 可选本地 LLM（Ollama）。

## 语言

**锁餐（locked meal）**：
用户在结果页锁定的一餐；重生成时该餐内容保持不变。
_Avoid_: 固定餐、收藏餐

**重生成（regenerate）**：
保留全部锁餐、重新生成未锁餐次的过程；「清空锁餐重生成」先清空锁餐再完整重新生成。
_Avoid_: 刷新、再来一次

**算法引擎（engine）**：
本地确定性营养计算引擎：BMR（Henry 2005）/PAL → TDEE → 宏量目标 → 周计划。纯函数、零依赖、可单测。
_Avoid_: 本地兜底、后端

**AI 模式（AI mode）**：
由本地 LLM（Ollama qwen3）决定每餐食材组合的生成路径；分量与宏量仍由算法引擎负责。
_Avoid_: AI 引擎（易被误读为"LLM 全权生成"）

**受控选材（constrained selection）**：
AI 模式下 LLM 只能从本地食材库候选清单中挑选食材，不得发明库外食材。
_Avoid_: 自由选材

**回算（recompute）**：
AI 模式下食材确定后，由算法引擎按宏量目标核算分量与宏量的步骤。
_Avoid_: 二次计算

**生成 seed（generation seed）**：
算法模式随机化的随机源。首次生成固定 seed（可复现、演示稳定），重生成换新 seed。
_Avoid_: 随机数（未指明来源时）

**计算依据（calc）**：
结果页展示的可展开核算链：BMR → PAL → TDEE → 训练 / 休息日热量与宏量占比。
_Avoid_: 说明文字、依据

**食材库（food library）**：
本地精选食材数据集（USDA + 中国食物成分表），按 protein / carb / veg / fat 池分类；算法选材与 AI 受控选材的共同来源。
_Avoid_: 数据库、食材表
