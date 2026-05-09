import { join } from "node:path";
import { existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { ensureRuntime } from "../pipelineDir";
import { writeJson } from "../jsonFile";
import type { QAReply, Draft } from "../../../shared/types";

export type { Draft, Turn } from "../../../shared/types";

function dir(projectPath: string): string {
  return ensureRuntime(projectPath, "qa-drafts");
}

function file(projectPath: string, draftId: string): string {
  return join(dir(projectPath), `${draftId}.json`);
}

export async function listDrafts(projectPath: string): Promise<Draft[]> {
  const d = dir(projectPath);
  if (!existsSync(d)) {
    mkdirSync(d, { recursive: true });
    return [];
  }
  const files = readdirSync(d).filter((f) => f.endsWith(".json"));
  const out: Draft[] = [];
  for (const f of files) {
    try {
      out.push(JSON.parse(await Bun.file(join(d, f)).text()));
    } catch {}
  }
  return out;
}

export async function findActiveByPipeline(
  projectPath: string,
  pipelineId: string
): Promise<Draft | null> {
  const all = await listDrafts(projectPath);
  return all.find((d) => d.pipelineId === pipelineId) ?? null;
}

export async function readDraft(projectPath: string, draftId: string): Promise<Draft | null> {
  const f = file(projectPath, draftId);
  if (!existsSync(f)) return null;
  try {
    return JSON.parse(await Bun.file(f).text());
  } catch {
    return null;
  }
}

export async function createDraft(projectPath: string, pipelineId: string): Promise<Draft> {
  const draftId = randomUUID().replace(/-/g, "").slice(0, 16);
  const sessionId = randomUUID();
  const now = Date.now();
  const draft: Draft = {
    draftId,
    pipelineId,
    sessionId,
    sessionStarted: false,
    complete: false,
    createdAt: now,
    updatedAt: now,
    turns: [],
    spec: null,
  };
  await writeJson(file(projectPath, draftId), draft);
  return draft;
}

export async function appendTurn(
  projectPath: string,
  draftId: string,
  userMessage: string | null,
  reply: QAReply
): Promise<Draft> {
  const d = await readDraft(projectPath, draftId);
  if (!d) throw new Error("draft_not_found");
  const now = Date.now();
  if (userMessage !== null) {
    d.turns.push({ role: "user", message: userMessage, ts: now });
  }
  d.turns.push({
    role: "ai",
    message: reply.message,
    options: reply.options,
    optionsMode: reply.optionsMode ?? "single",
    ts: now,
  });
  d.spec = reply.spec ?? d.spec;
  d.complete = reply.complete;
  d.updatedAt = now;
  await writeJson(file(projectPath, draftId), d);
  return d;
}

export async function markStarted(projectPath: string, draftId: string): Promise<void> {
  const d = await readDraft(projectPath, draftId);
  if (!d) return;
  d.sessionStarted = true;
  d.updatedAt = Date.now();
  await writeJson(file(projectPath, draftId), d);
}

export async function deleteDraft(projectPath: string, draftId: string): Promise<void> {
  const f = file(projectPath, draftId);
  if (existsSync(f)) unlinkSync(f);
}
