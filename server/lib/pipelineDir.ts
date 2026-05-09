import { join } from "node:path";
import { existsSync, mkdirSync, statSync, readdirSync } from "node:fs";

const DIR = ".vibe-pipeline";
const RUNTIME_GITIGNORE_ENTRY = `${DIR}/.runtime/`;

export function rootPath(projectPath: string): string {
  return join(projectPath, DIR);
}

export function runtimePath(projectPath: string, sub = ""): string {
  return join(rootPath(projectPath), ".runtime", sub);
}

export function ensureRuntime(projectPath: string, sub = ""): string {
  const p = runtimePath(projectPath, sub);
  mkdirSync(p, { recursive: true });
  return p;
}

export function hasInit(projectPath: string): boolean {
  const p = rootPath(projectPath);
  return existsSync(p) && statSync(p).isDirectory();
}

const DEFAULT_CONFIG = {
  defaults: {
    base_branch: "main",
    merge_strategy: "squash",
  },
  scripts: {
    setup: "",
    dev: "",
    cleanup: "",
  },
  qa: {
    openingMessage: "幫我建一張 ticket。",
  },
};

export type ProjectConfig = {
  defaults?: { base_branch?: string; merge_strategy?: string };
  scripts?: { setup?: string; dev?: string; cleanup?: string };
  qa?: { openingMessage?: string };
};

export async function readConfig(projectPath: string): Promise<ProjectConfig> {
  const file = join(rootPath(projectPath), "config.json");
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(await Bun.file(file).text());
  } catch {
    return {};
  }
}

function writeJson(path: string, data: unknown): Promise<number> {
  return Bun.write(path, JSON.stringify(data, null, 2) + "\n");
}

export async function init(projectPath: string): Promise<void> {
  if (hasInit(projectPath)) {
    throw new Error("already_initialized");
  }
  const root = rootPath(projectPath);
  mkdirSync(root, { recursive: true });
  mkdirSync(join(root, "pipelines"), { recursive: true });
  mkdirSync(join(root, ".runtime"), { recursive: true });

  await writeJson(join(root, "config.json"), DEFAULT_CONFIG);
  await ensureGitignoreEntry(projectPath, RUNTIME_GITIGNORE_ENTRY);
}

async function ensureGitignoreEntry(projectPath: string, entry: string): Promise<void> {
  const gi = join(projectPath, ".gitignore");
  let content = "";
  if (existsSync(gi)) content = await Bun.file(gi).text();
  const lines = content.split(/\r?\n/);
  if (lines.some((l) => l.trim() === entry)) return;
  const next = (content.endsWith("\n") || content === "" ? content : content + "\n") + entry + "\n";
  await Bun.write(gi, next);
}

const SLUG_CHARS = /[^a-z0-9-_]+/g;

export function generatePipelineId(name: string): string {
  const ts = Date.now().toString(16).padStart(12, "0");
  const slug = name.toLowerCase().replace(SLUG_CHARS, "-").replace(/^-+|-+$/g, "") || "pipeline";
  return `${ts}-${slug}`;
}

export async function listPipelines(projectPath: string): Promise<unknown[]> {
  return readJsonDir(join(rootPath(projectPath), "pipelines"));
}

async function readJsonDir(dir: string): Promise<unknown[]> {
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort();
  const out: unknown[] = [];
  for (const f of files) {
    const text = await Bun.file(join(dir, f)).text();
    try {
      out.push(JSON.parse(text));
    } catch {}
  }
  return out;
}

export function pipelineFile(projectPath: string, id: string): string {
  return join(rootPath(projectPath), "pipelines", `${id}.json`);
}

export async function readPipeline(projectPath: string, id: string): Promise<unknown | null> {
  const file = pipelineFile(projectPath, id);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(await Bun.file(file).text());
  } catch {
    return null;
  }
}

export async function writePipeline(projectPath: string, id: string, data: unknown): Promise<void> {
  await writeJson(pipelineFile(projectPath, id), data);
}
