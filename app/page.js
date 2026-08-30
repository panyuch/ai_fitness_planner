"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import * as history from "../lib/history.js";

const GUIDE_KEY = "fitmeal:guideSeen";

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

function CardGroup({ options, value, onChange, example }) {
  return (
    <>
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
      {example ? <FieldHint>例：{example}</FieldHint> : null}
    </>
  );
}

function NumberField({ label, value, onChange, min, max, step = 1, hint, example }) {
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
      {example ? <FieldHint>例：{example}</FieldHint> : null}
    </div>
  );
}

function FieldHint({ children }) {
  return <p className="field-example">{children}</p>;
}

export default function Page() {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [result, setResult] = useState(null);
  const [locked, setLocked] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyEntries, setHistoryEntries] = useState([]);
  const [historyCount, setHistoryCount] = useState(0);
  const [guideOpen, setGuideOpen] = useState(false);
  // ticket 04：AI 生成开关——开启后请求携带 useAI（后端走受控选材闭环，
  // 失败/超时自动回退本地并返回 degraded 标记）
  const [useAI, setUseAI] = useState(false);
  // ticket 01：重生成 seed 计数器——首次生成不携带（默认 seed 可复现），
  // 每次「重生成 / 清空锁餐重生成」递增携带，驱动算法模式食材轮换 + 分量浮动。
  const seedRef = useRef(0);

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const refreshHistory = useCallback(() => {
    const items = history.list();
    setHistoryEntries(items);
    setHistoryCount(items.length);
  }, []);

  // 启动：迁移旧单计划进历史（如存在）并恢复为当前工作区；初始化历史；首次向导
  useEffect(() => {
    try {
      const { entry } = history.ensureMigrated();
      if (entry) {
        if (entry.form) setForm({ ...DEFAULT_FORM, ...entry.form });
        if (entry.result) setResult(entry.result);
        setLocked(entry.locked || {});
      }
    } catch {
      /* ignore */
    }
    refreshHistory();
    try {
      if (!localStorage.getItem(GUIDE_KEY)) setGuideOpen(true);
    } catch {
      /* ignore */
    }
  }, [refreshHistory]);

  const gen = useCallback(
    async (useLocked, isRegen = false) => {
      setLoading(true);
      setError(null);
      try {
        const { bmrEquation, ...input } = form;
        // 重生成换新 seed（1, 2, 3…），首次生成不带 seed
        const seed = isRegen ? ++seedRef.current : undefined;
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input, locked: useLocked ? locked : {}, seed, useAI }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "生成失败");
          return;
        }
        setResult(data);
      } catch (e) {
        setError("网络错误：" + e.message);
      } finally {
        setLoading(false);
      }
    },
    [form, locked, useAI]
  );

  const toggleLock = (meal) => {
    setLocked((prev) => {
      const next = { ...prev };
      if (next[meal.key]) delete next[meal.key];
      else next[meal.key] = meal;
      return next;
    });
  };

  const clearLocks = () => setLocked({});

  const closeGuide = () => {
    setGuideOpen(false);
    try {
      localStorage.setItem(GUIDE_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  const downloadMd = (md) => {
    if (!md) return;
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "fitmeal-plan.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  const saveToHistory = () => {
    if (!result) return;
    history.add(form, result);
    refreshHistory();
  };

  const exportCurrent = () => {
    if (!result) return;
    downloadMd(
      history.exportMarkdown({ form, result, savedAt: new Date().toISOString() })
    );
  };

  const openHistoryEntry = (id) => {
    const entry = history.get(id);
    if (!entry) return;
    if (entry.form) setForm({ ...DEFAULT_FORM, ...entry.form });
    setResult(entry.result || null);
    setLocked(entry.locked || {});
    setHistoryOpen(false);
  };

  const removeHistoryEntry = (id) => {
    if (!window.confirm("确定删除这条历史计划？此操作不可恢复。")) return;
    history.remove(id);
    refreshHistory();
  };

  const openHistoryPanel = () => {
    refreshHistory();
    setHistoryOpen(true);
  };

  return (
    <main className="app">
      <div className="app-header">
        <div className="app-logo">🥗</div>
        <div>
          <h1 className="app-title">FitMeal · AI 饮食计划生成器</h1>
          <p className="app-sub">本地化营养计算 · 透明可解释 · 零运行时外部依赖</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-ghost" onClick={openHistoryPanel}>
            🕘 历史
            {historyCount > 0 ? <span className="count-badge">{historyCount}</span> : null}
          </button>
        </div>
      </div>

      {guideOpen ? <FirstRunGuide onDone={closeGuide} /> : null}

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
              <NumberField label="年龄" value={form.age} min={14} max={100} onChange={(v) => setField("age", v)} example="18–60 常见" />
              <NumberField label="体重 (kg)" value={form.weight} min={30} max={250} onChange={(v) => setField("weight", v)} example="60–80 常见" />
            </div>
            <div className="input-row">
              <NumberField label="身高 (cm)" value={form.height} min={120} max={230} onChange={(v) => setField("height", v)} example="160–185 常见" />
              <div className="field" style={{ flex: 1 }} />
            </div>
            <details className="adv-fields">
              <summary>⚙️ 高级：体脂率（选填）</summary>
              <div className="adv-body">
                <NumberField label="体脂率 (%)" value={form.bodyFat} min={3} max={60} onChange={(v) => setField("bodyFat", v)} example="15（只用于展示，不影响热量计算）" />
              </div>
            </details>
          </section>

          <section className="panel">
            <h2 className="panel-title">目标与周期</h2>
            <div className="field">
              <div className="field-label"><span>目标</span></div>
              <CardGroup options={GOAL_OPTS} value={form.goal} onChange={(v) => setField("goal", v)} />
            </div>
            <div className="input-row">
              <NumberField label="周期 (周)" value={form.timelineWeeks} min={1} max={52} onChange={(v) => setField("timelineWeeks", v)} example="备赛常见 8–12 周" />
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
              <FieldHint>0=不练 · 3=入门 · 5=进阶 · 6–7=高频率</FieldHint>
            </div>
            <details className="adv-fields">
              <summary>⚙️ 高级设置：分化 / 强度 / 工作性质 / 步数 / 有氧</summary>
              <div className="adv-body">
                <div className="field">
                  <div className="field-label"><span>分化类型</span></div>
                  <CardGroup options={SPLIT_OPTS} value={form.splitType} onChange={(v) => setField("splitType", v)} example="推拉腿=按部位拆分的经典安排" />
                </div>
                <div className="field">
                  <div className="field-label"><span>训练强度</span></div>
                  <CardGroup options={INTENSITY_OPTS} value={form.intensity} onChange={(v) => setField("intensity", v)} example="中=接近力竭为主" />
                </div>
                <div className="field">
                  <div className="field-label"><span>工作性质</span></div>
                  <CardGroup options={WORK_OPTS} value={form.workType} onChange={(v) => setField("workType", v)} example="久坐=办公室为主" />
                </div>
                <div className="input-row">
                  <NumberField label="日均步数" value={form.steps} min={0} max={40000} step={500} onChange={(v) => setField("steps", v)} example="5000–12000 常见" />
                  <NumberField label="每周有氧 (次)" value={form.cardioFreq} min={0} max={14} onChange={(v) => setField("cardioFreq", v)} example="0–3 常见" />
                </div>
              </div>
            </details>
          </section>

          {/* ticket 04：AI 生成开关——算法模式（默认）与 AI 模式（本机 Ollama 受控选材） */}
          <div className={"opt ai-toggle" + (useAI ? " selected" : "")} onClick={() => setUseAI((v) => !v)} role="switch" aria-checked={useAI} tabIndex={0}>
            🤖 AI 生成
            <span className="opt-sub">本机 Ollama 选食材 · 约需 1 分钟</span>
          </div>
          <p className="field-example">
            开启后由本机 Ollama（qwen3:8b）挑选常见食材，克数与宏量仍由算法引擎精确分配；需先启动 Ollama 并拉取模型，不可用时自动回退算法引擎。
          </p>

          <button className="btn btn-primary btn-block" disabled={loading} onClick={() => gen(false)}>
            {loading ? <span className="spinner" /> : null}
            {loading
              ? useAI
                ? "本地模型生成中，约需 1 分钟…"
                : "生成中…"
              : useAI
                ? "🤖 AI 生成我的周计划"
                : "⚡ 生成我的周计划"}
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
              onRegen={() => gen(true, true)}
              onClearAndRegen={() => {
                clearLocks();
                gen(false, true);
              }}
              onExport={exportCurrent}
              onSave={saveToHistory}
            />
          )}
        </div>
      </div>

      <HistoryPanel
        open={historyOpen}
        entries={historyEntries}
        onClose={() => setHistoryOpen(false)}
        onOpen={openHistoryEntry}
        onRemove={removeHistoryEntry}
        onExport={(e) => downloadMd(history.exportMarkdown(e))}
      />
    </main>
  );
}

