import { existsSync } from "node:fs";
import { join } from "node:path";

export function hasGit(projectPath: string): boolean {
  return existsSync(join(projectPath, ".git"));
}

export async function gitInit(projectPath: string): Promise<void> {
  if (hasGit(projectPath)) throw new Error("already_git_repo");
  const proc = Bun.spawn(["git", "-C", projectPath, "init", "-b", "main"], {
    stdout: "pipe",
    stderr: "pipe",
    windowsHide: true,
  });
  await proc.exited;
  if (proc.exitCode !== 0) {
    const err = await new Response(proc.stderr).text();
    throw new Error(`git init failed: ${err.trim() || "exit " + proc.exitCode}`);
  }
}

// 當前 HEAD 的 branch 短名(detached HEAD 或非 git repo 回 null)
export async function currentBranch(projectPath: string): Promise<string | null> {
  if (!hasGit(projectPath)) return null;
  const proc = Bun.spawn(
    ["git", "-C", projectPath, "symbolic-ref", "--short", "-q", "HEAD"],
    { stdout: "pipe", stderr: "pipe", windowsHide: true }
  );
  await proc.exited;
  if (proc.exitCode !== 0) return null;
  const text = await new Response(proc.stdout).text();
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// 跑 git -C <path> status --porcelain 判 working tree 乾淨。
// 回 { clean: true } 表示乾淨可動;{ clean: false, modified, untracked, files } 表示髒。
// AI merge / runner spawn 前呼叫,避免動到 user 沒 commit 的工作。
export type WorkingTreeStatus =
  | { clean: true }
  | { clean: false; modified: number; untracked: number; files: string[] };

export async function workingTreeStatus(projectPath: string): Promise<WorkingTreeStatus> {
  const proc = Bun.spawn(["git", "-C", projectPath, "status", "--porcelain"], {
    stdout: "pipe",
    stderr: "pipe",
    windowsHide: true,
  });
  const out = (await new Response(proc.stdout).text()).trim();
  await proc.exited;
  if (out.length === 0) return { clean: true };
  const lines = out.split(/\r?\n/);
  let modified = 0;
  let untracked = 0;
  const files: string[] = [];
  for (const line of lines) {
    // porcelain format: "XY filename" 兩個 status code
    const code = line.slice(0, 2);
    const file = line.slice(3);
    if (code.startsWith("??")) untracked++;
    else modified++;
    if (files.length < 12) files.push(file); // 前 12 個給 UI 顯示
  }
  return { clean: false, modified, untracked, files };
}

// 強刪 local branch(git branch -D <name>)。
// 用於 pipeline delete cascade:worktree dir 已砍 + prune 後,把 pipeline/* branch ref 也清掉。
// throw-safe:回 { ok, error };branch 不存在當成 ok(冪等)。
export async function deleteBranchForce(
  projectPath: string,
  branchName: string
): Promise<{ ok: boolean; error?: string }> {
  if (!hasGit(projectPath)) return { ok: false, error: "not a git repo" };
  if (!branchName || branchName.length === 0) {
    return { ok: false, error: "empty branch name" };
  }
  // 先確認 branch 存在 — 不存在 = 已沒事可做,當成功(冪等,allow re-run)
  const check = Bun.spawn(
    ["git", "-C", projectPath, "rev-parse", "--verify", "--quiet", `refs/heads/${branchName}`],
    { stdout: "pipe", stderr: "pipe", windowsHide: true }
  );
  await check.exited;
  if (check.exitCode !== 0) return { ok: true };
  const proc = Bun.spawn(["git", "-C", projectPath, "branch", "-D", branchName], {
    stdout: "pipe",
    stderr: "pipe",
    windowsHide: true,
  });
  const [, errText] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  await proc.exited;
  if (proc.exitCode !== 0) {
    return { ok: false, error: errText.trim() || `git branch -D exit ${proc.exitCode}` };
  }
  return { ok: true };
}

// list local branches (for CreateCard base branch picker)
// 過濾掉 pipeline/* (vibe-pipeline 自家建的 worktree branch)避免 base 撞自己
export async function listBranches(projectPath: string): Promise<string[]> {
  if (!hasGit(projectPath)) return [];
  const proc = Bun.spawn(
    ["git", "-C", projectPath, "for-each-ref", "--format=%(refname:short)", "refs/heads/"],
    { stdout: "pipe", stderr: "pipe", windowsHide: true }
  );
  await proc.exited;
  if (proc.exitCode !== 0) return [];
  const text = await new Response(proc.stdout).text();
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .filter((l) => !l.startsWith("pipeline/"));
}
