import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import * as pipelineDir from "../pipelineDir";
import * as worktree from "../git/worktree";
import * as notifs from "../notifs/store";
import * as ticketWatcher from "./ticketWatcher";
import * as runLog from "./runLog";
import * as testMode from "../testMode";
import { RUNNER_BEHAVIOR_PROMPT } from "./runnerPrompt";

type RunningProcess = {
  pipelineId: string;
  proc: Bun.Subprocess | null; // mock 模式為 null
  startedAt: number;
};

const running = new Map<string, RunningProcess>(); // key: <projectHash>:<pipelineId>

// FIFO queue per project:enqueue 順序 = 排隊順位。dispatcher 從隊頭撈、轉 spawn。
// 不存 process,只存「下一次 spawn 該帶的 opts」。
type QueuedItem = {
  projectPath: string;
  projectHash: string;
  pipelineId: string;
  enqueuedAt: number;
};
// key: projectHash → ordered list (順位 = index + 1)
const queues = new Map<string, QueuedItem[]>();

function key(projectHash: string, pipelineId: string): string {
  return `${projectHash}:${pipelineId}`;
}

// 算該 project 所有 pipeline 的累積花費。
// 來源優先序:ticket.runs[].cost(若 runner 有寫入)→ fallback 解析 runtime/logs/<pipelineId>-<ts>.log。
// 已 merged / failed / paused 也算。算不出來就當 0,絕不擋住 /run。
async function computeProjectSpent(projectPath: string): Promise<number> {
  let total = 0;
  try {
    const pipelines = (await pipelineDir.listPipelines(projectPath)) as Array<{
      id?: string;
      tickets?: Array<{
        runs?: Array<{ cost?: number }>;
        [k: string]: unknown;
      }>;
      [k: string]: unknown;
    }>;
    for (const p of pipelines) {
      if (!p.id) continue;
      let pipelineCost = 0;
      let foundTicketCost = false;
      for (const t of p.tickets ?? []) {
        for (const r of t.runs ?? []) {
          if (typeof r.cost === "number" && Number.isFinite(r.cost)) {
            pipelineCost += r.cost;
            foundTicketCost = true;
          }
        }
      }
      if (foundTicketCost) {
        total += pipelineCost;
        continue;
      }
      // fallback:沒 ticket-level cost,sum log 解析結果
      try {
        const runs = await runLog.listRuns(projectPath, p.id);
        for (const r of runs) {
          if (typeof r.costUsd === "number" && Number.isFinite(r.costUsd)) {
            total += r.costUsd;
          }
        }
      } catch {
        // log 解析失敗當 0
      }
    }
  } catch {
    return 0;
  }
  return total;
}

export function isRunning(projectHash: string, pipelineId: string): boolean {
  return running.has(key(projectHash, pipelineId));
}

export function isQueued(projectHash: string, pipelineId: string): boolean {
  const q = queues.get(projectHash);
  return q ? q.some((it) => it.pipelineId === pipelineId) : false;
}

// 同 project 還在跑的條數 — 給 routes / TopBar N/M 用
export function runningCount(projectHash: string): number {
  let n = 0;
  for (const k of running.keys()) {
    if (k.startsWith(projectHash + ":")) n++;
  }
  return n;
}

// 順位(1-based);不在 queue 回 0
export function queuePosition(projectHash: string, pipelineId: string): number {
  const q = queues.get(projectHash);
  if (!q) return 0;
  const i = q.findIndex((it) => it.pipelineId === pipelineId);
  return i < 0 ? 0 : i + 1;
}

function enqueue(item: QueuedItem): void {
  const arr = queues.get(item.projectHash) ?? [];
  arr.push(item);
  queues.set(item.projectHash, arr);
}

function dequeue(projectHash: string, pipelineId: string): boolean {
  const arr = queues.get(projectHash);
  if (!arr) return false;
  const i = arr.findIndex((it) => it.pipelineId === pipelineId);
  if (i < 0) return false;
  arr.splice(i, 1);
  if (arr.length === 0) queues.delete(projectHash);
  return true;
}

