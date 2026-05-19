import { test } from "@playwright/test";

const PROJECT_HASH = "1876248b";

test("mount-time request fire pattern @mount", async ({ browser }) => {
  test.setTimeout(60_000);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  const reqs: { t: number; url: string }[] = [];
  const start = Date.now();
  page.on("request", (req) => {
    const u = req.url();
    if (!u.includes("/api/")) return;
    reqs.push({ t: Date.now() - start, url: u.replace(/.*\/api\//, "/api/") });
  });

  await page.addInitScript((hash) => {
    try { localStorage.setItem("vibe-pipeline:lastProjectHash", hash); } catch {}
  }, PROJECT_HASH);
  await page.goto(`/board?project=${PROJECT_HASH}&pipeline=019e41177fc7-verify-flicker-fix`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(5000);

  console.log(`\n=== ${reqs.length} requests in 5s ===`);
  const byEndpoint: Record<string, number> = {};
  for (const r of reqs) {
    const path = r.url.replace(/\/api\/projects\/[a-f0-9]{8}/, "/api/projects/<H>").replace(/\/pipelines\/[a-z0-9-]+/, "/pipelines/<P>");
    byEndpoint[path] = (byEndpoint[path] || 0) + 1;
  }
  for (const [p, c] of Object.entries(byEndpoint).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${c}× ${p}`);
  }
  console.log("\n--- timeline ---");
  for (const r of reqs) {
    console.log(`  +${r.t}ms ${r.url}`);
  }
});
