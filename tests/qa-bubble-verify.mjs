import { chromium } from "playwright";
import fs from "node:fs";

const candidates = [
  "C:/Users/Eric/AppData/Local/ms-playwright/chromium-1217/chrome-win64/chrome.exe",
  "C:/Users/Eric/AppData/Local/Playwright/chromium-1217/chrome-win64/chrome.exe",
];
let executablePath;
for (const c of candidates) if (fs.existsSync(c)) { executablePath = c; break; }

const browser = await chromium.launch({ executablePath, headless: true });
const ctx = await browser.newContext({ viewport: { width: 700, height: 900 } });
const page = await ctx.newPage();

await page.goto("http://127.0.0.1:5173/tests/qa-bubble-probe.html", { waitUntil: "networkidle" });
await page.waitForTimeout(300);

const metrics = await page.locator("#metrics").textContent();
console.log(metrics);

const styles = await page.evaluate(() => {
  const ai1 = document.getElementById("ai1");
  const cs = getComputedStyle(ai1);
  const msg = ai1.querySelector(".qa-bubble-msg");
  const msgCs = getComputedStyle(msg);
  const role = ai1.querySelector(".qa-bubble-role");
  const roleCs = getComputedStyle(role);
  const roleRect = role.getBoundingClientRect();
  const msgRect = msg.getBoundingClientRect();
  const bubbleRect = ai1.getBoundingClientRect();
  return {
    bubble: {
      display: cs.display,
      width: cs.width,
      height: cs.height,
      paddingTop: cs.paddingTop,
      paddingBottom: cs.paddingBottom,
      flexDirection: cs.flexDirection,
      minHeight: cs.minHeight,
    },
    msg: {
      display: msgCs.display,
      height: msgCs.height,
      lineHeight: msgCs.lineHeight,
    },
    role: {
      display: roleCs.display,
      height: roleCs.height,
      fontSize: roleCs.fontSize,
      paddingTop: roleCs.paddingTop,
      paddingBottom: roleCs.paddingBottom,
    },
    rects: {
      bubbleY: bubbleRect.top.toFixed(0) + "-" + bubbleRect.bottom.toFixed(0),
      roleY: roleRect.top.toFixed(0) + "-" + roleRect.bottom.toFixed(0),
      msgY: msgRect.top.toFixed(0) + "-" + msgRect.bottom.toFixed(0),
    },
  };
});
console.log("computed:", JSON.stringify(styles, null, 2));

await page.screenshot({ path: "tests/qa-bubble.png", fullPage: true });
console.log("screenshot: tests/qa-bubble.png");

await browser.close();
