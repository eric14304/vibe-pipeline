import * as projectStore from "../../server/lib/projectStore";
import * as pipelineDir from "../../server/lib/pipelineDir";
import { projectHash } from "../../server/lib/hash";
import { resolve } from "node:path";
import type { ParsedArgs } from "../lib/args";
import { fail, isJsonMode, okJson, print, printLines, table } from "../lib/output";
import type { Project } from "../../shared/types";

export async function runProject(sub: string | undefined, args: ParsedArgs): Promise<void> {
  switch (sub) {
    case "list": return projectList();
    case "show": return projectShow(args);
    case "add":  return projectAdd(args);
    case "remove": return projectRemove(args);
    default:
      fail("INVALID_ARGS", `Unknown project subcommand: ${sub ?? "(none)"}. Use list|show|add|remove`);
  }
}

async function projectList(): Promise<void> {
  const projects = await projectStore.listRecent();
  if (isJsonMode()) {
    okJson(projects);
    return;
  }
  if (projects.length === 0) {
    print("No projects.");
    return;
  }
  const rows: string[][] = [["HASH", "NAME", "PATH", "INIT", "BRANCH"]];
  for (const p of projects) {
    rows.push([
      p.hash,
      p.name,
      p.path,
      p.hasInit ? "yes" : "no",
      p.currentBranch ?? "-",
    ]);
  }
  printLines([table(rows)]);
}

async function projectShow(args: ParsedArgs): Promise<void> {
  const hash = typeof args.flags["project"] === "string" ? args.flags["project"] : undefined;
  const path = typeof args.flags["project-path"] === "string" ? args.flags["project-path"] : undefined;

  let proj: Project | null = null;
  if (path) {
    const abs = resolve(path);
    proj = await projectStore.findByHash(projectHash(abs));
    if (!proj) {
      // Build one on the fly even if not in state.json
      const hasInit = pipelineDir.hasInit(abs);
      proj = {
        path: abs,
        hash: projectHash(abs),
        name: abs.split(/[\\/]/).pop() ?? abs,
        hasInit,
        hasGit: false,
        lastOpenedAt: 0,
      };
    }
  } else if (hash) {
    proj = await projectStore.findByHash(hash);
    if (!proj) fail("NO_PROJECT", `No project with hash ${hash}`);
  } else {
    proj = await projectStore.getLastProject();
    if (!proj) fail("NO_PROJECT", "No active project");
  }

  if (isJsonMode()) {
    okJson(proj);
    return;
  }
  printLines([
    `hash:    ${proj!.hash}`,
    `name:    ${proj!.name}`,
    `path:    ${proj!.path}`,
    `init:    ${proj!.hasInit ? "yes" : "no"}`,
    `git:     ${proj!.hasGit ? "yes" : "no"}`,
    `branch:  ${proj!.currentBranch ?? "-"}`,
    `opened:  ${proj!.lastOpenedAt ? new Date(proj!.lastOpenedAt).toLocaleString() : "-"}`,
  ]);
}

async function projectAdd(args: ParsedArgs): Promise<void> {
  const path = args.positional[0] ?? (typeof args.flags["path"] === "string" ? args.flags["path"] : undefined);
  if (!path) fail("INVALID_ARGS", "Usage: vbpl project add <path>");
  const proj = await projectStore.open(path);
  if (isJsonMode()) {
    okJson(proj);
    return;
  }
  print(`Added project: ${proj.name} (${proj.hash})`);
}

async function projectRemove(args: ParsedArgs): Promise<void> {
  const hashOrPath = args.positional[0] ??
    (typeof args.flags["project"] === "string" ? args.flags["project"] : undefined) ??
    (typeof args.flags["project-path"] === "string" ? args.flags["project-path"] : undefined);

  if (!hashOrPath) fail("INVALID_ARGS", "Usage: vbpl project remove <hash|path>");

  // Try as hash first, then as path
  let proj = await projectStore.findByHash(hashOrPath);
  if (!proj) {
    const abs = resolve(hashOrPath);
    proj = await projectStore.findByHash(projectHash(abs));
  }
  if (!proj) fail("NO_PROJECT", `No project found for: ${hashOrPath}`);

  // Remove from state.json by re-writing without this entry
  // projectStore doesn't expose a remove function, so we do it via the internal state
  // We need to call a remove-compatible path — open a shim via direct state manipulation
  // Since projectStore doesn't export remove, we implement inline via its exported functions.
  // We'll use a workaround: the state file is at vibeHome()/.vibe-pipeline/state.json
  // Rather than re-implementing, we expose removal via a helper below.
  await removeProject(proj!.path);

  if (isJsonMode()) {
    okJson({ removed: true, hash: proj!.hash, path: proj!.path });
    return;
  }
  print(`Removed project: ${proj!.name} (${proj!.hash})`);
}

// Inline project removal — rewrite state.json without the given path.
async function removeProject(projectPath: string): Promise<void> {
  const { join } = await import("node:path");
  const { existsSync, mkdirSync } = await import("node:fs");
  const { vibeHome } = await import("../../server/lib/paths");

  const home = vibeHome();
  const dir = join(home, ".vibe-pipeline");
  const file = join(dir, "state.json");

  type State = { lastProject: string | null; recentProjects: Array<{ path: string; lastOpenedAt: number }> };
  let state: State = { lastProject: null, recentProjects: [] };
  if (existsSync(file)) {
    try {
      state = JSON.parse(await Bun.file(file).text());
    } catch { /* ignore */ }
  }

  state.recentProjects = (state.recentProjects ?? []).filter((r) => r.path !== projectPath);
  if (state.lastProject === projectPath) {
    state.lastProject = state.recentProjects[0]?.path ?? null;
  }

  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = file + ".tmp";
  await Bun.write(tmp, JSON.stringify(state, null, 2));
  const { renameSync } = await import("node:fs");
  renameSync(tmp, file);
}
