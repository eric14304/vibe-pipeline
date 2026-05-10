// pipeline / ticket 狀態的 UI 對應(顏色 / 文字 / 時間格式)。
// 之前還有 PIPELINES / PROJECTS mock seed,phase 3 後 prototype 路由全砍掉,
// 不再 import seed,只剩這三個 helper。

export const STATE_COLOR: Record<string, string> = {
  // pipeline states
  paused: "var(--paused)",
  running: "var(--running)",
  stopping: "var(--paused)",
  queued: "var(--queued)",
  ready: "var(--done)",
  planning: "var(--draft)",
  failed: "var(--failed)",
  merged: "var(--fg-faint)",
  // ticket statuses
  done: "var(--done)",
  draft: "var(--draft)",
  failed_iter_limit: "var(--failed)",
  failed_transient: "var(--failed)",
};

export const STATE_LABEL: Record<string, string> = {
  // pipeline states
  paused: "paused",
  running: "running",
  stopping: "stopping",
  queued: "queued",
  ready: "ready to merge",
  planning: "planning",
  failed: "failed",
  merged: "merged",
  // ticket statuses
  done: "done",
  draft: "draft",
  failed_iter_limit: "iter 上限",
  failed_transient: "transient 失敗",
};

export function fmtElapsed(s: number): string {
  const m = Math.floor(s / 60),
    sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
