// 前後端共用持久化型別。Backend 是 source of truth。

export type Project = {
  path: string; // absolute
  hash: string; // sha256(path).slice(0, 8)
  name: string; // basename(path)
  hasInit: boolean; // .vibe-pipeline/ 是否存在
  hasGit: boolean; // .git/ 是否存在(runner 階段需要)
  lastOpenedAt: number; // unix ms
};

export type ApiOk<T> = { ok: true; data: T };
export type ApiErr = { ok: false; error: { code: ApiErrorCode; message: string } };
export type ApiResponse<T> = ApiOk<T> | ApiErr;

export type ApiErrorCode =
  | "not_found"
  | "permission_denied"
  | "dialog_cancelled"
  | "invalid_path"
  | "not_initialized"
  | "already_initialized"
  | "internal_error";

// ─── Notification taxonomy ─────────────────────────────────────────
// Schema 先定下,producer / 觸發點等 [P2] runner 落地再寫。
// sev: block 需 user 動作 / info 重要更新 / muted 活動紀錄
// phase: 標示這個事件什麼時候會真的有來源觸發

export type NotifSeverity = "block" | "info" | "muted";
export type NotifPhase = "stub-first" | "P2" | "P3";

export type NotifEventType =
  // stub-first(現在能觸發,但 user 自己剛做完,通常不發)
  | "project_init"
  | "pipeline_created"
  | "pipeline_deleted"
  | "pipeline_renamed"
  | "ticket_added"
  | "ticket_removed"
  | "ticket_status_changed"
  // P2(runner / budget 落地後)
  | "ticket_started"
  | "iter_critic_pass"
  | "iter_critic_fail"
  | "ticket_done"
  | "ticket_failed"
  | "pipeline_ready_to_merge"
  | "pipeline_merged"
  | "pipeline_failed"
  | "budget_warn"
  | "budget_hard_cap"
  | "runner_stall"
  | "runner_crash"
  // P3(SKILL / 跨 pipeline / 排程)
  | "skill_candidate"
  | "cross_pipeline_pattern"
  | "scheduler_fired";

export type NotifEventMeta = {
  sev: NotifSeverity;
  phase: NotifPhase;
  label: string;
};

export const NOTIF_EVENTS: Record<NotifEventType, NotifEventMeta> = {
  project_init: { sev: "muted", phase: "stub-first", label: "Project 初始化完成" },
  pipeline_created: { sev: "muted", phase: "stub-first", label: "Pipeline 建立" },
  pipeline_deleted: { sev: "muted", phase: "stub-first", label: "Pipeline 刪除" },
  pipeline_renamed: { sev: "muted", phase: "stub-first", label: "Pipeline 改名" },
  ticket_added: { sev: "muted", phase: "stub-first", label: "Ticket 加入" },
  ticket_removed: { sev: "muted", phase: "stub-first", label: "Ticket 移除" },
  ticket_status_changed: { sev: "muted", phase: "stub-first", label: "Ticket 狀態變更" },

  ticket_started: { sev: "muted", phase: "P2", label: "Ticket 開始跑" },
  iter_critic_pass: { sev: "info", phase: "P2", label: "Iteration critic pass" },
  iter_critic_fail: { sev: "muted", phase: "P2", label: "Iteration critic fail(連續 N 次升 block)" },
  ticket_done: { sev: "info", phase: "P2", label: "Ticket done" },
  ticket_failed: { sev: "block", phase: "P2", label: "Ticket failed" },
  pipeline_ready_to_merge: { sev: "info", phase: "P2", label: "Pipeline ready to merge" },
  pipeline_merged: { sev: "info", phase: "P2", label: "Pipeline merge 完成" },
  pipeline_failed: { sev: "block", phase: "P2", label: "Pipeline failed" },
  budget_warn: { sev: "info", phase: "P2", label: "Budget 80% 警告" },
  budget_hard_cap: { sev: "block", phase: "P2", label: "Budget 硬上限" },
  runner_stall: { sev: "block", phase: "P2", label: "Runner 卡住" },
  runner_crash: { sev: "block", phase: "P2", label: "Runner crash" },

  skill_candidate: { sev: "info", phase: "P3", label: "新 SKILL 候選" },
  cross_pipeline_pattern: { sev: "info", phase: "P3", label: "跨 pipeline 模式偵測" },
  scheduler_fired: { sev: "muted", phase: "P3", label: "排程觸發" },
};
