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

// ticket 01：默认 seed。缺省 / 等于 DEFAULT_SEED 时输出与 v1.0 逐字节一致
// （演示可复现）；重生成传入其他 seed 启用确定性随机化（同 seed 同结果）。
export const DEFAULT_SEED = 0;

// 确定性 PRNG（mulberry32）：同 seed 必得同序列，不污染全局 Math.random，
// 保证既有单测在默认 seed 下全绿。
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildSchedule(trainFreq = 0) {
  const f = Math.max(0, Math.min(7, Math.round(trainFreq)));
  return SCHEDULES[f].slice();
}

// 单餐宏量分配（定点迭代 4 轮收敛）
function buildMeal({ dayKcal, dayProteinG, fatKcal, carbKcal, mealFrac, proteinFood, carbFood, vegFood, fatFood, extra, includeVeg = true, jitterShare = 1 }) {
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
  let carbShare = Math.max(0, carbKcalMeal) / denom;
  let fatShare = Math.max(0, fatKcalMeal) / denom;

  // ticket 01：分量浮动——直接在迭代锚点（碳脂热量份额）上施加 ±10% 扰动。
  // 若只抖动初值，4 轮定点迭代会把扰动完全抹平（每轮 cg/fg 由 remKcal 全量
  // 重算）；锚定份额则让同食材下的分量也有真实差异，同时碳水+脂肪总热量
  // 守恒（remKcal 全额分配）、蛋白目标仍由迭代反推满足，宏量照旧达标。
  if (jitterShare !== 1) {
    carbShare = Math.min(0.98, Math.max(0.02, carbShare * jitterShare));
    fatShare = 1 - carbShare;
  }

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

// 7 天 × 4 餐公共组装循环：锁餐优先 → 每餐由 pickFoods(d, mi, m) 提供食材与
// jitterShare → buildMeal 分配分量 → 汇总 day totals。
// 算法模式（generateWeek）与 AI 受控选材（buildWeekFromIds）共用，
// 差异仅在选材策略（seed 轮换 vs AI id 归类 + 缺槽位补全）。
function buildWeekLoop(calc, schedule, locked, pickFoods) {
  const days = [];
  for (let d = 0; d < 7; d++) {
    const isTrain = schedule[d] === 1;
    const dt = isTrain ? calc.train : calc.rest;
    const meals = [];

    for (let mi = 0; mi < MEALS.length; mi++) {
      const m = MEALS[mi];
      const key = `${d}-${m.key}`;

      // 锁餐：直接使用已锁定餐次（两个模式共享，锁定餐不受 seed/AI 影响）
      if (locked && locked[key]) {
        meals.push({ ...locked[key], key, label: `第${d + 1}天 ${m.label}`, locked: true });
        continue;
      }

      const { proteinFood, carbFood, vegFood, fatFood, extra, jitterShare = 1 } = pickFoods(d, mi, m);
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
        jitterShare,
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

  return { schedule, days };
}

export function generateWeek(input = {}, locked = {}, seed = DEFAULT_SEED) {
  const calc = computeMacros(input);
  const schedule = buildSchedule(input.trainFreq);

  // ticket 01：仅非默认 seed 启用随机化。锁定餐分支先于随机化执行，
  // 因此锁定餐不受 seed 影响；PRNG 调用顺序固定，保证同 seed 可复现。
  const rnd = seed === DEFAULT_SEED ? null : mulberry32(seed);
  const rint = (n) => (rnd ? Math.floor(rnd() * n) : 0);

  const pickFoods = (d, mi, m) => {
    // 食材在同类池内按 seed 派生偏移轮换（默认 seed 偏移为 0，与 v1.0 一致）
    const proteinFood = poolItem("protein", d * 4 + mi + rint(POOLS.protein.length));
    const carbFood = pickFrom(CARB_SLOT, d * 4 + mi + 1 + rint(CARB_SLOT.length));
    const vegFood = poolItem("veg", d * 4 + mi + 2 + rint(POOLS.veg.length));
    const fatFood = pickFrom(FAT_SLOT, d * 4 + mi + 3 + rint(FAT_SLOT.length));

    // ticket 14：加餐从 fruit / dairy 池取候选（乳制品轮换希腊酸奶/全脂牛奶，排除高密度奶酪）。
    // 加餐为轻食：不放蔬菜（includeVeg=false），乳制品克数压到 35g，避免其天然蛋白把主蛋白挤到 0g。
    let extra = null;
    if (m.key === "snack") {
      let useFruit, food, grams;
      if (rnd) {
        useFruit = rnd() < 0.5;
        if (useFruit) {
          food = poolItem("fruit", d + rint(POOLS.fruit.length));
          grams = 100;
        } else {
          food = rnd() < 0.5 ? getFood("milk") : getFood("greekyogurt");
          grams = 35;
        }
      } else {
        useFruit = d % 2 === 0;
        food = useFruit ? poolItem("fruit", d) : d % 4 === 1 ? getFood("milk") : getFood("greekyogurt");
        grams = useFruit ? 100 : 35; // 乳制品取 35g（希腊酸奶约 3.5g 蛋白），水果 100g
      }
      extra = { food, grams };
    }

    return {
      proteinFood,
      carbFood,
      vegFood,
      fatFood,
      extra,
      // 分量浮动：碳脂份额 ±10% 扰动（默认 1 时与 v1.0 完全一致）
      jitterShare: rnd ? 0.9 + rnd() * 0.2 : 1,
    };
  };

  return { calc, schedule, days: buildWeekLoop(calc, schedule, locked, pickFoods).days };
}

// ticket 03：AI 受控选材 → 算法定克数。
// aiDays 为 resolveAIIds 的输出（7 天 × 4 餐，每餐 items 为库内 food 对象）。
// 按 pool 归类填入 buildMeal 槽位（蛋白/碳水/蔬菜/脂肪/加餐）；AI 未给的槽位用池内
// 默认补全（保证算法可行性）；锁餐先于选材执行；分量无随机化（jitterShare=1）。
// 宏量达标由 buildMeal 定点迭代保证——LLM 幻觉被隔离在「选什么食材」这一层。
export function buildWeekFromIds(calc, schedule, aiDays, locked = {}) {
  const pickFoods = (d, mi, m) => {
    // 按池归类 AI 选材；缺槽位回退池内默认（与 generateWeek 相同的轮换索引）
    const items = aiDays[d]?.meals?.[mi]?.items || [];
    const firstOf = (pool) => items.find((f) => f.pool === pool) || null;
    const proteinFood = firstOf("protein") || poolItem("protein", d * 4 + mi);
    const carbFood = firstOf("carb") || pickFrom(CARB_SLOT, d * 4 + mi + 1);
    const vegFood = firstOf("veg") || poolItem("veg", d * 4 + mi + 2);
    const fatFood = firstOf("fat") || pickFrom(FAT_SLOT, d * 4 + mi + 3);

    // 加餐：仅 snack 餐消费 AI 选的 fruit/dairy（避免早/午/晚餐同时出现蔬菜+水果双份加餐，
    // 与算法模式结构一致）；AI 未给时 snack 餐按算法默认补（与 generateWeek 一致）
    const extraFood = m.key === "snack" ? items.find((f) => f.pool === "fruit" || f.pool === "dairy") || null : null;
    let extra = null;
    if (extraFood) {
      extra = { food: extraFood, grams: extraFood.pool === "fruit" ? 100 : 35 };
    } else if (m.key === "snack") {
      const useFruit = d % 2 === 0;
      extra = {
        food: useFruit ? poolItem("fruit", d) : d % 4 === 1 ? getFood("milk") : getFood("greekyogurt"),
        grams: useFruit ? 100 : 35,
      };
    }

    return { proteinFood, carbFood, vegFood, fatFood, extra, jitterShare: 1 };
  };

  return buildWeekLoop(calc, schedule, locked, pickFoods);
}

export default generateWeek;
