import { test } from "@playwright/test";
import { spawn } from "node:child_process";

const PROJECT_HASH = "1876248b";
const PIPELINE_ID = "019e40b31763-auto-update";

// 在 backend monitor 啟動的同時打一個 endpoint,看 spawn 幾個視窗類 process
async function probeOne(label: string, url: string): Promise<void> {
  return new Promise(async (resolve) => {
    const before = new Set<number>();
    const cmd = "powershell.exe";
    // 抓 baseline
    const baseline = spawn(cmd, [
      "-NoProfile",
      "-Command",
      "Get-Process | Where-Object { $_.Name -match '^(git|conhost|OpenConsole|bash|cmd)$' } | Select-Object -ExpandProperty Id",
    ]);
    let baseOut = "";
    baseline.stdout.on("data", (d: Buffer) => { baseOut += d.toString(); });
    await new Promise<void>((r) => baseline.on("close", () => r()));
    for (const line of baseOut.split("\n")) {
      const id = Number(line.trim());
      if (id) before.add(id);
    }

    // 啟動高頻 monitor
    const seen = new Map<number, string>();
    const events: { t: number; pid: number; name: string }[] = [];
    const start = Date.now();
    const mon = spawn(cmd, [
      "-NoProfile",
      "-Command",
      `while($true) { Get-Process | Where-Object { $_.Name -match '^(git|conhost|OpenConsole|bash|cmd)$' } | Select-Object Id,Name | Format-Table -HideTableHeaders | Out-String -Stream; Start-Sleep -Milliseconds 25 }`,
    ]);
    mon.stdout.on("data", (d: Buffer) => {
      for (const line of d.toString().split("\n")) {
        const m = line.trim().match(/^(\d+)\s+(\w+)/);
        if (m) {
          const pid = Number(m[1]);
          const name = m[2];
          if (!before.has(pid) && !seen.has(pid)) {
            seen.set(pid, name);
            events.push({ t: Date.now() - start, pid, name });
          }
        }
      }
    });

    // 等 200ms 讓 monitor 起來
    await new Promise((r) => setTimeout(r, 200));

    const t0 = Date.now();
    try {
      await fetch(url);
    } catch (e) {
      console.log(`  [${label}] fetch err: ${e}`);
    }
    const dur = Date.now() - t0;

    // 等 endpoint 完成 + git fork chain
    await new Promise((r) => setTimeout(r, 2000));
    mon.kill();

    const grouped: Record<string, number> = {};
    for (const e of events) grouped[e.name] = (grouped[e.name] || 0) + 1;
    const total = events.length;
    const breakdown = Object.entries(grouped).map(([k, v]) => `${v} ${k}`).join(" + ");
    console.log(`  [${label.padEnd(12)}] ${dur}ms HTTP, ${total} new procs = ${breakdown}`);
    resolve();
  });
}

test("git spawn breakdown per endpoint @trace", async () => {
  test.setTimeout(120_000);

  const base = `http://127.0.0.1:3001/api/projects/${PROJECT_HASH}`;
  console.log("\n=== 各 endpoint 單獨打,看 spawn 多少 ===");

  // baseline endpoints(不該 spawn git)
  await probeOne("notifs", `${base}/notifs`);
  await new Promise((r) => setTimeout(r, 1000));
  await probeOne("pipelines", `${base}/pipelines`);
  await new Promise((r) => setTimeout(r, 1000));
  await probeOne("config", `${base}/config`);
  await new Promise((r) => setTimeout(r, 1000));
  await probeOne("health", "http://127.0.0.1:3001/api/health");
  await new Promise((r) => setTimeout(r, 1000));

  // git-spawning endpoints
  await probeOne("diff-stat", `${base}/pipelines/${PIPELINE_ID}/diff-stat`);
  await new Promise((r) => setTimeout(r, 2000));
  await probeOne("sync-status", `${base}/pipelines/${PIPELINE_ID}/sync-status`);
  await new Promise((r) => setTimeout(r, 2000));
  await probeOne("diff-stat-2", `${base}/pipelines/${PIPELINE_ID}/diff-stat`);
});