// 從 queue 撈下一張可跑的並 spawn。每次 ticket 跑完 / max_parallel 變動時呼叫。
// 每次只取 1 張(if slot 還空就會被下一輪 dispatch 接著跑)。
async function dispatch(projectPath: string, projectHash: string): Promise<void> {
  const max = await pipelineDir.getMaxParallel(projectPath);
  while (runningCount(projectHash) < max) {
    const arr = queues.get(projectHash);
    if (!arr || arr.length === 0) return;
    const next = arr.shift()!;
    if (arr.length === 0) queues.delete(projectHash);

    // 嘗試 spawn — 若目標 pipeline 已不在 queued 狀態(被 user 改回 paused / 刪掉)就跳過
    const cur = (await pipelineDir.readPipeline(projectPath, next.pipelineId)) as {
      state?: string;
    } | null;
    if (!cur || cur.state !== "queued") continue;
    // 改回 ready / paused 之類後再 spawn(spawn 內會 mark running)
    // 但內部 spawn 已 own state guard;這邊不重設 state,直接呼叫內部 spawn
    await spawnDirect({ projectPath, projectHash, pipelineId: next.pipelineId });
  }
}

// 起 main agent。Pipeline 必須已存在,有 branch 欄位。
// 行為:
//   - 既有 state guard(running/stopping/merged/queued + ready 沒可跑 ticket)擋
//   - slot 滿 → 標 queued + emit pipeline_queued + enqueue,不 spawn
//   - slot 沒滿 → 直接 spawn(走 spawnDirect)
export type StartResult =
  | { ok: true; queued?: boolean; position?: number }
  | { ok: false; error: string; reason?: "budget_exceeded"; spent?: number; limit?: number };

export async function start(opts: {
  projectPath: string;
  projectHash: string;
  pipelineId: string;
}): Promise<StartResult> {
  const { projectPath, projectHash, pipelineId } = opts;
  const k = key(projectHash, pipelineId);

  if (running.has(k)) {
    return { ok: false, error: "Pipeline 已在跑" };
  }
  if (isQueued(projectHash, pipelineId)) {
    return { ok: false, error: "Pipeline 已在排隊" };
  }

  const pipeline = (await pipelineDir.readPipeline(projectPath, pipelineId)) as {
    branch?: string;
    baseBranch?: string;
    name?: string;
    state?: string;
    tickets?: Array<{ status?: string }>;
    [k: string]: unknown;
  } | null;
  if (!pipeline) return { ok: false, error: `Pipeline not found: ${pipelineId}` };

  // State guard:不允許在這幾個狀態 spawn(避免重複跑、燒錢空轉)
  if (pipeline.state === "running") {
    return { ok: false, error: "Pipeline 已在 running" };
  }
  if (pipeline.state === "stopping") {
    return { ok: false, error: "Pipeline 正在 stopping,等它收完再 run" };
  }
  if (pipeline.state === "queued") {
    return { ok: false, error: "Pipeline 已在 queued" };
  }
  if (pipeline.state === "ready" || pipeline.state === "merged") {
    // 沒事可跑 — ready / merged 都需要 user 先 append 新 ticket(或 sync ticket)才有東西跑。
    // merged 不是終態:branch / worktree 都還在,可以繼續加 ticket、sync、再 merge。
    const hasRunnable = (pipeline.tickets ?? []).some(
      (t) => t.status === "draft" || t.status === "ready"
    );
    if (!hasRunnable) {
      return { ok: false, error: "Pipeline 沒待跑的 ticket(append 新 ticket 或 reset 既有的)" };
    }
  }

  // Budget check:cost_limit_usd > 0 且 累積 spent >= limit 時擋下。
  // 不改 pipeline state(維持當前)。emit pipeline_blocked_budget notif。
  const resolved = await pipelineDir.getResolvedDefaults(projectPath);
  const limit = resolved.cost_limit_usd;
  if (limit > 0) {
    const spent = await computeProjectSpent(projectPath);
    if (spent >= limit) {
      notifs.emit(projectPath, {
        type: "pipeline_blocked_budget",
        title: `${pipeline.name || pipelineId} 被預算上限擋下`,
        sub: `已花 $${spent.toFixed(4)} / 上限 $${limit.toFixed(2)}`,
        pipelineId,
      });
      return {
        ok: false,
        error: `已達預算上限($${spent.toFixed(4)} / $${limit.toFixed(2)})`,
        reason: "budget_exceeded",
        spent,
        limit,
      };
    }
  }

  // Slot 檢查:滿了改進 queue
  const max = await pipelineDir.getMaxParallel(projectPath);
  if (runningCount(projectHash) >= max) {
    enqueue({ projectPath, projectHash, pipelineId, enqueuedAt: Date.now() });
    await pipelineDir.writePipeline(projectPath, pipelineId, {
      ...pipeline,
      state: "queued",
    });
    const pos = queuePosition(projectHash, pipelineId);
    notifs.emit(projectPath, {
      type: "pipeline_queued",
      title: `${pipeline.name || pipelineId} 已排隊`,
      sub: `順位 ${pos}(slot ${runningCount(projectHash)}/${max} 已滿)`,
      pipelineId,
    });
    return { ok: true, queued: true, position: pos };
  }

  return spawnDirect({ projectPath, projectHash, pipelineId });
}

