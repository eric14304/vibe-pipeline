import { test, expect } from "@playwright/test";
import { API, VP_AUTOTEST_HASH, assertRealMode, listAutotestPipelines } from "../helpers/real-project";

// Real 模式 smoke:不燒 token,純 plumbing 驗證。
// 跑前 user 要確認 vp-autotest 在乾淨狀態(沒 running pipeline)。

test.beforeAll(async () => {
  await assertRealMode();
});

test("backend health 顯示 real mode (testMode=false)", async ({ request }) => {
  const res = await request.get(`${API}/health`);
  const body = await res.json();
  expect(body.data.testMode).toBe(false);
});

test("/api/__test/* 在 real 模式 404", async ({ request }) => {
  const res = await request.post(`${API}/__test/reset`);
  expect(res.status()).toBe(404);
});

test("vp-autotest project 可以讀到", async ({ request }) => {
  const res = await request.get(`${API}/projects/${VP_AUTOTEST_HASH}/status`);
  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(body.data.hasInit).toBe(true);
  expect(body.data.hasGit).toBe(true);
});

test("既有 pipelines 列得出來(空 array OK)", async () => {
  const list = await listAutotestPipelines();
  expect(Array.isArray(list)).toBe(true);
  // 沒驗 length — 之前的 real run 留下來的可能有
});

test("vp-autotest board UI 可 render", async ({ page }) => {
  await page.goto(`/board?project=${VP_AUTOTEST_HASH}`);
  await expect(page.locator(".proj-trigger-name", { hasText: "vp-autotest" })).toBeVisible();
});
