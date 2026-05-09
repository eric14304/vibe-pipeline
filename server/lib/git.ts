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
