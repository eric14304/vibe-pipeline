import { chromium } from "playwright";

const URLS = [
  "http://localhost:5174/Prototype - Notifications.html",
  "http://127.0.0.1:5173/notifications",
];

async function main() {
  console.log("launching chromium...");
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Users/Eric/AppData/Local/ms-playwright/chromium-1217/chrome-win64/chrome.exe",
  });
  console.log("launched");
  for (const url of URLS) {
    console.log(`▸ ${url}`);
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.log("  pageerror:", e.message));
    page.on("console", (m) => {
      if (m.type() === "error" || m.type() === "warning") console.log(`  console.${m.type()}:`, m.text());
    });
    const t0 = Date.now();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
    console.log(`  domcontentloaded in ${Date.now() - t0}ms`);
    try {
      await page.waitForSelector(".board-root", { state: "visible", timeout: 10000 });
      console.log(`  .board-root visible in ${Date.now() - t0}ms`);
    } catch (e) {
      console.log(`  no .board-root: ${(e as Error).message}`);
      const html = (await page.content()).slice(0, 500);
      console.log(`  html: ${html}`);
    }
    await ctx.close();
  }
  await browser.close();
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
