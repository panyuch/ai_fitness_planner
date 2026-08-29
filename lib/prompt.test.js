// lib/prompt.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { PROVIDERS, detectProvider } from "./prompt.js";

// ---- ticket 02: Ollama provider 注册与探测顺序 ----

test("detectProvider: 云端 key 优先于 Ollama（deepseek > dashscope > ollama）", () => {
  assert.equal(detectProvider({ DEEPSEEK_API_KEY: "x" }), "deepseek");
  assert.equal(detectProvider({ DASHSCOPE_API_KEY: "x" }), "dashscope");
  assert.equal(detectProvider({ DEEPSEEK_API_KEY: "x", DASHSCOPE_API_KEY: "x" }), "deepseek");
  // 无云端 key → 回落到本机 Ollama（连接失败由调用方快速回退本地引擎）
  assert.equal(detectProvider({}), "ollama");
  assert.equal(detectProvider({ DEEPSEEK_API_KEY: "", DASHSCOPE_API_KEY: "" }), "ollama");
});

test("detectProvider: 默认使用 process.env", () => {
  const orig = process.env;
  try {
    process.env = {};
    assert.equal(detectProvider(), "ollama");
  } finally {
    process.env = orig;
  }
});

test("PROVIDERS.ollama: 本机 OpenAI 兼容端点 + qwen3:8b，无需 API key", () => {
  const p = PROVIDERS.ollama;
  assert.ok(p, "应注册 ollama provider");
  assert.equal(p.baseURL, "http://localhost:11434/v1/chat/completions");
  assert.equal(p.model, "qwen3:8b");
  assert.equal(p.envKey, undefined, "Ollama 不需要 envKey");
  assert.equal(p.enableThinking, false, "qwen3 需显式关闭 thinking");
});
