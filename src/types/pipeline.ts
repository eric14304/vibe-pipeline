export type TicketStatus = "draft" | "ready" | "running" | "paused" | "done" | "failed";
export type TicketMode = "step" | "iter";
export type IterStage = "doer" | "critic" | "✓" | "done";

export type Verdict = 1 | 0 | -1;

export type IterState = {
  current: number;
  totalElapsed: number;
  stage: IterStage;
  verdicts: Verdict[];
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
};

export type PipelineState = "planning" | "running" | "paused" | "ready" | "failed" | "merged";

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
