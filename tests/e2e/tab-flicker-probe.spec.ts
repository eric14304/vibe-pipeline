import { test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test("tab visibility flicker probe @flicker", async ({ browser }) => {
  test.setTimeout(180_000);

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  // 收集所有 API request,標時間
  type ReqRec = { t: number; url: string; method: string };
  const requests: ReqRec[] = [];
  let recordStart = Date.now();
  page.on("request", (req) => {
    const u = req.url();
    if (!u.includes("/api/")) return;
    const elapsed = Date.now() - recordStart;
    requests.push({ t: elapsed, url: u.replace(/.*\/api\//, "/api/"), method: req.method() });
  });

  // 先 init localStorage 再 navigate
  await page.goto("http://localhost:4173", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.setItem("vibe-pipeline:lastProjectHash", "1876248b");
  });
  await page.goto("http://localhost:4173/?project=1876248b", { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);

  const page2 = await ctx.newPage();
  await page2.goto("about:blank");

  for (let round = 1; round <= 1; round++) {
    console.log(`\n=== round ${round} ===`);

    // hidden
    await page2.bringToFront();
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { value: true, configurable: true });
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    console.log(`[r${round}] hidden 15s`);
    await page.waitForTimeout(15_000);

    // 清空 records,開始記
    requests.length = 0;
    recordStart = Date.now();
    console.log(`[r${round}] START visible`);

    await page.bringToFront();
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { value: false, configurable: true });
      Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("focus"));
    });
    await page.waitForTimeout(60_000);

    // 統計
    const byEndpoint: Record<string, number[]> = {};
    for (const r of requests) {
      const key = r.url.replace(/\/api\/projects\/[^/]+/, "/api/projects/<H>")
        .replace(/\/pipelines\/[^/]+/, "/pipelines/<P>");
      if (!byEndpoint[key]) byEndpoint[key] = [];
      byEndpoint[key].push(r.t);
    }
    console.log(`[r${round}] total ${requests.length} requests in 25s`);
    const sorted = Object.entries(byEndpoint).sort((a, b) => b[1].length - a[1].length);
    for (const [key, ts] of sorted) {
      const times = ts.map((t) => (t / 1000).toFixed(1)).join(", ");
      console.log(`  ${ts.length}× ${key} → t=${times}s`);
    }
  }

  await ctx.close();
});
