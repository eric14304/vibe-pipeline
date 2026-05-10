// 前後端共用持久化型別。Backend 是 source of truth。

// ─── User-level config(~/.vibe-pipeline/config.json,跨 project) ───
// 跟 <target-repo>/.vibe-pipeline/config.json (per-project, max_parallel 等) 不同層。
export type ModelName = "opus" | "sonnet" | "haiku";
export type Effort = "low" | "medium" | "high";
export type TaskClass = "qa" | "runner" | "subAgent" | "merge";

export type TaskModelConfig = {
  model: ModelName;
  effort: Effort;
};

export type UserConfig = {
  defaults: Record<TaskClass, TaskModelConfig>;
};

export const DEFAULT_USER_CONFIG: UserConfig = {
  defaults: {
    qa: { model: "sonnet", effort: "low" },
    runner: { model: "opus", effort: "medium" },
    subAgent: { model: "opus", effort: "high" },
    merge: { model: "opus", effort: "high" },
  },
};

export const TASK_CLASSES: TaskClass[] = ["qa", "runner", "subAgent", "merge"];
export const MODEL_NAMES: ModelName[] = ["opus", "sonnet", "haiku"];
export const EFFORT_LEVELS: Effort[] = ["low", "medium", "high"];

export const TASK_CLASS_LABELS: Record<TaskClass, string> = {
  qa: "QA(規格收斂)",
  runner: "Runner 主 agent",
  subAgent: "Sub-agent(執行AI / 審核AI)",
  merge: "AI 合併",
};


export type Project = {
  path: string; // absolute
  hash: string; // sha256(path).slice(0, 8)
  name: string; // basename(path)
  hasInit: boolean; // .vibe-pipeline/ 是否存在
  hasGit: boolean; // .git/ 是否存在(runner 階段需要)
  lastOpenedAt: number; // unix ms
  currentBranch?: string; // 當前 git HEAD 短名(`git symbolic-ref --short HEAD`),非 git repo 為 undefined
  defaultBaseBranch?: string; // config.defaults.base_branch(沒設則 fallback 當前 git branch)
  costLimitUsd?: number; // config.defaults.cost_limit_usd(0 = 無限)
};

// ─── QA / Ticket spec ─────────────────────────────────────────────
// mode: "step" = 單次任務(跑一次就收) / "iter" = 迭代任務(執行AI ↔ 審核AI 來回到通過)
export type TicketSpec = {
  title: string;
  goal: string;
  acceptance: string[];
  prompt: string;
  mode: "step" | "iter";
  iterLimit?: number; // iter 模式上限輪數,預設 5
  iterStopAtLimit?: boolean; // 達上限是否整條 pause(true),否則標 ticket failed 跳下一張(false),預設 true
};

export const DEFAULT_ITER_LIMIT = 5;
export const DEFAULT_ITER_STOP_AT_LIMIT = true;
export const MODE_LABELS: Record<TicketSpec["mode"] | "merge" | "sync", string> = {
  iter: "迭代任務",
  step: "單次任務",
  merge: "AI 合併",
  sync: "AI 同步",
};

export type PartialSpec = Partial<TicketSpec>;

export type QAReply = {
  message: string;
  options: string[];
  optionsMode?: "single" | "multi";
  complete: boolean;
  spec: PartialSpec | null;
  // 選填:complete=true 時若 AI 判斷範圍橫跨多件獨立 ticket → 填 N 個完整 spec。
  // 用於零延遲 split(取代後跑的 splitTicketSpec call)。length < 2 等同沒拆建議,前端忽略
  splitInto?: TicketSpec[];
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
  sessionStarted: boolean;
  complete: boolean;
  createdAt: number;
  updatedAt: number;
  turns: Turn[];
  spec: PartialSpec | null;
  // QA 開始時 snapshot 的 pipeline 內既有 ticket 摘要,供 AI 引導時避免重複定義。
  // 不在後續 turn 重抓 — 一條 draft 整段對話用同一份上下文,避免 AI 看到漂移。
  pipelineContext?: string;
  // QA AI 在 complete=true 那輪若認為範圍橫跨多件 → 提供 N 個完整 spec。
  // 替代後跑 splitTicketSpec(零額外 latency)。frontend 在 finalize 前讓 user 選拆/不拆
  splitInto?: TicketSpec[];
};

