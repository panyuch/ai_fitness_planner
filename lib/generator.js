// lib/generator.js
// 周计划生成器：训练日排程 + 4 餐拆分 + 定点迭代使全天宏量达标 + 锁餐重生成。
// 纯函数、零依赖、可单测。

import { computeMacros } from "./nutrition.js";
import { poolItem, getFood, pickFrom, POOLS, FOODS } from "./foods.js";

// 最瘦蛋白（每克蛋白热量最低），用于小餐（如加餐）空间不足时的兜底
const LEAN_PROTEIN = [...POOLS.protein].sort((a, b) => a.kcal / a.p - b.kcal / b.p)[0];

// 碳水槽位：仅用低蛋白主食（米饭/土豆/红薯/芋头/南瓜，蛋白 ≤3g/100g）。
// 玉米(4g)、燕麦/全麦面包(13g) 蛋白偏高，在大份量下其天然蛋白会逼近甚至超过小餐的
// 蛋白目标，把主蛋白挤到 0g。它们仍保留在食材库，仅不进入自动主碳水槽位。
const CARB_SLOT = FOODS.filter((f) => f.pool === "carb" && f.p <= 3);
// 脂肪槽位：橄榄油（0 蛋白）+ 牛油果（2g/100g），排除杏仁（蛋白/热量密度过高）。
const FAT_SLOT = FOODS.filter((f) => f.pool === "fat" && f.id !== "almond");

// 训练日排程模式表：保证训练日分布且穿插休息
const SCHEDULES = {
  0: [0, 0, 0, 0, 0, 0, 0],
  1: [1, 0, 0, 0, 0, 0, 0],
  2: [1, 0, 0, 1, 0, 0, 0],
  3: [1, 0, 1, 0, 1, 0, 0],
  4: [1, 0, 1, 1, 0, 1, 0],
  5: [1, 1, 0, 1, 1, 0, 1], // 1101101
  6: [1, 1, 1, 1, 1, 0, 1],
  7: [1, 1, 1, 1, 1, 1, 1],
};

// 餐次拆分（占全天比例）
export const MEALS = [
  { key: "breakfast", label: "早餐", frac: 0.25 },
  { key: "lunch", label: "午餐", frac: 0.35 },
  { key: "dinner", label: "晚餐", frac: 0.3 },
  { key: "snack", label: "加餐", frac: 0.1 },
];

const VEG_GRAMS = 150; // 每餐蔬菜固定 150g
const ITER_ROUNDS = 4;

export function buildSchedule(trainFreq = 0) {
  const f = Math.max(0, Math.min(7, Math.round(trainFreq)));
  return SCHEDULES[f].slice();
}

