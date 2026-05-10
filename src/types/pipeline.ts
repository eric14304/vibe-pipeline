export type TicketStatus =
  | "draft"
  | "ready"
  | "running"
  | "paused"
  | "done"
  | "failed"
  | "failed_iter_limit"
  | "failed_transient";
export type TicketMode = "step" | "iter";
export type IterStage = "doer" | "critic" | "✓" | "done";

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

export type IterState = {
  current: number;
  totalElapsed: number;
  stage: IterStage;
  verdicts: Verdict[];
  rounds?: IterRound[];
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
  mode: TicketMode;
  status: TicketStatus;
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
  mergeStrategy?: string;
};

export type Project = {
  path: string;
  name: string;
  branch: string;
  pipelines: number;
  recent?: boolean;
};
