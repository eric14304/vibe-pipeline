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
  if (isFirstTurn) {
    args.push("--session-id", sessionId);
    args.push("--system-prompt", QA_BEHAVIOR_PROMPT);
  } else {
    args.push("--resume", sessionId);
    args.push(
      "--append-system-prompt",
      "提醒:回覆永遠用單一 JSON 物件 {message, options, complete, spec},不要解釋、不要 markdown 包裝。"
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
  return parseReply(innerStr);
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
