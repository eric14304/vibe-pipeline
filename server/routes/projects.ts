import { resolve } from "node:path";
import { existsSync, statSync } from "node:fs";
import * as projectStore from "../lib/projectStore";
import * as pipelineDir from "../lib/pipelineDir";
import * as git from "../lib/git";
import * as orchestrator from "../lib/runner/orchestrator";
import * as worktree from "../lib/git/worktree";
import * as runLog from "../lib/runner/runLog";
import * as notifs from "../lib/notifs/store";
import { pickFolder, revealFolder } from "../lib/dialog";
import { projectHash } from "../lib/hash";
import type { ApiResponse, ApiErrorCode, Project } from "../../shared/types";

function ok<T>(data: T): Response {
  return Response.json({ ok: true, data } satisfies ApiResponse<T>);
}

function err(code: ApiErrorCode, message: string, status = 400): Response {
  return Response.json({ ok: false, error: { code, message } } satisfies ApiResponse<never>, {
    status,
  });
}

async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function validProjectPath(p: string): boolean {
  if (!p || typeof p !== "string") return false;
  const abs = resolve(p);
  if (!existsSync(abs)) return false;
  try {
    return statSync(abs).isDirectory();
  } catch {
    return false;
  }
}

export async function listRecent(): Promise<Response> {
  const items = await projectStore.listRecent();
  return ok(items);
}

export async function selectFolder(): Promise<Response> {
  let path: string | null;
  try {
    path = await pickFolder();
  } catch (e) {
    return err("internal_error", String(e), 500);
  }
  if (!path) return err("dialog_cancelled", "User cancelled folder selection");
  if (!validProjectPath(path)) return err("invalid_path", `Not a directory: ${path}`);
  return ok({ path: resolve(path) });
}

export async function openProject(req: Request): Promise<Response> {
  const body = await readJson(req);
  const path = body.path as string | undefined;
  if (!path || !validProjectPath(path)) return err("invalid_path", `Invalid path: ${path}`);
  const project = await projectStore.open(path);
  return ok(project);
}

export async function status(hash: string): Promise<Response> {
  const project = await projectStore.findByHash(hash);
  if (!project) return err("not_found", `Project not found: ${hash}`, 404);
  return ok(project satisfies Project);
}

export async function init(hash: string): Promise<Response> {
  const project = await projectStore.findByHash(hash);
  if (!project) return err("not_found", `Project not found: ${hash}`, 404);
  if (!validProjectPath(project.path)) return err("invalid_path", `Path missing: ${project.path}`);
  if (pipelineDir.hasInit(project.path))
    return err("already_initialized", `.vibe-pipeline/ already exists in ${project.path}`);
  try {
    await pipelineDir.init(project.path);
  } catch (e) {
    return err("internal_error", String(e), 500);
  }
  const refreshed = await projectStore.findByHash(hash);
  return ok(refreshed);
}

export async function listPipelines(hash: string): Promise<Response> {
  const project = await projectStore.findByHash(hash);
  if (!project) return err("not_found", `Project not found: ${hash}`, 404);
  if (!pipelineDir.hasInit(project.path))
    return err("not_initialized", `.vibe-pipeline/ not found in ${project.path}`);
  const items = await pipelineDir.listPipelines(project.path);
  return ok(items);
}

export async function createPipeline(hash: string, req: Request): Promise<Response> {
  const project = await projectStore.findByHash(hash);
  if (!project) return err("not_found", `Project not found: ${hash}`, 404);
  if (!pipelineDir.hasInit(project.path))
    return err("not_initialized", `.vibe-pipeline/ not found in ${project.path}`);
  const body = await readJson(req);
  const name = (body.name as string) || "pipeline";
  const id = (body.id as string) || pipelineDir.generatePipelineId(name);
  const data = { ...body, id, tickets: Array.isArray(body.tickets) ? body.tickets : [] };
  await pipelineDir.writePipeline(project.path, id, data);
  return ok(data);
}

export async function getPipeline(hash: string, id: string): Promise<Response> {
  const project = await projectStore.findByHash(hash);
  if (!project) return err("not_found", `Project not found: ${hash}`, 404);
  if (!pipelineDir.hasInit(project.path))
    return err("not_initialized", `.vibe-pipeline/ not found in ${project.path}`);
  const data = await pipelineDir.readPipeline(project.path, id);
  if (!data) return err("not_found", `Pipeline not found: ${id}`, 404);
  return ok(data);
}

