import { test } from "@playwright/test";

const PROJECT_HASH = "1876248b";
const PAUSED_PIPELINE_ID = "019e40b31763-auto-update";

test("freeze/resume burst probe", async ({ browser }) => {
  test.setTimeout(120_000);

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.addInitScript((hash) => {
    try { localStorage.setItem("vibe-pipeline:lastProjectHash", hash); } catch {}
  }, PROJECT_HASH);

  const requests: { t: number; url: string }[] = [];
  let recordStart = Date.now();
  page.on("request", (req) => {
    const u = req.url();
    if (!u.includes("/api/")) return;
    requests.push({ t: Date.now() - recordStart, url: u.replace(/.*\/api\//, "/api/") });
  });

  await page.goto(`/?project=${PROJECT_HASH}&pipeline=${PAUSED_PIPELINE_ID}`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(3000);

  const rail = page.locator(".rail-item", { hasText: "auto-update" }).first();
  await rail.waitFor({ state: "visible", timeout: 10000 });
  await rail.click();
  await page.waitForTimeout(2000);

  console.log("\n=== TEST 1: visibility hidden 15s (沒 freeze 純 hidden) → resume ===");
  requests.length = 0;
  recordStart = Date.now();

  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  console.log("  hidden, wait 15s");
  await page.waitForTimeout(15000);
  console.log(`  hidden 期間 requests: ${requests.length}`);

  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
  });
  await page.waitForTimeout(3000);
  console.log(`  resume 後 3s 內 total: ${requests.length}`);
  for (const r of requests) console.log(`  +${r.t}ms ${r.url}`);

  console.log("\n=== TEST 2: 模擬 Chrome freeze event → resume ===");
  requests.length = 0;
  recordStart = Date.now();

  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    document.dispatchEvent(new Event("freeze"));
  });
  console.log("  frozen, wait 15s");
  await page.waitForTimeout(15000);
  console.log(`  frozen 期間 requests: ${requests.length}`);

  await page.evaluate(() => {
    document.dispatchEvent(new Event("resume"));
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
  });
  await page.waitForTimeout(3000);
  console.log(`  resume 後 3s 內 total: ${requests.length}`);
  for (const r of requests) console.log(`  +${r.t}ms ${r.url}`);

  await ctx.close();
});