// ---------------- 结果视图 ----------------
function ResultView({ form, result, locked, onToggleLock, onRegen, onClearAndRegen, onExport, onSave }) {
  const { calc, plan, usedAI, degraded } = result;
  return (
    <>
      <section className="panel">
        <div className="result-head">
          <h2 className="panel-title" style={{ margin: 0 }}>
            你的周计划
            <span className={"badge " + (usedAI ? "badge-ai" : "badge-local")}>
              {usedAI ? "AI 模式" : "算法引擎"}
            </span>
          </h2>
          <div className="btn-row">
            <SaveButton onSave={onSave} />
            <button className="btn btn-ghost" onClick={onRegen}>🔄 重生成（保留锁餐）</button>
            <button className="btn btn-ghost" onClick={onClearAndRegen}>🗑 清空锁餐重生成</button>
            <button className="btn btn-ghost" onClick={onExport}>⬇ 导出 Markdown</button>
          </div>
        </div>

        {/* ticket 04：AI 请求失败/超时回退本地时的降级提示 */}
        {degraded ? (
          <div className="degrade-banner">
            ⚠️ 本次由算法引擎生成（Ollama 未运行 / 模型缺失 / 生成超时，已自动回退，结果完整可用）
          </div>
        ) : null}

        {/* 一句话结论（常驻，ticket 02）：目标+周期 + TDEE + 每日热量 */}
        <div className="result-summary">
          <div className="rs-goal">🎯 {history.goalText(calc.goal)} · {form.timelineWeeks} 周</div>
          <div className="rs-kcal">
            <span>
              <TermTip term="TDEE">一天总消耗，维持体重所需热量</TermTip> <b>{calc.tdee}</b> kcal
            </span>
            <span>训练日 <b>{calc.phaseKcal}</b> kcal</span>
            <span>休息日 <b>{calc.restKcal}</b> kcal</span>
          </div>
        </div>

        {plan.days.map((day) => (
          <DayCard key={day.day} day={day} locked={locked} onToggleLock={onToggleLock} />
        ))}

        <PrinciplePanel form={form} calc={calc} />

        <div className="disclaimer">⚠️ {history.DISCLAIMER}</div>
      </section>
    </>
  );
}

