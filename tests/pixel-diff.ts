import { chromium, type Browser, type Page } from "playwright";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PROTO_HOST = "http://localhost:5174";
const MY_HOST = "http://127.0.0.1:5173";
const VIEWPORT = { width: 1440, height: 900 };
const SETTLE_MS = 800;

type Variant = {
  name: string;
  prototypeFile: string;
  routePath: string;
  query?: Record<string, string>;
  // Replaces the EDITMODE-BEGIN/END block in the prototype with this object.
  editmode: Record<string, unknown>;
};

const NOTIF_VARIANTS: Variant[] = (["expanded", "collapsed", "hidden"] as const).flatMap((inboxState) =>
  (["all", "unread", "blocking"] as const).flatMap((filter) =>
    [false, true].map<Variant>((dark) => ({
      name: `notif-${inboxState}-${filter}-${dark ? "dark" : "light"}`,
      prototypeFile: "Prototype - Notifications.html",
      routePath: "/notifications",
      query: { state: inboxState, filter, theme: dark ? "dark" : "light" },
      editmode: { dark, inboxState, filter, density: "medium" },
    }))
  )
);

const BOARD_VARIANTS: Variant[] = ([false, true] as const).flatMap((dark) =>
  (["medium", "compact"] as const).map<Variant>((density) => ({
    name: `board-${density}-${dark ? "dark" : "light"}`,
    prototypeFile: "Prototype - Board.html",
    routePath: "/board",
    query: { density, theme: dark ? "dark" : "light" },
    editmode: { dark, density },
  }))
);

const CREATE_VARIANTS: Variant[] = ([false, true] as const).map<Variant>((dark) => ({
  name: `create-${dark ? "dark" : "light"}`,
  prototypeFile: "Prototype - Pipeline Create.html",
  routePath: "/board",
  query: { creating: "1", theme: dark ? "dark" : "light" },
  editmode: { dark, density: "medium", openOnLoad: true },
}));

const INIT_VARIANTS: Variant[] = ([false, true] as const).map<Variant>((dark) => ({
  name: `init-${dark ? "dark" : "light"}`,
  prototypeFile: "Prototype - Init.html",
  routePath: "/init",
  query: { theme: dark ? "dark" : "light" },
  editmode: { dark, density: "medium" },
}));

const DRAWER_STATES = ["iter-done", "iter-running", "step-done", "step-running"] as const;
const DRAWER_VARIANTS: Variant[] = DRAWER_STATES.flatMap((state) =>
  [false, true].map<Variant>((dark) => ({
    name: `drawer-${state}-${dark ? "dark" : "light"}`,
    prototypeFile: "Prototype - Ticket Drawer.html",
    routePath: "/drawer",
    query: { state, theme: dark ? "dark" : "light" },
    editmode: { dark, drawerState: state, showSwitcher: false },
  }))
);

// Prototype - Ticket QA.html hardcodes variant="drawer". Only that variant has
// a prototype to compare against; other QA variants exist in code but have no
// reference to diff against.
const QA_VARIANTS: Variant[] = [false, true].map<Variant>((dark) => ({
  name: `qa-drawer-${dark ? "dark" : "light"}`,
  prototypeFile: "Prototype - Ticket QA.html",
  routePath: "/qa",
  query: { variant: "drawer", autoplay: "0", theme: dark ? "dark" : "light" },
  editmode: { dark, autoplay: false },
}));

const VARIANTS: Variant[] = [
  ...NOTIF_VARIANTS,
  ...BOARD_VARIANTS,
  ...CREATE_VARIANTS,
  ...INIT_VARIANTS,
  ...DRAWER_VARIANTS,
  ...QA_VARIANTS,
];

const SNAP_DIR = "tests/.snapshots";
const DIFF_DIR = "tests/.diffs";
mkdirSync(SNAP_DIR, { recursive: true });
mkdirSync(DIFF_DIR, { recursive: true });

const HIDE_CSS = `
  .proto-jumpback, .twk-panel { display: none !important; }
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
  }
`;

const CHROME_EXE = "C:/Users/Eric/AppData/Local/ms-playwright/chromium-1217/chrome-win64/chrome.exe";

async function setup(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  return await ctx.newPage();
}

