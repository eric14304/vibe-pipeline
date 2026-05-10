// 抽出 /merge endpoint 的核心邏輯,讓 HTTP handler 與 auto-merge trigger 共用同一條 path。
// 不做 self-HTTP call,純函式;呼叫端自己決定回什麼 HTTP status。

import * as pipelineDir from "./pipelineDir";
import * as orchestrator from "./runner/orchestrator";
import * as git from "./git";
import { mergeTicketPrompt } from "./runner/mergeTicketPrompt";
import { getTaskConfig } from "./userConfig";

export type TriggerMergeResult =
  | { ok: true; ticketId: string; reused: boolean }
  | { ok: false; reason: "not_found"; error: string }
  | { ok: false; reason: "no_git"; error: string }
  | { ok: false; reason: "running"; error: string }
  | { ok: false; reason: "working_tree_dirty"; error: string; details: { modified: number; untracked: number; files: string[] } }
  | { ok: false; reason: "append_failed"; error: string }
  | { ok: false; reason: "spawn_failed"; error: string };

// 把 working tree 髒、pipeline 在跑、append / spawn 失敗等情況分成 reason 標籤,
// HTTP handler 把它對應到 status code,auto-trigger 寫進 lastAutoMergeError + notif。
export async function triggerMerge(opts: {
  projectPath: string;
  projectHash: string;
  pipelineId: string;
  hasGit: boolean;
}): Promise<TriggerMergeResult> {
  const { projectPath, projectHash, pipelineId, hasGit } = opts;

  if (!hasGit) return { ok: false, reason: "no_git", error: "Project 沒 .git/" };
  if (orchestrator.isRunning(projectHash, pipelineId)) {
    return { ok: false, reason: "running", error: "Pipeline 在跑,先 pause 才能 merge" };
  }

  // Preflight:main repo working tree 必須乾淨
  const dirty = await git.workingTreeStatus(projectPath);
  if (!dirty.clean) {
    return {
      ok: false,
      reason: "working_tree_dirty",
      error:
        `main repo 有 ${dirty.modified} 個 modified + ${dirty.untracked} 個 untracked,` +
        `先 commit 或 stash 再 AI 合併(避免 merge 動到 user 沒存的工作)。`,
      details: { modified: dirty.modified, untracked: dirty.untracked, files: dirty.files },
    };
  }

  const pipeline = (await pipelineDir.readPipeline(projectPath, pipelineId)) as {
    name?: string;
    branch?: string;
    baseBranch?: string;
    state?: string;
    tickets?: Array<{
      n?: number;
      title?: string;
      mode?: string;
      goal?: string;
      acceptance?: string[];
      commits?: Array<{ hash?: string; subject?: string }>;
    }>;
    [k: string]: unknown;
  } | null;
  if (!pipeline) return { ok: false, reason: "not_found", error: `Pipeline not found: ${pipelineId}` };

  const branch = pipeline.branch || `pipeline/${pipeline.name || pipelineId}`;
  const baseBranch = pipeline.baseBranch || "main";
  const strategy = pipelineDir.FIXED_MERGE_STRATEGY;

  const history = (pipeline.tickets ?? [])
    .filter((t) => t.mode !== "merge")
    .map((t) => ({
      n: typeof t.n === "number" ? t.n : 0,
      title: t.title ?? "(no title)",
      mode: t.mode,
      goal: t.goal,
      acceptance: t.acceptance,
      commits: (t.commits ?? [])
        .map((c) => ({ hash: c.hash ?? "", subject: c.subject ?? "" }))
        .filter((c) => c.hash || c.subject),
    }));

  const mergeCfg = await getTaskConfig("merge");
  const prompt = mergeTicketPrompt({
    projectPath,
    branch,
    baseBranch,
    strategy,
    history,
    modelHint: { model: mergeCfg.model, effort: mergeCfg.effort },
  });

  const appendRes = await pipelineDir.appendMergeTicket({
    projectPath,
    pipelineId,
    prompt,
  });
  if (!appendRes.ok) return { ok: false, reason: "append_failed", error: appendRes.error };

  const startRes = await orchestrator.start({
    projectPath,
    projectHash,
    pipelineId,
  });
  if (!startRes.ok) {
    // 補救:append 了但 spawn 失敗 → 把 merge ticket 拔掉避免之後干擾
    const cur = (await pipelineDir.readPipeline(projectPath, pipelineId)) as {
      tickets?: Array<{ id?: string; mode?: string }>;
      [k: string]: unknown;
    } | null;
    if (cur?.tickets) {
      const filtered = cur.tickets.filter(
        (t) => t.mode !== "merge" || t.id !== appendRes.ticket.id
      );
      await pipelineDir.writePipeline(projectPath, pipelineId, { ...cur, tickets: filtered });
    }
    return { ok: false, reason: "spawn_failed", error: `append OK but spawn failed: ${startRes.error}` };
  }
  return { ok: true, ticketId: appendRes.ticket.id as string, reused: appendRes.reused };
}
