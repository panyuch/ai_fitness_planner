"use client";

import { useState, useEffect, useCallback } from "react";

const DISCLAIMER =
  "本计划为通用营养参考，不构成医疗 / 临床营养建议；特殊健康状况、孕期、慢病等请遵医嘱；备赛 / 脱水等高风险操作需专业监督。";

const DEFAULT_FORM = {
  sex: "male",
  age: 26,
  weight: 75,
  height: 178,
  bodyFat: "",
  goal: "cut",
  timelineWeeks: 8,
  trainFreq: 5,
  splitType: "推拉腿(PPL)",
  intensity: "mid",
  workType: "sedentary",
  steps: 8000,
  cardioFreq: 2,
};

const STORE_KEY = "fitmeal:v1";

const SEX_OPTS = [
  { value: "male", label: "男" },
  { value: "female", label: "女" },
];
const GOAL_OPTS = [
  { value: "cut", label: "减脂", sub: "cut" },
  { value: "bulk", label: "增肌", sub: "bulk" },
  { value: "maintain", label: "维持", sub: "maintain" },
];
const INTENSITY_OPTS = [
  { value: "low", label: "低" },
  { value: "mid", label: "中" },
  { value: "high", label: "高" },
];
const WORK_OPTS = [
  { value: "sedentary", label: "久坐" },
  { value: "light", label: "轻度活动" },
  { value: "heavy", label: "重度体力" },
];
const SPLIT_OPTS = [
  { value: "推拉腿(PPL)", label: "推拉腿(PPL)" },
  { value: "上下肢分化", label: "上下肢" },
  { value: "全身训练", label: "全身" },
];
const TRAIN_FREQ = [0, 1, 2, 3, 4, 5, 6, 7];

function CardGroup({ options, value, onChange }) {
  return (
    <div className="opt-grid">
      {options.map((o) => (
        <div
          key={o.value}
          className={"opt" + (value === o.value ? " selected" : "")}
          onClick={() => onChange(o.value)}
        >
          {o.label}
          {o.sub ? <span className="opt-sub">{o.sub}</span> : null}
        </div>
      ))}
    </div>
  );
}

function NumberField({ label, value, onChange, min, max, step = 1, hint }) {
  return (
    <div className="field">
      <div className="field-label">
        <span>{label}</span>
        {hint ? <span className="hint">{hint}</span> : null}
      </div>
      <input
        className="num-input"
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
      />
    </div>
  );
}

