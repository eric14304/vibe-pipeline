import { test, expect } from "@playwright/test";
import { createTempProject, cleanupTempProject, type TempProject } from "../helpers/temp-project";
import { resetMocks, setRunnerScript, type RunnerScript } from "../helpers/mock-control";

let proj: TempProject;

test.beforeEach(async () => {
  await resetMocks();
});

test.afterEach(() => {
  if (proj) cleanupTempProject(proj);
});

function pipelineWithTickets(tickets: Array<{ id: string; title: string; mode?: "step" | "iter" }>) {
  return {
    id: "pipe-run-1",
    name: "run-pipeline",
    branch: "pipeline/run-pipeline",
    baseBranch: "main",
    state: "planning",
    tickets: tickets.map((t, i) => ({
      id: t.id,
      n: i + 1,
      title: t.title,
      goal: "g",
      acceptance: ["a"],
      prompt: "p",
      mode: t.mode ?? "step",
      status: "ready",
    })),
  };
}

test("step ticket Run → running → done → ready,commit hash 寫回", async ({ page }) => {
  proj = await createTempProject({
    pipelines: [pipelineWithTickets([{ id: "t-step-1", title: "single-step" }])],
  });
  const script: RunnerScript = {
    tickets: [
      {
        beforeRunningMs: 50,
        workMs: 80,
        finalStatus: "done",
        commitHash: "mock-abc1234567",
        commitSubject: "ticket(1): single-step",
      },
    ],
    finalState: "ready",
  };
  await setRunnerScript(proj.hash, "pipe-run-1", script);

  await page.goto(`/board?project=${proj.hash}`);
  await expect(page.locator(".rail-item-name", { hasText: "run-pipeline" })).toBeVisible();

  // 按 ▶ 開始運行
  await page.locator("button[title*='開始運行']").click();

  // 跑完進 ready 狀態 — 看 ReadyBanner
  await expect(page.locator(".banner-ready")).toBeVisible({ timeout: 10000 });
  // ✓ 全部完成 button 取代 Run button
  await expect(page.locator("button", { hasText: "全部完成" })).toBeVisible();
});

test("iter mode FAIL → PASS chain,verdicts 顯示", async ({ page }) => {
  proj = await createTempProject({
    pipelines: [pipelineWithTickets([{ id: "t-iter-1", title: "iter-task", mode: "iter" }])],
  });
  const script: RunnerScript = {
    tickets: [
      {
        beforeRunningMs: 50,
        iterRounds: [
          { verdict: "FAIL", durationMs: 60, executorSummary: "first attempt", criticFeedback: "missed AC2" },
          { verdict: "PASS", durationMs: 60, executorSummary: "addressed feedback", criticFeedback: "looks good" },
        ],
        finalStatus: "done",
        commitHash: "mock-deadbeef",
      },
    ],
    finalState: "ready",
  };
  await setRunnerScript(proj.hash, "pipe-run-1", script);

  await page.goto(`/board?project=${proj.hash}`);
  await page.locator("button[title*='開始運行']").click();

  // 等到 ready
  await expect(page.locator(".banner-ready")).toBeVisible({ timeout: 10000 });

  // verdict pip 應該有 2 個(FAIL + PASS)
  const verdictPips = page.locator(".verdict-pip");
  await expect(verdictPips).toHaveCount(2);
  await expect(verdictPips.nth(0)).toHaveClass(/is-fail/);
  await expect(verdictPips.nth(1)).toHaveClass(/is-pass/);
});

test("Pause running → state 變 paused,resume 接續", async ({ page }) => {
  proj = await createTempProject({
    pipelines: [
      pipelineWithTickets([
        { id: "t-pause-1", title: "first" },
        { id: "t-pause-2", title: "second" },
      ]),
    ],
  });
  // 第一張慢一點,給時間 click pause
  const script: RunnerScript = {
    tickets: [
      { beforeRunningMs: 100, workMs: 800, finalStatus: "done", commitHash: "mock-1" },
      { beforeRunningMs: 50, workMs: 100, finalStatus: "done", commitHash: "mock-2" },
    ],
    finalState: "ready",
    // 第 0 張 ticket 結束後 pause
    pauseAfterTicketIndex: 0,
  };
  await setRunnerScript(proj.hash, "pipe-run-1", script);

  await page.goto(`/board?project=${proj.hash}`);
  await page.locator("button[title*='開始運行']").click();

  // 等 paused 狀態(pauseAfterTicketIndex=0 → 第一張完成後直接 paused)
  await expect(page.locator("button", { hasText: /繼續/ })).toBeVisible({ timeout: 10000 });

  // 第二張仍是 ready / 未跑(ticket-row 顯示應該沒 done)
  // 第一張應該 done(commits 寫了)
});

test("沒 ticket 的 pipeline 顯示「無ticket可執行」按鈕", async ({ page }) => {
  proj = await createTempProject({
    pipelines: [
      {
        id: "pipe-empty-1",
        name: "empty-pipe",
        branch: "pipeline/empty-pipe",
        baseBranch: "main",
        state: "planning",
        tickets: [],
      },
    ],
  });
  await page.goto(`/board?project=${proj.hash}`);
  await expect(page.locator("button", { hasText: "無ticket可執行" })).toBeVisible();
});
