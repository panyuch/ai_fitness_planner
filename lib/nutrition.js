// lib/nutrition.js
// 纯函数营养计算引擎：BMR / PAL / TDEE / 阶段热量 / 宏量分配。
// 零依赖、可在 Node 与浏览器端运行，便于单测与透明展示。

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const round = (v) => Math.round(v);

// ---------------------------------------------------------------------------
// BMR —— Henry (2005) / Oxford 方程（按年龄分组，仅用体重）
// 来源：Nutrients 2023 Table 1
// ---------------------------------------------------------------------------
function henryBMR(sex, age, weight) {
  // 30–60 与 60+ 分组方程相同，合并处理
  let b;
  if (sex === "female") {
    b = age < 30 ? 13.1 * weight + 558 : 9.74 * weight + 694;
  } else {
    // male（默认）
    b = age < 30 ? 16.0 * weight + 545 : 14.2 * weight + 593;
  }
  return Math.round(b);
}

// ---------------------------------------------------------------------------
// BMR —— Mifflin-St Jeor 方程（含身高，ticket 12）
// 男：10·W + 6.25·H − 5·A + 5 ；女：10·W + 6.25·H − 5·A − 161
// W=kg, H=cm, A=岁。身高缺失时回退 Henry。
// ---------------------------------------------------------------------------
function mifflinBMR(sex, age, weight, height) {
  if (!Number.isFinite(height) || height <= 0) return null;
  const base = 10 * weight + 6.25 * height - 5 * age;
  const sexAdj = sex === "female" ? -161 : 5;
  return Math.round(base + sexAdj);
}

export function computeBMR(input = {}) {
  const { sex = "male", age = 30, weight = 70, height, bmrEquation } = input;
  // 默认 Henry（与 SPEC §4.1 及文档化验证样例一致）；
  // 显式选择 mifflin 且提供身高时，切换为含身高方程（ticket 12）。
  const useMifflin = bmrEquation === "mifflin";
  const usedEquation = useMifflin && Number.isFinite(height) && height > 0 ? "mifflin" : "henry";
  const bmr = usedEquation === "mifflin" ? mifflinBMR(sex, age, weight, height) : henryBMR(sex, age, weight);
  return { bmr, equation: usedEquation };
}

// ---------------------------------------------------------------------------
// PAL —— 活动系数（ticket 02 基础 + ticket 13 steps/intensity 增强）
// ---------------------------------------------------------------------------
export function computePAL(input = {}) {
  const {
    trainFreq = 0,
    workType = "sedentary",
    cardioFreq,
    cardio,
    steps = 0,
    intensity = "low",
  } = input;

  // 兼容两种字段名：cardioFreq 与 cardio.freq
  const cf = Number.isFinite(cardioFreq)
    ? cardioFreq
    : cardio && Number.isFinite(cardio.freq)
    ? cardio.freq
    : 0;

  let pal;
  if (trainFreq >= 6) pal = 1.725;
  else if (trainFreq >= 3) pal = 1.55;
  else if (trainFreq >= 1) pal = 1.375;
  else pal = 1.2;

  if (workType === "heavy") pal += 0.15;
  else if (workType === "light") pal += 0.05;

  pal += Math.min(0.1, cf * 0.02); // 有氧
  pal += Math.min(0.15, (steps || 0) / 1000 * 0.01); // 步数 -> NEAT（ticket 13）
  if (intensity === "mid") pal += 0.03; // 训练强度（ticket 13）
  else if (intensity === "high") pal += 0.06;

  return clamp(Number(pal.toFixed(3)), 1.2, 1.9); // 钳制 [1.2, 1.9]
}

export function computeTDEE(bmr, pal) {
  return Math.round(bmr * pal);
}

// ---------------------------------------------------------------------------
// 阶段热量与宏量分配
// ---------------------------------------------------------------------------
const PHASE_ADJUST = {
  // [≤8周调整, >8周调整, 封顶]
  cut: { short: -0.2, long: -0.15, cap: -0.2 },
  bulk: { short: 0.12, long: 0.1, cap: 0.15 },
  maintain: { short: 0, long: 0, cap: 0 },
};

const PROTEIN_PER_KG = { cut: 2.2, bulk: 2.0, maintain: 1.8 };

