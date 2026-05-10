// 構造 sync ticket 的 prompt(把 base branch 拉進 pipeline worktree,改用 rebase)。
// sub-agent 在 worktree 內操作(用 git -C "<worktreePath>"),不動 main repo。
// 重要:不能用 inline backtick(踩過兩次),所有 inline code 用單引號或不框。
//
// 為何 rebase 不 merge:rebase 完 worktree 上不會多出無內容的 sync merge commit;
// 已 merged 過的 pipeline 跑 sync 等於 FF,worktree 跟 base 0 diff,banner 不會誤觸發 re-merge。
// 代價:branch 上未 merged 的 ticket commit 會被 replay → hash 全變;主 agent 跑完
// 抓 git log 配對 ticket.commits[].subject 寫回新 hash 修正。

export function syncTicketPrompt(opts: {
  worktreePath: string;
  branch: string;
  baseBranch: string;
  behindCount: number;
}): string {
  const { worktreePath, branch, baseBranch, behindCount } = opts;
  return [
    "AI sync 任務:用 rebase 把 base '" + baseBranch + "' 拉進 pipeline worktree(branch '" + branch + "')。",
    "目前落後 " + behindCount + " 個 commit。",
    "",
    "**所有 git 操作都用 git -C \"" + worktreePath + "\" 顯式指定 worktree,不切 cwd**。",
    "",
    "## 流程",
    "",
    "1. 預檢:",
    "   - Bash: git -C \"" + worktreePath + "\" status --porcelain → worktree 必須乾淨(沒未 commit 改動)",
    "   - **不乾淨 → FAIL_NORETRY**(reason='worktree 不乾淨'),iter 不重試",
    "   - Bash: git -C \"" + worktreePath + "\" rev-parse --verify " + baseBranch + " → base branch 存在",
    "   - 不存在 → FAIL_NORETRY(reason='base branch 不存在')",
    "",
    "2. rebase:",
    "   - Bash: git -C \"" + worktreePath + "\" rebase " + baseBranch,
    "   - 三種結果:",
    "     a. 'Already up to date' / 'Current branch ... is up to date' → 直接到 step 5,回 'PASS\\nNOTHING_TO_SYNC'",
    "     b. 'Successfully rebased' (沒衝突) → 到 step 4 驗證",
    "     c. 'CONFLICT (...)' → 到 step 3 解衝突",
    "",
    "3. 衝突處理(rebase 中斷,每個 commit replay 都可能撞):",
    "   - Bash: git -C \"" + worktreePath + "\" diff --name-only --diff-filter=U → 列衝突檔",
    "   - 對每個檔(用絕對路徑 \"" + worktreePath + "/<相對路徑>\"):",
    "     a. Read 看內容(<<<<<<< / ======= / >>>>>>> markers)",
    "     b. **branch side(<<<)是當前正在 replay 的 ticket commit 改動,base side(>>>)是 base 平行修改**",
    "     c. 通常保留 branch side 邏輯,融合 base side 的平行修改",
    "     d. Edit 解衝突,markers 全清掉",
    "     e. Bash: git -C \"" + worktreePath + "\" add <相對路徑>",
    "   - 全解完該 commit → Bash: git -C \"" + worktreePath + "\" rebase --continue",
    "   - 若還有下個 commit 衝突 → 回到本步驟重來;直到 rebase 完成",
    "   - 解不出來 → Bash: git -C \"" + worktreePath + "\" rebase --abort,回 FAIL + 衝突檔列表",
    "   - **空 commit**:rebase 過程 git 提示 'is empty'(該 commit 改動已被 base 包含)→ Bash: git -C \"" + worktreePath + "\" rebase --skip,該 commit 從 branch 消失,接續",
    "",
    "4. 驗證(rebase 完):",
    "   - Bash: cat \"" + worktreePath + "/package.json\" 看 script",
    "   - 有 'build' → Bash: cd \"" + worktreePath + "\" && bun run build(timeout 5min)",
    "   - 有 'test' → Bash: cd \"" + worktreePath + "\" && bun run test(timeout 10min)",
    "   - 沒這些 → Bash: cd \"" + worktreePath + "\" && bunx tsc --noEmit",
    "   - 任一驗證 fail:",
    "     a. 試一次自動修復:Read 錯誤檔,Edit 修,git -C \"" + worktreePath + "\" add + commit --amend --no-edit",
    "     b. 第二次還 fail → 不 reset,FAIL + 錯誤摘要",
    "",
    "5. 收尾:回應開頭明確寫一種:",
    "   - 'PASS\\nNOTHING_TO_SYNC' — 已最新,沒 rebase 任何東西(等同 FF 0 commit)",
    "   - 'PASS\\nSYNC_DONE' — rebase 成功(可能含衝突解 + 驗證 PASS)",
    "   注意:不需要寫 SYNC_COMMIT_HASH(主 agent 會自己跑 git log 抓新 ticket commits 的 hash 配對 pipeline.json)",
    "",
    "失敗 → 回應開頭明確寫一種:",
    "  - 'FAIL\\n<reason>' — 可重試(衝突解錯、驗證 fail)。runner iter 再給一次",
    "  - 'FAIL_NORETRY\\n<reason>' — 致命(worktree 髒、branch 不存在)。runner 立刻終止 iter",
    "",
    "## 不踩",
    "",
    "- 不要切 cwd 出 worktree;所有 git 操作針對 \"" + worktreePath + "\"。",
    "- **不要動 main repo**(target project 路徑)。sync 只在 worktree 內 rebase。",
    "- 不要 git pull / fetch / push / reset --hard / merge。全 local rebase。",
    "- 解衝突時 markers 必須完全清掉。",
    "- 一輪驗證沒過自動修一次就好,不要無限迴圈。",
    "- rebase --abort 是「解不出來」的 escape hatch,不是「我懶得試」的退路。",
    "",
    "## acceptance",
    "",
    "- worktree HEAD 含 " + baseBranch + " 最新 commit(git rev-list --count HEAD.." + baseBranch + " 應為 0)",
    "- worktree 乾淨,沒 conflict markers,沒 .git/rebase-merge 目錄殘留",
    "- 驗證(tsc / build / test)PASS",
  ].join("\n");
}
