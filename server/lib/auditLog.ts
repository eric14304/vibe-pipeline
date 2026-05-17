// Pipeline state mutation audit log.
//
// 目的:解「pipeline.state 變 X 但不知道誰標的」debug 痛點。
// 每次 pipeline.state 真的有變動(舊值 !== 新值)就 append 一行 JSON 到
// <projectPath>/.vibe-pipeline/.runtime/audit.jsonl。
//
// 格式:每行一個 JSON object。
//   { ts, pipelineId, type:'state_change', from, to, source, sourceDetail? }
//
// source 由 caller 傳給 writePipeline / mutatePipeline,沒傳就記 'unknown'。
// 在 ticketWatcher 偵測到 disk 上 state 變了但 in-memory snapshot 不知道是誰寫的場合
// (runner 主 agent 自己 Edit pipeline.json),補一筆 source='runner-self-detected'。
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
