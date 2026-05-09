import { resolve } from "node:path";
import { existsSync, statSync } from "node:fs";
import * as projectStore from "../lib/projectStore";
import * as pipelineDir from "../lib/pipelineDir";
import * as git from "../lib/git";
import * as orchestrator from "../lib/runner/orchestrator";
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

export async function savePipeline(hash: string, id: string, req: Request): Promise<Response> {
  const project = await projectStore.findByHash(hash);
  if (!project) return err("not_found", `Project not found: ${hash}`, 404);
  if (!pipelineDir.hasInit(project.path))
    return err("not_initialized", `.vibe-pipeline/ not found in ${project.path}`);
  const body = await readJson(req);
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
  if (!r.ok) return err("internal_error", r.error, 500);
  return ok({ ok: true });
}

export async function pausePipeline(hash: string, pipelineId: string): Promise<Response> {
  const project = await projectStore.findByHash(hash);
  if (!project) return err("not_found", `Project not found: ${hash}`, 404);
  const r = await orchestrator.stop({
    projectPath: project.path,
    projectHash: hash,
    pipelineId,
  });
  if (!r.ok) return err("invalid_path", r.error);
  return ok({ ok: true });
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

export { projectHash };
