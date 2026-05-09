import { chromium } from "playwright";
import fs from "node:fs";

const candidates = [
  "C:/Users/Eric/AppData/Local/ms-playwright/chromium-1217/chrome-win64/chrome.exe",
  "C:/Users/Eric/AppData/Local/Playwright/chromium-1217/chrome-win64/chrome.exe",
];
let executablePath;
for (const c of candidates) if (fs.existsSync(c)) { executablePath = c; break; }

const browser = await chromium.launch({ executablePath, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

page.on("pageerror", (e) => console.error("PAGE ERROR:", e.message));

// Open vibe-pipeline self project (which has draft 010e81e3def147a3 already)
await page.goto("http://127.0.0.1:5173/board?project=1876248b", { waitUntil: "networkidle" });
await page.waitForTimeout(800);

// Find pipeline that has the draft (pipelineId from the draft file = "test")
// Need to find pipeline named "test" in rail
await page.waitForSelector(".rail-item", { timeout: 5000 });

// Click pipeline named "test" in rail (it's the one with the QA draft)
const railItems = await page.$$(".rail-item");
for (const item of railItems) {
  const txt = await item.innerText();
  if (txt.includes("test")) {
    await item.click();
    break;
  }
}
await page.waitForTimeout(300);

// Click + ticket / 接續 QA — the focus column header button
const ticketBtn = page.locator(".focus-head-top button").last();
await ticketBtn.click();
await page.waitForTimeout(1500);

// Inspect actual bubble dimensions in real running app
const bubbles = await page.evaluate(() => {
  const list = Array.from(document.querySelectorAll(".qadr-bubble"));
  return list.map((b) => {
    const r = b.getBoundingClientRect();
    const cs = getComputedStyle(b);
    const parent = b.parentElement;
    const pcs = parent ? getComputedStyle(parent) : null;
    return {
      cls: b.className,
      w: Math.round(r.width),
      h: Math.round(r.height),
      bubbleDisplay: cs.display,
      bubbleWidth: cs.width,
      bubbleHeight: cs.height,
      parentClass: parent?.className ?? null,
      parentDisplay: pcs?.display ?? null,
      parentDir: pcs?.flexDirection ?? null,
    };
  });
});
console.log(JSON.stringify(bubbles, null, 2));

await page.screenshot({ path: "tests/qa-real-flow.png" });
console.log("screenshot: tests/qa-real-flow.png");

await browser.close();
