// 構造 merge ticket 的 prompt(給 runner sub-agent / executor 看)。
// sub-agent 的 cwd 會是 worktree(繼承自 main agent),所以 git 操作都用 -C "<projectPath>"
// 顯式指定 main repo 路徑,不依賴 cwd。
//
// 重要:不能用 inline backtick(踩過兩次),所有 inline code 用單引號或不框。

export function mergeTicketPrompt(opts: {
  projectPath: string;
  branch: string;
  baseBranch: string;
  strategy: "merge" | "squash" | "ff-only";
}): string {
  const { projectPath, branch, baseBranch, strategy } = opts;
  const strategyDesc =
    strategy === "squash"
      ? "git -C \"" + projectPath + "\" merge --squash " + branch + ",之後 git -C \"" + projectPath + "\" commit -m 'Squash merge " + branch + " into " + baseBranch + "'"
      : strategy === "ff-only"
      ? "git -C \"" + projectPath + "\" merge --ff-only " + branch
      : "git -C \"" + projectPath + "\" merge --no-ff " + branch + " -m 'Merge " + branch + " into " + baseBranch + "'";
  return [
    "AI merge 任務。把 pipeline branch '" + branch + "' 合併到 base '" + baseBranch + "'。",
    "",
    "**所有 git 操作都用 git -C \"" + projectPath + "\" 顯式指定 main repo,不切 cwd**。",
    "(你的 cwd 是 worktree,不能在這做 merge — 必須在 main repo 操作。)",
    "",
    "## 流程",
    "",
    "1. 預檢:",
    "   - Bash: git -C \"" + projectPath + "\" status --porcelain → 確認 working tree 乾淨",
    "   - 不乾淨 → 報告失敗 + reason='working tree 不乾淨,需先 stash/commit'",
    "   - Bash: git -C \"" + projectPath + "\" rev-parse --verify " + baseBranch + " 跟 git -C \"" + projectPath + "\" rev-parse --verify " + branch + " → branch 都存在",
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
    "     b. Edit 解衝突,markers 全清掉",
    "     c. Bash: git -C \"" + projectPath + "\" add <相對路徑>",
    "   - 全解完 → Bash: git -C \"" + projectPath + "\" commit -m 'Merge " + branch + " into " + baseBranch + " (AI resolved)'",
    "   - 解不出來 → Bash: git -C \"" + projectPath + "\" merge --abort,回報失敗 + 衝突檔列表",
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
    "失敗(無論 step 哪一階段)→ 在回應開頭明確寫:'FAIL\\n<reason 一行>'",
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
  ].join("\n");
}
