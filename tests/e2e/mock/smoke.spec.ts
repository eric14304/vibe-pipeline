import { test, expect } from "@playwright/test";
import { API_BASE } from "../helpers/api-base";

// Phase 1 smoke:確認 playwright + vite + bun server 啟得起來、route 通、frontend 渲染。
// 沒寫 backend mock 注入,純 boot test。Phase 2 才做 fixture project + mock script。

test("backend health 回應 ok", async ({ request }) => {
  const res = await request.get(`${API_BASE}/health`);
  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(body.ok).toBe(true);
  expect(body.data.status).toBe("up");
});

test("/ 重導向 /board", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/board/);
});

test("沒 project 時 board 顯示 empty 狀態", async ({ page }) => {
  // localStorage 可能殘留之前 session 的 project hash。清掉確保是空狀態。
  await page.goto("/board");
  await page.evaluate(() => localStorage.removeItem("vibe-pipeline:lastProjectHash"));
  await page.goto("/board");
  // 不指定 selector,先驗 page 不是 blank — phase 2 加 testid 後會收緊
  await expect(page.locator("body")).not.toBeEmpty();
});
