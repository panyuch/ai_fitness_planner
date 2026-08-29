// lib/generator.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSchedule, generateWeek, MEALS } from "./generator.js";

const SAMPLE = {
  sex: "male", age: 26, weight: 75, goal: "cut", timelineWeeks: 8, trainFreq: 5, cardioFreq: 2,
};

// 加餐候选池（fruit / dairy）
const FRUIT_DAIRY = ["apple", "blueberry", "orange", "greekyogurt", "milk", "cheddar"];

// 锁餐 fixture：第 1 天早餐
const LOCKED_BREAKFAST = {
  key: "0-breakfast",
  label: "第1天 早餐",
  kcal: 500,
  p: 40,
  c: 50,
  f: 10,
  items: [{ id: "chicken", name: "鸡胸肉", grams: 150, macros: { p: 46, c: 0, f: 5, kcal: 248 } }],
  locked: true,
};

test("buildSchedule: 5练 → 1101101", () => {
  assert.deepEqual(buildSchedule(5), [1, 1, 0, 1, 1, 0, 1]);
});

test("buildSchedule: 边界 0 与 7", () => {
  assert.deepEqual(buildSchedule(0), [0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(buildSchedule(7), [1, 1, 1, 1, 1, 1, 1]);
  assert.deepEqual(buildSchedule(99), [1, 1, 1, 1, 1, 1, 1]);
});

test("文档化样例：训练日2220/休息日2109，偏差≤2.6%", () => {
  const { schedule, days } = generateWeek(SAMPLE);
  const expected = schedule.map((s) => (s ? 2220 : 2109));
  days.forEach((day, i) => {
    const dev = Math.abs(day.totals.kcal - expected[i]) / expected[i];
    assert.ok(dev <= 0.026, `第${i + 1}天 热量偏差 ${(dev * 100).toFixed(2)}% 超过 2.6%`);
  });
});

test("周蛋白总和偏差 ≤1% （目标 165g/天 ×7 = 1155g）", () => {
  const { days } = generateWeek(SAMPLE);
  const weekProtein = days.reduce((a, d) => a + d.totals.p, 0);
  const dev = Math.abs(weekProtein - 1155) / 1155;
  assert.ok(dev <= 0.01, `周蛋白偏差 ${(dev * 100).toFixed(2)}% 超过 1%`);
});

test("每日宏量结构完整：4餐，每餐含食材与克数", () => {
  const { days } = generateWeek(SAMPLE);
  for (const day of days) {
    assert.equal(day.meals.length, 4);
    for (const meal of day.meals) {
      assert.ok(Array.isArray(meal.items) && meal.items.length >= 4);
      for (const it of meal.items) {
        assert.ok(it.grams > 0, `${it.name} 克数应为正`);
        assert.ok(it.macros && Number.isFinite(it.macros.kcal));
      }
    }
  }
});

test("ticket 14：加餐含 fruit/dairy 候选", () => {
  const { days } = generateWeek(SAMPLE);
  let snackSeen = 0;
  for (const day of days) {
    const snack = day.meals.find((m) => m.key.endsWith("-snack"));
    assert.ok(snack, "应有加餐");
    snackSeen++;
    const extra = snack.items.find((it) => FRUIT_DAIRY.includes(it.id));
    assert.ok(extra, `加餐应包含 fruit/dairy 食材，实际：${snack.items.map((i) => i.id).join(",")}`);
  }
  assert.equal(snackSeen, 7);
});

test("锁餐：重生成时锁定餐次保持不变，其余重新生成", () => {
  const { days } = generateWeek(SAMPLE, { "0-breakfast": LOCKED_BREAKFAST });
  const got = days[0].meals.find((m) => m.key === "0-breakfast");
  assert.equal(got.locked, true);
  assert.deepEqual(got.items, LOCKED_BREAKFAST.items);
  // 同日的其他餐应为新生成（非锁定）
  const lunch = days[0].meals.find((m) => m.key === "0-lunch");
  assert.equal(lunch.locked, false);
  assert.ok(lunch.kcal > 0);
});

test("不同目标/频率也能生成且热量为正", () => {
  for (const goal of ["bulk", "maintain"]) {
    for (const tf of [0, 2, 4, 6]) {
      const { days } = generateWeek({ sex: "female", age: 30, weight: 60, goal, trainFreq: tf, cardioFreq: 1 });
      days.forEach((d) => assert.ok(d.totals.kcal > 0, `goal=${goal} tf=${tf} 热量应>0`));
    }
  }
});

// ---- ticket 01: 算法模式重生成随机化（可注入 seed） ----

const mealSignature = (plan) =>
  plan.days.flatMap((d) => d.meals.flatMap((m) => m.items.map((it) => `${m.key}:${it.id}:${it.grams}`)));

test("seed: 缺省/默认 seed 输出与 v1.0 逐字节一致", () => {
  const legacy = generateWeek(SAMPLE);
  assert.deepEqual(generateWeek(SAMPLE, {}, 0), legacy, "seed=0 应与缺省一致");
  assert.deepEqual(generateWeek(SAMPLE, {}, undefined), legacy, "seed=undefined 应与缺省一致");
});

test("seed: 同 seed 两次生成结果一致（确定性可复现）", () => {
  assert.deepEqual(generateWeek(SAMPLE, {}, 12345), generateWeek(SAMPLE, {}, 12345));
});

test("seed: 不同 seed 生成的计划至少一餐食材或分量不同", () => {
  const a = mealSignature(generateWeek(SAMPLE, {}, 1));
  const b = mealSignature(generateWeek(SAMPLE, {}, 2));
  const diffs = a.filter((s, i) => s !== b[i]);
  assert.ok(diffs.length > 0, `seed 1/2 应产生差异，实际无差异`);
});

test("seed: 非默认 seed 下随机化生效（与默认计划不同）", () => {
  const base = mealSignature(generateWeek(SAMPLE));
  const rnd = mealSignature(generateWeek(SAMPLE, {}, 7));
  assert.ok(base.some((s, i) => s !== rnd[i]), "随机化 seed 应改变计划");
});

test("seed: 随机化下每日宏量仍达标（热量≤2.6%、周蛋白≤1%）", () => {
  for (const seed of [1, 2, 3, 7, 42, 999]) {
    const { schedule, days } = generateWeek(SAMPLE, {}, seed);
    const expected = schedule.map((s) => (s ? 2220 : 2109));
    days.forEach((day, i) => {
      const dev = Math.abs(day.totals.kcal - expected[i]) / expected[i];
      assert.ok(dev <= 0.026, `seed=${seed} 第${i + 1}天 热量偏差 ${(dev * 100).toFixed(2)}% 超过 2.6%`);
    });
    const weekProtein = days.reduce((a, d) => a + d.totals.p, 0);
    const pDev = Math.abs(weekProtein - 1155) / 1155;
    assert.ok(pDev <= 0.01, `seed=${seed} 周蛋白偏差 ${(pDev * 100).toFixed(2)}% 超过 1%`);
  }
});

test("seed: 随机化下结构完整，加餐仍含 fruit/dairy", () => {
  const { days } = generateWeek(SAMPLE, {}, 9);
  for (const day of days) {
    assert.equal(day.meals.length, 4);
    for (const meal of day.meals) {
      assert.ok(meal.items.length >= 4, `${meal.key} 应含完整食材`);
    }
    const snack = day.meals.find((m) => m.key.endsWith("-snack"));
    const extra = snack.items.find((it) => FRUIT_DAIRY.includes(it.id));
    assert.ok(extra, `加餐应含 fruit/dairy，实际：${snack.items.map((i) => i.id).join(",")}`);
  }
});

test("seed: 锁餐 + 随机化——锁定餐纹丝不动、未锁餐变化", () => {
  const lockedArg = { "0-breakfast": LOCKED_BREAKFAST };
  for (const seed of [1, 5, 77]) {
    const { days } = generateWeek(SAMPLE, lockedArg, seed);
    const got = days[0].meals.find((m) => m.key === "0-breakfast");
    assert.equal(got.locked, true);
    assert.deepEqual(got.items, LOCKED_BREAKFAST.items, `seed=${seed} 锁定餐应保持不变`);
  }
  // 未锁餐在不同 seed 间应变化
  const a = generateWeek(SAMPLE, lockedArg, 1);
  const b = generateWeek(SAMPLE, lockedArg, 2);
  const lunchSig = (p) => p.days[0].meals.find((m) => m.key === "0-lunch").items.map((it) => `${it.id}:${it.grams}`).join(",");
  assert.notEqual(lunchSig(a), lunchSig(b), "未锁餐在不同 seed 下应变化");
});

test("seed: 同食材组合的餐跨 seed 分量必变（份额锚定生效）", () => {
  // 定向断言：找到食材组合完全相同、但 seed 不同的餐，其克数必须不同——
  // 证明分量浮动真实生效，而不是只靠食材轮换制造"变化"。
  let checked = 0, changed = 0;
  for (let sa = 1; sa <= 20; sa++) {
    for (let sb = sa + 1; sb <= 20; sb++) {
      const a = generateWeek(SAMPLE, {}, sa);
      const b = generateWeek(SAMPLE, {}, sb);
      for (let d = 0; d < 7; d++) {
        for (let mi = 0; mi < 4; mi++) {
          const ma = a.days[d].meals[mi];
          const mb = b.days[d].meals[mi];
          const ida = ma.items.map((i) => i.id).join(",");
          const idb = mb.items.map((i) => i.id).join(",");
          if (ida !== idb) continue;
          checked++;
          const ga = ma.items.map((i) => i.grams).join(",");
          const gb = mb.items.map((i) => i.grams).join(",");
          if (ga !== gb) changed++;
        }
      }
    }
  }
  assert.ok(checked >= 1, `seed 1..20 对之间应存在食材组合相同的餐（前提校验，checked=${checked}）`);
  assert.equal(changed, checked, `同食材组合的餐分量应全部不同（checked=${checked}, changed=${changed}）`);
});
