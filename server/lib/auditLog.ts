// Pipeline state mutation audit log.
//
// 目的:解「pipeline.state 變 X 但不知道誰標的」debug 痛點。
// 每次 pipeline.state 真的有變動(舊值 !== 新值)就 append 一行 JSON 到
// <projectPath>/.vibe-pipeline/.runtime/audit.jsonl。
//
// 格式:每行一個 JSON object。
//   state_change: { ts, pipelineId, type:'state_change', from, to, source, sourceDetail? }
//   user_action:  { ts, type:'user_action', action, pipelineId?, ticketId?,
//                   result:'pending'|'ok'|'error', errorCode?, errorMessage? }
//
// state_change source 由 caller 傳給 writePipeline / mutatePipeline,沒傳就記 'unknown'。
// 在 ticketWatcher 偵測到 disk 上 state 變了但 in-memory snapshot 不知道是誰寫的場合
// (runner 主 agent 自己 Edit pipeline.json),補一筆 source='runner-self-detected'。
//
// user_action 給 mutation handler / lib 進入點記「user 剛按了什麼」,
// 走 begin → ok/error wrapper 兩段紀錄(pending → ok/error),這樣即使 handler crash 也留有 pending 證據。
//
// 純 append-only;沒有 rotation / GC(audit 量很小,一條 pipeline 一生大概 < 100 行)。

import { join } from "node:path";
import { existsSync, appendFileSync, readFileSync, mkdirSync } from "node:fs";

export type StateChangeEntry = {
  ts: number;
  pipelineId: string;
  type: "state_change";
  from: string;
  to: string;
  source: string;
  sourceDetail?: string;
};

export type UserActionResult = "pending" | "ok" | "error";

export type UserActionEntry = {
  ts: number;
  type: "user_action";
  action: string;
  pipelineId?: string;
  ticketId?: string;
  result: UserActionResult;
  errorCode?: string;
  errorMessage?: string;
};

export type AuditEntry = StateChangeEntry | UserActionEntry;

// 直接構造路徑而不 import pipelineDir.runtimePath,避免循環 import
// (pipelineDir.writePipeline 會反向呼叫 auditLog.appendStateChange)
function auditFile(projectPath: string): string {
  return join(projectPath, ".vibe-pipeline", ".runtime", "audit.jsonl");
}

function auditDir(projectPath: string): string {
  return join(projectPath, ".vibe-pipeline", ".runtime");
}

export function appendStateChange(opts: {
  projectPath: string;
  pipelineId: string;
  from: string;
  to: string;
  source: string;
  sourceDetail?: string;
}): void {
  const entry: StateChangeEntry = {
    ts: Date.now(),
    pipelineId: opts.pipelineId,
    type: "state_change",
    from: opts.from,
    to: opts.to,
    source: opts.source,
    ...(opts.sourceDetail ? { sourceDetail: opts.sourceDetail } : {}),
  };
  try {
    mkdirSync(auditDir(opts.projectPath), { recursive: true });
    appendFileSync(auditFile(opts.projectPath), JSON.stringify(entry) + "\n", "utf8");
  } catch (e) {
    // 寫 audit 失敗絕不可以擋住 pipeline mutation;只 log。
    console.warn(`[auditLog] append failed for ${opts.pipelineId}:`, e);
  }
}

export function listAudit(
  projectPath: string,
  pipelineId: string,
  limit?: number
): StateChangeEntry[] {
  const file = auditFile(projectPath);
  if (!existsSync(file)) return [];
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return [];
  }
  const lines = text.split(/\r?\n/);
  const out: StateChangeEntry[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line) as StateChangeEntry;
      if (obj && obj.pipelineId === pipelineId && obj.type === "state_change") {
        out.push(obj);
      }
    } catch {
      // 壞行跳過,不擋讀取
    }
  }
  // 按 ts 降冪(最新在最前),取 limit
  out.sort((a, b) => b.ts - a.ts);
  if (typeof limit === "number" && limit > 0) return out.slice(0, limit);
  return out;
}

function appendRaw(projectPath: string, entry: AuditEntry): void {
  try {
    mkdirSync(auditDir(projectPath), { recursive: true });
    appendFileSync(auditFile(projectPath), JSON.stringify(entry) + "\n", "utf8");
  } catch (e) {
    console.warn(`[auditLog] append failed:`, e);
  }
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

export function appendUserAction(opts: {
  projectPath: string;
  action: string;
  pipelineId?: string;
  ticketId?: string;
  result: UserActionResult;
  errorCode?: string;
  errorMessage?: string;
}): void {
  const entry: UserActionEntry = {
    ts: Date.now(),
    type: "user_action",
    action: opts.action,
    ...(opts.pipelineId ? { pipelineId: opts.pipelineId } : {}),
    ...(opts.ticketId ? { ticketId: opts.ticketId } : {}),
    result: opts.result,
    ...(opts.errorCode ? { errorCode: opts.errorCode } : {}),
    ...(opts.errorMessage ? { errorMessage: truncate(opts.errorMessage, 200) } : {}),
  };
  appendRaw(opts.projectPath, entry);
}

export type UserActionHandle = {
  ok(): void;
  error(message: string, code?: string): void;
};

// 開頭呼 beginUserAction 立刻寫 pending,handler return 前呼 .ok() / .error(msg) 寫終態。
// pending 行不會被回收 — 即使 handler 提前 throw,留下 pending 也是有用線索。
// 注意:本 helper 不會自動 catch;caller 自己負責在 catch / 各 return 點呼 finalizer。
export function beginUserAction(opts: {
  projectPath: string;
  action: string;
  pipelineId?: string;
  ticketId?: string;
}): UserActionHandle {
  appendUserAction({
    projectPath: opts.projectPath,
    action: opts.action,
    pipelineId: opts.pipelineId,
    ticketId: opts.ticketId,
    result: "pending",
  });
  let done = false;
  return {
    ok(): void {
      if (done) return;
      done = true;
      appendUserAction({
        projectPath: opts.projectPath,
        action: opts.action,
        pipelineId: opts.pipelineId,
        ticketId: opts.ticketId,
        result: "ok",
      });
    },
    error(message: string, code?: string): void {
      if (done) return;
      done = true;
      appendUserAction({
        projectPath: opts.projectPath,
        action: opts.action,
        pipelineId: opts.pipelineId,
        ticketId: opts.ticketId,
        result: "error",
        errorCode: code,
        errorMessage: message,
      });
    },
  };
}

export type UserActionFilter = {
  action?: string;
  pipelineId?: string;
  ticketId?: string;
  limit?: number;
};

export function listUserActions(
  projectPath: string,
  filter: UserActionFilter = {}
): UserActionEntry[] {
  const file = auditFile(projectPath);
  if (!existsSync(file)) return [];
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return [];
  }
  const lines = text.split(/\r?\n/);
  const out: UserActionEntry[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line) as UserActionEntry;
      if (!obj || obj.type !== "user_action") continue;
      if (filter.action && obj.action !== filter.action) continue;
      if (filter.pipelineId && obj.pipelineId !== filter.pipelineId) continue;
      if (filter.ticketId && obj.ticketId !== filter.ticketId) continue;
      out.push(obj);
    } catch {
      // 壞行跳過
    }
  }
  out.sort((a, b) => b.ts - a.ts);
  if (typeof filter.limit === "number" && filter.limit > 0) {
    return out.slice(0, filter.limit);
  }
  return out;
}
