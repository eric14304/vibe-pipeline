import { join } from "node:path";
import { existsSync, appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { ensureRuntime } from "../pipelineDir";
import type { NotifEventType } from "../../../shared/types";

export type NotifRecord = {
  id: string;
  type: NotifEventType;
  title: string;
  sub?: string;
  ts: number;
  unread: boolean;
  pipelineId?: string;
};

function file(projectPath: string): string {
  return join(ensureRuntime(projectPath), "notifs.jsonl");
}

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function emit(
  projectPath: string,
  params: {
    type: NotifEventType;
    title: string;
    sub?: string;
    pipelineId?: string;
  }
): NotifRecord {
  const r: NotifRecord = {
    id: genId(),
    type: params.type,
    title: params.title,
    sub: params.sub,
    ts: Date.now(),
    unread: true,
    pipelineId: params.pipelineId,
  };
  appendFileSync(file(projectPath), JSON.stringify(r) + "\n");
  return r;
}

export function list(projectPath: string, limit = 200): NotifRecord[] {
  const f = file(projectPath);
  if (!existsSync(f)) return [];
  const text = readFileSync(f, "utf8");
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  const out: NotifRecord[] = [];
  for (const line of lines.slice(-limit)) {
    try {
      out.push(JSON.parse(line));
    } catch {}
  }
  return out.reverse();
}

function rewrite(projectPath: string, fn: (r: NotifRecord) => NotifRecord | null): void {
  const f = file(projectPath);
  if (!existsSync(f)) return;
  const lines = readFileSync(f, "utf8").split("\n").filter((l) => l.trim());
  const out: string[] = [];
  for (const line of lines) {
    try {
      const r: NotifRecord = JSON.parse(line);
      const next = fn(r);
      if (next) out.push(JSON.stringify(next));
    } catch {
      out.push(line);
    }
  }
  writeFileSync(f, out.join("\n") + (out.length ? "\n" : ""));
}

export function markRead(projectPath: string, id: string): void {
  rewrite(projectPath, (r) => (r.id === id ? { ...r, unread: false } : r));
}

export function markAllRead(projectPath: string): void {
  rewrite(projectPath, (r) => ({ ...r, unread: false }));
}

export function dismiss(projectPath: string, id: string): void {
  rewrite(projectPath, (r) => (r.id === id ? null : r));
}

// 全 project notifs 保留最新 keep 筆(unread / read 不分,純按時序)。
// JSONL 是 append-only,GC 等於一次性 rewrite。
// 失敗 (檔不存在 / parse 壞) 安靜忽略。
export function pruneOldRecords(projectPath: string, keep = 500): number {
  const f = file(projectPath);
  if (!existsSync(f)) return 0;
  let lines: string[];
  try {
    lines = readFileSync(f, "utf8").split("\n").filter((l) => l.trim().length > 0);
  } catch {
    return 0;
  }
  if (lines.length <= keep) return 0;
  const kept = lines.slice(-keep);
  try {
    writeFileSync(f, kept.join("\n") + "\n");
    return lines.length - keep;
  } catch {
    return 0;
  }
}
