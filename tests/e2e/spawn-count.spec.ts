import { test } from "@playwright/test";
import { spawn } from "node:child_process";

const PROJECT_HASH = "1876248b";
const PAUSED_PIPELINE = "019e40b31763-auto-update";
const MERGED_PIPELINE = "019e41177fc7-verify-flicker-fix";

async function countSpawns(label: string, durMs: number): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const seen = new Set<number>();
  const start = Date.now();
  return new Promise((resolve) => {
    const mon = spawn("powershell.exe", [
      "-NoProfile",
      "-Command",
      "while($true) { Get-Process | Where-Object { $_.Name -match '^(git|conhost|OpenConsole|cmd|bash)$' } | Select-Object Id,Name | Format-Table -HideTableHeaders | Out-String -Stream; Start-Sleep -Milliseconds 50 }",
    ]);
    mon.stdout.on("data", (d: Buffer) => {
      for (const line of d.toString().split("\n")) {
        const m = line.trim().match(/^(\d+)\s+(\w+)/);
        if (m) {
          const pid = Number(m[1]);
          const name = m[2];
          if (!seen.has(pid)) {
            seen.add(pid);
            counts.set(name, (counts.get(name) || 0) + 1);
          }
        }
      }
    });
    setTimeout(() => {
      mon.kill();
      resolve(counts);
    }, durMs);
  });
}

async function snapshotPids(): Promise<Set<number>> {
  return new Promise((resolve) => {
    const ps = spawn("powershell.exe", [
      "-NoProfile",
      "-Command",
      "Get-Process | Where-Object { $_.Name -match '^(git|conhost|OpenConsole|cmd|bash)$' } | Select-Object -ExpandProperty Id",
    ]);
    let out = "";
    ps.stdout.on("data", (d: Buffer) => (out += d.toString()));
    ps.on("close", () => {
      const ids = new Set<number>();
      for (const line of out.split("\n")) {
        const id = Number(line.trim());
        if (id) ids.add(id);
      }
      resolve(ids);
    });
  });
}

async function monitorNewSpawns(durMs: number, baseline: Set<number>): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const seen = new Set<number>();
  return new Promise((resolve) => {
    const mon = spawn("powershell.exe", [
      "-NoProfile",
      "-Command",
      "while($true) { Get-Process | Where-Object { $_.Name -match '^(git|conhost|OpenConsole|cmd|bash)$' } | Select-Object Id,Name | Format-Table -HideTableHeaders | Out-String -Stream; Start-Sleep -Milliseconds 30 }",
    ]);
    mon.stdout.on("data", (d: Buffer) => {
      for (const line of d.toString().split("\n")) {
        const m = line.trim().match(/^(\d+)\s+(\w+)/);
        if (m) {
          const pid = Number(m[1]);
          const name = m[2];
          if (!baseline.has(pid) && !seen.has(pid)) {
            seen.add(pid);
            counts.set(name, (counts.get(name) || 0) + 1);
          }
        }
      }
    });
    setTimeout(() => {
      mon.kill();
      resolve(counts);
    }, durMs);
  });
}

test("spawn count for paused pipeline mount @spawn", async ({ browser }) => {
  test.setTimeout(60_000);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.addInitScript((hash) => {
    try { localStorage.setItem("vibe-pipeline:lastProjectHash", hash); } catch {}
  }, PROJECT_HASH);

  const baseline = await snapshotPids();
  console.log(`baseline alive: ${baseline.size}`);

  // 含 mount + ~25s polling 觀察(若有 5s polling 應該看到 ~5 輪)
  const monitorPromise = monitorNewSpawns(30000, baseline);
  await page.goto(`/board?project=${PROJECT_HASH}&pipeline=${PAUSED_PIPELINE}`);
  const counts = await monitorPromise;

  console.log("\n=== mount paused (auto-update) 30s 內 NEW spawn(扣 baseline)===");
  let total = 0;
  for (const [name, count] of counts) {
    console.log(`  ${count} ${name}`);
    total += count;
  }
  console.log(`  TOTAL NEW = ${total}`);

  await ctx.close();
});
