import type { ApiResponse, ApiErrorCode } from "../../shared/types";

export class ApiError extends Error {
  constructor(public code: ApiErrorCode | string, message: string) {
    super(message);
  }
}

type CallInit = { method?: string; body?: unknown };

async function call<T>(path: string, init?: CallInit): Promise<T> {
  const opts: RequestInit = { method: init?.method };
  if (init?.body !== undefined) {
    opts.body = typeof init.body === "string" ? init.body : JSON.stringify(init.body);
    opts.headers = { "Content-Type": "application/json" };
  }
  const res = await fetch(path, opts);
  const json = (await res.json()) as ApiResponse<T> & { data?: T };
  if (!json.ok) throw new ApiError(json.error.code, json.error.message);
  return json.data!;
}

export type TicketSpec = {
  title: string;
  goal: string;
  acceptance: string[];
  prompt: string;
  mode: "step" | "iter";
};

export type PartialSpec = Partial<TicketSpec>;

export type QAReply = {
  message: string;
  options: string[];
  optionsMode?: "single" | "multi";
  complete: boolean;
  spec: PartialSpec | null;
};

export type Turn = {
  role: "user" | "ai";
  message: string;
  options?: string[];
  optionsMode?: "single" | "multi";
  ts: number;
};

export type Draft = {
  draftId: string;
  pipelineId: string;
  sessionId: string;
  createdAt: number;
  updatedAt: number;
  turns: Turn[];
  spec: PartialSpec | null;
};

type StartResp = { draft: Draft; reply: QAReply };
type TurnResp = { draft: Draft; reply: QAReply };
type FinalizeResp = { ticket: unknown; pipeline: unknown };

export function startQA(hash: string, pipelineId: string): Promise<StartResp> {
  return call<StartResp>(`/api/projects/${hash}/pipelines/${pipelineId}/qa/start`, {
    method: "POST",
    body: {},
  });
}

export function turnQA(hash: string, draftId: string, userMessage: string): Promise<TurnResp> {
  return call<TurnResp>(`/api/projects/${hash}/qa/${draftId}/turn`, {
    method: "POST",
    body: { userMessage },
  });
}

export function finalizeQA(
  hash: string,
  draftId: string,
  edits?: Partial<TicketSpec>
): Promise<FinalizeResp> {
  return call<FinalizeResp>(`/api/projects/${hash}/qa/${draftId}/finalize`, {
    method: "POST",
    body: { edits: edits ?? {} },
  });
}

export function cancelQA(hash: string, draftId: string): Promise<{ ok: true }> {
  return call<{ ok: true }>(`/api/projects/${hash}/qa/${draftId}/cancel`, { method: "POST" });
}

export function listDrafts(hash: string): Promise<Draft[]> {
  return call<Draft[]>(`/api/projects/${hash}/qa/drafts`);
}

export function getDraft(hash: string, draftId: string): Promise<Draft> {
  return call<Draft>(`/api/projects/${hash}/qa/${draftId}`);
}
