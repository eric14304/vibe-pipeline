import { join } from "node:path";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { projectHash } from "../hash";
import { vibeHome } from "../paths";
import type { DiffStat, DiffFile, FullDiff } from "../../../shared/types";
export type { DiffStat, DiffFile, FullDiff };

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

// Throw-safe 版本:remove worktree(git worktree remove --force → 移除實體 dir → 失敗 fallback prune)。
// merge / delete 完成後呼叫,讓 caller 不必擔心 worktree dir 已被外部刪 / git metadata 損壞等情況。
// 永遠不 throw;回 { ok, error } 給 caller 決定要不要降級為 warning。
export async function removeQuiet(
  projectPath: string,
  pipelineId: string
): Promise<{ ok: boolean; error?: string }> {
  const wt = worktreePath(projectPath, pipelineId);
  try {
    // 1. git worktree remove(若 dir 還在 git 註冊表)
    if (existsSync(wt)) {
      const res = await spawnGit(["worktree", "remove", "--force", wt], projectPath);
      if (!res.ok) {
        // remove 失敗常見:dir 已被外部刪掉 / locked / metadata 壞掉 → 走 fallback
        // 試著手動刪 dir + prune,把 git 註冊表清掉
        try {
          if (existsSync(wt)) rmSync(wt, { recursive: true, force: true });
        } catch {
          // ignore
        }
        const pruneRes = await spawnGit(["worktree", "prune"], projectPath);
        if (!pruneRes.ok) {
          return {
            ok: false,
            error: `worktree remove + prune 都失敗:remove=${res.err || res.out};prune=${pruneRes.err || pruneRes.out}`,
          };
        }
        // remove 失敗但 prune 救回 — 已從 git worktree list 拿掉,視為成功
        return { ok: true };
      }
      // remove 成功;若 dir 仍殘留(極少數)手動清
      if (existsSync(wt)) {
        try {
          rmSync(wt, { recursive: true, force: true });
        } catch {
          // ignore
        }
      }
      return { ok: true };
    }
    // dir 不存在 → 只需 prune 清 git 註冊表(若有殘留紀錄)
    await spawnGit(["worktree", "prune"], projectPath);
    return { ok: true };
  } catch (e) {
    // 兜底:任何例外都當失敗回去,不要 throw
    return { ok: false, error: String(e) };
  }
}

// 看當下 worktree 跟 base 的 diff stat(已 commit + working tree 都算)。
// 給 UI polling 顯示「+N -M / K files」用,讓 user 知道 runner 正在改東西。
// 沒 worktree / git 異常 → 回 null,UI 隱藏即可。
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

// AI merge 完後 worktree 仍指在舊 branch tip(沒含 base 上剛吸收的 merge commit)。
// 跑 rebase baseBranch 把 worktree 拉到 base HEAD(已 merged 過的 pipeline branch_unique=0,等同 FF;
// hash 不變)。失敗(罕見:user 自己加 commit 撞)→ 回 ok=false,呼叫端 log warn,user 之後可手動 sync。
export async function rebaseOntoBase(
  projectPath: string,
  pipelineId: string,
  baseBranch: string
): Promise<{ ok: boolean; out: string; err: string }> {
  const wt = worktreePath(projectPath, pipelineId);
  if (!existsSync(wt)) return { ok: false, out: "", err: "worktree 不存在" };
  // 預檢:worktree 必須乾淨,否則 rebase 失敗
  const status = await spawnGit(["status", "--porcelain"], wt);
  if (!status.ok) return { ok: false, out: status.out, err: "status 失敗:" + status.err };
  if (status.out.trim().length > 0) {
    return { ok: false, out: status.out, err: "worktree 不乾淨,跳過 auto-rebase" };
  }
  return await spawnGit(["rebase", baseBranch], wt);
}

// 看 worktree 上 branch 落後 base 幾個 commit(從 base merge-base 算起 base 多走的 commit 數)。
// 用 rev-list --count baseBranch ^HEAD(只在 baseBranch 上 reachable 的 commit,而 worktree HEAD 還沒拿到的)。
// 沒 worktree / git 異常 → 回 null,UI 自己處理。
export async function behindBaseCount(
  projectPath: string,
  pipelineId: string,
  baseBranch: string
): Promise<number | null> {
  const wt = worktreePath(projectPath, pipelineId);
  if (!existsSync(wt)) return null;
  const res = await spawnGit(["rev-list", "--count", `HEAD..${baseBranch}`], wt);
  if (!res.ok) return null;
  const n = Number(res.out.trim());
  return Number.isFinite(n) ? n : null;
}

// 完整 unified diff:跟 base 比對 worktree 全部改動。
// 回 { files: [{path, added, deleted}], raw } — raw 是 git diff 全文,前端自己 render。
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
