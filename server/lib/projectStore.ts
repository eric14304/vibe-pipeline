import { homedir } from "node:os";
import { join, basename, resolve } from "node:path";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { projectHash } from "./hash";
import { currentBranch } from "./git";
import type { Project } from "../../shared/types";

const STATE_DIR = join(homedir(), ".vibe-pipeline");
const STATE_FILE = join(STATE_DIR, "state.json");

type State = {
  lastProject: string | null;
  recentProjects: Array<{ path: string; lastOpenedAt: number }>;
};

const EMPTY_STATE: State = { lastProject: null, recentProjects: [] };

async function readState(): Promise<State> {
  if (!existsSync(STATE_FILE)) return EMPTY_STATE;
  try {
    const text = await Bun.file(STATE_FILE).text();
    const parsed = JSON.parse(text);
    return {
      lastProject: typeof parsed.lastProject === "string" ? parsed.lastProject : null,
      recentProjects: Array.isArray(parsed.recentProjects) ? parsed.recentProjects : [],
    };
  } catch {
    return EMPTY_STATE;
  }
}

async function writeState(state: State): Promise<void> {
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
  const tmp = STATE_FILE + ".tmp";
  await Bun.write(tmp, JSON.stringify(state, null, 2));
  await Bun.$`mv ${tmp} ${STATE_FILE}`.quiet();
}

async function toProject(path: string, lastOpenedAt: number): Promise<Project> {
  const absolute = resolve(path);
  const dirPath = join(absolute, ".vibe-pipeline");
  const hasInit = existsSync(dirPath) && statSync(dirPath).isDirectory();
  const hasGit = existsSync(join(absolute, ".git"));
  const branch = hasGit ? await currentBranch(absolute) : null;
  return {
    path: absolute,
    hash: projectHash(absolute),
    name: basename(absolute),
    hasInit,
    hasGit,
    lastOpenedAt,
    currentBranch: branch ?? undefined,
  };
}

export async function listRecent(): Promise<Project[]> {
  const state = await readState();
  const sorted = [...state.recentProjects].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
  return Promise.all(sorted.map((r) => toProject(r.path, r.lastOpenedAt)));
}

export async function getLastProject(): Promise<Project | null> {
  const state = await readState();
  if (!state.lastProject) return null;
  const entry = state.recentProjects.find((r) => r.path === state.lastProject);
  if (!entry) return null;
  return toProject(state.lastProject, entry.lastOpenedAt);
}

export async function findByHash(hash: string): Promise<Project | null> {
  const state = await readState();
  for (const r of state.recentProjects) {
    if (projectHash(r.path) === hash) return toProject(r.path, r.lastOpenedAt);
  }
  return null;
}

export async function open(path: string): Promise<Project> {
  const absolute = resolve(path);
  const now = Date.now();
  const state = await readState();
  state.lastProject = absolute;
  const existing = state.recentProjects.find((r) => r.path === absolute);
  if (existing) existing.lastOpenedAt = now;
  else state.recentProjects.push({ path: absolute, lastOpenedAt: now });
  await writeState(state);
  return toProject(absolute, now);
}