export function isCompleteSpec(s: unknown): s is TicketSpec {
  if (!s || typeof s !== "object") return false;
  const o = s as Record<string, unknown>;
  return (
    typeof o.title === "string" &&
    o.title.length > 0 &&
    typeof o.goal === "string" &&
    o.goal.length > 0 &&
    Array.isArray(o.acceptance) &&
    o.acceptance.length > 0 &&
    o.acceptance.every((x) => typeof x === "string") &&
    typeof o.prompt === "string" &&
    o.prompt.length > 0 &&
    (o.mode === "step" || o.mode === "iter")
  );
}

// ─── Pipeline / Ticket(持久化於 .vibe-pipeline/pipelines/<id>.json) ───
// "merge" / "sync" 是 synthetic ticket(/merge / /sync endpoint append),不在 QA / TicketSpec 列表
export type TicketMode = "step" | "iter" | "merge" | "sync";

export type TicketStatus =
  | "draft"
  | "ready"
  | "running"
  | "paused"
  | "done"
  | "failed"
  | "failed_iter_limit"
  | "failed_transient";

// 1/0/-1 是舊 prototype mock 格式;runner 寫回是字串 "PASS"/"FAIL"/"PARTIAL"
export type Verdict = 1 | 0 | -1 | "PASS" | "FAIL" | "PARTIAL";

// 一輪 iter 的紀錄。runner 主 agent 在每輪審核完寫進 ticket.iter.rounds[]。
export type IterRound = {
  n: number;                  // 第幾輪 (1-based)
  startedAt: number;          // 執行AI 派出當下,unix ms
  endedAt?: number;           // 審核完當下
  executorSummary?: string;   // 主 agent 拿到 sub-agent 結果後的簡述(<=300 字)
  criticVerdict: "PASS" | "FAIL" | "PARTIAL";
  criticFeedback?: string;    // 審核AI 給的 feedback(下一輪 prompt 用)
};

// iter 階段(UI 用;persistent JSON 寫 "doer"/"critic"/"done" 等)
export type IterStage = "doer" | "critic" | "✓" | "done";

// 持久化的 iter 狀態(寫進 ticket.iter)。
// totalElapsed 不在實際 JSON,前端 FocusColumn 依 rounds[] 推算後可選擇掛上來;
// 保留 optional 欄位讓 UI 與型別都不用走 cast。
export type IterState = {
  current: number;
  stage: IterStage;
  verdicts: Verdict[];
  rounds?: IterRound[];
  totalElapsed?: number;
};

// ticket 完成後 runner commit 的紀錄
export type CommitRef = {
  hash: string;       // git rev-parse HEAD 抓的完整 hash
  subject: string;    // commit message 第一行
  ts: number;         // commit 時間 unix ms
};

export type Ticket = {
  id: string;
  n: number;
  title: string;
  goal?: string;
  acceptance?: string[];
  prompt?: string;
  mode: TicketMode;
  status: TicketStatus;
  iterLimit?: number;
  iterStopAtLimit?: boolean;
  // step / iter 共用:runner 寫 unix ms,給 UI 算 elapsed 用
  startedAt?: number;
  endedAt?: number;
  meta?: string;
  iter?: IterState;
  liveLog?: string;
  reason?: string;
  commits?: CommitRef[];
};

export type PipelineState =
  | "planning"
  | "running"
  | "stopping"
  | "queued"
  | "paused"
  | "ready"
  | "failed"
  | "merged";

export type Pipeline = {
  id: string;
  name: string;
  branch: string;
  state: PipelineState;
  tickets: Ticket[];
  baseBranch?: string;
  mergedAt?: number;
  mergeCommit?: { hash: string; subject: string; ts: number };
};

// ─── Run log(.runtime/logs/<pipelineId>-<ts>.log 解析結果) ───
export type RunSummary = {
  filename: string;       // <pipelineId>-<ts>.log
  startedAt: number;      // 從 filename 拆 ts
  exitCode: number | null;
  durationMs: number | null;
  costUsd: number | null;
  numTurns: number | null;
  result: string | null;  // claude CLI "result" 欄位 (主 agent 最終訊息)
  tokens: {
    input: number;
    output: number;
    cacheRead: number;
    cacheCreate: number;
  } | null;
  sessionId: string | null;
  hasStderr: boolean;
};

