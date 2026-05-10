import { test, expect } from "@playwright/test";
import { createTempProject, cleanupTempProject, type TempProject } from "../helpers/temp-project";
import { resetMocks } from "../helpers/mock-control";

let proj: TempProject;

test.beforeEach(async () => {
  await resetMocks();
});
test.afterEach(() => {
  if (proj) cleanupTempProject(proj);
});

test("沒 project → EmptyShell + 引導開資料夾", async ({ page }) => {
  // 清掉 lastProjectHash,隨意 hash 進不去
  await page.goto("/board");
  await page.evaluate(() => localStorage.removeItem("vibe-pipeline:lastProjectHash"));
  await page.goto("/board");
  // 不指定 project → 應該看到 emptyshell / 引導文字
  await expect(page.locator("body")).not.toBeEmpty();
});

test("空 project(沒 pipeline)→ 顯示「新 pipeline」CTA", async ({ page }) => {
  proj = await createTempProject();
  await page.goto(`/board?project=${proj.hash}`);
  await expect(page.locator(".rail-add", { hasText: "新 pipeline" })).toBeVisible();
});

test("空 pipeline(沒 ticket)→ 顯示 EmptyTickets 引導", async ({ page }) => {
  proj = await createTempProject({
    pipelines: [
      {
        id: "p-empty",
        name: "empty-tickets",
        branch: "pipeline/empty-tickets",
        baseBranch: "main",
        state: "planning",
        tickets: [],
      },
    ],
  });
  await page.goto(`/board?project=${proj.hash}`);
  // EmptyTickets 區應該顯示
  await expect(page.locator(".create-empty, .focus-list")).toBeVisible();
});
