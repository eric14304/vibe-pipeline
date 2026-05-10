// Wraps /api/__test/* 控制端點。Mock 模式專用。

const API = "http://127.0.0.1:3001/api/__test";

// QA reply 結構跟 shared/types.ts 一致;mock 腳本 spec 欄位放寬到 Record(允許 partial spec test)。
import type { QAReply as SharedQAReply } from "../../../shared/types";
export type QAReply = Omit<SharedQAReply, "spec"> & {
  spec: Record<string, unknown> | null;
};

export type RunnerScriptRound = {
  verdict: "PASS" | "FAIL" | "PARTIAL";
  executorSummary?: string;
  criticFeedback?: string;
  durationMs?: number;
};

export type RunnerScriptTicket = {
  beforeRunningMs?: number;
  iterRounds?: RunnerScriptRound[];
  workMs?: number;
  finalStatus: "done" | "failed" | "failed_iter_limit" | "failed_transient";
  commitHash?: string;
  commitSubject?: string;
};

export type RunnerScript = {
  tickets: RunnerScriptTicket[];
  finalState?: "ready" | "paused" | "failed";
  pauseAfterTicketIndex?: number;
};

async function post(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
  const j = (await res.json()) as { ok: boolean; data?: unknown; error?: { message: string } };
  if (!j.ok) throw new Error(`${path} failed: ${j.error?.message ?? "unknown"}`);
  return j.data;
}

export async function setQAScript(projectHash: string, replies: QAReply[]): Promise<void> {
  await post("/script/qa", { hash: projectHash, replies });
}

export async function setRunnerScript(
  projectHash: string,
  pipelineId: string,
  script: RunnerScript
): Promise<void> {
  await post("/script/runner", { hash: projectHash, pipelineId, script });
}

export async function resetMocks(): Promise<void> {
  await post("/reset", {});
}
