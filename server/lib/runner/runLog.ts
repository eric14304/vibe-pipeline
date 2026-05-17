// Runner log reader: 解析 .runtime/logs/<pipelineId>-<ts>.log
// 格式:
//   [runner <pipelineId>] exited code=<n>
//   --- stdout ---
//   {JSON line: total_cost_usd, duration_ms, num_turns, result, session_id, usage{...}, ...}
//   --- stderr ---
//   <text>
//
// 也支援沒寫完整(crash 等)的部分檔案 — best effort parse。

import { readdirSync, existsSync, unlinkSync, statSync } from "node:fs";
import { join } from "node:path";
import * as pipelineDir from "../pipelineDir";

import type { RunSummary, RunDetail, Provider } from "../../../shared/types";
export type { RunSummary, RunDetail };

const FILENAME_RE = /^(.+)-(\d+)\.log$/;

function logsDir(projectPath: string): string {
  return pipelineDir.runtimePath(projectPath, "logs");
}

// list 所有 run summary(parse JSON 但不回 stdout/stderr 全文)
export async function listRuns(
  projectPath: string,
  pipelineId: string
): Promise<RunSummary[]> {
  const dir = logsDir(projectPath);
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter((f) => {
    const m = f.match(FILENAME_RE);
    return m && m[1] === pipelineId;
  });
  const out: RunSummary[] = [];
  for (const f of files) {
    const file = join(dir, f);
    try {
      const text = await Bun.file(file).text();
      const detail = parseFullLog(f, file, text);
      if (detail) {
        const { stdout: _s, stderr: _e, ...summary } = detail;
        void _s;
        void _e;
        out.push(summary);
      }
    } catch {
      // skip unreadable
    }
  }
  return out.sort((a, b) => b.startedAt - a.startedAt);
}

// 該 pipeline 留最新 keep 筆,其餘刪掉。回傳刪除數量。
// 不 throw — 個別 unlink 失敗安靜忽略,GC 不該擋 runner。
export function pruneLogs(
  projectPath: string,
  pipelineId: string,
  keep = 10
): number {
  const dir = logsDir(projectPath);
  if (!existsSync(dir)) return 0;
  const files = readdirSync(dir)
    .map((f) => {
      const m = f.match(FILENAME_RE);
      if (!m || m[1] !== pipelineId) return null;
      return { name: f, ts: Number(m[2]) };
    })
    .filter((x): x is { name: string; ts: number } => x !== null)
    .sort((a, b) => b.ts - a.ts);
  if (files.length <= keep) return 0;
  let deleted = 0;
  for (const f of files.slice(keep)) {
    try {
      unlinkSync(join(dir, f.name));
      deleted++;
    } catch {
      // skip
    }
  }
  return deleted;
}

export async function getRun(
  projectPath: string,
  pipelineId: string,
  filename: string
): Promise<RunDetail | null> {
  const m = filename.match(FILENAME_RE);
  if (!m || m[1] !== pipelineId) return null;
  const file = join(logsDir(projectPath), filename);
  if (!existsSync(file)) return null;
  const text = await Bun.file(file).text();
  return parseFullLog(filename, file, text);
}

