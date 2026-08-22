// lib/nutrition.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeBMR, computePAL, computeTDEE, computeMacros } from "./nutrition.js";

// --- computeBMR: Henry 2005 年龄分组 ---
test("Henry BMR 男 26岁/75kg → 1745", () => {
  const { bmr, equation } = computeBMR({ sex: "male", age: 26, weight: 75 });
  assert.equal(equation, "henry");
  assert.equal(bmr, 1745); // 16.0*75 + 545
});

test("Henry BMR 女 26岁/55kg → 1279", () => {
  const { bmr } = computeBMR({ sex: "female", age: 26, weight: 55 });
  assert.equal(bmr, Math.round(13.1 * 55 + 558)); // 1278.5 → 1279
});

test("Henry BMR 男 ≥60岁 走 14.2·W+593", () => {
  const { bmr } = computeBMR({ sex: "male", age: 65, weight: 75 });
  assert.equal(bmr, Math.round(14.2 * 75 + 593)); // 1658
});

test("Henry BMR 男 30-60 与 ≥60 同式", () => {
  const a = computeBMR({ sex: "male", age: 45, weight: 80 }).bmr;
  const b = computeBMR({ sex: "male", age: 70, weight: 80 }).bmr;
  assert.equal(a, b);
});

// --- ticket 12: 身高进入 BMR (Mifflin-St Jeor) ---
test("Mifflin BMR 含身高且不同于 Henry", () => {
  const henry = computeBMR({ sex: "male", age: 26, weight: 75 }).bmr;
  const mifflin = computeBMR({ sex: "male", age: 26, weight: 75, height: 180, bmrEquation: "mifflin" });
  assert.equal(mifflin.equation, "mifflin");
  // 10*75 + 6.25*180 - 5*26 + 5 = 750 + 1125 - 130 + 5 = 1750
  assert.equal(mifflin.bmr, 1750);
  assert.notEqual(mifflin.bmr, henry);
});

test("Mifflin 身高不同 → BMR 不同（身高确实参与）", () => {
  const a = computeBMR({ sex: "male", age: 26, weight: 75, height: 170, bmrEquation: "mifflin" }).bmr;
  const b = computeBMR({ sex: "male", age: 26, weight: 75, height: 190, bmrEquation: "mifflin" }).bmr;
  assert.equal(b - a, 6.25 * 20); // 每 cm 影响 6.25 kcal
});

test("Mifflin 但缺身高 → 回退 Henry", () => {
  const r = computeBMR({ sex: "male", age: 26, weight: 75, bmrEquation: "mifflin" });
  assert.equal(r.equation, "henry");
  assert.equal(r.bmr, 1745);
});

// --- computePAL: 训练频率 ---
test("PAL 训练频率分档", () => {
  assert.equal(computePAL({ trainFreq: 0 }), 1.2);
  assert.equal(computePAL({ trainFreq: 1 }), 1.375);
  assert.equal(computePAL({ trainFreq: 3 }), 1.55);
  assert.equal(computePAL({ trainFreq: 6 }), 1.725);
  assert.equal(computePAL({ trainFreq: 7 }), 1.725);
});

test("PAL 工作性质加成", () => {
  assert.equal(computePAL({ trainFreq: 0, workType: "light" }), 1.25);
  assert.equal(computePAL({ trainFreq: 0, workType: "heavy" }), 1.35);
});

test("PAL 有氧加成（含 cardio.freq 兼容）", () => {
  assert.equal(computePAL({ trainFreq: 0, cardioFreq: 2 }), 1.24); // 2*0.02=0.04
  assert.equal(computePAL({ trainFreq: 0, cardio: { freq: 2 } }), 1.24);
  assert.equal(computePAL({ trainFreq: 0, cardioFreq: 20 }), 1.3); // min(0.1, ...)
});

// --- ticket 13: steps / intensity 进入 PAL ---
test("PAL 步数提升 NEAT", () => {
  assert.equal(computePAL({ trainFreq: 0, steps: 0 }), 1.2);
  assert.equal(computePAL({ trainFreq: 0, steps: 10000 }), 1.3); // 10000/1000*0.01 = 0.10
});

