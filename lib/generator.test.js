// lib/generator.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSchedule, generateWeek, MEALS } from "./generator.js";

const SAMPLE = {
  sex: "male", age: 26, weight: 75, goal: "cut", timelineWeeks: 8, trainFreq: 5, cardioFreq: 2,
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
  const FRUIT_DAIRY = ["apple", "blueberry", "orange", "greekyogurt", "milk", "cheddar"];
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
  const lockedMeal = {
    key: "0-breakfast",
    label: "第1天 早餐",
    kcal: 500,
    p: 40,
    c: 50,
    f: 10,
    items: [{ id: "chicken", name: "鸡胸肉", grams: 150, macros: { p: 46, c: 0, f: 5, kcal: 248 } }],
    locked: true,
  };
  const { days } = generateWeek(SAMPLE, { "0-breakfast": lockedMeal });
  const got = days[0].meals.find((m) => m.key === "0-breakfast");
  assert.equal(got.locked, true);
  assert.deepEqual(got.items, lockedMeal.items);
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
