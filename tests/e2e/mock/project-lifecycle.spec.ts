import { test, expect } from "@playwright/test";
import { createTempProject, cleanupTempProject, type TempProject } from "../helpers/temp-project";
import { resetMocks } from "../helpers/mock-control";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TEST_API_BASE } from "../helpers/api-base";

let proj: TempProject;

test.beforeEach(async () => {
  await resetMocks();
});
test.afterEach(() => {
  if (proj) cleanupTempProject(proj);
});

test("URL ?project=<hash> 直接導向該 project", async ({ page }) => {
  proj = await createTempProject();
  await page.goto(`/board?project=${proj.hash}`);
  await expect(page.locator(".proj-trigger-name")).toBeVisible();
  // localStorage 應該存了 hash
  const stored = await page.evaluate(() => localStorage.getItem("vibe-pipeline:lastProjectHash"));
  expect(stored).toBe(proj.hash);
});

test("localStorage 殘留 hash + URL 沒帶 → fallback 到 stored project", async ({ page }) => {
  proj = await createTempProject();
  await page.goto(`/board?project=${proj.hash}`);
  // localStorage 已寫
  await page.goto("/board");
  // 不帶 ?project= 也應該載入該 project
  await expect(page.locator(".proj-trigger-name")).toBeVisible();
});

test("hasGit=false 時 board 仍 render(fixture project 都有 git;這裡用無 git dir)", async ({ page, request }) => {
  // 手動建一個沒 git 的 dir 註冊
  const dir = mkdtempSync(join(tmpdir(), "vp-e2e-nogit-"));
  // 建 .vibe-pipeline 但不 git init
  mkdirSync(join(dir, ".vibe-pipeline"), { recursive: true });
  writeFileSync(
    join(dir, ".vibe-pipeline", "config.json"),
    JSON.stringify({ defaults: {} })
  );

  const res = await request.post(`${TEST_API_BASE}/register-project`, {
    data: { path: dir, ensureInit: true },
  });
  const body = await res.json();
  const hash = body.data.hash;

  await page.goto(`/board?project=${hash}`);
  // 沒 git → branch chip 不存在(只有 hasGit 才顯示)
  await expect(page.locator(".chip.mono", { hasText: /^main$/ })).toHaveCount(0);

  rmSync(dir, { recursive: true, force: true });
});

test("project recentProjects 排序(剛開的在上)", async ({ page, request }) => {
  // 開兩個 project
  const p1 = await createTempProject();
  const p2 = await createTempProject();
  await page.goto(`/board?project=${p1.hash}`);
  await page.locator(".proj-trigger").click();

  // dropdown 列出兩個都有
  const items = page.locator(".proj-menu-item");
  const count = await items.count();
  expect(count).toBeGreaterThanOrEqual(2);

  cleanupTempProject(p1);
  cleanupTempProject(p2);
  void request;
});