export async function deletePipeline(hash: string, id: string): Promise<Response> {
  const project = await projectStore.findByHash(hash);
  if (!project) return err("not_found", `Project not found: ${hash}`, 404);
  if (orchestrator.isRunning(hash, id)) {
    return err("invalid_path", "Pipeline 還在跑,先 pause 才能刪", 409);
  }
  // queued 的順手從 queue 拔,避免 dispatcher 等下撈到一個刪掉的 pipeline
  if (orchestrator.isQueued(hash, id)) {
    await orchestrator.cancelQueued({
      projectPath: project.path,
      projectHash: hash,
      pipelineId: id,
    });
  }
  // 刪 pipeline.json + qa drafts(若有)。worktree 留著,user 自己 git worktree remove 清。
  const removed = pipelineDir.deletePipeline(project.path, id);
  if (!removed) return err("not_found", `Pipeline not found: ${id}`, 404);
  return ok({ ok: true });
}

export async function savePipeline(hash: string, id: string, req: Request): Promise<Response> {
  const project = await projectStore.findByHash(hash);
  if (!project) return err("not_found", `Project not found: ${hash}`, 404);
  if (!pipelineDir.hasInit(project.path))
    return err("not_initialized", `.vibe-pipeline/ not found in ${project.path}`);
  const existing = (await pipelineDir.readPipeline(project.path, id)) as {
    state?: string;
  } | null;
  // PUT 不准用來建立新 pipeline(用 POST /pipelines)— 避免 typo 路徑悄悄 upsert
  if (!existing) {
    return err("not_found", `Pipeline not found: ${id}(建立用 POST /pipelines)`, 404);
  }
  // Race guard:running / stopping / queued 時禁止 PUT,避免覆蓋 runner 主 agent 正在寫的 iter / commits
  // 或把 queued 狀態踩掉導致 dispatcher 接不到。queued 可走「取消排隊」端點處理。
  if (
    existing.state === "running" ||
    existing.state === "stopping" ||
    existing.state === "queued"
  ) {
    return err(
      "invalid_path",
      `Pipeline 在 ${existing.state} 狀態,先 pause/取消排隊 才能修改`,
      409
    );
  }
  const body = await readJson(req);
  // 最小 shape 驗證:防止空 body / 半個 body 把整條 pipeline.json 清光
  // (不做完整 spec 驗,只擋明顯壞掉)
  if (
    !body ||
    typeof body !== "object" ||
    typeof (body as Record<string, unknown>).name !== "string" ||
    typeof (body as Record<string, unknown>).branch !== "string" ||
    !Array.isArray((body as Record<string, unknown>).tickets)
  ) {
    return err(
      "invalid_path",
      "Body 缺必要欄位:name(string)/ branch(string)/ tickets(array)",
      400
    );
  }
  const data = { ...body, id };
  await pipelineDir.writePipeline(project.path, id, data);
  return ok(data);
}

export async function gitInit(hash: string): Promise<Response> {
  const project = await projectStore.findByHash(hash);
  if (!project) return err("not_found", `Project not found: ${hash}`, 404);
  if (!validProjectPath(project.path)) return err("invalid_path", `Path missing: ${project.path}`);
  if (git.hasGit(project.path))
    return err("already_initialized", `.git already exists in ${project.path}`);
  try {
    await git.gitInit(project.path);
  } catch (e) {
    return err("internal_error", String(e), 500);
  }
  const refreshed = await projectStore.findByHash(hash);
  return ok(refreshed);
}

export async function reveal(hash: string): Promise<Response> {
  const project = await projectStore.findByHash(hash);
  if (!project) return err("not_found", `Project not found: ${hash}`, 404);
  if (!validProjectPath(project.path)) return err("invalid_path", `Path missing: ${project.path}`);
  try {
    await revealFolder(project.path);
  } catch (e) {
    return err("internal_error", String(e), 500);
  }
  return ok({ ok: true });
}

export async function runPipeline(hash: string, pipelineId: string): Promise<Response> {
  const project = await projectStore.findByHash(hash);
  if (!project) return err("not_found", `Project not found: ${hash}`, 404);
  if (!validProjectPath(project.path)) return err("invalid_path", `Path missing: ${project.path}`);
  if (!project.hasGit) return err("invalid_path", "Project 沒 .git/,先 git init 再跑 pipeline");
  const r = await orchestrator.start({
    projectPath: project.path,
    projectHash: hash,
    pipelineId,
  });
  if (!r.ok) {
    // 邏輯阻擋(state guard / 已在跑等)用 409 conflict;真正爆炸用 500
    const isConflict = /已在|stopping|完成|排隊|merge/.test(r.error);
    return err("invalid_path", r.error, isConflict ? 409 : 500);
  }
  // queued: true 時,前端可立即顯示「排隊中(順位 N)」不等下一輪 poll
  return ok({ ok: true, queued: r.queued ?? false, position: r.position ?? 0 });
}

