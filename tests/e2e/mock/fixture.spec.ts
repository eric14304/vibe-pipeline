import { test, expect } from "@playwright/test";
import { createTempProject, cleanupTempProject, type TempProject } from "../helpers/temp-project";
import { resetMocks } from "../helpers/mock-control";
import { API_BASE } from "../helpers/api-base";

// Phase 2 驗證:fixture project + mock 控制端點通。
// 建一個 temp project,seed 一條 pipeline,進 board 看 Rail 顯示得到。

let proj: TempProject;

test.beforeEach(async () => {
  await resetMocks();
  proj = await createTempProject({
    pipelines: [
      {
        id: "pipe-fixture-1",
        name: "fixture-pipeline-a",
        branch: "pipeline/fixture-pipeline-a",
        baseBranch: "main",
        state: "planning",
        tickets: [],
      },
    ],
  });
});

test.afterEach(async () => {
  if (proj) cleanupTempProject(proj);
});

test("temp project 註冊後 health 報 testMode=true", async ({ request }) => {
  const res = await request.get(`${API_BASE}/health`);
  const body = await res.json();
  expect(body.data.testMode).toBe(true);
});

test("seed 的 pipeline 出現在 Rail", async ({ page }) => {
  await page.goto(`/board?project=${proj.hash}`);
  // Rail item 用 .rail-item-name span;Focus title 也會顯示同名,所以縮 Rail 內找
  await expect(page.locator(".rail-item-name", { hasText: "fixture-pipeline-a" })).toBeVisible();
});
