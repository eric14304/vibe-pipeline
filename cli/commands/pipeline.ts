import * as pipelineDir from "../../server/lib/pipelineDir";
import * as orchestrator from "../../server/lib/runner/orchestrator";
import * as runLog from "../../server/lib/runner/runLog";
import * as syncJob from "../../server/lib/runner/syncJob";
import { resolveProject, requireInit } from "../lib/project";
import { post } from "../lib/api";
import type { ParsedArgs } from "../lib/args";
import { fail, isJsonMode, okJson, print, printLines, table } from "../lib/output";
import type { Pipeline } from "../../shared/types";

export async function runPipeline(sub: string | undefined, args: ParsedArgs): Promise<void> {
  switch (sub) {
    case "list":   return pipelineList(args);
    case "show":   return pipelineShow(args);
    case "create": return pipelineCreate(args);
    case "delete": return pipelineDelete(args);
    case "run":    return pipelineRun(args);
    case "stop":   return pipelineStop(args);
    case "status": return pipelineStatus(args);
    case "log":    return pipelineLog(args);
    case "merge":  return pipelineMerge(args);
    case "sync":   return pipelineSync(args);
    default:
      fail("INVALID_ARGS", `Unknown pipeline subcommand: ${sub ?? "(none)"}. Use list|create|show|delete|run|stop|status|log|merge|sync`);
  }
}

async function pipelineList(args: ParsedArgs): Promise<void> {
  const proj = await resolveProject(args.flags);
  await requireInit(proj.path);
  const pipelines = (await pipelineDir.listPipelines(proj.path)) as Pipeline[];
  if (isJsonMode()) {
    okJson(pipelines);
    return;
  }
  if (pipelines.length === 0) {
    print("No pipelines.");
    return;
  }
  const rows: string[][] = [["ID", "NAME", "STATE", "TICKETS", "BRANCH"]];
  for (const p of pipelines) {
    rows.push([
      p.id,
      p.name,
      p.state,
      String(p.tickets?.length ?? 0),
      p.branch ?? "-",
    ]);
  }
  printLines([table(rows)]);
}

async function pipelineShow(args: ParsedArgs): Promise<void> {
  const proj = await resolveProject(args.flags);
  await requireInit(proj.path);
  const id = args.positional[0];
  if (!id) fail("INVALID_ARGS", "Usage: vbpl pipeline show <id>");
  const pipeline = (await pipelineDir.readPipeline(proj.path, id)) as Pipeline | null;
  if (!pipeline) fail("NO_PIPELINE", `Pipeline not found: ${id}`);
  if (isJsonMode()) {
    okJson(pipeline);
    return;
  }
  printLines([
    `id:        ${pipeline!.id}`,
    `name:      ${pipeline!.name}`,
    `state:     ${pipeline!.state}`,
    `branch:    ${pipeline!.branch}`,
    `baseBranch: ${pipeline!.baseBranch ?? "main"}`,
    `tickets:   ${pipeline!.tickets?.length ?? 0}`,
    `autoMerge: ${pipeline!.autoMerge ?? false}`,
  ]);
  if ((pipeline!.tickets ?? []).length > 0) {
    print("");
    print("Tickets:");
    const rows: string[][] = [["N", "TITLE", "STATUS", "MODE"]];
    for (const t of pipeline!.tickets) {
      rows.push([
        String(t.n),
        t.title,
        t.status,
        t.mode,
      ]);
    }
    printLines([table(rows)]);
  }
}

async function pipelineCreate(args: ParsedArgs): Promise<void> {
  const proj = await resolveProject(args.flags);
  await requireInit(proj.path);

  const name = args.positional[0] ?? (typeof args.flags["name"] === "string" ? args.flags["name"] : undefined);
  if (!name) fail("INVALID_ARGS", "Usage: vbpl pipeline create <name> [--base-branch <branch>] [--auto-merge]");

  const id = pipelineDir.generatePipelineId(name);
  const defaults = await pipelineDir.getResolvedDefaults(proj.path);
  const baseBranch = typeof args.flags["base-branch"] === "string" ? args.flags["base-branch"] : defaults.base_branch || "main";
  const autoMerge = args.flags["auto-merge"] === true || args.flags["auto-merge"] === "true";
  const branch = `pipeline/${name.toLowerCase().replace(/[^a-z0-9-_]+/g, "-").replace(/^-+|-+$/g, "")}`;

  const pipeline: Pipeline = {
    id,
    name,
    branch,
    baseBranch,
    state: "planning",
    tickets: [],
    autoMerge,
  };

  await pipelineDir.writePipeline(proj.path, id, pipeline);

  if (isJsonMode()) {
    okJson(pipeline);
    return;
  }
  printLines([
    `Created pipeline: ${name}`,
    `  id:     ${id}`,
    `  branch: ${branch}`,
  ]);
}

