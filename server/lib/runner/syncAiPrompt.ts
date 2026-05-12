// 給 AI 解 sync 衝突的 prompt(worktree 已在 mid-merge 狀態,衝突檔列在 conflictFiles)。
// 跟舊 syncTicketPrompt 不同:這只負責「解衝突 + 完成 merge commit + 驗證」,
// 不負責跑 git merge / rebase(那是 backend 用 git CLI 直接做的)。
//
// 不踩 inline backtick 雷 — 所有 inline code 用單引號。

export function syncAiPrompt(opts: {
  worktreePath: string;
  branch: string;
  baseBranch: string;
  conflictFiles: string[];
}): string {
  const { worktreePath, branch, baseBranch, conflictFiles } = opts;
  const filesList = conflictFiles.map((f) => "   - " + f).join("\n");
  return [
    "AI sync 衝突解法任務:worktree '" + worktreePath + "' 上跑 'git merge --no-ff " + baseBranch + "' 進 branch '" + branch + "' 失敗,有衝突。你的任務是解掉並完成 merge commit。",
    "",
    "目前 worktree 處於 mid-merge 狀態,.git/MERGE_HEAD 存在,工作區檔案有 conflict markers(<<<<<<< / ======= / >>>>>>>)。",
    "",
    "衝突檔(相對 worktree 路徑):",
    filesList,
    "",
    "**所有 git 操作都用 git -C \"" + worktreePath + "\" 顯式指定 worktree。**",
    "",
    "## 流程",
    "",
    "1. 對每個衝突檔(絕對路徑 = \"" + worktreePath + "/<相對>\"):",
    "   a. Read 看內容,定位 <<<<<<< / ======= / >>>>>>> markers",
    "   b. **<<<<<<< HEAD 那段是 pipeline branch 自己的修改**,**>>>>>>> " + baseBranch + " 那段是 base 平行修改**",
    "   c. 通常邏輯:保留 pipeline 改動 + 融合 base 改動;若兩邊改同一行 → 用語意上正確的版本",
    "   d. Edit 解衝突,markers **必須完全清掉**",
    "   e. Bash: git -C \"" + worktreePath + "\" add <相對路徑>",
    "",
    "2. 全部解完後完成 merge commit:",
    "   - Bash: git -C \"" + worktreePath + "\" commit --no-edit",
    "   - (沿用 git 自動產的 merge commit message,不改)",
    "",
    "3. 驗證(可選但建議):",
    "   - Bash: cat \"" + worktreePath + "/package.json\" 看 script",
    "   - 有 tsc → Bash: cd \"" + worktreePath + "\" && bunx tsc --noEmit",
    "   - tsc fail → 試一次自動修(Read 錯誤檔 + Edit + git add + commit --amend --no-edit);第二次還 fail → FAIL",
    "",
    "4. 回應開頭明確寫一種:",
    "   - 'PASS\\nSYNC_DONE' — 解完 + commit 成功",
    "   - 'FAIL\\n<簡述>' — 解失敗或驗證 fail,worktree 留在當前狀態給 backend 跑 git merge --abort",
    "",
    "## 不踩",
    "",
    "- 不要切 cwd 出 \"" + worktreePath + "\";所有 git 操作明確指定 worktree。",
    "- **不要動 main repo**(target project 路徑)。",
    "- 不要 git pull / fetch / push / reset --hard / merge --abort / rebase。merge 在這邊已啟動,你只解衝突 + commit。",
    "- markers 必須完全清掉,不要留半個 <<<<<<< 或 =======。",
    "- 不要改 .git/ 內部檔案。",
    "",
    "## acceptance",
    "",
    "- 所有衝突檔已被 git add(git status --porcelain 沒 UU/AA 等)",
    "- merge commit 已 commit(git -C ... rev-parse HEAD 拿到一個含 " + baseBranch + " 的新 merge commit)",
    "- 沒 conflict markers 殘留",
    "- (若有跑 tsc)tsc 通過",
  ].join("\n");
}
