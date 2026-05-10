import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import * as pipelineDir from "../pipelineDir";
import * as worktree from "../git/worktree";
import * as notifs from "../notifs/store";
import * as ticketWatcher from "./ticketWatcher";
import { RUNNER_BEHAVIOR_PROMPT } from "./runnerPrompt";

type RunningProcess = {
  pipelineId: string;
  proc: Bun.Subprocess;
  startedAt: number;
};

const running = new Map<string, RunningProcess>(); // key: <projectHash>:<pipelineId>

function key(projectHash: string, pipelineId: string): string {
  return `${projectHash}:${pipelineId}`;
}

export function isRunning(projectHash: string, pipelineId: string): boolean {
  return running.has(key(projectHash, pipelineId));
}

// 起 main agent。Pipeline 必須已存在,有 branch 欄位。
export async function start(opts: {
  projectPath: string;
  projectHash: string;
  pipelineId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { projectPath, projectHash, pipelineId } = opts;
  const k = key(projectHash, pipelineId);

  if (running.has(k)) {
    return { ok: false, error: "Pipeline 已在跑" };
  }

  const pipeline = (await pipelineDir.readPipeline(projectPath, pipelineId)) as {
    branch?: string;
    baseBranch?: string;
    name?: string;
    state?: string;
    tickets?: Array<{ status?: string }>;
  } | null;
  if (!pipeline) return { ok: false, error: `Pipeline not found: ${pipelineId}` };

  // State guard:不允許在這幾個狀態 spawn(避免重複跑、燒錢空轉)
  if (pipeline.state === "running") {
    return { ok: false, error: "Pipeline 已在 running" };
  }
  if (pipeline.state === "stopping") {
    return { ok: false, error: "Pipeline 正在 stopping,等它收完再 run" };
  }
  if (pipeline.state === "ready") {
    // 全部 ticket 都 done,沒事可跑。要重跑的話 user 要先 reset ticket 狀態。
    const hasRunnable = (pipeline.tickets ?? []).some(
      (t) => t.status === "draft" || t.status === "ready"
    );
    if (!hasRunnable) {
      return { ok: false, error: "Pipeline 已完成,沒待跑的 ticket(reset ticket.status 才能重跑)" };
    }
  }

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

  // 3. spawn claude CLI 主 agent (cwd = worktree)
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
        } | null;
        const name = final?.name || pipelineId;
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

// Crash recovery:server 啟動時,任何 pipeline.state="running"/"stopping" 但 process 不在 → 標 paused
export async function recoverStale(projectPath: string): Promise<void> {
  const pipelines = (await pipelineDir.listPipelines(projectPath)) as Array<{
    id?: string;
    state?: string;
    [k: string]: unknown;
  }>;
  for (const p of pipelines) {
    if (!p.id) continue;
    if (p.state === "running" || p.state === "stopping") {
      await pipelineDir.writePipeline(projectPath, p.id, { ...p, state: "paused" });
      console.log(`[runner] recovered stale pipeline ${p.id} → paused`);
    }
  }
}