async function pipelineDelete(args: ParsedArgs): Promise<void> {
  const proj = await resolveProject(args.flags);
  await requireInit(proj.path);
  const id = args.positional[0];
  if (!id) fail("INVALID_ARGS", "Usage: vbpl pipeline delete <id>");
  const deleted = pipelineDir.deletePipeline(proj.path, id);
  if (!deleted) fail("NO_PIPELINE", `Pipeline not found: ${id}`);
  if (isJsonMode()) {
    okJson({ deleted: true, id });
    return;
  }
  print(`Deleted pipeline: ${id}`);
}

// 走 backend HTTP — spawn child(claude/codex runner)必須讓 backend 養。
// CLI 自己 spawn 會在 CLI 退出時失去 child 控制權(orchestrator running map 蒸發,watchdog / pause / stop 都失效)
async function pipelineRun(args: ParsedArgs): Promise<void> {
  const proj = await resolveProject(args.flags);
  await requireInit(proj.path);
  const id = args.positional[0];
  if (!id) fail("INVALID_ARGS", "Usage: vbpl pipeline run <id>");

  const result = await post<{ ok: true; queued?: boolean; position?: number | null }>(
    `/api/projects/${proj.hash}/pipelines/${id}/run`
  );

  if (isJsonMode()) {
    okJson({ started: true, pipelineId: id, queued: result.queued ?? false, position: result.position ?? null });
    return;
  }
  if (result.queued) {
    print(`Pipeline queued: ${id} (position ${result.position ?? "?"})`);
  } else {
    print(`Pipeline started: ${id}`);
  }
}

async function pipelineStop(args: ParsedArgs): Promise<void> {
  const proj = await resolveProject(args.flags);
  await requireInit(proj.path);
  const id = args.positional[0];
  if (!id) fail("INVALID_ARGS", "Usage: vbpl pipeline stop <id>");

  await post(`/api/projects/${proj.hash}/pipelines/${id}/pause`);

  if (isJsonMode()) {
    okJson({ stopping: true, pipelineId: id });
    return;
  }
  print(`Pipeline stopping: ${id} (runner will mark paused after current ticket)`);
}

