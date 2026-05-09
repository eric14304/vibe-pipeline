import { QA_BEHAVIOR_PROMPT } from "./systemPrompt";
import { type QAReply } from "./schema";

export class ClaudeCliError extends Error {
  constructor(public code: "not_available" | "exec_failed" | "parse_failed", message: string) {
    super(message);
  }
}

export async function checkAvailable(): Promise<boolean> {
  try {
    const proc = Bun.spawn(["claude", "--version"], { stdout: "pipe", stderr: "pipe" });
    await proc.exited;
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}

type RunOpts = {
  cwd: string;
  sessionId: string;
  userMessage: string;
  isFirstTurn: boolean;
};

// Run one turn through claude CLI. First turn supplies session-id + system prompt,
// follow-up turns use --resume with the same session id.
export async function runTurn({
  cwd,
  sessionId,
  userMessage,
  isFirstTurn,
}: RunOpts): Promise<QAReply> {
  const args = ["claude", "-p", "--output-format", "json"];
  // QA 階段:鎖會改檔 / 跑 sub-agent / 上網的工具,其他(Bash / Read / Grep / Glob / MCP)放行讓 AI 收斂時可查專案。
  args.push("--disallowedTools", "Edit Write Task");
  if (isFirstTurn) {
    args.push("--session-id", sessionId);
    args.push("--system-prompt", QA_BEHAVIOR_PROMPT);
  } else {
    args.push("--resume", sessionId);
    args.push(
      "--append-system-prompt",
      "提醒:你只負責對話收斂 ticket 需求,不要實際執行任何工具(Bash/Read/Edit/Grep/...)。回覆永遠用單一 JSON 物件 {message, options, complete, spec},不要解釋、不要 markdown 包裝。"
    );
  }
  args.push(userMessage);

  let proc;
  try {
    proc = Bun.spawn(args, { cwd, stdout: "pipe", stderr: "pipe" });
  } catch (e) {
    throw new ClaudeCliError("not_available", `claude CLI not found: ${e}`);
  }
  const [stdoutText, stderrText] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  await proc.exited;

  if (proc.exitCode !== 0) {
    throw new ClaudeCliError(
      "exec_failed",
      `claude exited ${proc.exitCode}: ${stderrText.trim() || stdoutText.trim()}`
    );
  }

  // --output-format json wraps result in: { type:"result", result:"<actual text>", session_id, ... }
  let outerJson;
  try {
    outerJson = JSON.parse(stdoutText);
  } catch {
    throw new ClaudeCliError("parse_failed", `claude output not JSON: ${stdoutText.slice(0, 200)}`);
  }
  const inner = outerJson.result ?? outerJson.text ?? outerJson;
  const innerStr = typeof inner === "string" ? inner : JSON.stringify(inner);
  return enforceContract(parseReply(innerStr));
}

function normalizeMode(v: unknown): "step" | "iter" | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.toLowerCase();
  if (s === "step" || s === "one-shot" || s === "oneshot" || s === "single") return "step";
  if (s === "iter" || s === "iterative" || s === "loop" || s === "iterate") return "iter";
  return undefined;
}

function coerceSpec(spec: unknown): unknown {
  if (!spec || typeof spec !== "object") return spec;
  const o = { ...(spec as Record<string, unknown>) };
  const mode = normalizeMode(o.mode);
  if (mode) o.mode = mode;
  // acceptance 偶爾被 AI 寫成字串(多行 join);split 成陣列
  if (typeof o.acceptance === "string") {
    o.acceptance = (o.acceptance as string)
      .split(/\r?\n/)
      .map((s) => s.replace(/^\s*[-*•]?\s*\d*[.\)]?\s*/, "").trim())
      .filter((s) => s.length > 0);
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
  const coerced = { ...reply, spec: coerceSpec(reply.spec) as QAReply["spec"] };
  // 2. Even if AI declares complete=true, override to false when spec is incomplete.
  if (coerced.complete && !specHasAllFields(coerced.spec)) {
    return { ...coerced, complete: false };
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

