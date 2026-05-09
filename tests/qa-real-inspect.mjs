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

// Inject mocks via fetch interception so QADrawer renders without real claude
await page.route("**/api/projects/*/qa/drafts", (route) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, data: [] }),
  })
);

const draft = {
  draftId: "demo",
  pipelineId: "abc-test",
  sessionId: "sid",
  createdAt: 0,
  updatedAt: 0,
  turns: [
    { role: "ai", message: "這張 ticket 大概是哪一類?", ts: 0 },
    { role: "user", message: "自己描述", ts: 0 },
    { role: "ai", message: "好,你描述一下要做的事。", ts: 0 },
  ],
  spec: null,
};

// Mount probe page that imports our actual QADrawer
page.on("pageerror", (e) => console.error("PAGE ERROR:", e.message));
page.on("console", (m) => { if (m.type() === "error") console.error("CONSOLE:", m.text()); });

await page.goto("http://127.0.0.1:5173/tests/qa-real-mount.html", { waitUntil: "networkidle" });
await page.waitForTimeout(800);

const out = await page.evaluate(() => {
  const bubbles = Array.from(document.querySelectorAll(".qa-bubble"));
  return bubbles.map((b) => {
    const r = b.getBoundingClientRect();
    return {
      cls: b.className,
      w: Math.round(r.width),
      h: Math.round(r.height),
      parentDisp: getComputedStyle(b.parentElement).display,
      parentDir: getComputedStyle(b.parentElement).flexDirection,
    };
  });
});
console.log(JSON.stringify(out, null, 2));

await page.screenshot({ path: "tests/qa-real.png", fullPage: false });
await browser.close();