async function pipelineStatus(args: ParsedArgs): Promise<void> {
  const proj = await resolveProject(args.flags);
  await requireInit(proj.path);
  const id = args.positional[0];
  if (!id) fail("INVALID_ARGS", "Usage: vbpl pipeline status <id>");

  const pipeline = (await pipelineDir.readPipeline(proj.path, id)) as Pipeline | null;
  if (!pipeline) fail("NO_PIPELINE", `Pipeline not found: ${id}`);

  const running = orchestrator.isRunning(proj.hash, id);
  const queued = orchestrator.isQueued(proj.hash, id);
  const queuePos = queued ? orchestrator.queuePosition(proj.hash, id) : null;

  const statusObj = {
    id,
    name: pipeline!.name,
    state: pipeline!.state,
    running,
    queued,
    queuePosition: queuePos,
    tickets: (pipeline!.tickets ?? []).map((t) => ({ id: t.id, n: t.n, title: t.title, status: t.status, mode: t.mode })),
  };

  if (isJsonMode()) {
    okJson(statusObj);
    return;
  }
  printLines([
    `Pipeline: ${pipeline!.name} (${id})`,
    `state:    ${pipeline!.state}${running ? " [in-process running]" : ""}${queued ? ` [queued #${queuePos}]` : ""}`,
  ]);
  if ((pipeline!.tickets ?? []).length > 0) {
    print("");
    const rows: string[][] = [["N", "TITLE", "STATUS"]];
    for (const t of pipeline!.tickets) {
      rows.push([String(t.n), t.title, t.status]);
    }
    printLines([table(rows)]);
  }
}

async function pipelineLog(args: ParsedArgs): Promise<void> {
  const proj = await resolveProject(args.flags);
  await requireInit(proj.path);
  const id = args.positional[0];
  if (!id) fail("INVALID_ARGS", "Usage: vbpl pipeline log <id> [--last N]");

  const lastN = typeof args.flags["last"] === "string" ? Number(args.flags["last"]) : 1;
  const runs = await runLog.listRuns(proj.path, id);

  if (isJsonMode()) {
    okJson(runs.slice(0, lastN));
    return;
  }
  if (runs.length === 0) {
    print("No run logs found.");
    return;
  }
  const toShow = runs.slice(0, lastN);
  for (const run of toShow) {
    printLines([
      `--- Run ${run.filename} ---`,
      `started:  ${new Date(run.startedAt).toLocaleString()}`,
      `exit:     ${run.exitCode ?? "?"}`,
      `duration: ${run.durationMs != null ? `${(run.durationMs / 1000).toFixed(1)}s` : "-"}`,
      `cost:     ${run.costUsd != null ? `$${run.costUsd.toFixed(4)}` : "-"}`,
      `turns:    ${run.numTurns ?? "-"}`,
      `result:   ${run.result ? run.result.slice(0, 200) : "-"}`,
    ]);
    print("");
  }
}

// AI merge:走 backend POST /merge,backend spawn runner 主 agent。CLI 立刻返回。
async function pipelineMerge(args: ParsedArgs): Promise<void> {
  const proj = await resolveProject(args.flags);
  await requireInit(proj.path);
  const id = args.positional[0];
  if (!id) fail("INVALID_ARGS", "Usage: vbpl pipeline merge <id>");

  // 2026-05-13 後 backend 二段式:mechanical → mergeCommit;衝突 fallback ai → ticketId
  type MergeResp =
    | { ok: true; mode: "mechanical"; mergeCommit?: { hash: string; subject: string; ts: number }; alreadyMerged?: boolean }
    | { ok: true; mode: "ai"; ticketId: string; conflictFiles?: string[] };
  const res = await post<MergeResp>(`/api/projects/${proj.hash}/pipelines/${id}/merge`);

  if (isJsonMode()) {
    okJson({ ...res, pipelineId: id });
    return;
  }
  if (res.mode === "mechanical") {
    if (res.alreadyMerged) {
      print(`Already merged (no-op): ${id}`);
    } else {
      print(`✓ Merged (mechanical, no AI): ${id}`);
      if (res.mergeCommit) print(`  commit: ${res.mergeCommit.hash.slice(0, 7)} - ${res.mergeCommit.subject}`);
    }
  } else {
    const n = res.conflictFiles?.length ?? 0;
    print(`⚠ Conflict (${n} files), AI 接手:ticket=${res.ticketId}`);
    print(`Watch progress: vbpl pipeline log ${id}`);
  }
}

// Sync:把 base branch merge 進 pipeline worktree。
//   vbpl pipeline sync <id>           → 啟動(試 git merge,衝突跳 conflict_await)
//   vbpl pipeline sync <id> --ai      → conflict_await 階段確認讓 AI 解
//   vbpl pipeline sync <id> --cancel  → 任 active 狀態取消(merge --abort)
//   vbpl pipeline sync <id> --dismiss → 收尾 done/failed,清 syncJob
async function pipelineSync(args: ParsedArgs): Promise<void> {
  const proj = await resolveProject(args.flags);
  await requireInit(proj.path);
  const id = args.positional[0];
  if (!id) fail("INVALID_ARGS", "Usage: vbpl pipeline sync <id> [--ai|--cancel|--dismiss]");

  const wantAi = args.flags["ai"] === true;
  const wantCancel = args.flags["cancel"] === true;
  const wantDismiss = args.flags["dismiss"] === true;

  if (wantAi) {
    // spawn AI child → 必須走 HTTP 讓 backend 養 child
    await post(`/api/projects/${proj.hash}/pipelines/${id}/sync/ai`);
    if (isJsonMode()) { okJson({ confirmed: true }); return; }
    print(`AI conflict resolution started for ${id}. Watch: vbpl pipeline status ${id}`);
    return;
  }
  if (wantCancel) {
    // 可能要 kill 已 spawn AI → 必須走 HTTP
    await post(`/api/projects/${proj.hash}/pipelines/${id}/sync/cancel`);
    if (isJsonMode()) { okJson({ cancelled: true }); return; }
    print(`Sync cancelled. worktree restored via git merge --abort.`);
    return;
  }
  if (wantDismiss) {
    const p = (await pipelineDir.readPipeline(proj.path, id)) as { syncJob?: { state?: string }; [k: string]: unknown } | null;
    if (!p) fail("NOT_FOUND", `Pipeline not found: ${id}`);
    if (!p.syncJob) {
      if (isJsonMode()) { okJson({ dismissed: true, noop: true }); return; }
      print("No syncJob to dismiss.");
      return;
    }
    if (p.syncJob.state === "ai_running" || p.syncJob.state === "merging") {
      fail("STATE_GUARD", `Sync still running (state=${p.syncJob.state}); use --cancel first`);
    }
    const { syncJob: _drop, ...rest } = p;
    void _drop;
    await pipelineDir.writePipeline(proj.path, id, rest);
    if (isJsonMode()) { okJson({ dismissed: true }); return; }
    print("syncJob dismissed.");
    return;
  }

  // Default action:啟動 sync
  const res = await syncJob.startSync({
    projectPath: proj.path,
    projectHash: proj.hash,
    pipelineId: id,
  });
  if (!res.ok) fail("STATE_GUARD", res.error);

  if (isJsonMode()) {
    okJson({ state: res.state, behind: res.behind, conflictFiles: res.conflictFiles });
    return;
  }
  if (res.state === "done") {
    print(`✓ Sync done (was ${res.behind ?? 0} commits behind, git merge clean).`);
  } else if (res.state === "conflict_await") {
    print(`⚠ Conflict: ${res.conflictFiles?.length ?? 0} files. Decide:`);
    print(`  vbpl pipeline sync ${id} --ai      (let AI resolve)`);
    print(`  vbpl pipeline sync ${id} --cancel  (abort merge)`);
    if (res.conflictFiles && res.conflictFiles.length > 0) {
      print("Conflicting files:");
      for (const f of res.conflictFiles.slice(0, 12)) print(`  - ${f}`);
      if (res.conflictFiles.length > 12) print(`  …and ${res.conflictFiles.length - 12} more`);
    }
  } else if (res.state === "failed") {
    print(`✕ Sync failed.`);
  } else {
    print(`Sync state: ${res.state}`);
  }
}
