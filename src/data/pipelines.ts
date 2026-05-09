import type { Pipeline, Project } from "../types/pipeline";

export const PIPELINES: Pipeline[] = [
  {
    id: "feat-auth",
    name: "feat-auth",
    branch: "pipeline/feat-auth",
    state: "paused",
    tickets: [
      { id: "t1", n: 1, title: "DB schema 設計", mode: "step", status: "done", meta: "12 min" },
      {
        id: "t2",
        n: 2,
        title: "OAuth flow 收斂",
        mode: "iter",
        status: "paused",
        iter: { current: 6, totalElapsed: 258, stage: "critic", verdicts: [1, 1, 0, -1, -1, -1] },
        reason: "critic 連續 3 次 reject — 同樣的 token refresh edge case",
      },
      { id: "t3", n: 3, title: "route handlers", mode: "step", status: "ready", meta: "等上游" },
      { id: "t4", n: 4, title: "session util", mode: "step", status: "draft" },
      { id: "t5", n: 5, title: "login UI", mode: "step", status: "draft" },
    ],
  },
  {
    id: "feat-search",
    name: "feat-search",
    branch: "pipeline/feat-search",
    state: "running",
    tickets: [
      { id: "s1", n: 1, title: "indexer skel", mode: "step", status: "done", meta: "8 min" },
      {
        id: "s2",
        n: 2,
        title: "ranking algorithm",
        mode: "iter",
        status: "running",
        iter: { current: 3, totalElapsed: 47, stage: "doer", verdicts: [1, 0] },
        liveLog: "doer · drafting BM25 + recency boost…",
      },
      { id: "s3", n: 3, title: "UI 整合", mode: "step", status: "ready", meta: "等上游" },
    ],
  },
  {
    id: "refactor-api",
    name: "refactor-api",
    branch: "pipeline/refactor-api",
    state: "ready",
    tickets: [
      { id: "r1", n: 1, title: "extract router", mode: "step", status: "done", meta: "6 min" },
      { id: "r2", n: 2, title: "middleware split", mode: "step", status: "done", meta: "9 min" },
      {
        id: "r3",
        n: 3,
        title: "error mapping",
        mode: "iter",
        status: "done",
        iter: { current: 4, totalElapsed: 192, stage: "done", verdicts: [0, 1, 1, 1] },
        meta: "4 iter",
      },
      { id: "r4", n: 4, title: "tests", mode: "step", status: "done", meta: "11 min" },
    ],
  },
  {
    id: "infra-ci",
    name: "infra-ci",
    branch: "pipeline/infra-ci",
    state: "planning",
    tickets: [
      { id: "i1", n: 1, title: "GitHub Actions skel", mode: "step", status: "draft" },
      { id: "i2", n: 2, title: "lint job", mode: "step", status: "draft" },
      { id: "i3", n: 3, title: "test matrix", mode: "step", status: "draft" },
      { id: "i4", n: 4, title: "preview deploy", mode: "step", status: "draft" },
      { id: "i5", n: 5, title: "Slack 通知", mode: "step", status: "draft" },
      { id: "i6", n: 6, title: "release tag", mode: "step", status: "draft" },
    ],
  },
];

export const PROJECTS: Project[] = [
  { path: "~/code/vibe-flow", name: "vibe-flow", branch: "main", pipelines: 4, recent: true },
  { path: "~/code/marketing-site", name: "marketing-site", branch: "develop", pipelines: 1 },
  { path: "~/work/billing-svc", name: "billing-svc", branch: "release/2.4", pipelines: 2 },
  { path: "~/code/internal-docs", name: "internal-docs", branch: "main", pipelines: 0 },
];

export const STATE_COLOR: Record<string, string> = {
  paused: "var(--paused)",
  running: "var(--running)",
  ready: "var(--done)",
  planning: "var(--draft)",
  failed: "var(--failed)",
  merged: "var(--fg-faint)",
  done: "var(--done)",
  draft: "var(--draft)",
};

export const STATE_LABEL: Record<string, string> = {
  paused: "paused",
  running: "running",
  ready: "ready to merge",
  planning: "planning",
  failed: "failed",
  merged: "merged",
  done: "done",
  draft: "draft",
};

export function fmtElapsed(s: number): string {
  const m = Math.floor(s / 60),
    sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
