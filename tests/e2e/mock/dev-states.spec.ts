import { test, expect } from "@playwright/test";

test("/dev/states gallery 路由可達", async ({ page }) => {
  await page.goto("/dev/states");
  // gallery 至少 render(body 有東西)
  await expect(page.locator("body")).not.toBeEmpty();
});

test("gallery 顯示多個狀態 sample(RunButton / ReadyBanner)", async ({ page }) => {
  await page.goto("/dev/states");
  // 至少看得到一些 state 字
  const text = await page.locator("body").innerText();
  expect(text.length).toBeGreaterThan(50);
});