export default function Page() {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [result, setResult] = useState(null);
  const [locked, setLocked] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [restored, setRestored] = useState(false);

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // 自动恢复 localStorage（ticket 10）
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d.form) setForm(d.form);
        if (d.locked) setLocked(d.locked);
        if (d.result) setResult(d.result);
      }
    } catch {
      /* ignore */
    }
    setRestored(true);
  }, []);

  const persist = useCallback((nextForm, nextLocked, nextResult) => {
    try {
      localStorage.setItem(
        STORE_KEY,
        JSON.stringify({ form: nextForm, locked: nextLocked, result: nextResult })
      );
    } catch {
      /* ignore */
    }
  }, []);

  const gen = useCallback(
    async (useLocked) => {
      setLoading(true);
      setError(null);
      try {
        const { bmrEquation, ...input } = form;
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input, locked: useLocked ? locked : {} }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "生成失败");
          return;
        }
        setResult(data);
        persist(form, useLocked ? locked : {}, data);
      } catch (e) {
        setError("网络错误：" + e.message);
      } finally {
        setLoading(false);
      }
    },
    [form, locked, persist]
  );

  const toggleLock = (meal) => {
    setLocked((prev) => {
      const next = { ...prev };
      if (next[meal.key]) delete next[meal.key];
      else next[meal.key] = meal;
      if (result) persist(form, next, result);
      return next;
    });
  };

  const clearLocks = () => {
    setLocked({});
    if (result) persist(form, {}, result);
  };

  const exportMd = () => {
    if (!result) return;
    const md = buildMarkdown(form, result);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "fitmeal-plan.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="app">
      <div className="app-header">
        <div className="app-logo">🥗</div>
        <div>
          <h1 className="app-title">FitMeal · AI 饮食计划生成器</h1>
          <p className="app-sub">本地化营养计算 · 透明可解释 · 零运行时外部依赖</p>
        </div>
      </div>

      <div className="layout">
        {/* ---------------- 左栏：表单 ---------------- */}
        <div>
          <section className="panel">
            <h2 className="panel-title">基本信息</h2>
            <div className="field">
              <div className="field-label"><span>性别</span></div>
              <CardGroup options={SEX_OPTS} value={form.sex} onChange={(v) => setField("sex", v)} />
            </div>
            <div className="input-row">
              <NumberField label="年龄" value={form.age} min={14} max={100} onChange={(v) => setField("age", v)} />
              <NumberField label="体重 (kg)" value={form.weight} min={30} max={250} onChange={(v) => setField("weight", v)} />
            </div>
            <div className="input-row">
              <NumberField label="身高 (cm)" value={form.height} min={120} max={230} onChange={(v) => setField("height", v)} />
              <NumberField label="体脂率 (选填)" value={form.bodyFat} onChange={(v) => setField("bodyFat", v)} />
            </div>
          </section>

          <section className="panel">
            <h2 className="panel-title">目标与周期</h2>
            <div className="field">
              <div className="field-label"><span>目标</span></div>
              <CardGroup options={GOAL_OPTS} value={form.goal} onChange={(v) => setField("goal", v)} />
            </div>
            <div className="input-row">
              <NumberField label="周期 (周)" value={form.timelineWeeks} min={1} max={52} onChange={(v) => setField("timelineWeeks", v)} />
              <div className="field" style={{ flex: 1 }}>
                <div className="field-label"><span>BMR 方程</span><span className="hint">自动选择</span></div>
                <p className="field-note">系统会按你填写的「身高」自动选用更精确的方程：填了身高 → Mifflin-St Jeor（含身高）；未填 → Henry 2005。结果页「计算依据」会标明实际采用的方程。</p>
              </div>
            </div>
          </section>

          <section className="panel">
            <h2 className="panel-title">训练与活动</h2>
            <div className="field">
              <div className="field-label"><span>每周训练频率</span><span className="hint">{form.trainFreq} 次/周</span></div>
              <div className="opt-grid">
                {TRAIN_FREQ.map((n) => (
                  <div
                    key={n}
                    className={"opt" + (form.trainFreq === n ? " selected" : "")}
                    onClick={() => setField("trainFreq", n)}
                  >
                    {n}
                  </div>
                ))}
              </div>
            </div>
            <div className="field">
              <div className="field-label"><span>分化类型</span><span className="hint">展示文案</span></div>
              <CardGroup options={SPLIT_OPTS} value={form.splitType} onChange={(v) => setField("splitType", v)} />
            </div>
            <div className="field">
              <div className="field-label"><span>训练强度</span></div>
              <CardGroup options={INTENSITY_OPTS} value={form.intensity} onChange={(v) => setField("intensity", v)} />
            </div>
            <div className="field">
              <div className="field-label"><span>工作性质</span></div>
              <CardGroup options={WORK_OPTS} value={form.workType} onChange={(v) => setField("workType", v)} />
            </div>
            <div className="input-row">
              <NumberField label="日均步数" value={form.steps} min={0} max={40000} step={500} onChange={(v) => setField("steps", v)} />
              <NumberField label="每周有氧 (次)" value={form.cardioFreq} min={0} max={14} onChange={(v) => setField("cardioFreq", v)} />
            </div>
          </section>

          <button className="btn btn-primary btn-block" disabled={loading} onClick={() => gen(false)}>
            {loading ? <span className="spinner" /> : null}
            {loading ? "生成中…" : "⚡ 生成我的周计划"}
          </button>
          {error ? <p className="section-note" style={{ color: "var(--danger)" }}>{error}</p> : null}
        </div>

        {/* ---------------- 右栏：结果 ---------------- */}
        <div>
          {!result ? (
            <section className="panel">
              <div className="empty">
                <div className="big">🍽️</div>
                <p>填写左侧信息，点击「生成我的周计划」查看 7 天饮食方案。</p>
                <p className="section-note">计算逻辑完全在本地完成，不收集你的任何数据。</p>
              </div>
            </section>
          ) : (
            <ResultView
              form={form}
              result={result}
              locked={locked}
              onToggleLock={toggleLock}
              onRegen={() => gen(true)}
              onClearAndRegen={() => {
                clearLocks();
                gen(false);
              }}
              onExport={exportMd}
            />
          )}
        </div>
      </div>
    </main>
  );
}

