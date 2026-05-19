import { expect, test } from "@playwright/test";

// Probe: 驗 useApi dedupe(974811f)+ windowsHide(e73d772)真實生效
// 跑前置條件(probe config 不啟 webServer,故意打 user 真 stack):
//   - bun server 3001 live
//   - vite dev 5173 live
//   - active project hash 1876248b(本 repo)
//   - 至少一個 paused pipeline(本 ticket repo 內已有 019e40b31763-auto-update)
//
// 驗證邏輯:
//   1. 開瀏覽器到 board,選 paused pipeline
//   2. 清計數,等 1s 排空 mount 期 request
//   3. 切走 tab(visibilitychange hidden)+ 切回(visibilitychange visible + focus)
//   4. 計 500ms 內 /diff-stat 與 /sync-status 各幾筆
//   5. 等 60s 後再驗沒新 request 進來(gate=false 不 poll)

const PROJECT_HASH = "1876248b";
const PAUSED_PIPELINE_ID = "019e40b31763-auto-update";

test("tab 切回觸發 dedupe — diff-stat / sync-status 各 1 次", async ({ page, context }) => {
  type Hit = { url: string; t: number };
  const hits: Hit[] = [];
  const allApi: string[] = [];
  page.on("request", (req) => {
    const u = req.url();
    if (u.includes("/api/")) allApi.push(u.replace(/^https?:\/\/[^/]+/, ""));
    if (u.includes("/diff-stat") || u.includes("/sync-status")) {
      hits.push({ url: u, t: Date.now() });
    }
  });

  await page.addInitScript((hash) => {
    try {
      localStorage.setItem("vibe-pipeline:lastProjectHash", hash);
    } catch {}
  }, PROJECT_HASH);
  await page.goto(`/?project=${PROJECT_HASH}&pipeline=${PAUSED_PIPELINE_ID}`);
  // 等 board / FocusColumn mount
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(3000);

  // 強制點 rail 上 paused 的 auto-update — URL ?pipeline= 在 board 初次 render 後可能
  // 被既有 activeId / state machine 覆蓋,實際點擊 rail 是 source of truth
  const railItem = page.locator(".rail-item", { hasText: "auto-update" }).first();
  await railItem.waitFor({ state: "visible", timeout: 10000 });
  await railItem.click();
  await page.waitForTimeout(2000);
  console.log(`switched to auto-update, current url: ${page.url()}`);

  // 切完 pipeline 後排空 mount 期 request
  hits.length = 0;
  allApi.length = 0;
  await page.waitForTimeout(2000);
  // 排空 mount 期 + 排空 sync 5s timer(實際 gate=false 不會起,但 just in case)
  const baselineCount = hits.length;
  console.log(`baseline (mount 後): diff-stat + sync-status total = ${baselineCount}`);
  console.log(`mount 期 api requests (${allApi.length}):`);
  for (const u of allApi.slice(-20)) console.log(`  ${u}`);
  const pageTitle = await page.title();
  const bodyText = (await page.locator("body").innerText()).slice(0, 300);
  console.log(`page title: ${pageTitle}`);
  console.log(`body text head: ${bodyText.replace(/\s+/g, " ")}`);

  // 等到無新 request 一段時間
  await page.waitForTimeout(2000);
  const stableCount = hits.length;
  expect(stableCount, "mount 後應該 quiescent").toBe(baselineCount);

  // 模擬 tab 切走 → 切回(觸發 visibilitychange hidden / visible + focus)
  hits.length = 0;
  const t0 = Date.now();

  // Chrome DevTools Protocol: 模擬 page hidden
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: false });
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("blur"));
  });
  await page.waitForTimeout(100);

  // 切回:visibilitychange visible + window focus(這是雙觸發場景)
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
  });

  // 等 500ms 收齊雙觸發(dedupe window 300ms)
  await page.waitForTimeout(800);

  const diffHits = hits.filter((h) => h.url.includes("/diff-stat"));
  const syncHits = hits.filter((h) => h.url.includes("/sync-status"));

  console.log(`tab focus 後 800ms 內:`);
  console.log(`  diff-stat hits = ${diffHits.length}`);
  console.log(`  sync-status hits = ${syncHits.length}`);
  for (const h of hits) console.log(`  +${h.t - t0}ms ${h.url.replace(/^https?:\/\/[^/]+/, "")}`);

  // 核心斷言:雙觸發後 dedupe 收斂為各 1
  expect(diffHits.length, "diff-stat 應該被 dedupe 為 1 次").toBe(1);
  expect(syncHits.length, "sync-status 應該被 dedupe 為 1 次").toBe(1);

  // 驗 gate=false 不 poll — 後續 8s 不應有新 request(paused state 不打 interval)
  // 注意 sync 5s gap 也包含在內;3s diff 也覆蓋
  hits.length = 0;
  await page.waitForTimeout(8000);
  expect(hits.length, "paused 下 gate=false,8s 內不應再 fire").toBe(0);
  console.log(`gate=false 驗證 ok:8s 內 0 個新 request`);
});