function SaveButton({ onSave }) {
  const [saved, setSaved] = useState(false);
  return (
    <button
      className="btn btn-primary"
      onClick={() => {
        onSave();
        setSaved(true);
        window.setTimeout(() => setSaved(false), 2000);
      }}
    >
      {saved ? "✓ 已保存" : "💾 保存此计划"}
    </button>
  );
}

// 术语白话解释（ticket 05）：下划虚线词 + 悬停气泡
function TermTip({ term, children }) {
  return (
    <span className="term-tip" tabIndex={0}>
      {term}
      <span className="term-bubble">{children}</span>
    </span>
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
      <summary>📐 计算依据（展开查看公式与宏量占比）</summary>
      <div className="principle-body">
        <p>本计划的热量与宏量分配完全在本地计算，以下为所用公式与你的参数。</p>

        <div className="glossary-row">
          <TermTip term="BMR">基础代谢率：躺着不动一天也要消耗的热量</TermTip>
          <TermTip term="PAL">活动系数：日常活动水平的倍率</TermTip>
          <TermTip term="碳循环">训练日高碳水、休息日低碳水的安排</TermTip>
          <TermTip term="宏量">蛋白 / 碳水 / 脂肪三大营养素</TermTip>
        </div>

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
          {`阶段热量（目标 ${history.goalText(calc.goal)}，周期 ${form.timelineWeeks} 周）：\n` +
            `  调整 ${Math.round(calc.phaseAdjustPct * 100)}%  →  训练日 ${calc.phaseKcal} kcal\n` +
            `  ${calc.goal === "cut" ? `休息日 = 训练日 × 95% = ${calc.restKcal} kcal（放大碳循环）` : `休息日 = ${calc.restKcal} kcal`}\n` +
            `蛋白: ${calc.proteinPerKg} g/kg × ${form.weight}kg = ${calc.proteinG} g/天`}
        </div>

        <table>
          <thead>
            <tr><th>类型</th><th>碳水占比</th><th>脂肪占比</th><th>蛋白</th></tr>
          </thead>
          <tbody>
            <tr><td>训练日</td><td>{history.pct(calc.train.carbPct)}</td><td>{history.pct(calc.train.fatPct)}</td><td rowSpan="2">{calc.proteinG} g</td></tr>
            <tr><td>休息日</td><td>{history.pct(calc.rest.carbPct)}</td><td>{history.pct(calc.rest.fatPct)}</td></tr>
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

// ---------------- 首次欢迎向导（ticket 06） ----------------
function FirstRunGuide({ onDone }) {
  const [step, setStep] = useState(1);
  return (
    <div className="guide-card">
      <button className="guide-close" onClick={onDone} aria-label="关闭">✕</button>
      {step === 1 ? (
        <>
          <div className="guide-title">👋 欢迎使用 FitMeal</div>
          <p className="guide-desc">生成一份 7 天饮食计划只需 3 步：</p>
          <ol className="guide-steps">
            <li><b>填写左侧表单</b> — 核心几项就够，高级设置已折叠可跳过</li>
            <li><b>点「⚡ 生成我的周计划」</b> — 立即得到 7 天食谱</li>
            <li><b>满意就点「💾 保存此计划」</b> — 存进历史，随时找回</li>
          </ol>
          <div className="guide-actions">
            <button className="btn btn-ghost" onClick={onDone}>跳过</button>
            <button className="btn btn-primary" onClick={() => setStep(2)}>下一步 →</button>
          </div>
        </>
      ) : (
        <>
          <div className="guide-title">💡 小提示</div>
          <p className="guide-desc">
            所有计算都在本地完成，不上传任何数据。历史计划最多保留最近 20 条；
            老版本保存过的计划会自动迁移进历史，不会丢失。
          </p>
          <div className="guide-actions">
            <button className="btn btn-primary" onClick={onDone}>开始使用 🚀</button>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------- 历史侧滑面板（ticket 08） ----------------
function HistoryPanel({ open, entries, onClose, onOpen, onRemove, onExport }) {
  return (
    <>
      <div className={"overlay" + (open ? " show" : "")} onClick={onClose} />
      <aside className={"history-panel" + (open ? " open" : "")} aria-hidden={!open}>
        <div className="hp-head">
          <h2>🕘 计划历史</h2>
          <button className="hp-close" onClick={onClose} aria-label="关闭">✕</button>
        </div>
        <p className="hp-sub">手动保存的计划 · 最多保留最近 20 条</p>
        {entries.length === 0 ? (
          <div className="hp-empty">
            <div className="big">🗂️</div>
            <p>还没有保存过的计划。</p>
            <p className="section-note">生成计划后，点结果页的「💾 保存此计划」即可存入这里。</p>
          </div>
        ) : (
          <ul className="hp-list">
            {entries.map((e) => (
              <li key={e.id} className="hp-item">
                <div className="hp-item-main">
                  <div className="hp-item-title">
                    <b>{history.goalText(e.summary.goal)} · {e.summary.timelineWeeks} 周</b>
                    <span className="hp-time">{fmtTime(e.savedAt)}</span>
                  </div>
                  <div className="hp-item-meta">
                    TDEE {e.summary.tdee} kcal ｜ 训练日 {e.summary.phaseKcal} · 休息日 {e.summary.restKcal} kcal
                  </div>
                </div>
                <div className="hp-item-actions">
                  <button className="btn btn-small" onClick={() => onOpen(e.id)}>打开</button>
                  <button className="btn btn-small" onClick={() => onExport(e)}>导出</button>
                  <button className="btn btn-small btn-danger" onClick={() => onRemove(e.id)}>删除</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </>
  );
}

// ---------------- 小工具 ----------------
const basePalText = (f) =>
  f >= 6 ? "1.725" : f >= 3 ? "1.55" : f >= 1 ? "1.375" : "1.2";
const workText = (w) => ({ sedentary: "0", light: "+0.05", heavy: "+0.15" }[w] || "0");
const cardioText = (c) => `min(0.1, ${(c || 0) * 0.02})`;
const stepsText = (s) => `min(0.15, ${((s || 0) / 1000) * 0.01})`;
const intensityText = (i) => ({ low: "0", mid: "+0.03", high: "+0.06" }[i] || "0");
const fmtTime = (iso) => {
  try {
    return new Date(iso).toLocaleString("zh-CN", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
};
