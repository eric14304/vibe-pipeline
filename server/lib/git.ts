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

export type MergeStrategy = "merge" | "squash" | "ff-only";

export type MergeResult =
  | { ok: true; commitHash: string; commitSubject: string }
  | { ok: false; reason: "conflict" | "not_fast_forward" | "other"; stderr: string };

// Merge `branch` into `baseBranch` in project root.
// 不在 worktree 內(那邊 checkout 的就是 branch);要在 main repo 內 checkout base 後 merge。
// 注意:結束時會把 main repo 的 HEAD 切到 baseBranch(原本可能在別處)。
export async function merge(
  projectPath: string,
  branch: string,
  baseBranch: string,
  strategy: MergeStrategy
): Promise<MergeResult> {
  if (!hasGit(projectPath)) return { ok: false, reason: "other", stderr: "not a git repo" };

  // 1. checkout baseBranch
  const co = Bun.spawn(["git", "-C", projectPath, "checkout", baseBranch], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await co.exited;
  if (co.exitCode !== 0) {
    const err = (await new Response(co.stderr).text()).trim();
    return { ok: false, reason: "other", stderr: `checkout ${baseBranch} 失敗: ${err}` };
  }

  // 2. merge
  const args = ["git", "-C", projectPath, "merge"];
  if (strategy === "squash") {
    args.push("--squash", branch);
  } else if (strategy === "ff-only") {
    args.push("--ff-only", branch);
  } else {
    // "merge" → no-ff,保留 branch 圖
    args.push("--no-ff", branch, "-m", `Merge ${branch} into ${baseBranch}`);
  }
  const m = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
  await m.exited;
  const mErr = (await new Response(m.stderr).text()).trim();
  const mOut = (await new Response(m.stdout).text()).trim();

  if (m.exitCode !== 0) {
    // abort merge if mid-state
    Bun.spawn(["git", "-C", projectPath, "merge", "--abort"], { stdout: "ignore", stderr: "ignore" });
    if (/CONFLICT|Automatic merge failed/i.test(mOut + mErr)) {
      return { ok: false, reason: "conflict", stderr: mErr || mOut };
    }
    if (/not possible to fast-forward/i.test(mErr)) {
      return { ok: false, reason: "not_fast_forward", stderr: mErr };
    }
    return { ok: false, reason: "other", stderr: mErr || mOut || `exit ${m.exitCode}` };
  }

  // 3. squash 模式 merge 完還沒真 commit,要再下一刀
  if (strategy === "squash") {
    const c = Bun.spawn(
      ["git", "-C", projectPath, "commit", "-m", `Squash merge ${branch} into ${baseBranch}`],
      { stdout: "pipe", stderr: "pipe" }
    );
    await c.exited;
    if (c.exitCode !== 0) {
      const err = (await new Response(c.stderr).text()).trim();
      // 沒改動可 squash → 視為 already-merged 沒事
      if (/nothing to commit/i.test(err)) {
        return { ok: false, reason: "other", stderr: "沒改動可 squash(可能已 merge 過)" };
      }
      return { ok: false, reason: "other", stderr: `squash commit 失敗: ${err}` };
    }
  }

  // 4. 抓新 HEAD hash + subject
  const rp = Bun.spawn(["git", "-C", projectPath, "rev-parse", "HEAD"], { stdout: "pipe", stderr: "pipe" });
  await rp.exited;
  const commitHash = (await new Response(rp.stdout).text()).trim();
  const lg = Bun.spawn(["git", "-C", projectPath, "log", "-1", "--pretty=%s", "HEAD"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await lg.exited;
  const commitSubject = (await new Response(lg.stdout).text()).trim();

  return { ok: true, commitHash, commitSubject };
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
