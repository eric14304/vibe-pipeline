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
    { stdout: "pipe", stderr: "pipe" }
  );
  await proc.exited;
  if (proc.exitCode !== 0) return null;
  const text = await new Response(proc.stdout).text();
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// list local branches (for CreateCard base branch picker)
// 過濾掉 pipeline/* (vibe-pipeline 自家建的 worktree branch)避免 base 撞自己
export async function listBranches(projectPath: string): Promise<string[]> {
  if (!hasGit(projectPath)) return [];
  const proc = Bun.spawn(
    ["git", "-C", projectPath, "for-each-ref", "--format=%(refname:short)", "refs/heads/"],
    { stdout: "pipe", stderr: "pipe" }
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