// 真正 spawn 主 agent。state guard / slot 檢查在外層 start 完成。
// dispatcher 也走這條(已從 queue 撈出來、確認 slot 有空)。
async function spawnDirect(opts: {
  projectPath: string;
  projectHash: string;
  pipelineId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { projectPath, projectHash, pipelineId } = opts;
  const k = key(projectHash, pipelineId);

  const pipeline = (await pipelineDir.readPipeline(projectPath, pipelineId)) as {
    branch?: string;
    baseBranch?: string;
    name?: string;
    state?: string;
    tickets?: Array<{ status?: string }>;
    [k: string]: unknown;
  } | null;
  if (!pipeline) return { ok: false, error: `Pipeline not found: ${pipelineId}` };

  const branch = pipeline.branch || `pipeline/${pipeline.name || pipelineId}`;
  const baseBranch = pipeline.baseBranch || "main";

  // 1. 建/重用 worktree
  let wtPath: string;
  try {
    wtPath = await worktree.ensure(projectPath, pipelineId, branch, baseBranch);
  } catch (e) {
    return { ok: false, error: `worktree 失敗: ${String(e)}` };
  }

  // 2. 標 pipeline running 寫回
  await pipelineDir.writePipeline(projectPath, pipelineId, {
    ...pipeline,
    state: "running",
  });

  // GC:每次 /run 順便修剪累積。logs per-pipeline 留 10、notifs 全 project 留 500。
  // 失敗安靜忽略,GC 不該擋 runner 起跑。
  try {
    runLog.pruneLogs(projectPath, pipelineId, 10);
    notifs.pruneOldRecords(projectPath, 500);
  } catch {
    // skip
  }

  // 3a. E2E mock 分支:不 spawn 真 claude,起 fake timeline 模擬寫 pipeline.json
  if (testMode.isTestMode()) {
    return startMockRunner({ projectPath, projectHash, pipelineId, k });
  }

  // 3b. spawn claude CLI 主 agent (cwd = worktree)
  const sessionId = randomUUID();
  const initialMessage = `開始跑 pipeline。\n\npipeline JSON: ${join(
    projectPath,
    ".vibe-pipeline",
    "pipelines",
    `${pipelineId}.json`
  )}\npipelineId: ${pipelineId}\nworktree (your cwd): ${wtPath}\n\n讀 pipeline JSON,按 system prompt 流程跑。`;

  // 主 agent 拿全工具 — 因為 sub-agent (Task) 會繼承限制,
  // 擋 Edit/Write 就等於 sub-agent 也不能改 code,ticket 跑不了。
  // 改用 system prompt 約束主 agent 自己不直接改 source(只用 Edit/Write 更新 pipeline.json)
  const args = [
    "claude",
    "-p",
    "--output-format",
    "json",
    "--session-id",
    sessionId,
    "--system-prompt",
    RUNNER_BEHAVIOR_PROMPT,
    initialMessage,
  ];

  let proc: Bun.Subprocess;
  try {
    proc = Bun.spawn(args, {
      cwd: wtPath,
      stdout: "pipe",
      stderr: "pipe",
    });
  } catch (e) {
    return { ok: false, error: `spawn claude failed: ${String(e)}` };
  }

  running.set(k, { pipelineId, proc, startedAt: Date.now() });

  notifs.emit(projectPath, {
    type: "pipeline_started",
    title: `${pipeline.name || pipelineId} 開始運行`,
    sub: `worktree: ${wtPath}`,
    pipelineId,
  });

  // 啟 ticket watcher:監看 pipeline.json,ticket.status 變化 → emit notif
  await ticketWatcher.start({ projectPath, projectHash, pipelineId });

  // log file: <target>/.vibe-pipeline/.runtime/logs/<pipelineId>-<ts>.log
  const logsDir = pipelineDir.ensureRuntime(projectPath, "logs");
  mkdirSync(logsDir, { recursive: true });
  const logFile = join(logsDir, `${pipelineId}-${Date.now()}.log`);

  // 不 await — let it run async,handler 監看 exit
  (async () => {
    let stdoutText = "";
    let stderrText = "";
    try {
      [stdoutText, stderrText] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);
      await proc.exited;
      const code = proc.exitCode;
      const log = [
        `[runner ${pipelineId}] exited code=${code}`,
        `--- stdout ---`,
        stdoutText,
        `--- stderr ---`,
        stderrText,
      ].join("\n");
      await Bun.write(logFile, log);
      console.log(`[runner ${pipelineId}] exited code=${code}, log → ${logFile}`);

      // Emit notif based on final pipeline state
      try {
        const final = (await pipelineDir.readPipeline(projectPath, pipelineId)) as {
          state?: string;
          name?: string;
          baseBranch?: string;
        } | null;
        const name = final?.name || pipelineId;

        // Auto-rebase worktree onto base after AI merge done。merge 完 worktree 仍在舊 branch tip,
        // base 已吸收 ticket commits → rebase 是 FF,hash 不變。把 worktree 拉到新 base 後
        // sync chip 自然 = 0(base 沒往前),banner 也不會重觸發 re-merge。
        // strategy 鎖 merge,一律跑 auto-rebase。
        if (final?.state === "merged") {
          try {
            const base = final?.baseBranch || "main";
            const rebaseRes = await worktree.rebaseOntoBase(projectPath, pipelineId, base);
            if (rebaseRes.ok) {
              console.log(`[runner ${pipelineId}] auto-rebase post-merge ok`);
            } else {
              console.warn(`[runner ${pipelineId}] auto-rebase skipped: ${rebaseRes.err}`);
            }
          } catch (e) {
            console.warn(`[runner ${pipelineId}] auto-rebase failed:`, e);
          }
        }

        if (final?.state === "ready") {
          notifs.emit(projectPath, {
            type: "pipeline_ready_to_merge",
            title: `${name} 完成,可合併`,
            pipelineId,
          });
        } else if (final?.state === "paused") {
          notifs.emit(projectPath, {
            type: "pipeline_paused",
            title: `${name} 已暫停`,
            pipelineId,
          });
        } else if (final?.state === "failed") {
          notifs.emit(projectPath, {
            type: "pipeline_failed",
            title: `${name} 失敗`,
            sub: `code=${code}`,
            pipelineId,
          });
        } else if (code !== 0) {
          notifs.emit(projectPath, {
            type: "runner_crash",
            title: `${name} runner 異常結束`,
            sub: `exit ${code}`,
            pipelineId,
          });
        }
      } catch (e) {
        console.error(`[runner ${pipelineId}] notif emit failed:`, e);
      }
    } catch (e) {
      console.error(`[runner ${pipelineId}] error:`, e);
      try {
        await Bun.write(logFile, `[runner ${pipelineId}] error: ${String(e)}\nstdout:\n${stdoutText}\nstderr:\n${stderrText}`);
      } catch {}
    } finally {
      running.delete(k);
      ticketWatcher.stop({ projectHash, pipelineId });
      // slot 釋出,看看 queue 有沒有 pending 接棒
      dispatch(projectPath, projectHash).catch((e) =>
        console.error(`[runner ${pipelineId}] dispatch after exit failed:`, e)
      );
    }
  })();

  return { ok: true };
}