export async function pausePipeline(hash: string, pipelineId: string): Promise<Response> {
  const project = await projectStore.findByHash(hash);
  if (!project) return err("not_found", `Project not found: ${hash}`, 404);
  // queued 狀態走 cancelQueued(直接從 queue 拔 + 標 paused);running 走原 stop 流程
  if (orchestrator.isQueued(hash, pipelineId)) {
    const r = await orchestrator.cancelQueued({
      projectPath: project.path,
      projectHash: hash,
      pipelineId,
    });
    if (!r.ok) return err("invalid_path", r.error, 409);
    return ok({ ok: true, cancelled: true });
  }
  const r = await orchestrator.stop({
    projectPath: project.path,
    projectHash: hash,
    pipelineId,
  });
  if (!r.ok) return err("invalid_path", r.error, 409);
  return ok({ ok: true });
}

export async function mergePipeline(hash: string, pipelineId: string): Promise<Response> {
  const project = await projectStore.findByHash(hash);
  if (!project) return err("not_found", `Project not found: ${hash}`, 404);
  if (!project.hasGit) return err("invalid_path", "Project 沒 .git/", 400);
  if (orchestrator.isRunning(hash, pipelineId)) {
    return err("invalid_path", "Pipeline 在跑,先 pause 才能 merge", 409);
  }

  const pipeline = (await pipelineDir.readPipeline(project.path, pipelineId)) as {
    name?: string;
    branch?: string;
    baseBranch?: string;
    state?: string;
    tickets?: Array<{ status?: string }>;
    [k: string]: unknown;
  } | null;
  if (!pipeline) return err("not_found", `Pipeline not found: ${pipelineId}`, 404);

  const allDone = (pipeline.tickets ?? []).every((t) => t.status === "done");
  if (!allDone) {
    return err("invalid_path", "還有 ticket 未 done,先跑完再 merge", 409);
  }
  if (pipeline.state === "merged") {
    return err("invalid_path", "Pipeline 已 merge 過", 409);
  }

  const branch = pipeline.branch || `pipeline/${pipeline.name || pipelineId}`;
  const baseBranch = pipeline.baseBranch || "main";

  // strategy 從 project config 拿
  const cfg = await pipelineDir.readConfig(project.path);
  const strategyRaw = cfg.defaults?.merge_strategy ?? "squash";
  const strategy: git.MergeStrategy =
    strategyRaw === "merge" || strategyRaw === "ff-only" ? strategyRaw : "squash";

  const r = await git.merge(project.path, branch, baseBranch, strategy);
  if (!r.ok) {
    const msg =
      r.reason === "conflict"
        ? `Merge 衝突 — 手動 resolve 後 commit:\n${r.stderr}`
        : r.reason === "not_fast_forward"
        ? `不能 fast-forward(strategy=${strategy}),改用 merge / squash:\n${r.stderr}`
        : r.stderr;
    return err("invalid_path", msg, 409);
  }

  // 標 merged + 寫 mergedAt + 記錄 merge commit
  await pipelineDir.writePipeline(project.path, pipelineId, {
    ...pipeline,
    state: "merged",
    mergedAt: Date.now(),
    mergeCommit: { hash: r.commitHash, subject: r.commitSubject, ts: Date.now() },
  });

  notifs.emit(project.path, {
    type: "pipeline_merged",
    title: `${pipeline.name || pipelineId} merged → ${baseBranch}`,
    sub: r.commitHash.slice(0, 7),
    pipelineId,
  });

  return ok({ ok: true, commitHash: r.commitHash, commitSubject: r.commitSubject });
}

export async function listNotifs(hash: string): Promise<Response> {
  const project = await projectStore.findByHash(hash);
  if (!project) return err("not_found", `Project not found: ${hash}`, 404);
  return ok(notifs.list(project.path));
}

export async function markNotifRead(hash: string, id: string): Promise<Response> {
  const project = await projectStore.findByHash(hash);
  if (!project) return err("not_found", `Project not found: ${hash}`, 404);
  notifs.markRead(project.path, id);
  return ok({ ok: true });
}

export async function markAllNotifsRead(hash: string): Promise<Response> {
  const project = await projectStore.findByHash(hash);
  if (!project) return err("not_found", `Project not found: ${hash}`, 404);
  notifs.markAllRead(project.path);
  return ok({ ok: true });
}

export async function dismissNotif(hash: string, id: string): Promise<Response> {
  const project = await projectStore.findByHash(hash);
  if (!project) return err("not_found", `Project not found: ${hash}`, 404);
  notifs.dismiss(project.path, id);
  return ok({ ok: true });
}