// 碳水 / 脂肪占比（轻量碳循环：训练日高碳、休息日低碳）
const MACRO_PCT = {
  cut: { train: { carb: 0.45, fat: 0.25 }, rest: { carb: 0.3, fat: 0.35 } },
  bulk: { train: { carb: 0.5, fat: 0.22 }, rest: { carb: 0.4, fat: 0.3 } },
  maintain: { train: { carb: 0.45, fat: 0.28 }, rest: { carb: 0.35, fat: 0.33 } },
};

// 备赛充碳周提示（peak week），仅 cut
function buildPeakWeekHint(weight) {
  const deplete = Math.round(weight * 1); // 碳水耗竭 ~1 g/kg
  const load = Math.round(weight * 4.5); // 充碳 ~4.5 g/kg
  return [
    `赛前 1 周先做 2–3 天碳水耗竭（约 ${deplete} g/天，即 体重×1）。`,
    `赛前 1–2 天充碳至约 ${load} g/天（即 体重×4.5），并同步调整水分。`,
    `水 / 钠（脱水）调控属高风险操作，仅提示、不在工具内一键执行。`,
  ];
}

export function computeMacros(input = {}) {
  const {
    sex = "male",
    age = 30,
    weight = 70,
    height,
    goal = "maintain",
    timelineWeeks = 8,
    trainFreq = 0,
    workType = "sedentary",
    cardioFreq,
    cardio,
    steps = 0,
    intensity = "low",
    bmrEquation,
  } = input;

  const { bmr, equation } = computeBMR({ sex, age, weight, height, bmrEquation });
  const pal = computePAL({ trainFreq, workType, cardioFreq, cardio, steps, intensity });
  const tdee = computeTDEE(bmr, pal);

  const ph = PHASE_ADJUST[goal] || PHASE_ADJUST.maintain;
  const adjust = timelineWeeks <= 8 ? ph.short : ph.long;
  const cappedAdjust = clamp(adjust, ph.cap < 0 ? ph.cap : -Infinity, ph.cap > 0 ? ph.cap : Infinity);

  const phaseKcal = Math.round(tdee * (1 + cappedAdjust));
  // 休息日热量：仅减脂目标下取阶段热量的 95%（放大碳循环幅度）
  const restKcal = goal === "cut" ? Math.round(phaseKcal * 0.95) : phaseKcal;

  const proteinPerKg = PROTEIN_PER_KG[goal] ?? PROTEIN_PER_KG.maintain;
  // 可行性上限：蛋白热量不超过当日总消耗(TDEE)的 40%。
  // 极端体重 + 激进减脂时，2.2g/kg 的蛋白目标会超过全天热量预算，
  // 把碳水/脂肪挤到 0g（生成器无法落盘）。正常体重下该上限不会触发。
  const PROTEIN_KCAL_CAP = 0.4;
  const rawProteinG = Math.round(proteinPerKg * weight);
  const maxProteinG = Math.floor((tdee * PROTEIN_KCAL_CAP) / 4);
  const proteinG = Math.min(rawProteinG, maxProteinG);
  const proteinKcal = proteinG * 4;

  const pct = MACRO_PCT[goal] ?? MACRO_PCT.maintain;

  const dayTargets = (kcal, p) => {
    const fatKcal = Math.round(kcal * p.fat);
    const carbKcal = Math.round(kcal - proteinKcal - fatKcal); // 碳水作为剩余项补足
    return {
      kcal,
      carbPct: p.carb,
      fatPct: p.fat,
      proteinKcal,
      fatKcal,
      carbKcal,
    };
  };

  const train = dayTargets(phaseKcal, pct.train);
  const rest = dayTargets(restKcal, pct.rest);

  return {
    bmr,
    equation,
    pal,
    tdee,
    goal,
    timelineWeeks,
    phaseAdjustPct: cappedAdjust,
    phaseKcal,
    restKcal,
    proteinPerKg,
    proteinG,
    train,
    rest,
    peakWeek: goal === "cut" ? buildPeakWeekHint(weight) : null,
    inputs: { sex, age, weight, height, goal, timelineWeeks, trainFreq, workType, cardioFreq, cardio, steps, intensity },
  };
}

export default { computeBMR, computePAL, computeTDEE, computeMacros };