// 单餐宏量分配（定点迭代 4 轮收敛）
function buildMeal({ dayKcal, dayProteinG, fatKcal, carbKcal, mealFrac, proteinFood, carbFood, vegFood, fatFood, extra, includeVeg = true }) {
  const mealProtein = dayProteinG * mealFrac;
  const mealKcal = dayKcal * mealFrac;
  const fatKcalMeal = fatKcal * mealFrac;
  const carbKcalMeal = carbKcal * mealFrac;

  // 加餐为轻食：不放蔬菜（避免 150g 蔬菜 + 加餐 + 主食的天然蛋白超过小餐蛋白目标）
  let vegGrams = includeVeg ? VEG_GRAMS : 0;
  let vegKcal = (vegGrams * vegFood.kcal) / 100;
  let vegP = (vegGrams * vegFood.p) / 100;

  // 加餐候选（fruit / dairy）：固定克数，其热量从碳水/脂肪池扣除
  let extraItem = null;
  let extraGrams = extra ? extra.grams : 0;
  let extraKcal = 0;
  let extraP = 0;
  if (extra) {
    extraKcal = (extraGrams * extra.food.kcal) / 100;
    extraP = (extraGrams * extra.food.p) / 100;
    extraItem = { id: extra.food.id, name: extra.food.name, grams: extraGrams, macros: foodMacros(extra.food, extraGrams) };
  }

  // 自适应：极小餐（如久坐减脂的加餐约 150 kcal）放不下 150g 蔬菜 + 加餐 + 主蛋白时，
  // 按比例缩减蔬菜/加餐，为主蛋白与碳水/脂肪各留份额，保证可行且全天精度达标。
  const minProteinKcal = (mealProtein * LEAN_PROTEIN.kcal) / LEAN_PROTEIN.p;
  const vegExtraKcal = vegKcal + extraKcal;
  const fixedKcalTarget = mealKcal * 0.82;
  if (minProteinKcal + vegExtraKcal > fixedKcalTarget && vegExtraKcal > 0) {
    const scale = Math.max(0.15, (fixedKcalTarget - minProteinKcal) / vegExtraKcal);
    vegGrams = Math.max(30, Math.round(vegGrams * scale));
    if (extra) extraGrams = Math.max(20, Math.round(extraGrams * scale));
    vegKcal = (vegGrams * vegFood.kcal) / 100;
    vegP = (vegGrams * vegFood.p) / 100;
    if (extra) {
      extraKcal = (extraGrams * extra.food.kcal) / 100;
      extraP = (extraGrams * extra.food.p) / 100;
      extraItem = { id: extra.food.id, name: extra.food.name, grams: extraGrams, macros: foodMacros(extra.food, extraGrams) };
    }
  }

  // 碳水/脂肪能量配比（保持 day 的碳脂比例）。钳制非负，避免 carbKcal 因
  // 蛋白+脂肪目标超过全天热量而变负，导致碳水份额为负、碳水被挤到 0g。
  const denom = Math.max(1, carbKcalMeal + fatKcalMeal);
  const carbShare = Math.max(0, carbKcalMeal) / denom;
  const fatShare = Math.max(0, fatKcalMeal) / denom;

  // 可行性兜底：若所选主蛋白过"密"（小餐放不下 蛋白+蔬菜+加餐），切换为最瘦蛋白
  const kcalForProtein = (mealProtein * proteinFood.kcal) / proteinFood.p;
  const headroom = mealKcal - kcalForProtein - vegKcal - extraKcal;
  if (headroom < mealKcal * 0.12) {
    proteinFood = LEAN_PROTEIN;
  }

  // 初值：蛋白食物承担全天该餐蛋白；碳水/脂肪按各自热量目标取克数（碳水克数非负）
  let cg = Math.max(0, (carbKcalMeal * 100) / carbFood.kcal);
  let fg = Math.max(0, (fatKcalMeal * 100) / fatFood.kcal);

  for (let r = 0; r < ITER_ROUNDS; r++) {
    // 蔬菜 + 碳水 + 脂肪 + 加餐 的天然蛋白
    const naturalP =
      ((cg * carbFood.p) / 100) +
      ((fg * fatFood.p) / 100) +
      vegP +
      extraP;

    // 反推主蛋白真实需求
    const needP = Math.max(0, mealProtein - naturalP);
    const pg = (needP * 100) / proteinFood.p;
    const proteinKcal = (pg * proteinFood.kcal) / 100;

    // 主蛋白少用的热量回填到碳水/脂肪
    const remKcal = mealKcal - proteinKcal - vegKcal - extraKcal;
    cg = Math.max(0, ((remKcal * carbShare) * 100) / carbFood.kcal);
    fg = Math.max(0, ((remKcal * fatShare) * 100) / fatFood.kcal);
  }

  // 蛋白安全兜底：若碳水/脂肪/蔬菜/加餐的"天然蛋白"已逼近或超过本餐蛋白目标，
  // 主蛋白会被挤到 0g。此时把部分碳水热量转移到脂肪（近乎 0 蛋白），在保持本餐热量
  // 不变的前提下降低天然蛋白，为主蛋白留出份额。脂肪比碳水更低蛋白密度才成立。
  const carbPPerKcal = carbFood.p / carbFood.kcal;
  const fatPPerKcal = fatFood.p / fatFood.kcal;
  if (carbPPerKcal > fatPPerKcal) {
    let guard = 0;
    while (guard++ < 24) {
      const natP = (cg * carbFood.p) / 100 + (fg * fatFood.p) / 100 + vegP + extraP;
      if (natP <= mealProtein * 0.9 || cg <= 20) break;
      const over = natP - mealProtein * 0.9;
      const shiftKcal = over / (carbPPerKcal - fatPPerKcal); // 需从碳水转移到脂肪的热量
      cg = Math.max(20, cg - (shiftKcal * 100) / carbFood.kcal);
      fg = fg + (shiftKcal * 100) / fatFood.kcal;
    }
  }

  // 末轮后，用最终 cg/fg 重新计算主蛋白，保证全天蛋白 = 目标
  const naturalPFinal =
    ((cg * carbFood.p) / 100) + ((fg * fatFood.p) / 100) + vegP + extraP;
  const needPFinal = Math.max(0, mealProtein - naturalPFinal);
  const pg = (needPFinal * 100) / proteinFood.p;

  const items = [
    { id: proteinFood.id, name: proteinFood.name, grams: pg, macros: foodMacros(proteinFood, pg) },
    { id: carbFood.id, name: carbFood.name, grams: cg, macros: foodMacros(carbFood, cg) },
  ];
  if (includeVeg) items.push({ id: vegFood.id, name: vegFood.name, grams: vegGrams, macros: foodMacros(vegFood, vegGrams) });
  items.push({ id: fatFood.id, name: fatFood.name, grams: fg, macros: foodMacros(fatFood, fg) });
  if (extraItem) items.push(extraItem);

  const totals = items.reduce(
    (acc, it) => {
      acc.p += it.macros.p;
      acc.c += it.macros.c;
      acc.f += it.macros.f;
      acc.kcal += it.macros.kcal;
      return acc;
    },
    { p: 0, c: 0, f: 0, kcal: 0 }
  );

  return {
    p: round1(totals.p),
    c: round1(totals.c),
    f: round1(totals.f),
    kcal: Math.round(totals.kcal),
    items: items.map((it) => ({ ...it, grams: round1(it.grams) })),
  };
}