function ResultView({ form, result, locked, onToggleLock, onRegen, onClearAndRegen, onExport }) {
  const { calc, plan, usedAI } = result;
  return (
    <>
      <section className="panel">
        <div className="result-head">
          <h2 className="panel-title" style={{ margin: 0 }}>
            你的周计划
            <span className={"badge " + (usedAI ? "badge-ai" : "badge-local")}>
              {usedAI ? "AI 模式" : "本地引擎"}
            </span>
          </h2>
          <div className="btn-row">
            <button className="btn btn-ghost" onClick={onRegen}>🔄 重生成（保留锁餐）</button>
            <button className="btn btn-danger" onClick={onClearAndRegen}>🗑 清空锁餐重生成</button>
            <button className="btn btn-primary" onClick={onExport}>⬇ 导出 Markdown</button>
          </div>
        </div>

        {/* 计算依据汇总条 */}
        <div className="calc-strip">
          <Cell k="BMR" v={calc.bmr} u="kcal" sub={calc.equation === "mifflin" ? "Mifflin" : "Henry"} />
          <Cell k="PAL" v={calc.pal} u="" />
          <Cell k="TDEE" v={calc.tdee} u="kcal" />
          <Cell k="训练日" v={calc.phaseKcal} u="kcal" />
          <Cell k="休息日" v={calc.restKcal} u="kcal" />
          <Cell k="每日蛋白" v={calc.proteinG} u="g" sub={`${calc.proteinPerKg} g/kg`} />
        </div>

        {plan.days.map((day) => (
          <DayCard key={day.day} day={day} locked={locked} onToggleLock={onToggleLock} />
        ))}

        <PrinciplePanel form={form} calc={calc} />

        <div className="disclaimer">⚠️ {DISCLAIMER}</div>
      </section>
    </>
  );
}

function Cell({ k, v, u, sub }) {
  return (
    <div className="calc-cell">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
      <div className="u">{u}{sub ? ` · ${sub}` : ""}</div>
    </div>
  );
}

function DayCard({ day, locked, onToggleLock }) {
  const t = day.totals;
  const pK = t.p * 4, cK = t.c * 4, fK = t.f * 9;
  const sum = pK + cK + fK || 1;
  const pPct = (pK / sum) * 100, cPct = (cK / sum) * 100, fPct = (fK / sum) * 100;
  return (
    <div className={"day-card" + (day.isTrain ? "" : " rest")}>
      <div className="day-head">
        <span className="day-title">{day.label}</span>
        <span className={"day-tag " + (day.isTrain ? "train" : "rest")}>
          {day.isTrain ? "训练日" : "休息日"}
        </span>
      </div>

      <div className="macro-bar">
        <span style={{ width: `${pPct}%`, background: "var(--c-protein)" }} />
        <span style={{ width: `${cPct}%`, background: "var(--c-carb)" }} />
        <span style={{ width: `${fPct}%`, background: "var(--c-fat)" }} />
      </div>
      <div className="macro-legend">
        <span><i style={{ background: "var(--c-protein)" }} />蛋白 {Math.round(t.p)}g</span>
        <span><i style={{ background: "var(--c-carb)" }} />碳水 {Math.round(t.c)}g</span>
        <span><i style={{ background: "var(--c-fat)" }} />脂肪 {Math.round(t.f)}g</span>
        <span>全天 {t.kcal} kcal</span>
      </div>

      {day.meals.map((meal) => (
        <MealRow key={meal.key} meal={meal} locked={!!locked[meal.key]} onToggleLock={onToggleLock} />
      ))}
    </div>
  );
}

