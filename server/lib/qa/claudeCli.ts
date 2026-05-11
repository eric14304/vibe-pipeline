import { QA_BEHAVIOR_PROMPT } from "./systemPrompt";
import type { QAReply } from "./schema";
import type { TicketSpec } from "../../../shared/types";
import { isTestMode, nextQAReply } from "../testMode";
import { projectHash } from "../hash";
import { getTaskConfigWithAdapter } from "../userConfig";

export class ClaudeCliError extends Error {
  constructor(public code: "not_available" | "exec_failed" | "parse_failed", message: string) {
    super(message);
  }
}

export async function checkAvailable(): Promise<boolean> {
  // Mock 模式:跳過 spawn,假裝 claude 在,讓 e2e 不依賴 user 機器有沒有裝
  if (isTestMode()) return true;
  // 依 user config 的 QA provider 檢查對應 CLI(未設 → claude)
  const cfg = await getTaskConfigWithAdapter("qa");
  return cfg.adapter.checkAvailable();
}

type RunOpts = {
  cwd: string;
  sessionId: string;
  userMessage: string;
  isFirstTurn: boolean;
  // 收斂進度提示:caller (qa.ts route) 計算後傳進來,讓 AI 知道目前狀態
  progressHint?: string;
  // pipeline 內既有 ticket 摘要,/qa/start 時 snapshot 進 draft;每輪都 append 進 system prompt
  pipelineContext?: string;
  // 之前已完成的輪次(不含本輪 userMessage)。
  // claude:不需要(--resume 從 session 接續);codex:必須,沒 session resume 會失憶。
  history?: Array<{ role: "user" | "assistant"; content: string }>;
};

// Run one turn through claude CLI. First turn supplies session-id + system prompt,
// follow-up turns use --resume with the same session id.
export async function runTurn({
  cwd,
  sessionId,
  userMessage,
  isFirstTurn,
  progressHint,
  pipelineContext,
  history,
}: RunOpts): Promise<QAReply> {
  // E2E mock:從 testMode store 拿下一筆 scripted reply。不 spawn 真 claude。
  // 走 enforceContract 通過保留跟 real 模式同樣的 spec coercion / completeness check。
  if (isTestMode()) {
    void sessionId;
    void userMessage;
    void isFirstTurn;
    void progressHint;
    void pipelineContext;
    const reply = nextQAReply(projectHash(cwd));
    return enforceContract(reply);
  }

  const qaCfg = await getTaskConfigWithAdapter("qa");
  // perf:QA 是 server-controlled feature,system prompt 自己定完整契約,不該被 user 個人設定 / project hooks /
  // MCP servers / slash commands 干擾。砍 setting-sources / mcp / slash-commands 後 cold start ~快 125ms、
  // 1h cache_creation tokens 從 19512 降到 0(cost -89%)。量測見 refs/claude-cli-spawn-perf-2026-05-11.md。
  //
  // 注意:**不能加 --no-session-persistence** — QA 多輪靠 --resume 接續,
  // 第二輪起需要前一輪 session 落地到 disk,no-persist 會讓 follow-up turn 直接 500。
  const sysPrompt = pipelineContext
    ? QA_BEHAVIOR_PROMPT + "\n\n" + pipelineContext
    : QA_BEHAVIOR_PROMPT;
  const hint = isFirstTurn
    ? undefined
    : "提醒:你只負責對話收斂 ticket 需求,不要實際執行任何工具(Bash/Read/Edit/Grep/...)。回覆永遠用單一 JSON 物件 {message, options, complete, spec, splitInto?},splitInto 只在 complete=true 且範圍跨多件獨立 ticket 時填 N 個完整 spec(見系統 prompt ## splitInto 段)。不要解釋、不要 markdown 包裝。" +
        (pipelineContext ? "\n\n" + pipelineContext : "") +
        (progressHint ? "\n\n" + progressHint : "");

  let proc: ReturnType<typeof Bun.spawn>;
  try {
    proc = qaCfg.adapter.spawn({
      kind: "qa",
      cwd,
      sessionId,
      userMessage,
      isFirstTurn,
      systemPrompt: sysPrompt,
      appendSystemPrompt: hint,
      model: qaCfg.model,
      effort: qaCfg.effort,
      history,
    });
  } catch (e) {
    throw new ClaudeCliError("not_available", `${qaCfg.adapter.name} CLI not found: ${e}`);
  }
  const [stdoutText, stderrText] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  await proc.exited;

  if (proc.exitCode !== 0) {
    throw new ClaudeCliError(
      "exec_failed",
      `${qaCfg.adapter.name} exited ${proc.exitCode}: ${stderrText.trim() || stdoutText.trim()}`
    );
  }

  // adapter.parseResult 統一從原始 stdout 取出「LLM 最終訊息字串」(claude=outer JSON.result;codex=JSONL last agent_message)
  let innerStr: string;
  try {
    innerStr = qaCfg.adapter.parseResult("qa", stdoutText);
  } catch (e) {
    throw new ClaudeCliError(
      "parse_failed",
      `${qaCfg.adapter.name} output not parseable: ${String(e).slice(0, 200)}`
    );
  }
  return enforceContract(parseReply(innerStr));
}

