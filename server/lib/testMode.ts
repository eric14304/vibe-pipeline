// E2E mock 注入點。VP_TEST_MODE=mock 時:
//  - claudeCli.runTurn 不 spawn,讀 qaScripts(projectHash) 拿下一筆 reply
//  - orchestrator.start 不 spawn,讀 runnerScripts(projectHash, pipelineId) 模擬時間軸
// 控制端點 /api/__test/* 寫入這兩個 store。
//
// real 模式 (VP_TEST_MODE 非 "mock"):isTestMode() 回 false,所有 fake 分支跳過,行為跟以前一樣。

import type { QAReply } from "./qa/schema";

export function isTestMode(): boolean {
  return process.env.VP_TEST_MODE === "mock";
}

// ─── QA mock ──────────────────────────────────────────────────────────
// per project hash 一條 queue。每呼叫 runTurn 從前面取一筆。空 queue 拋錯讓 spec 看到問題。

const qaScripts = new Map<string, QAReply[]>();

export function setQAScript(projectHash: string, replies: QAReply[]): void {
  qaScripts.set(projectHash, [...replies]);
}

export function nextQAReply(projectHash: string): QAReply {
  const q = qaScripts.get(projectHash);
  if (!q || q.length === 0) {
    throw new Error(
      `[testMode] QA script empty for projectHash=${projectHash}. ` +
        `先 POST /api/__test/script/qa 設劇本`
    );
  }
  const reply = q.shift();
  if (!reply) throw new Error("[testMode] QA reply unexpectedly null");
  return reply;
}

// ─── Runner mock ──────────────────────────────────────────────────────
// per (projectHash, pipelineId) 一個劇本。tickets 陣列依序模擬。
// runner orchestrator 啟動後:
//  for each ticket:
//    delay(beforeRunningMs) → ticket.status = running
//    iter mode:依 iterRounds 序列模擬 (每輪 delay + 寫 round + verdict),最後一筆 PASS / 達 finalStatus
//    step mode:delay(workMs) 後直接設 finalStatus
//    寫 commits[] 用假 hash
//  所有 ticket done → pipeline.state = "ready"(或 "paused" / "failed" 看 script.outcome)

export type RunnerScriptRound = {
  verdict: "PASS" | "FAIL" | "PARTIAL";
  executorSummary?: string;
  criticFeedback?: string;
  durationMs?: number;
};

export type RunnerScriptTicket = {
  beforeRunningMs?: number;
  iterRounds?: RunnerScriptRound[]; // iter 模式才用,step 模式給空陣列
  workMs?: number; // step 模式 ticket 執行時間
  finalStatus: "done" | "failed" | "failed_iter_limit" | "failed_transient";
  commitHash?: string; // 假 hash,例如 "mock-abc1234"
  commitSubject?: string;
};

export type RunnerScript = {
  tickets: RunnerScriptTicket[];
  // pipeline 收尾 state。預設 "ready" (全成功);測 pause/fail 流程用 "paused" / "failed";
  // "merged" 給 merge / auto-merge spec 驗 worktree prune 用
  finalState?: "ready" | "paused" | "failed" | "merged";
  // 模擬整段被 pause 後的行為 — 中途某 ticket 結束後標 paused。null 表示不 pause。
  pauseAfterTicketIndex?: number;
};

const runnerScripts = new Map<string, RunnerScript>();

function runnerKey(projectHash: string, pipelineId: string): string {
  return `${projectHash}:${pipelineId}`;
}

export function setRunnerScript(
  projectHash: string,
  pipelineId: string,
  script: RunnerScript
): void {
  runnerScripts.set(runnerKey(projectHash, pipelineId), script);
}

export function getRunnerScript(
  projectHash: string,
  pipelineId: string
): RunnerScript | null {
  return runnerScripts.get(runnerKey(projectHash, pipelineId)) ?? null;
}

// ─── Split mock ───────────────────────────────────────────────────────
// per projectHash 一筆 splitInto[]。inline ticket split(routes/qa.ts:splitTicket)
// 在 mock 模式不 spawn claude,直接吐預定義 splitInto。
// 注意:長度 1 → backend 視為 nothingToSplit;長度 >= 2 → 拆。
// 長度 0(empty list)→ 模擬「沒設劇本」場景,沿用「不拆」fallback([spec])。

import type { TicketSpec } from "../../shared/types";

const splitScripts = new Map<string, TicketSpec[]>();

export function setSplitScript(projectHash: string, specs: TicketSpec[]): void {
  splitScripts.set(projectHash, [...specs]);
}

export function getSplitScript(projectHash: string): TicketSpec[] | null {
  return splitScripts.get(projectHash) ?? null;
}

// ─── Reset ────────────────────────────────────────────────────────────

export function resetMocks(): void {
  qaScripts.clear();
  runnerScripts.clear();
  splitScripts.clear();
}
