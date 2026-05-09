import { join } from "node:path";
import { existsSync, mkdirSync, statSync, readdirSync } from "node:fs";
import { stringify, parse } from "yaml";

export function ticketsPath(projectPath: string): string {
  return join(projectPath, ".tickets");
}

export function hasTickets(projectPath: string): boolean {
  const p = ticketsPath(projectPath);
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
};

export async function init(projectPath: string): Promise<void> {
  if (hasTickets(projectPath)) {
    throw new Error("already_initialized");
  }
  const root = ticketsPath(projectPath);
  mkdirSync(root, { recursive: true });
  mkdirSync(join(root, "tickets"), { recursive: true });
  mkdirSync(join(root, "pipelines"), { recursive: true });
  mkdirSync(join(root, "skills"), { recursive: true });
  mkdirSync(join(root, ".runtime"), { recursive: true });

  const configPath = join(root, "config.yaml");
  await Bun.write(configPath, stringify(DEFAULT_CONFIG));

  await ensureGitignoreEntry(projectPath, ".tickets/.runtime/");
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

export async function listPipelines(projectPath: string): Promise<unknown[]> {
  return readYamlDir(join(ticketsPath(projectPath), "pipelines"));
}

export async function listTickets(projectPath: string): Promise<unknown[]> {
  return readYamlDir(join(ticketsPath(projectPath), "tickets"));
}

async function readYamlDir(dir: string): Promise<unknown[]> {
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  const out: unknown[] = [];
  for (const f of files) {
    const text = await Bun.file(join(dir, f)).text();
    try {
      out.push(parse(text));
    } catch {}
  }
  return out;
}

export async function writePipeline(projectPath: string, id: string, data: unknown): Promise<void> {
  const file = join(ticketsPath(projectPath), "pipelines", `${id}.yaml`);
  await Bun.write(file, stringify(data));
}

export async function writeTicket(projectPath: string, id: string, data: unknown): Promise<void> {
  const file = join(ticketsPath(projectPath), "tickets", `${id}.yaml`);
  await Bun.write(file, stringify(data));
}