// Pause: 標 pipeline.state = "stopping",主 agent 跑完當前 ticket 看到後自己標 paused 退出
export async function stop(opts: {
  projectPath: string;
  projectHash: string;
  pipelineId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { projectPath, pipelineId } = opts;

  const pipeline = (await pipelineDir.readPipeline(projectPath, pipelineId)) as {
    state?: string;
    [k: string]: unknown;
  } | null;
  if (!pipeline) return { ok: false, error: `Pipeline not found: ${pipelineId}` };
  if (pipeline.state !== "running") return { ok: false, error: `Pipeline 不在 running 狀態` };

  await pipelineDir.writePipeline(projectPath, pipelineId, {
    ...pipeline,
    state: "stopping",
  });

  return { ok: true };
}

// ─── Mock runner ──────────────────────────────────────────────────────
// VP_TEST_MODE=mock 時走這條,模擬 runner 寫 pipeline.json 的時間軸,
// 不 spawn 真 claude。fs.watch / notif emit / state 機照常,只是訊息流變 deterministic。

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function startMockRunner(opts: {
  projectPath: string;
  projectHash: string;
  pipelineId: string;
  k: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { projectPath, projectHash, pipelineId, k } = opts;

  const script = testMode.getRunnerScript(projectHash, pipelineId);
  if (!script) {
    return {
      ok: false,
      error: `[mock runner] no script for ${projectHash}:${pipelineId}. ` +
        `先 POST /api/__test/script/runner 設劇本`,
    };
  }

  const pipeline = (await pipelineDir.readPipeline(projectPath, pipelineId)) as {
    name?: string;
    tickets?: Array<{ id?: string; status?: string; mode?: string; [key: string]: unknown }>;
    [key: string]: unknown;
  } | null;
  if (!pipeline) return { ok: false, error: "pipeline not found in mock" };

  running.set(k, { pipelineId, proc: null, startedAt: Date.now() });

  notifs.emit(projectPath, {
    type: "pipeline_started",
    title: `${pipeline.name || pipelineId} 開始運行`,
    sub: `[mock]`,
    pipelineId,
  });

  await ticketWatcher.start({ projectPath, projectHash, pipelineId });

  // 不 await — 讓 timeline 異步跑
  (async () => {
    try {
      const tickets = pipeline.tickets ?? [];
      let pausedMid = false;
      for (let i = 0; i < tickets.length; i++) {
        const t = tickets[i];
        const tScript = script.tickets[i];
        if (!tScript) {
          // script 比 tickets 短 — 沒劇本的 ticket 跳過(fail-soft 留給 spec 自己驗)
          break;
        }

        // 檢查是否 user 中途 pause
        const cur = (await pipelineDir.readPipeline(projectPath, pipelineId)) as {
          state?: string;
        } | null;
        if (cur?.state === "stopping") {
          pausedMid = true;
          break;
        }

        await sleep(tScript.beforeRunningMs ?? 50);
        await mutateTicket(projectPath, pipelineId, t.id ?? `t${i}`, (curT) => ({
          ...curT,
          status: "running",
          startedAt: Date.now(),
        }));

        if (t.mode === "iter" && tScript.iterRounds && tScript.iterRounds.length > 0) {
          const rounds: Array<Record<string, unknown>> = [];
          const verdicts: string[] = [];
          for (let r = 0; r < tScript.iterRounds.length; r++) {
            const round = tScript.iterRounds[r];
            const startedAt = Date.now();
            await sleep(round.durationMs ?? 80);
            const endedAt = Date.now();
            rounds.push({
              n: r + 1,
              startedAt,
              endedAt,
              executorSummary: round.executorSummary ?? `mock executor turn ${r + 1}`,
              criticVerdict: round.verdict,
              criticFeedback: round.criticFeedback ?? "",
            });
            verdicts.push(round.verdict);
            // 寫一次中途進度,模擬 fs.watch 看到 round 累加
            await mutateTicket(projectPath, pipelineId, t.id ?? `t${i}`, (curT) => ({
              ...curT,
              iter: { current: r + 1, rounds: [...rounds], verdicts: [...verdicts] },
            }));
          }
        } else {
          await sleep(tScript.workMs ?? 100);
        }

        const commits =
          tScript.commitHash != null
            ? [
                {
                  hash: tScript.commitHash,
                  subject: tScript.commitSubject ?? `ticket(${i + 1}): ${(t as { title?: string }).title ?? "mock"}`,
                  ts: Date.now(),
                },
              ]
            : [];

        await mutateTicket(projectPath, pipelineId, t.id ?? `t${i}`, (curT) => ({
          ...curT,
          status: tScript.finalStatus,
          endedAt: Date.now(),
          ...(commits.length > 0 ? { commits } : {}),
        }));

        if (script.pauseAfterTicketIndex === i) {
          pausedMid = true;
          break;
        }
      }

      // 收尾 pipeline state
      const finalState = pausedMid ? "paused" : (script.finalState ?? "ready");
      const final = (await pipelineDir.readPipeline(projectPath, pipelineId)) as {
        [k: string]: unknown;
      } | null;
      if (final) {
        await pipelineDir.writePipeline(projectPath, pipelineId, {
          ...final,
          state: finalState,
        });
      }

      const name = pipeline.name || pipelineId;
      if (finalState === "ready") {
        notifs.emit(projectPath, {
          type: "pipeline_ready_to_merge",
          title: `${name} 完成,可合併`,
          pipelineId,
        });
      } else if (finalState === "paused") {
        notifs.emit(projectPath, {
          type: "pipeline_paused",
          title: `${name} 已暫停`,
          pipelineId,
        });
      } else if (finalState === "failed") {
        notifs.emit(projectPath, {
          type: "pipeline_failed",
          title: `${name} 失敗`,
          pipelineId,
        });
      }
    } catch (e) {
      console.error(`[mock runner ${pipelineId}] error:`, e);
    } finally {
      running.delete(k);
      ticketWatcher.stop({ projectHash, pipelineId });
      dispatch(projectPath, projectHash).catch((e) =>
        console.error(`[mock runner ${pipelineId}] dispatch after exit failed:`, e)
      );
    }
  })();

  return { ok: true };
}

// 讀 pipeline → 找對應 ticket → 套 update fn → 寫回。每次都全 reload 因 user 可能中途改別欄。
async function mutateTicket(
  projectPath: string,
  pipelineId: string,
  ticketId: string,
  update: (t: Record<string, unknown>) => Record<string, unknown>
): Promise<void> {
  const p = (await pipelineDir.readPipeline(projectPath, pipelineId)) as {
    tickets?: Array<Record<string, unknown>>;
    [k: string]: unknown;
  } | null;
  if (!p) return;
  const tickets = p.tickets ?? [];
  const idx = tickets.findIndex((t) => t.id === ticketId);
  if (idx === -1) return;
  tickets[idx] = update(tickets[idx]);
  await pipelineDir.writePipeline(projectPath, pipelineId, { ...p, tickets });
}

// Crash recovery:server 啟動時掃 pipelines。兩種 inconsistency 都修:
// (a) pipeline.state="running"/"stopping"/"queued" 但 process / queue 不在
//     (in-memory state 隨 server 重啟蒸發)→ 標 paused
// (b) ticket.status="running" 但 pipeline 不是 running(任何 state)→ 標 paused
//
// (b) 處理上一次 server 死前 ticket 已寫 running,但 pipeline state 改回 paused 後沒同步 ticket
// 的殘留(畫面會出現 RunButton 顯「繼續」+ TicketCard 卻仍顯「執行中」的錯位)。
export async function recoverStale(projectPath: string): Promise<void> {
  const pipelines = (await pipelineDir.listPipelines(projectPath)) as Array<{
    id?: string;
    state?: string;
    tickets?: Array<{ status?: string; [k: string]: unknown }>;
    [k: string]: unknown;
  }>;
  for (const p of pipelines) {
    if (!p.id) continue;
    const isStaleRunning =
      p.state === "running" || p.state === "stopping" || p.state === "queued";
    const hasOrphanTicket =
      !isStaleRunning && p.state !== "running" &&
      (p.tickets ?? []).some((t) => t.status === "running");
    if (!isStaleRunning && !hasOrphanTicket) continue;

    const nextState = isStaleRunning ? "paused" : p.state;
    const tickets = (p.tickets ?? []).map((t) =>
      t.status === "running" ? { ...t, status: "paused" } : t
    );
    await pipelineDir.writePipeline(projectPath, p.id, {
      ...p,
      state: nextState,
      tickets,
    });
    console.log(
      `[runner] recovered stale pipeline ${p.id} (was ${p.state}) → ${nextState}, orphan tickets fixed`
    );
  }
}

// 把已 queued 的 pipeline 從 queue 移除 + state 回 paused。給 user 在排隊時按「取消排隊」用。
export async function cancelQueued(opts: {
  projectPath: string;
  projectHash: string;
  pipelineId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { projectPath, projectHash, pipelineId } = opts;
  const removed = dequeue(projectHash, pipelineId);
  if (!removed) return { ok: false, error: "Pipeline 不在排隊中" };
  const pipeline = (await pipelineDir.readPipeline(projectPath, pipelineId)) as {
    state?: string;
    [k: string]: unknown;
  } | null;
  if (pipeline && pipeline.state === "queued") {
    await pipelineDir.writePipeline(projectPath, pipelineId, {
      ...pipeline,
      state: "paused",
    });
  }
  return { ok: true };
}

// 公開給 routes:max_parallel 變大時手動觸發補位
export async function triggerDispatch(projectPath: string, projectHash: string): Promise<void> {
  await dispatch(projectPath, projectHash);
}