test("PAL 强度加成", () => {
  assert.equal(computePAL({ trainFreq: 0, intensity: "mid" }), 1.23);
  assert.equal(computePAL({ trainFreq: 0, intensity: "high" }), 1.26);
});

test("PAL 钳制上限 1.9", () => {
  const p = computePAL({ trainFreq: 7, workType: "heavy", cardioFreq: 20, steps: 30000, intensity: "high" });
  assert.equal(p, 1.9);
});

test("PAL 钳制下限 1.2", () => {
  assert.equal(computePAL({ trainFreq: 0, steps: 0, intensity: "low" }), 1.2);
});

// --- computeMacros: 文档化验证样例 ---
test("文档化样例 26男75kg cut 5练 cardioFreq2 → 2220/2109/165", () => {
  const m = computeMacros({
    sex: "male", age: 26, weight: 75, goal: "cut", timelineWeeks: 8, trainFreq: 5, cardioFreq: 2,
  });
  assert.equal(m.bmr, 1745);
  assert.equal(m.pal, 1.59);
  assert.equal(m.tdee, 2775);
  assert.equal(m.phaseKcal, 2220); // 训练日
  assert.equal(m.restKcal, 2109); // 休息日 95%
  assert.equal(m.proteinG, 165); // 2.2*75
});

test("阶段热量缺口/盈余封顶", () => {
  const cutShort = computeMacros({ weight: 75, goal: "cut", timelineWeeks: 4, trainFreq: 3, cardioFreq: 2 });
  const cutLong = computeMacros({ weight: 75, goal: "cut", timelineWeeks: 12, trainFreq: 3, cardioFreq: 2 });
  // ≤8周 -20%，>8周 -15%
  const tdee = cutShort.tdee;
  assert.equal(cutShort.phaseKcal, Math.round(tdee * 0.8));
  assert.equal(cutLong.phaseKcal, Math.round(tdee * 0.85));

  const bulkShort = computeMacros({ weight: 75, goal: "bulk", timelineWeeks: 4 });
  const bulkLong = computeMacros({ weight: 75, goal: "bulk", timelineWeeks: 12 });
  assert.equal(bulkShort.phaseAdjustPct, 0.12);
  assert.equal(bulkLong.phaseAdjustPct, 0.1);
});

test("蛋白 g/kg 分配", () => {
  assert.equal(computeMacros({ weight: 75, goal: "cut" }).proteinG, 165);
  assert.equal(computeMacros({ weight: 75, goal: "bulk" }).proteinG, 150);
  assert.equal(computeMacros({ weight: 75, goal: "maintain" }).proteinG, 135);
});

test("碳循环：碳水为剩余项补足", () => {
  const m = computeMacros({ sex: "male", age: 26, weight: 75, goal: "cut", timelineWeeks: 8, trainFreq: 5, cardioFreq: 2 });
  // 训练日 2220 - 蛋白660 - 脂肪(0.25*2220=555) = 1005
  assert.equal(m.train.fatKcal, 555);
  assert.equal(m.train.carbKcal, 1005);
  // 休息日 2109 - 660 - 脂肪(0.35*2109=738) ≈ 711
  assert.equal(m.rest.fatKcal, Math.round(0.35 * 2109));
  assert.equal(m.rest.carbKcal, 2109 - 660 - Math.round(0.35 * 2109));
});

test("cut 生成备赛充碳提示", () => {
  const m = computeMacros({ weight: 75, goal: "cut" });
  assert.ok(Array.isArray(m.peakWeek));
  assert.match(m.peakWeek[0], /75/); // 体重×1
  assert.match(m.peakWeek[1], /338/); // 75*4.5 = 337.5 → 338
});

test("maintain 无充碳提示", () => {
  const m = computeMacros({ weight: 75, goal: "maintain" });
  assert.equal(m.peakWeek, null);
});
