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

const TICKET_FULL = {
  id: "t-1",
  n: 1,
  title: "示範 ticket",
  goal: "驗證 drawer 各欄位",
  acceptance: ["AC1: title 顯示", "AC2: prompt 顯示"],
  prompt: "做一個 demo",
  mode: "step" as const,
  status: "done" as const,
  commits: [
    { hash: "1234567890abcdef", subject: "ticket(1): 示範 ticket", ts: Date.now() },
  ],
};

test("點 ticket → drawer 開啟,goal/acceptance/prompt 各欄位顯示", async ({ page }) => {
  proj = await createTempProject({
    pipelines: [
      {
        id: "p1",
        name: "td-pipe",
        branch: "pipeline/td-pipe",
        baseBranch: "main",
        state: "ready",
        tickets: [TICKET_FULL],
      },
    ],
  });
  await page.goto(`/board?project=${proj.hash}`);

  // 點 ticket card
  const tcard = page.locator(".ticket", { hasText: "示範 ticket" });
  await expect(tcard).toBeVisible();
  await tcard.click();

  // drawer 出現
  await expect(page.locator(".tdrw-drawer")).toBeVisible();

  // 各 section 顯示對應內容
  await expect(page.locator(".tdrw-drawer", { hasText: "驗證 drawer 各欄位" })).toBeVisible();
  await expect(page.locator(".tdrw-list li", { hasText: "AC1: title 顯示" })).toBeVisible();
  await expect(page.locator(".tdrw-prompt", { hasText: "做一個 demo" })).toBeVisible();
});

test("commits 顯示 + 點 hash 複製", async ({ page, context }) => {
  proj = await createTempProject({
    pipelines: [
      {
        id: "p1",
        name: "td-pipe",
        branch: "pipeline/td-pipe",
        baseBranch: "main",
        state: "ready",
        tickets: [TICKET_FULL],
      },
    ],
  });

  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(`/board?project=${proj.hash}`);
  await page.locator(".ticket", { hasText: "示範 ticket" }).click();

  // commit hash 短碼顯示前 7 字
  const hashBtn = page.locator(".tdrw-commit-hash-btn", { hasText: "1234567" });
  await expect(hashBtn).toBeVisible();
  await hashBtn.click();

  // 驗 clipboard 拿到完整 hash(text 變「已複製」只 1.4s,polling 容易 race)
  const txt = await page.evaluate(() => navigator.clipboard.readText());
  expect(txt).toBe("1234567890abcdef");
});

test("Esc 關 drawer", async ({ page }) => {
  proj = await createTempProject({
    pipelines: [
      {
        id: "p1",
        name: "td-pipe",
        branch: "pipeline/td-pipe",
        baseBranch: "main",
        state: "ready",
        tickets: [TICKET_FULL],
      },
    ],
  });
  await page.goto(`/board?project=${proj.hash}`);
  await page.locator(".ticket", { hasText: "示範 ticket" }).click();
  await expect(page.locator(".tdrw-drawer")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.locator(".tdrw-drawer")).not.toBeVisible();
});

test("done ticket 顯示「重置 ticket 狀態」操作按鈕", async ({ page }) => {
  proj = await createTempProject({
    pipelines: [
      {
        id: "p1",
        name: "td-pipe",
        branch: "pipeline/td-pipe",
        baseBranch: "main",
        state: "ready",
        tickets: [TICKET_FULL],
      },
    ],
  });
  await page.goto(`/board?project=${proj.hash}`);
  await page.locator(".ticket", { hasText: "示範 ticket" }).click();

  await expect(
    page.locator("button", { hasText: "重置 ticket 狀態" })
  ).toBeVisible();
});

test("draft ticket(沒 done)不顯示重置按鈕", async ({ page }) => {
  proj = await createTempProject({
    pipelines: [
      {
        id: "p1",
        name: "td-pipe",
        branch: "pipeline/td-pipe",
        baseBranch: "main",
        state: "planning",
        tickets: [
          {
            id: "t-d",
            n: 1,
            title: "draft-ticket",
            goal: "g",
            acceptance: ["a"],
            prompt: "p",
            mode: "step",
            status: "ready",
          },
        ],
      },
    ],
  });
  await page.goto(`/board?project=${proj.hash}`);
  await page.locator(".ticket", { hasText: "draft-ticket" }).click();

  await expect(page.locator("button", { hasText: "重置 ticket 狀態" })).toHaveCount(0);
});
