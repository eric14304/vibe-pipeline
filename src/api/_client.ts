import type { ApiResponse, ApiErrorCode } from "../../shared/types";

export class ApiError extends Error {
  constructor(public code: ApiErrorCode, message: string) {
    super(message);
  }
}

type CallInit = { method?: string; body?: unknown; headers?: Record<string, string> };

export async function call<T>(path: string, init?: CallInit): Promise<T> {
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
