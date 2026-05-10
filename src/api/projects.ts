import type { ApiResponse, Project, ApiErrorCode } from "../../shared/types";

export class ApiError extends Error {
  constructor(public code: ApiErrorCode, message: string) {
    super(message);
  }
}

type CallInit = { method?: string; body?: unknown; headers?: Record<string, string> };

async function call<T>(path: string, init?: CallInit): Promise<T> {
  const opts: RequestInit = { method: init?.method, headers: init?.headers };
  if (init?.body !== undefined) {
    opts.body = typeof init.body === "string" ? init.body : JSON.stringify(init.body);
    opts.headers = { "Content-Type": "application/json", ...(init.headers || {}) };
  }
  const res = await fetch(path, opts);
  const json = (await res.json()) as ApiResponse<T>;
  if (!json.ok) throw new ApiError(json.error.code, json.error.message);
  return json.data;
}

export function listRecent(): Promise<Project[]> {
  return call<Project[]>("/api/projects");
}

export function selectFolder(): Promise<{ path: string }> {
  return call<{ path: string }>("/api/projects/select", { method: "POST" });
}

export function openProject(path: string): Promise<Project> {
  return call<Project>("/api/projects/open", { method: "POST", body: { path } });
}

export function status(hash: string): Promise<Project> {
  return call<Project>(`/api/projects/${hash}/status`);
}

export function init(hash: string): Promise<Project> {
  return call<Project>(`/api/projects/${hash}/init`, { method: "POST" });
}

export function gitInit(hash: string): Promise<Project> {
  return call<Project>(`/api/projects/${hash}/git-init`, { method: "POST" });
}

export function reveal(hash: string): Promise<{ ok: true }> {
  return call<{ ok: true }>(`/api/projects/${hash}/reveal`, { method: "POST" });
}

export function listBranches(hash: string): Promise<string[]> {
  return call<string[]>(`/api/projects/${hash}/branches`);
}

export function listPipelines(hash: string): Promise<unknown[]> {
  return call<unknown[]>(`/api/projects/${hash}/pipelines`);
}

export function createPipeline(hash: string, body: unknown): Promise<unknown> {
  return call<unknown>(`/api/projects/${hash}/pipelines`, { method: "POST", body });
}

export function getPipeline(hash: string, id: string): Promise<unknown> {
  return call<unknown>(`/api/projects/${hash}/pipelines/${id}`);
}

export function savePipeline(hash: string, id: string, body: unknown): Promise<unknown> {
  return call<unknown>(`/api/projects/${hash}/pipelines/${id}`, { method: "PUT", body });
}

export function deletePipeline(hash: string, id: string): Promise<{ ok: true }> {
  return call<{ ok: true }>(`/api/projects/${hash}/pipelines/${id}`, { method: "DELETE" });
}

export function revealWorktree(hash: string, id: string): Promise<{ ok: true; path: string }> {
  return call<{ ok: true; path: string }>(
    `/api/projects/${hash}/pipelines/${id}/worktree/reveal`,
    { method: "POST" }
  );
}

export function runPipeline(hash: string, id: string): Promise<{ ok: true }> {
  return call<{ ok: true }>(`/api/projects/${hash}/pipelines/${id}/run`, { method: "POST" });
}

export function pausePipeline(hash: string, id: string): Promise<{ ok: true }> {
  return call<{ ok: true }>(`/api/projects/${hash}/pipelines/${id}/pause`, { method: "POST" });
}

// AI 合併:後端 append 一張 mode=merge ticket + 觸發 runner;立即 return,不等合併完。
// 前端靠 polling pipeline 看 ticket 進度 + 最終 pipeline.state=merged。
export function mergePipeline(hash: string, id: string): Promise<{ ok: true; ticketId: string }> {
  return call<{ ok: true; ticketId: string }>(
    `/api/projects/${hash}/pipelines/${id}/merge`,
    { method: "POST" }
  );
}

export type DiffStat = { files: number; added: number; deleted: number };

export function getDiffStat(hash: string, id: string): Promise<DiffStat | null> {
  return call<DiffStat | null>(`/api/projects/${hash}/pipelines/${id}/diff-stat`);
}

export type DiffFile = { path: string; added: number; deleted: number };
export type FullDiff = { files: DiffFile[]; raw: string };

export function getFullDiff(hash: string, id: string): Promise<FullDiff | null> {
  return call<FullDiff | null>(`/api/projects/${hash}/pipelines/${id}/diff`);
}

export type NotifRecord = {
  id: string;
  type: string;
  title: string;
  sub?: string;
  ts: number;
  unread: boolean;
  pipelineId?: string;
};

export function listNotifs(hash: string): Promise<NotifRecord[]> {
  return call<NotifRecord[]>(`/api/projects/${hash}/notifs`);
}

export function markNotifRead(hash: string, id: string): Promise<{ ok: true }> {
  return call<{ ok: true }>(`/api/projects/${hash}/notifs/${id}/read`, { method: "POST" });
}

export function dismissNotif(hash: string, id: string): Promise<{ ok: true }> {
  return call<{ ok: true }>(`/api/projects/${hash}/notifs/${id}/dismiss`, { method: "POST" });
}

export function markAllNotifsRead(hash: string): Promise<{ ok: true }> {
  return call<{ ok: true }>(`/api/projects/${hash}/notifs/mark-all-read`, { method: "POST" });
}

export type RunSummary = {
  filename: string;
  startedAt: number;
  exitCode: number | null;
  durationMs: number | null;
  costUsd: number | null;
  numTurns: number | null;
  result: string | null;
  tokens: { input: number; output: number; cacheRead: number; cacheCreate: number } | null;
  sessionId: string | null;
  hasStderr: boolean;
};

export type RunDetail = RunSummary & { stdout: string; stderr: string };

export function listPipelineRuns(hash: string, pipelineId: string): Promise<RunSummary[]> {
  return call<RunSummary[]>(`/api/projects/${hash}/pipelines/${pipelineId}/runs`);
}

export function getPipelineRun(
  hash: string,
  pipelineId: string,
  filename: string
): Promise<RunDetail> {
  return call<RunDetail>(
    `/api/projects/${hash}/pipelines/${pipelineId}/runs/${encodeURIComponent(filename)}`
  );
}
