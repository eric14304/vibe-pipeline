// quick PWA / SW check via playwright headless
import { chromium } from "playwright";

const URL = process.env.PWA_URL ?? "http://127.0.0.1:4173/";

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  console.log(`\n=== Visit 1 (cold,SW install) ===`);
  const t1 = Date.now();
  await page.goto(URL, { waitUntil: "networkidle" });
  console.log(`load (networkidle): ${Date.now() - t1}ms`);

  // wait SW activate(可能要 1-2 秒)
  await page.waitForFunction(
    () => navigator.serviceWorker?.controller != null || (navigator.serviceWorker?.getRegistration().then(r => !!r?.active) ?? false),
    { timeout: 5000 }
  ).catch(() => console.log("(SW controller wait timeout, 可能還在 install)"));

  const swInfo = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker?.getRegistration();
    return {
      hasController: !!navigator.serviceWorker?.controller,
      active: !!reg?.active,
      scope: reg?.scope,
      state: reg?.active?.state,
    };
  });
  console.log("SW:", swInfo);

  const cacheKeys = await page.evaluate(() => caches.keys());
  console.log("Cache storage keys:", cacheKeys);

  for (const key of cacheKeys) {
    const count = await page.evaluate(async (k) => (await (await caches.open(k)).keys()).length, key);
    console.log(`  ${key}: ${count} entries`);
  }

  console.log(`\n=== Visit 2 (reload,從 SW cache) ===`);
  const reqs: Array<{ url: string; fromSW: boolean }> = [];
  page.on("response", async (resp) => {
    const url = resp.url();
    if (url.startsWith(URL) || url.includes("/assets/")) {
      // fromServiceWorker 是 chromium-specific API
      const fromSW = (resp as unknown as { fromServiceWorker?: () => boolean }).fromServiceWorker?.() ?? false;
      reqs.push({ url: url.replace(URL, "/"), fromSW });
    }
  });

  const t2 = Date.now();
  await page.reload({ waitUntil: "networkidle" });
  console.log(`reload (networkidle): ${Date.now() - t2}ms`);

  console.log("Requests during reload:");
  for (const r of reqs.slice(0, 15)) {
    console.log(`  ${r.fromSW ? "[SW] " : "[NET]"} ${r.url}`);
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
