import { join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { projectHash } from "../hash";
import { vibeHome } from "../paths";

function worktreeRoot(): string {
  return join(vibeHome(), ".vibe-pipeline", "worktrees");
}

export function worktreePath(projectPath: string, pipelineId: string): string {
  return join(worktreeRoot(), projectHash(projectPath), pipelineId);
}

export function exists(projectPath: string, pipelineId: string): boolean {
  return existsSync(worktreePath(projectPath, pipelineId));
}

async function spawnGit(args: string[], cwd?: string): Promise<{ ok: boolean; out: string; err: string }> {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  await proc.exited;
  return { ok: proc.exitCode === 0, out: out.trim(), err: err.trim() };
}

// 建/重用 worktree。已存在直接回 path,沒有就 add。
// branch 不存在 → -b 建新 branch from baseBranch;branch 存在 → checkout 到該 branch
export async function ensure(
  projectPath: string,
  pipelineId: string,
  branchName: string,
  baseBranch: string
): Promise<string> {
  const wt = worktreePath(projectPath, pipelineId);
  if (existsSync(wt)) return wt;

  mkdirSync(join(worktreeRoot(), projectHash(projectPath)), { recursive: true });

  // Check if branch already exists
  const branchCheck = await spawnGit(
    ["rev-parse", "--verify", "--quiet", branchName],
    projectPath
  );
  const branchExists = branchCheck.ok;

  const args = ["worktree", "add"];
  if (!branchExists) args.push("-b", branchName);
  args.push(wt);
  if (!branchExists) args.push(baseBranch);
  else args.push(branchName);

  const res = await spawnGit(args, projectPath);
  if (!res.ok) {
    throw new Error(`git worktree add failed: ${res.err || res.out}`);
  }
  return wt;
}

export async function remove(projectPath: string, pipelineId: string): Promise<void> {
  const wt = worktreePath(projectPath, pipelineId);
  if (!existsSync(wt)) return;
  const res = await spawnGit(["worktree", "remove", "--force", wt], projectPath);
  if (!res.ok) {
    throw new Error(`git worktree remove failed: ${res.err || res.out}`);
  }
}

export async function prune(projectPath: string): Promise<void> {
  await spawnGit(["worktree", "prune"], projectPath);
}

// 看當下 worktree 跟 base 的 diff stat(已 commit + working tree 都算)。
// 給 UI polling 顯示「+N -M / K files」用,讓 user 知道 runner 正在改東西。
// 沒 worktree / git 異常 → 回 null,UI 隱藏即可。
export type DiffStat = { files: number; added: number; deleted: number };

export async function diffStat(
  projectPath: string,
  pipelineId: string,
  baseBranch: string
): Promise<DiffStat | null> {
  const wt = worktreePath(projectPath, pipelineId);
  if (!existsSync(wt)) return null;
  // --shortstat:" 12 files changed, 234 insertions(+), 45 deletions(-)"
  // 有可能 0 deletion → 沒那段;也可能 0 file → 整行空。
  // 比 baseBranch (no triple-dot) → working tree 對 base 的所有差異(含 uncommit)。
  const res = await spawnGit(["diff", "--shortstat", baseBranch], wt);
  if (!res.ok) return null;
  return parseShortstat(res.out);
}

function parseShortstat(s: string): DiffStat {
  const files = /(\d+) files? changed/.exec(s)?.[1];
  const added = /(\d+) insertions?\(\+\)/.exec(s)?.[1];
  const deleted = /(\d+) deletions?\(-\)/.exec(s)?.[1];
  return {
    files: files ? Number(files) : 0,
    added: added ? Number(added) : 0,
    deleted: deleted ? Number(deleted) : 0,
  };
}

// 完整 unified diff:跟 base 比對 worktree 全部改動。
// 回 { files: [{path, added, deleted}], raw } — raw 是 git diff 全文,前端自己 render。
export type DiffFile = { path: string; added: number; deleted: number };
export type FullDiff = { files: DiffFile[]; raw: string };

export async function fullDiff(
  projectPath: string,
  pipelineId: string,
  baseBranch: string
): Promise<FullDiff | null> {
  const wt = worktreePath(projectPath, pipelineId);
  if (!existsSync(wt)) return null;
  // numstat 給檔案級加減行數;raw diff 給前端整段顯示
  const stat = await spawnGit(["diff", "--numstat", baseBranch], wt);
  const raw = await spawnGit(["diff", baseBranch], wt);
  if (!stat.ok || !raw.ok) return null;
  const files: DiffFile[] = stat.out
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .map((line) => {
      // numstat 格式:"<added>\t<deleted>\t<path>" — binary file 時 added/deleted 會是 "-"
      const parts = line.split("\t");
      if (parts.length < 3) return null;
      const a = parts[0] === "-" ? 0 : Number(parts[0]) || 0;
      const d = parts[1] === "-" ? 0 : Number(parts[1]) || 0;
      return { path: parts.slice(2).join("\t"), added: a, deleted: d };
    })
    .filter((f): f is DiffFile => f !== null);
  return { files, raw: raw.out };
}