function normalizeMode(v: unknown): "step" | "iter" | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.toLowerCase();
  if (s === "step" || s === "one-shot" || s === "oneshot" || s === "single") return "step";
  if (s === "iter" || s === "iterative" || s === "loop" || s === "iterate") return "iter";
  return undefined;
}

const ALLOWED_SPEC_KEYS = new Set([
  "title",
  "goal",
  "acceptance",
  "prompt",
  "mode",
  "iterLimit",
  "iterStopAtLimit",
]);

function coerceSpec(spec: unknown): unknown {
  if (!spec || typeof spec !== "object") return spec;
  const raw = spec as Record<string, unknown>;
  const o: Record<string, unknown> = {};
  // Strip 非合法 key — AI 偶爾自創 scope/loop/deliverable 等,丟掉
  const dropped: string[] = [];
  for (const k of Object.keys(raw)) {
    if (ALLOWED_SPEC_KEYS.has(k)) {
      o[k] = raw[k];
    } else {
      dropped.push(k);
    }
  }
  if (dropped.length > 0) {
    console.warn(`[qa] AI invented non-canonical spec keys (dropped): ${dropped.join(", ")}`);
  }
  const mode = normalizeMode(o.mode);
  if (mode) o.mode = mode;
  // acceptance 偶爾被 AI 寫成字串(多行 join);split 成陣列
  if (typeof o.acceptance === "string") {
    o.acceptance = (o.acceptance as string)
      .split(/\r?\n/)
      .map((s) => s.replace(/^\s*[-*•]?\s*\d*[.)]?\s*/, "").trim())
      .filter((s) => s.length > 0);
  }
  // iterLimit clamp 到 [1, 5](AI 常自作主張寫 8-10,超過 UI 上限)
  if (typeof o.iterLimit === "number" && Number.isFinite(o.iterLimit)) {
    o.iterLimit = Math.max(1, Math.min(5, Math.floor(o.iterLimit)));
  }
  return o;
}

function specHasAllFields(s: unknown): boolean {
  if (!s || typeof s !== "object") return false;
  const o = s as Record<string, unknown>;
  return (
    typeof o.title === "string" &&
    o.title.length > 0 &&
    typeof o.goal === "string" &&
    o.goal.length > 0 &&
    Array.isArray(o.acceptance) &&
    o.acceptance.length > 0 &&
    typeof o.prompt === "string" &&
    o.prompt.length > 0 &&
    (o.mode === "step" || o.mode === "iter")
  );
}

function enforceContract(reply: QAReply): QAReply {
  // 1. Coerce common mode synonyms (iterative → iter, one-shot → step etc).
  const coerced: QAReply = {
    ...reply,
    spec: coerceSpec(reply.spec) as QAReply["spec"],
  };
  // 2. Even if AI declares complete=true, override to false when spec is incomplete.
  if (coerced.complete && !specHasAllFields(coerced.spec)) {
    return { ...coerced, complete: false, splitInto: undefined };
  }
  // 3. splitInto:每元素都跑 coerceSpec + completeness 檢查;只留合法 entries。
  //    length < 2 → 不算拆,丟掉 splitInto(主 spec 仍可用)
  if (Array.isArray(reply.splitInto) && reply.splitInto.length > 0) {
    const cleaned: TicketSpec[] = [];
    for (const raw of reply.splitInto) {
      const c = coerceSpec(raw);
      if (c && specHasAllFields(c)) cleaned.push(c as TicketSpec);
    }
    if (cleaned.length >= 2) {
      coerced.splitInto = cleaned;
    } else {
      coerced.splitInto = undefined;
    }
  } else {
    coerced.splitInto = undefined;
  }
  return coerced;
}

function parseReply(raw: string): QAReply {
  // 1. fenced JSON block
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {}
  }
  // 2. raw is JSON
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    try {
      return JSON.parse(trimmed);
    } catch {}
  }
  // 3. find first { ... } object inside text
  const obj = trimmed.match(/\{[\s\S]*\}/);
  if (obj) {
    try {
      return JSON.parse(obj[0]);
    } catch {}
  }
  // 4. fallback: AI broke contract, wrap as plain message so flow doesn't crash
  return {
    message: trimmed,
    options: [],
    complete: false,
    spec: null,
  };
}