function MealRow({ meal, locked, onToggleLock }) {
  return (
    <div className="meal">
      <button
        className={"meal-lock" + (locked ? " on" : "")}
        title={locked ? "已锁定（重生成保留）" : "点击锁定此餐"}
        onClick={() => onToggleLock(meal)}
      >
        {locked ? "🔒" : "🔓"}
      </button>
      <div className="meal-body">
        <div className="meal-title">
          <span>{meal.label}</span>
          <span className="kcal">{meal.kcal} kcal</span>
        </div>
        <div className="foods">
          {meal.items.map((it, i) => (
            <span className="food-chip" key={i}>
              <b>{it.name}</b> {Math.round(it.grams)}g
            </span>
          ))}
        </div>
        <div className="meal-macros">
          <span className="p">蛋白 {Math.round(meal.p)}g</span>
          <span className="c">碳水 {Math.round(meal.c)}g</span>
          <span className="f">脂肪 {Math.round(meal.f)}g</span>
        </div>
      </div>
    </div>
  );
}

function PrinciplePanel({ form, calc }) {
  const isHenry = calc.equation === "henry";
  return (
    <details className="principle">
      <summary>📐 计算依据（Principle · 透明可解释）</summary>
      <div className="principle-body">
        <p>本计划的热量与宏量分配完全在本地计算，以下为所用公式与你的参数。</p>

        <div className="formula">
          {isHenry
            ? `BMR（Henry 2005）· ${form.sex === "female" ? "女" : "男"}\n` +
              `  18–30岁: ${form.sex === "female" ? "13.1·W + 558" : "16.0·W + 545"}\n` +
              `  30–60岁: ${form.sex === "female" ? "9.74·W + 694" : "14.2·W + 593"}\n` +
              `  60+岁:   同上\n` +
              `  代入 W=${form.weight}kg, 年龄${form.age} → BMR = ${calc.bmr} kcal`
            : `BMR（Mifflin-St Jeor，含身高）\n` +
              `  ${form.sex === "female" ? "女: 10·W + 6.25·H − 5·A − 161" : "男: 10·W + 6.25·H − 5·A + 5"}\n` +
              `  代入 W=${form.weight}kg, H=${form.height}cm, A=${form.age} → BMR = ${calc.bmr} kcal`}
        </div>

        <div className="formula">
          {`PAL = 训练频率基准 + 工作性质 + 有氧 + 步数 + 强度\n` +
            `  = 基准(${basePalText(form.trainFreq)}) + 工作(${workText(form.workType)}) + 有氧(${cardioText(form.cardioFreq)})\n` +
            `  + 步数(${stepsText(form.steps)}) + 强度(${intensityText(form.intensity)})\n` +
            `  → 钳制 [1.2, 1.9] = ${calc.pal}\n` +
            `TDEE = BMR × PAL = ${calc.bmr} × ${calc.pal} = ${calc.tdee} kcal`}
        </div>

        <div className="formula">
          {`阶段热量（目标 ${goalText(calc.goal)}，周期 ${form.timelineWeeks} 周）：\n` +
            `  调整 ${Math.round(calc.phaseAdjustPct * 100)}%  →  训练日 ${calc.phaseKcal} kcal\n` +
            `  ${calc.goal === "cut" ? `休息日 = 训练日 × 95% = ${calc.restKcal} kcal（放大碳循环）` : `休息日 = ${calc.restKcal} kcal`}\n` +
            `蛋白: ${calc.proteinPerKg} g/kg × ${form.weight}kg = ${calc.proteinG} g/天`}
        </div>

        <table>
          <thead>
            <tr><th>类型</th><th>碳水占比</th><th>脂肪占比</th><th>蛋白</th></tr>
          </thead>
          <tbody>
            <tr><td>训练日</td><td>{pct(calc.train.carbPct)}</td><td>{pct(calc.train.fatPct)}</td><td rowSpan="2">{calc.proteinG} g</td></tr>
            <tr><td>休息日</td><td>{pct(calc.rest.carbPct)}</td><td>{pct(calc.rest.fatPct)}</td></tr>
          </tbody>
        </table>
        <p className="section-note">碳循环：训练日高碳促合成，休息日低碳控热量；蛋白按 g/kg 恒定。</p>

        {calc.peakWeek ? (
          <div className="callout">
            <b>🏆 备赛充碳周提示（peak week）</b>
            <ol style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {calc.peakWeek.map((s, i) => (<li key={i}>{s}</li>))}
            </ol>
          </div>
        ) : null}
      </div>
    </details>
  );
}

