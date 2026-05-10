// 構造 merge ticket 的 prompt(給 runner sub-agent / executor 看)。
// sub-agent 的 cwd 會是 worktree(繼承自 main agent),所以 git 操作都用 -C "<projectPath>"
// 顯式指定 main repo 路徑,不依賴 cwd。
//
// 重要:不能用 inline backtick(踩過兩次),所有 inline code 用單引號或不框。

export type MergeHistoryTicket = {
  n: number;
  title: string;
  mode?: string;
  goal?: string;
  acceptance?: string[];
  commits?: Array<{ hash: string; subject: string }>;
};

export function mergeTicketPrompt(opts: {
  projectPath: string;
  branch: string;
  baseBranch: string;
  strategy: "merge" | "squash" | "ff-only";
  // pipeline 內已完成的 real ticket 歷史(merge ticket 自己不放),
  // 給 sub-agent 解衝突時判斷 branch side 改動意圖、寫 commit message 用
  history?: MergeHistoryTicket[];
  // user 全域 config:這張 ticket 派 Task sub-agent 該用的 model / effort。
  // model 由主 agent 在 Task tool 參數帶;effort 沒對應 Task tool 參數時走 best-effort 提示
  modelHint?: { model: string; effort: string };
}): string {
  const { projectPath, branch, baseBranch, strategy, history, modelHint } = opts;
  const strategyDesc =
    strategy === "squash"
      ? "git -C \"" + projectPath + "\" merge --squash " + branch + " (沒 commit;見「## merge commit message」自己 compose 後 commit)"
      : strategy === "ff-only"
      ? "git -C \"" + projectPath + "\" merge --ff-only " + branch + " (線性,沒 merge commit;ticket commits 直接接到 base)"
      : "git -C \"" + projectPath + "\" merge --no-ff " + branch + " --no-commit (先 merge 不 commit;見「## merge commit message」compose 後再 commit)";

  const historyLines: string[] = [];
  if (history && history.length > 0) {
    historyLines.push("## 此 pipeline 已完成的 ticket 歷史");
    historyLines.push("");
    historyLines.push("(branch side 的改動由這些 ticket 累積而成,解衝突時 branch side 應視為這些任務的成果;commit message 也可參考這些寫得更精準)");
    historyLines.push("");
    for (const t of history) {
      historyLines.push("**#" + t.n + " " + t.title + "**" + (t.mode ? " (" + t.mode + ")" : ""));
      if (t.goal) historyLines.push("- goal: " + truncate(t.goal, 200));
      if (Array.isArray(t.acceptance) && t.acceptance.length > 0) {
        historyLines.push("- acceptance:");
        for (const a of t.acceptance) historyLines.push("  - " + truncate(a, 150));
      }
      if (Array.isArray(t.commits) && t.commits.length > 0) {
        historyLines.push("- commits:");
        for (const c of t.commits) historyLines.push("  - " + (c.hash ? c.hash.slice(0, 7) + " " : "") + (c.subject ?? ""));
      }
      historyLines.push("");
    }
  }

  const modelHintLine = modelHint
    ? "(建議 sub-agent 以 model=" + modelHint.model + " / effort=" + modelHint.effort + " 強度執行此任務。)"
    : "";

  return [
    "AI merge 任務。把 pipeline branch '" + branch + "' 合併到 base '" + baseBranch + "'。",
    modelHintLine,
    "",
    "**所有 git 操作都用 git -C \"" + projectPath + "\" 顯式指定 main repo,不切 cwd**。",
    "(你的 cwd 是 worktree,不能在這做 merge — 必須在 main repo 操作。)",
    "",
    ...historyLines,
    "## 流程",
    "",
    "1. 預檢:",
    "   - Bash: git -C \"" + projectPath + "\" status --porcelain → 確認 working tree 乾淨",
    "   - **不乾淨 → 用 FAIL_NORETRY 開頭報告**(reason='working tree 不乾淨,需先 stash/commit'),這是不會自動好的條件,iter 不該重試",
    "   - Bash: git -C \"" + projectPath + "\" rev-parse --verify " + baseBranch + " 跟 git -C \"" + projectPath + "\" rev-parse --verify " + branch + " → branch 都存在",
    "   - branch 不存在 → FAIL_NORETRY + reason='branch 不存在'",
    "",
    "2. checkout base:Bash git -C \"" + projectPath + "\" checkout " + baseBranch,
    "",
    "3. merge(strategy=" + strategy + "):",
    "   - " + strategyDesc,
    "",
    "4. 衝突處理(merge 出現 CONFLICT):",
    "   - Bash: git -C \"" + projectPath + "\" diff --name-only --diff-filter=U → 列出衝突檔(都是相對 main repo 路徑)",
    "   - 對每個衝突檔(用絕對路徑 \"" + projectPath + "/<相對路徑>\"):",
    "     a. Read 看內容(<<<<<<< / ======= / >>>>>>> markers)",
    "     b. **看上方 ticket 歷史**判斷 branch side 的改動意圖(branch side <<< 是 pipeline tickets 累積的成果),保留 branch side 邏輯但融合 base side 的平行修改。",
    "     c. Edit 解衝突,markers 全清掉",
    "     d. Bash: git -C \"" + projectPath + "\" add <相對路徑>",
    "   - 全解完 → 進「## merge commit message」compose 後 commit",
    "   - 解不出來 → Bash: git -C \"" + projectPath + "\" merge --abort,回報失敗 + 衝突檔列表",
    "",
    "## merge commit message(strategy=" + strategy + ")",
    "",
    (strategy === "ff-only"
      ? "ff-only 模式不產 merge commit(直接 fast-forward),這段跳過。"
      : strategy === "squash"
      ? [
          "squash 是這條 pipeline 在 base 上的**唯一 commit**,訊息要能完整代表這條 pipeline 做了什麼。",
          "看上方 ticket 歷史 compose 訊息:",
          "  - 第一行 (subject):≤72 字,概括這條 pipeline 在做什麼(用 imperative,例:'Add multi-pipeline parallel execution and config guards')",
          "  - 空行",
          "  - body:每張 ticket 一條 bullet,寫該 ticket 的成果(動詞開頭,簡潔,≤80 字 / 行);用 ticket title + acceptance 重點精煉",
          "Bash 用多個 -m 串多段(每個 -m 自動加空行):",
          "  git -C \"" + projectPath + "\" commit -m \"<subject>\" -m \"- <ticket1 精煉>\" -m \"- <ticket2 精煉>\" ..."
        ].join("\n")
      : [
          "merge --no-ff 模式 base 上多一個 merge commit + ticket commits 也保留。merge commit 訊息簡短即可(細節在 ticket commits 看):",
          "  - 第一行 (subject):'Merge " + branch + " into " + baseBranch + "' 或更精準的概括(看 ticket 歷史)",
          "  - body(可選):一句話總結這條 pipeline 做了什麼",
          "Bash:",
          "  git -C \"" + projectPath + "\" commit -m \"<subject>\" [-m \"<body>\"]"
        ].join("\n")
    ),
    "",
    "",
    "5. 驗證:",
    "   - Bash: cat \"" + projectPath + "/package.json\" 看有哪些 script",
    "   - 有 'build' → Bash: cd \"" + projectPath + "\" && bun run build (timeout 5min)",
    "   - 有 'test' → Bash: cd \"" + projectPath + "\" && bun run test (timeout 10min)",
    "   - 沒這些就跑 Bash: cd \"" + projectPath + "\" && bunx tsc --noEmit",
    "   - 任一驗證 fail:",
    "     a. 試一次自動修復:Read 錯誤檔(絕對路徑),Edit 修,git -C \"" + projectPath + "\" add + git -C \"" + projectPath + "\" commit --amend --no-edit",
    "     b. 第二次還 fail → 不 reset,回報失敗 + 錯誤摘要",
    "",
    "6. 收尾(成功):",
    "   - Bash: git -C \"" + projectPath + "\" rev-parse HEAD → 抓 mergeCommit hash",
    "   - Bash: git -C \"" + projectPath + "\" log -1 --pretty=%s HEAD → 抓 commit subject",
    "   - 在你的回應裡明確寫:'PASS\\nMERGE_COMMIT_HASH=<hash>\\nMERGE_COMMIT_SUBJECT=<subject>'",
    "",
    "失敗(無論 step 哪一階段)→ 在回應開頭明確寫一種:",
    "  - 'FAIL\\n<reason 一行>' — 可重試的失敗(衝突解錯、驗證 fail 等)。runner 會 iter 再給一次",
    "  - 'FAIL_NORETRY\\n<reason 一行>' — 條件不會自動改善的失敗(working tree 髒、branch 不存在、權限問題等)。runner 看到立刻終止 iter,不浪費 token",
    "",
    "## 不踩",
    "",
    "- 不要切 cwd,不要 cd,不要動 worktree 內任何檔。所有操作都針對 \"" + projectPath + "\" 這條 main repo。",
    "- 不要 git pull / fetch / push / reset --hard / rebase。全 local。",
    "- 解衝突時 markers 必須完全清掉。",
    "- 一輪驗證沒過自動修一次就好,不要無限迴圈。",
    "",
    "## acceptance(critic 會檢查)",
    "",
    "- main repo 的 " + baseBranch + " 上有新 commit 包含 " + branch + " 的內容",
    "- working tree 乾淨(沒未 commit 的 conflict markers)",
    "- 驗證(tsc / build / test)PASS",
    "- 若有 ticket 歷史,各 ticket 的 acceptance 經 merge 後仍成立",
  ].join("\n");
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}