function foodMacros(food, grams) {
  const p = (grams * food.p) / 100;
  const c = (grams * food.c) / 100;
  const f = (grams * food.f) / 100;
  // 热量口径与分配时一致（标签 kcal），避免 Atwater 估算与标签值偏差导致全天热量漂移
  const kcal = (grams * food.kcal) / 100;
  return { p: round1(p), c: round1(c), f: round1(f), kcal: Math.round(kcal) };
}

const round1 = (v) => Math.round(v * 10) / 10;

export function generateWeek(input = {}, locked = {}) {
  const calc = computeMacros(input);
  const schedule = buildSchedule(input.trainFreq);

  const days = [];
  for (let d = 0; d < 7; d++) {
    const isTrain = schedule[d] === 1;
    const dt = isTrain ? calc.train : calc.rest;
    const meals = [];

    for (let mi = 0; mi < MEALS.length; mi++) {
      const m = MEALS[mi];
      const key = `${d}-${m.key}`;

      // 锁餐：重生成时跳过，直接使用已锁定餐次
      if (locked && locked[key]) {
        meals.push({ ...locked[key], key, label: `第${d + 1}天 ${m.label}`, locked: true });
        continue;
      }

      const proteinFood = poolItem("protein", d * 4 + mi);
      const carbFood = pickFrom(CARB_SLOT, d * 4 + mi + 1);
      const vegFood = poolItem("veg", d * 4 + mi + 2);
      const fatFood = pickFrom(FAT_SLOT, d * 4 + mi + 3);

      // ticket 14：加餐从 fruit / dairy 池取候选（乳制品轮换希腊酸奶/全脂牛奶，排除高密度奶酪）。
      // 加餐为轻食：不放蔬菜（includeVeg=false），乳制品克数压到 35g，避免其天然蛋白把主蛋白挤到 0g。
      let extra = null;
      if (m.key === "snack") {
        const useFruit = d % 2 === 0;
        const food = useFruit ? poolItem("fruit", d) : d % 4 === 1 ? getFood("milk") : getFood("greekyogurt");
        const grams = useFruit ? 100 : 35; // 乳制品取 35g（希腊酸奶约 3.5g 蛋白），水果 100g
        extra = { food, grams };
      }

      const built = buildMeal({
        dayKcal: dt.kcal,
        dayProteinG: calc.proteinG,
        fatKcal: dt.fatKcal,
        carbKcal: dt.carbKcal,
        mealFrac: m.frac,
        proteinFood,
        carbFood,
        vegFood,
        fatFood,
        extra,
        includeVeg: m.key !== "snack",
      });

      meals.push({ key, label: `第${d + 1}天 ${m.label}`, ...built, locked: false });
    }

    const totals = meals.reduce(
      (acc, m) => {
        acc.kcal += m.kcal;
        acc.p += m.p;
        acc.c += m.c;
        acc.f += m.f;
        return acc;
      },
      { kcal: 0, p: 0, c: 0, f: 0 }
    );

    days.push({
      day: d,
      isTrain,
      label: `第${d + 1}天`,
      totals: {
        kcal: Math.round(totals.kcal),
        p: round1(totals.p),
        c: round1(totals.c),
        f: round1(totals.f),
      },
      meals,
    });
  }

  return { calc, schedule, days };
}

export default generateWeek;