function parseFullLog(filename: string, logPath: string, text: string): RunDetail | null {
  const m = filename.match(FILENAME_RE);
  if (!m) return null;
  const startedAt = Number(m[2]);

  // header: "[runner <id>] exited code=<n>"
  const headerMatch = text.match(/^\[runner [^\]]+\] exited code=(-?\d+)/m);
  const exitCode = headerMatch ? Number(headerMatch[1]) : null;

  const stdoutMatch = text.match(/^--- stdout ---\n([\s\S]*?)(?=\n--- stderr ---|$)/m);
  const stderrMatch = text.match(/^--- stderr ---\n([\s\S]*)$/m);
  const stdout = (stdoutMatch?.[1] ?? "").trim();
  const stderr = (stderrMatch?.[1] ?? "").trim();

  let costUsd: number | null = null;
  let durationMs: number | null = null;
  let numTurns: number | null = null;
  let result: string | null = null;
  let sessionId: string | null = null;
  let tokens: RunSummary["tokens"] = null;
  let provider: Provider | null = null;
  let model: string | null = null;

  if (stdout) {
    const firstNonEmpty = stdout.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";
    const isCodex = /"type"\s*:\s*"thread\.started"/.test(firstNonEmpty);
    if (isCodex) {
      provider = "codex";
      const parsed = parseCodexJsonl(stdout);
      sessionId = parsed.sessionId;
      numTurns = parsed.numTurns;
      result = parsed.result;
      tokens = parsed.tokens;
      model = parsed.model;
      costUsd = null;
      try {
        const mtimeMs = statSync(logPath).mtimeMs;
        durationMs = Math.max(0, Math.round(mtimeMs - startedAt));
      } catch {
        durationMs = null;
      }
    } else {
      try {
        const j = JSON.parse(stdout) as {
          total_cost_usd?: number;
          duration_ms?: number;
          num_turns?: number;
          result?: string;
          session_id?: string;
          usage?: {
            input_tokens?: number;
            output_tokens?: number;
            cache_read_input_tokens?: number;
            cache_creation_input_tokens?: number;
          };
          modelUsage?: Record<string, unknown>;
        };
        provider = "claude";
        costUsd = j.total_cost_usd ?? null;
        durationMs = j.duration_ms ?? null;
        numTurns = j.num_turns ?? null;
        result = j.result ?? null;
        sessionId = j.session_id ?? null;
        if (j.usage) {
          tokens = {
            input: j.usage.input_tokens ?? 0,
            output: j.usage.output_tokens ?? 0,
            cacheRead: j.usage.cache_read_input_tokens ?? 0,
            cacheCreate: j.usage.cache_creation_input_tokens ?? 0,
          };
        }
        if (j.modelUsage && typeof j.modelUsage === "object") {
          const firstKey = Object.keys(j.modelUsage)[0];
          if (firstKey) {
            // 剝離 "[1m]" 等 context window 後綴,保留主 model id
            model = firstKey.replace(/\[[^\]]*\]$/, "");
          }
        }
      } catch {
        // not parseable — leave nulls
      }
    }
  }

  return {
    filename,
    logPath,
    startedAt,
    exitCode,
    durationMs,
    costUsd,
    numTurns,
    result,
    tokens,
    sessionId,
    hasStderr: stderr.length > 0,
    provider,
    model,
    stdout,
    stderr,
  };
}

type CodexParsed = {
  sessionId: string | null;
  numTurns: number | null;
  result: string | null;
  tokens: RunSummary["tokens"];
  model: string | null;
};

function parseCodexJsonl(stdout: string): CodexParsed {
  let sessionId: string | null = null;
  let numTurns = 0;
  let result: string | null = null;
  let input = 0;
  let output = 0;
  let cacheRead = 0;
  let reasoning = 0;
  let sawTurn = false;
  let sawUsage = false;
  let model: string | null = null;

  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const ev = JSON.parse(trimmed) as {
        type?: string;
        thread_id?: string;
        model?: string;
        item?: { type?: string; text?: string };
        usage?: {
          input_tokens?: number;
          cached_input_tokens?: number;
          output_tokens?: number;
          reasoning_output_tokens?: number;
        };
      };
      if (ev.type === "thread.started" && typeof ev.thread_id === "string") {
        sessionId = ev.thread_id;
        if (typeof ev.model === "string") model = ev.model;
      } else if (ev.type === "turn.started") {
        numTurns++;
        sawTurn = true;
      } else if (ev.type === "turn.completed" && ev.usage) {
        input += ev.usage.input_tokens ?? 0;
        cacheRead += ev.usage.cached_input_tokens ?? 0;
        output += ev.usage.output_tokens ?? 0;
        reasoning += ev.usage.reasoning_output_tokens ?? 0;
        sawUsage = true;
      } else if (ev.type === "item.completed" && ev.item?.type === "agent_message") {
        if (typeof ev.item.text === "string") result = ev.item.text;
      }
    } catch {
      // skip non-JSON
    }
  }

  return {
    sessionId,
    numTurns: sawTurn ? numTurns : null,
    result,
    tokens: sawUsage
      ? { input, output, cacheRead, cacheCreate: 0, reasoning }
      : null,
    model,
  };
}