async function snapProto(page: Page, v: Variant): Promise<Buffer> {
  const protoBase = `${PROTO_HOST}/${v.prototypeFile}`;
  const url = `${protoBase}?_v=${encodeURIComponent(v.name)}`;
  await page.unrouteAll();
  // Match by regex on the prototype's filename so query-strings + URL encoding
  // don't break glob matching. The route fetches the original file from the
  // upstream server, then rewrites the EDITMODE block.
  const escapedFile = v.prototypeFile.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "[\\s%20]+");
  const fileRegex = new RegExp(escapedFile);
  await page.route(fileRegex, async (route) => {
    const upstream = await route.fetch({ url: protoBase });
    let body = await upstream.text();
    const json = JSON.stringify(v.editmode, null, 2);
    body = body.replace(
      /\/\*EDITMODE-BEGIN\*\/[\s\S]*?\/\*EDITMODE-END\*\//,
      `/*EDITMODE-BEGIN*/${json}/*EDITMODE-END*/`
    );
    await route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body });
  });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForSelector(".board-root, .init-root, .drawer-stage, .qa-root, .qa-drawer-backdrop", { state: "visible", timeout: 8000 });
  await page.addStyleTag({ content: HIDE_CSS });
  await page.evaluate(() => (document as any).fonts?.ready);
  await page.waitForTimeout(SETTLE_MS);
  return await page.screenshot({ fullPage: false, type: "png" });
}

async function snapMine(page: Page, v: Variant): Promise<Buffer> {
  const url = new URL(MY_HOST + v.routePath);
  for (const [k, val] of Object.entries(v.query ?? {})) url.searchParams.set(k, val);
  await page.goto(url.toString(), { waitUntil: "networkidle" });
  await page.waitForSelector(".board-root, .init-root, .drawer-stage, .qa-root, .qa-drawer-backdrop", { state: "visible", timeout: 8000 });
  await page.addStyleTag({ content: HIDE_CSS });
  await page.evaluate(() => (document as any).fonts?.ready);
  await page.waitForTimeout(SETTLE_MS);
  return await page.screenshot({ fullPage: false, type: "png" });
}

function diff(a: Buffer, b: Buffer, name: string) {
  const A = PNG.sync.read(a);
  const B = PNG.sync.read(b);
  if (A.width !== B.width || A.height !== B.height) {
    return { mismatch: -1, total: 0, note: `size mismatch ${A.width}x${A.height} vs ${B.width}x${B.height}` };
  }
  const out = new PNG({ width: A.width, height: A.height });
  const total = A.width * A.height;
  const mismatch = pixelmatch(A.data, B.data, out.data, A.width, A.height, {
    threshold: 0.1,
    includeAA: false,
    diffColor: [255, 0, 64],
    alpha: 0.4,
  });
  writeFileSync(join(DIFF_DIR, `${name}.diff.png`), PNG.sync.write(out));
  writeFileSync(join(SNAP_DIR, `${name}.proto.png`), a);
  writeFileSync(join(SNAP_DIR, `${name}.mine.png`), b);
  return { mismatch, total, note: `${mismatch}/${total} px (${((mismatch / total) * 100).toFixed(2)}%)` };
}

async function main() {
  const filterArg = process.argv[2];
  const variants = filterArg ? VARIANTS.filter((v) => v.name.includes(filterArg)) : VARIANTS;
  if (variants.length === 0) {
    console.error(`No variants match filter "${filterArg}"`);
    process.exit(2);
  }
  console.log(`Running ${variants.length} variant(s)`);

  const browser = await chromium.launch({ headless: true, executablePath: CHROME_EXE });
  const protoPage = await setup(browser);
  const minePage = await setup(browser);

  const results: Array<{ variant: string; note: string; pct: number }> = [];

  for (const v of variants) {
    process.stdout.write(`▸ ${v.name.padEnd(40)} `);
    try {
      const a = await snapProto(protoPage, v);
      const b = await snapMine(minePage, v);
      const r = diff(a, b, v.name);
      const pct = r.total > 0 ? (r.mismatch / r.total) * 100 : 100;
      results.push({ variant: v.name, note: r.note, pct });
      console.log(r.note);
    } catch (e) {
      console.log(`ERROR: ${(e as Error).message}`);
      results.push({ variant: v.name, note: `ERROR: ${(e as Error).message}`, pct: 100 });
    }
  }

  await browser.close();

  console.log("\n────── Summary ──────");
  for (const r of results) {
    const tag = r.pct === 0 ? "✓" : r.pct < 0.5 ? "≈" : "✗";
    console.log(`${tag} ${r.variant.padEnd(40)} ${r.note}`);
  }
  const failed = results.filter((r) => r.pct > 0).length;
  console.log(`\n${results.length - failed}/${results.length} variants pixel-perfect`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
