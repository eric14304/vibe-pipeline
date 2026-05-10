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
  paused: "暫停",
  running: "執行中",
  stopping: "停止中",
  queued: "排隊中",
  ready: "可合併",
  planning: "規劃中",
  failed: "失敗",
  merged: "已合併",
  // ticket statuses
  done: "完成",
  draft: "草稿",
  failed_iter_limit: "達 iter 上限",
  failed_transient: "暫時錯誤",
};

export function fmtElapsed(s: number): string {
  const m = Math.floor(s / 60),
    sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
