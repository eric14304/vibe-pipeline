import { chromium } from "playwright";
import fs from "node:fs";

const candidates = [
  "C:/Users/Eric/AppData/Local/ms-playwright/chromium-1217/chrome-win64/chrome.exe",
  "C:/Users/Eric/AppData/Local/Playwright/chromium-1217/chrome-win64/chrome.exe",
];
let executablePath;
for (const c of candidates) if (fs.existsSync(c)) { executablePath = c; break; }

const browser = await chromium.launch({ executablePath, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();

const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console.error: " + m.text()); });
page.on("requestfailed", (req) => errors.push("requestfailed: " + req.url() + " " + req.failure()?.errorText));
page.on("response", (res) => { if (res.status() >= 400) errors.push("response " + res.status() + ": " + res.url()); });

async function probe(url, label) {
  await page.goto(url, { waitUntil: "networkidle", timeout: 8000 });
  await page.waitForTimeout(500);
  const h = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 240));
  console.log(`[${label}]`, h);
}

try {
  await probe("http://127.0.0.1:5173/board", "no-project");
  await probe("http://127.0.0.1:5173/board?project=1876248b", "with-project-no-tickets");
  await probe("http://127.0.0.1:5173/board?project=6ba34098", "with-project-initialized");
  console.log("ERRORS:", errors.length ? errors : "none");
} finally {
  await browser.close();
}
