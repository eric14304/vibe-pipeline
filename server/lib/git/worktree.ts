import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { projectHash } from "../hash";

const WORKTREE_ROOT = join(homedir(), ".vibe-pipeline", "worktrees");

export function worktreePath(projectPath: string, pipelineId: string): string {
  return join(WORKTREE_ROOT, projectHash(projectPath), pipelineId);
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

  mkdirSync(join(WORKTREE_ROOT, projectHash(projectPath)), { recursive: true });

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