export async function listPipelineRuns(
  hash: string,
  pipelineId: string
): Promise<Response> {
  const project = await projectStore.findByHash(hash);
  if (!project) return err("not_found", `Project not found: ${hash}`, 404);
  const runs = await runLog.listRuns(project.path, pipelineId);
  return ok(runs);
}

export async function getPipelineRun(
  hash: string,
  pipelineId: string,
  filename: string
): Promise<Response> {
  const project = await projectStore.findByHash(hash);
  if (!project) return err("not_found", `Project not found: ${hash}`, 404);
  const run = await runLog.getRun(project.path, pipelineId, filename);
  if (!run) return err("not_found", `Run log not found: ${filename}`, 404);
  return ok(run);
}

export async function revealWorktree(hash: string, pipelineId: string): Promise<Response> {
  const project = await projectStore.findByHash(hash);
  if (!project) return err("not_found", `Project not found: ${hash}`, 404);
  const path = worktree.worktreePath(project.path, pipelineId);
  if (!existsSync(path)) {
    return err("not_found", `Worktree 還沒建立(pipeline 還沒跑過)`, 404);
  }
  await revealFolder(path);
  return ok({ ok: true, path });
}

// GET /api/projects/:hash/config — 回 project config(目前只暴露 max_parallel,其他保留)
export async function getConfig(hash: string): Promise<Response> {
  const project = await projectStore.findByHash(hash);
  if (!project) return err("not_found", `Project not found: ${hash}`, 404);
  if (!pipelineDir.hasInit(project.path))
    return err("not_initialized", `.vibe-pipeline/ not found in ${project.path}`);
  const cfg = await pipelineDir.readConfig(project.path);
  const max_parallel = pipelineDir.clampMaxParallel(cfg.defaults?.max_parallel);
  return ok({
    defaults: {
      base_branch: cfg.defaults?.base_branch ?? "main",
      merge_strategy: cfg.defaults?.merge_strategy ?? "squash",
      max_parallel,
    },
  });
}

// PUT /api/projects/:hash/config — 接 partial body,只認可白名單欄位
export async function updateConfig(hash: string, req: Request): Promise<Response> {
  const project = await projectStore.findByHash(hash);
  if (!project) return err("not_found", `Project not found: ${hash}`, 404);
  if (!pipelineDir.hasInit(project.path))
    return err("not_initialized", `.vibe-pipeline/ not found in ${project.path}`);
  const body = await readJson(req);
  const cur = await pipelineDir.readConfig(project.path);
  const next: pipelineDir.ProjectConfig = {
    ...cur,
    defaults: { ...(cur.defaults ?? {}) },
    scripts: cur.scripts,
    qa: cur.qa,
  };
  const incomingDefaults = (body.defaults ?? {}) as Record<string, unknown>;
  if ("max_parallel" in incomingDefaults) {
    next.defaults!.max_parallel = pipelineDir.clampMaxParallel(incomingDefaults.max_parallel);
  }
  // 其他 defaults 欄位之後再放白名單;目前只 max_parallel 可改
  await pipelineDir.writeConfig(project.path, next);
  // max_parallel 變大可能補位,觸發 dispatch
  await orchestrator.triggerDispatch(project.path, hash);
  return ok({
    defaults: {
      base_branch: next.defaults?.base_branch ?? "main",
      merge_strategy: next.defaults?.merge_strategy ?? "squash",
      max_parallel: pipelineDir.clampMaxParallel(next.defaults?.max_parallel),
    },
  });
}

// GET /api/projects/:hash/runtime — 回 N/M(running 條數 / max_parallel)給 TopBar
export async function getRuntime(hash: string): Promise<Response> {
  const project = await projectStore.findByHash(hash);
  if (!project) return err("not_found", `Project not found: ${hash}`, 404);
  // 即使 hasInit 還沒,也回 0/default(避免 TopBar 爆)
  const max_parallel = pipelineDir.hasInit(project.path)
    ? await pipelineDir.getMaxParallel(project.path)
    : pipelineDir.DEFAULT_MAX_PARALLEL;
  return ok({
    runningCount: orchestrator.runningCount(hash),
    maxParallel: max_parallel,
  });
}

export async function listBranches(hash: string): Promise<Response> {
  const project = await projectStore.findByHash(hash);
  if (!project) return err("not_found", `Project not found: ${hash}`, 404);
  if (!project.hasGit) return ok([]);
  const branches = await git.listBranches(project.path);
  return ok(branches);
}

export { projectHash };
