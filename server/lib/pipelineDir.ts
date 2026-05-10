import { join } from "node:path";
import {
  existsSync,
  mkdirSync,
  statSync,
  readdirSync,
  unlinkSync,
  renameSync,
} from "node:fs";
import { currentBranch } from "./git";

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

export const DEFAULT_MAX_PARALLEL = 2;
export const MAX_PARALLEL_MIN = 1;
export const MAX_PARALLEL_MAX = 8;

// merge strategy 已鎖定 merge --no-ff(squash 跟新版 auto-rebase + sync 不相容;ff-only 條件太苛)。
// 留 const 供 mergeTicketPrompt / 任何呼叫端參照,不再走 config。
export const FIXED_MERGE_STRATEGY = "merge" as const;
export const DEFAULT_COST_LIMIT_USD = 0;
export const DEFAULT_AUTO_MERGE = false;

const DEFAULT_CONFIG = {
  defaults: {
    base_branch: "main",
    max_parallel: DEFAULT_MAX_PARALLEL,
    cost_limit_usd: DEFAULT_COST_LIMIT_USD,
    auto_merge: DEFAULT_AUTO_MERGE,
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
  defaults?: {
    base_branch?: string;
    max_parallel?: number;
    cost_limit_usd?: number;
    auto_merge?: boolean;
  };
  scripts?: { setup?: string; dev?: string; cleanup?: string };
  qa?: { openingMessage?: string };
};

// 已 fallback / 驗證過的完整 config defaults。GET / status 拿這個即可,不用每處再 ?? "main"。
export type ResolvedDefaults = {
  base_branch: string;
  max_parallel: number;
  cost_limit_usd: number;
  auto_merge: boolean;
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

export async function writeConfig(projectPath: string, cfg: ProjectConfig): Promise<void> {
  const root = rootPath(projectPath);
  if (!existsSync(root)) mkdirSync(root, { recursive: true });
  await writeJson(join(root, "config.json"), cfg);
}

// max_parallel:讀 config + clamp [1,8],壞值 / 缺值 → DEFAULT_MAX_PARALLEL
export function clampMaxParallel(raw: unknown): number {
  const n = typeof raw === "number" && Number.isFinite(raw) ? Math.floor(raw) : NaN;
  if (!Number.isFinite(n)) return DEFAULT_MAX_PARALLEL;
  if (n < MAX_PARALLEL_MIN) return MAX_PARALLEL_MIN;
  if (n > MAX_PARALLEL_MAX) return MAX_PARALLEL_MAX;
  return n;
}

export async function getMaxParallel(projectPath: string): Promise<number> {
  const cfg = await readConfig(projectPath);
  return clampMaxParallel(cfg.defaults?.max_parallel);
}

export function normalizeCostLimitUsd(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) return DEFAULT_COST_LIMIT_USD;
  return raw;
}

// 拿 fallback 完整四欄。base_branch 沒設 → 嘗試 git current branch → 還沒就空字串(讓前端 placeholder)。
export async function getResolvedDefaults(projectPath: string): Promise<ResolvedDefaults> {
  const cfg = await readConfig(projectPath);
  const d = cfg.defaults ?? {};
  let base_branch =
    typeof d.base_branch === "string" && d.base_branch.trim().length > 0 ? d.base_branch.trim() : "";
  if (!base_branch) {
    try {
      const cur = await currentBranch(projectPath);
      base_branch = cur ?? "";
    } catch {
      base_branch = "";
    }
  }
  return {
    base_branch,
    max_parallel: clampMaxParallel(d.max_parallel),
    cost_limit_usd: normalizeCostLimitUsd(d.cost_limit_usd),
    auto_merge: typeof d.auto_merge === "boolean" ? d.auto_merge : DEFAULT_AUTO_MERGE,
  };
}

// Atomic write:先寫 .tmp,parse 驗一次,再 rename 蓋過原檔。
// 中途任何失敗(序列化炸 / 磁碟滿 / parse 不過)→ 原檔不動。
async function writeJson(path: string, data: unknown): Promise<void> {
  const text = JSON.stringify(data, null, 2) + "\n";
  // round-trip check:確認自己生的 JSON 真能 parse 回(防超大 number / Date 物件等惡作劇)
  JSON.parse(text);
  const tmp = path + ".tmp";
  await Bun.write(tmp, text);
  try {
    renameSync(tmp, path);
  } catch (e) {
    try {
      unlinkSync(tmp);
    } catch {
      // ignore
    }
    throw e;
  }
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

// Append 一張 synthetic merge ticket 到 pipeline 末尾,用來給 runner 派 sub-agent 處理 AI 合併。
// 已有失敗 / paused 的 merge ticket → reset 它(status=ready、清 iter),不重複 append。
// 失敗條件:沒 pipeline / 還有 real ticket 沒 done / 已 merged / 已有 running/done 的 merge ticket。
export async function appendMergeTicket(opts: {
  projectPath: string;
  pipelineId: string;
  prompt: string;
}): Promise<{ ok: true; ticket: Record<string, unknown>; reused: boolean } | { ok: false; error: string }> {
  const { projectPath, pipelineId, prompt } = opts;
  const p = (await readPipeline(projectPath, pipelineId)) as {
    state?: string;
    tickets?: Array<{ status?: string; mode?: string; n?: number; [k: string]: unknown }>;
    [k: string]: unknown;
  } | null;
  if (!p) return { ok: false, error: "Pipeline not found" };
  if (p.state === "merged") return { ok: false, error: "Pipeline 已 merged" };
  const tickets = p.tickets ?? [];
  const realTicketsDone =
    tickets.filter((t) => t.mode !== "merge").every((t) => t.status === "done") &&
    tickets.filter((t) => t.mode !== "merge").length > 0;
  if (!realTicketsDone) return { ok: false, error: "還有 ticket 未 done" };
  const existingIdx = tickets.findIndex((t) => t.mode === "merge");
  if (existingIdx !== -1) {
    const existing = tickets[existingIdx];
    if (existing.status === "running") return { ok: false, error: "merge ticket 正在跑" };
    if (existing.status === "done") return { ok: false, error: "merge ticket 已完成(state 應為 merged)" };
    // failed_iter_limit / failed / failed_transient / paused → reset 它,prompt 重灌(萬一 strategy 改了)
    tickets[existingIdx] = {
      ...existing,
      status: "ready",
      prompt,
      iter: undefined,
      startedAt: undefined,
      endedAt: undefined,
      reason: undefined,
    };
    await writePipeline(projectPath, pipelineId, { ...p, tickets });
    return { ok: true, ticket: tickets[existingIdx], reused: true };
  }
  const nextN = tickets.reduce((m, t) => Math.max(m, typeof t.n === "number" ? t.n : 0), 0) + 1;
  const ts = Date.now().toString(16).padStart(12, "0");
  const ticket = {
    id: `t${nextN}-${ts}`,
    n: nextN,
    title: "AI 合併 → base branch",
    goal: "把 pipeline branch 合併到 base branch,衝突自動解,跑驗證",
    acceptance: ["git merge 成功 (base 上有新 commit)", "tsc / test / build 通過(若 project 有)"],
    prompt,
    mode: "merge",
    status: "ready",
    iterLimit: 5,
    iterStopAtLimit: true,
    _synthetic: true, // user 不可改 / 不可刪;runner 完成後 set state=merged
  };
  tickets.push(ticket);
  await writePipeline(projectPath, pipelineId, { ...p, tickets });
  return { ok: true, ticket, reused: false };
}

// Append 一張 synthetic sync ticket。把 base 的更新 merge 進 worktree。
// 不允許條件:沒 pipeline / 已 merged / 已有 running 的 ticket(merge 或 sync 都算)。
// 已有 paused/failed sync ticket → reset(類比 mergeTicket reset 邏輯)。
export async function appendSyncTicket(opts: {
  projectPath: string;
  pipelineId: string;
  prompt: string;
  behindCount: number;
}): Promise<{ ok: true; ticket: Record<string, unknown>; reused: boolean } | { ok: false; error: string }> {
  const { projectPath, pipelineId, prompt, behindCount } = opts;
  const p = (await readPipeline(projectPath, pipelineId)) as {
    state?: string;
    tickets?: Array<{ status?: string; mode?: string; n?: number; [k: string]: unknown }>;
    [k: string]: unknown;
  } | null;
  if (!p) return { ok: false, error: "Pipeline not found" };
  const tickets = p.tickets ?? [];
  const anyRunning = tickets.some((t) => t.status === "running");
  if (anyRunning) return { ok: false, error: "有 ticket 正在跑,先 pause 才能 sync" };
  // 已有 sync ticket(failed/paused → reset;running 上面擋了;done → 可以再加新一張,base 又動了)
  const lastSyncIdx = (() => {
    for (let i = tickets.length - 1; i >= 0; i--) {
      if (tickets[i].mode === "sync") return i;
    }
    return -1;
  })();
  if (lastSyncIdx !== -1) {
    const existing = tickets[lastSyncIdx];
    if (existing.status !== "done") {
      tickets[lastSyncIdx] = {
        ...existing,
        status: "ready",
        prompt,
        title: `AI sync ← base (落後 ${behindCount})`,
        iter: undefined,
        startedAt: undefined,
        endedAt: undefined,
        reason: undefined,
      };
      await writePipeline(projectPath, pipelineId, { ...p, tickets });
      return { ok: true, ticket: tickets[lastSyncIdx], reused: true };
    }
  }
  const nextN = tickets.reduce((m, t) => Math.max(m, typeof t.n === "number" ? t.n : 0), 0) + 1;
  const ts = Date.now().toString(16).padStart(12, "0");
  const ticket = {
    id: `t${nextN}-${ts}`,
    n: nextN,
    title: `AI sync ← base (落後 ${behindCount})`,
    goal: "把 base branch 上的最新 commit merge 進 pipeline worktree,衝突自動解,跑驗證",
    acceptance: ["worktree 上 HEAD 包含 base 最新 commit", "tsc / test / build 通過(若 project 有)"],
    prompt,
    mode: "sync",
    status: "ready",
    iterLimit: 3,
    iterStopAtLimit: true,
    _synthetic: true,
  };
  tickets.push(ticket);
  await writePipeline(projectPath, pipelineId, { ...p, tickets });
  return { ok: true, ticket, reused: false };
}

// 刪 pipeline.json(worktree 不動,user 想清自己去)
export function deletePipeline(projectPath: string, id: string): boolean {
  const file = pipelineFile(projectPath, id);
  if (!existsSync(file)) return false;
  unlinkSync(file);
  return true;
}