const pct = (x) => `${Math.round(x * 100)}%`;
const goalText = (g) => ({ cut: "减脂", bulk: "增肌", maintain: "维持" }[g] || g);
const basePalText = (f) =>
  f >= 6 ? "1.725" : f >= 3 ? "1.55" : f >= 1 ? "1.375" : "1.2";
const workText = (w) => ({ sedentary: "0", light: "+0.05", heavy: "+0.15" }[w] || "0");
const cardioText = (c) => `min(0.1, ${(c || 0) * 0.02})`;
const stepsText = (s) => `min(0.15, ${((s || 0) / 1000) * 0.01})`;
const intensityText = (i) => ({ low: "0", mid: "+0.03", high: "+0.06" }[i] || "0");

// ---------------- Markdown 导出 ----------------
function buildMarkdown(form, result) {
  const { calc, plan } = result;
  const L = [];
  L.push(`# FitMeal 周饮食计划`);
  L.push("");
  L.push(`> 生成时间：${new Date().toLocaleString("zh-CN")} · 本地计算 · 非商业 Demo`);
  L.push("");
  L.push(`## 一、计算依据`);
  L.push("");
  L.push(`- 性别/年龄/体重/身高：${form.sex === "female" ? "女" : "男"} / ${form.age}岁 / ${form.weight}kg / ${form.height}cm`);
  L.push(`- BMR 方程：${calc.equation === "mifflin" ? "Mifflin-St Jeor（含身高）" : "Henry 2005"} → **${calc.bmr} kcal**`);
  L.push(`- PAL：${calc.pal}（钳制 [1.2,1.9]）`);
  L.push(`- TDEE：${calc.tdee} kcal`);
  L.push(`- 目标：${goalText(calc.goal)} · 周期 ${form.timelineWeeks} 周 · 阶段调整 ${Math.round(calc.phaseAdjustPct * 100)}%`);
  L.push(`- 每日热量：训练日 **${calc.phaseKcal} kcal** / 休息日 **${calc.restKcal} kcal**`);
  L.push(`- 每日蛋白：${calc.proteinG} g（${calc.proteinPerKg} g/kg）`);
  L.push(`- 宏量占比：训练日 碳水 ${pct(calc.train.carbPct)} / 脂肪 ${pct(calc.train.fatPct)}；休息日 碳水 ${pct(calc.rest.carbPct)} / 脂肪 ${pct(calc.rest.fatPct)}`);
  if (calc.peakWeek) {
    L.push("");
    L.push(`- 备赛充碳周提示：`);
    calc.peakWeek.forEach((s) => L.push(`  - ${s}`));
  }
  L.push("");
  L.push(`## 二、7 天饮食计划`);
  L.push("");
  plan.days.forEach((day) => {
    L.push(`### ${day.label}（${day.isTrain ? "训练日" : "休息日"}）`);
    L.push("");
    L.push(`全天：${day.totals.kcal} kcal ｜ 蛋白 ${Math.round(day.totals.p)}g ｜ 碳水 ${Math.round(day.totals.c)}g ｜ 脂肪 ${Math.round(day.totals.f)}g`);
    L.push("");
    day.meals.forEach((m) => {
      const foods = m.items.map((it) => `${it.name} ${Math.round(it.grams)}g`).join(" + ");
      L.push(`- **${m.label}**：${foods}`);
      L.push(`  - 单餐 ${m.kcal} kcal ｜ 蛋白 ${Math.round(m.p)}g ｜ 碳水 ${Math.round(m.c)}g ｜ 脂肪 ${Math.round(m.f)}g`);
    });
    L.push("");
  });
  L.push(`## 三、免责声明`);
  L.push("");
  L.push(DISCLAIMER);
  L.push("");
  return L.join("\n");
}