export type RunDetail = RunSummary & {
  stdout: string;
  stderr: string;
};

// ─── Worktree diff(server/lib/git/worktree.ts 算 / frontend 顯示) ───
export type DiffStat = { files: number; added: number; deleted: number };
export type DiffFile = { path: string; added: number; deleted: number };
export type FullDiff = { files: DiffFile[]; raw: string };

// ─── API envelope ─────────────────────────────────────────────────
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
  | "budget_exceeded"
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
  | "pipeline_started"
  | "pipeline_queued"
  | "pipeline_paused"
  | "ticket_started"
  | "iter_critic_pass"
  | "iter_critic_fail"
  | "ticket_done"
  | "ticket_failed"
  | "pipeline_ready_to_merge"
  | "merge_started"
  | "merge_blocked"
  | "pipeline_merged"
  | "pipeline_failed"
  | "budget_warn"
  | "budget_hard_cap"
  | "pipeline_blocked_budget"
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

// 持久化的 notif 紀錄(append-only 寫進 .runtime/notifs.jsonl)
export type NotifRecord = {
  id: string;
  type: NotifEventType;
  title: string;
  sub?: string;
  ts: number;
  unread: boolean;
  pipelineId?: string;
};

export const NOTIF_EVENTS: Record<NotifEventType, NotifEventMeta> = {
  project_init: { sev: "muted", phase: "stub-first", label: "Project 初始化完成" },
  pipeline_created: { sev: "muted", phase: "stub-first", label: "Pipeline 建立" },
  pipeline_deleted: { sev: "muted", phase: "stub-first", label: "Pipeline 刪除" },
  pipeline_renamed: { sev: "muted", phase: "stub-first", label: "Pipeline 改名" },
  ticket_added: { sev: "muted", phase: "stub-first", label: "Ticket 加入" },
  ticket_removed: { sev: "muted", phase: "stub-first", label: "Ticket 移除" },
  ticket_status_changed: { sev: "muted", phase: "stub-first", label: "Ticket 狀態變更" },

  pipeline_started: { sev: "muted", phase: "P2", label: "Pipeline 開始運行" },
  pipeline_queued: { sev: "muted", phase: "P2", label: "Pipeline 已排隊" },
  pipeline_paused: { sev: "info", phase: "P2", label: "Pipeline 已暫停" },
  ticket_started: { sev: "muted", phase: "P2", label: "Ticket 開始跑" },
  iter_critic_pass: { sev: "info", phase: "P2", label: "Iteration critic pass" },
  iter_critic_fail: { sev: "muted", phase: "P2", label: "Iteration critic fail(連續 N 次升 block)" },
  ticket_done: { sev: "info", phase: "P2", label: "Ticket done" },
  ticket_failed: { sev: "block", phase: "P2", label: "Ticket failed" },
  pipeline_ready_to_merge: { sev: "info", phase: "P2", label: "Pipeline ready to merge" },
  merge_started: { sev: "muted", phase: "P2", label: "AI 合併開始" },
  merge_blocked: { sev: "block", phase: "P2", label: "AI 合併失敗,需處理" },
  pipeline_merged: { sev: "info", phase: "P2", label: "Pipeline merge 完成" },
  pipeline_failed: { sev: "block", phase: "P2", label: "Pipeline failed" },
  budget_warn: { sev: "info", phase: "P2", label: "Budget 80% 警告" },
  budget_hard_cap: { sev: "block", phase: "P2", label: "Budget 硬上限" },
  pipeline_blocked_budget: { sev: "block", phase: "P2", label: "Pipeline 被預算上限擋下" },
  runner_stall: { sev: "block", phase: "P2", label: "Runner 卡住" },
  runner_crash: { sev: "block", phase: "P2", label: "Runner crash" },

  skill_candidate: { sev: "info", phase: "P3", label: "新 SKILL 候選" },
  cross_pipeline_pattern: { sev: "info", phase: "P3", label: "跨 pipeline 模式偵測" },
  scheduler_fired: { sev: "muted", phase: "P3", label: "排程觸發" },
};
