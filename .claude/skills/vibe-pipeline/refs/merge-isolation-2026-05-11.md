# Merge worktree isolation — 研究 (2026-05-11)

問題:vibe-pipeline self-dogfood(VP 改 VP 自己)時,AI merge agent 在 main repo 跑 `git merge` →
working tree 出現 conflict markers → vite 紅 overlay + bun --watch reload 殺掉 AI session →
merge 永遠完不成。

非 self-dogfood(VP 跑別 project)沒這問題,但長遠把 AI merge 隔離成「不打擾 user」是正確架構方向。

本 doc 對比四種解法,結論在末尾。

## 1. 技術可行性實測(/tmp 上開臨時 repo)

### `git worktree add --detach <path> <branch>` 行為
- ✓ 同一 branch 可被 main repo + 隔離 worktree(detached)同時 share
- ✗ 隔離 worktree 不能 `git checkout main`(會撞 "already used by worktree at ..."),要保持 detached
- ✓ detached HEAD 上 `git merge --no-ff <branch>` 能正常建 merge commit;commit object 寫進 share 的 .git object store

### `git update-ref refs/heads/main <new-commit>`
- ✓ 把 main branch 指針推到新 commit 一行搞定
- ⚠ **side effect**:main repo working tree 是舊 HEAD 的 disk content,但 HEAD 邏輯 ref 跳了 → `git status` 顯一堆「modified」(working tree 比 new HEAD 「少了」merge 帶進來的改動)
- 救法:
  - `git checkout HEAD -- .` 強制 disk 同步到 new HEAD(會吃掉 user 沒 commit 的真實 modify;要先 stash)
  - `git stash → git checkout HEAD -- . → git stash pop`(三步保住 user 真 modify,但 stash pop 可能跟 merge 內容衝突要再解一輪)

### `git merge-tree --write-tree`(plumbing,不開 worktree)
- ✓ 完全不動 working tree(**任何** working tree)
- ✗ 只回 tree object hash,不建 commit;要再 `git commit-tree <tree> -p <parent1> -p <parent2> -m ...` 手動產 commit
- ✗ 衝突要 AI 自己讀 tree object / blob、寫解過的 blob、組 commit — porcelain 工具(Edit/git add/diff)用不上,**AI 解衝突門檻變超高**
- ✗ 不跑 hooks(對我們是好事但要記)
- 適合:CI / server-side merge bot,完全機械化、無人介入(GitHub Actions 自動 PR merge 走這條)
- 不適合:AI 帶人類風格解衝突的場景

### `git update-ref` 跟 atomicity
- 單個 ref update 是 atomic(optimistic locking,old-oid 比對)
- 多 ref 同時更新可用 transactional 模式
- concurrent 寫:race 時只一個贏,輸的拿 stale-old-oid 錯誤 → AI 收到後可重試
- vibe-pipeline 場景單一 user / 單一 main,race 機率極低,但仍要 handle update-ref 失敗

## 2. 業界對照

### GitHub Actions / GitLab CI
- 每次 job spawn ephemeral runner,新 container / VM,從零 clone repo
- merge 在 ephemeral runner 內跑,結束後 push 結果
- **完全隔離,但成本高**(每次 clone 整個 repo);適合 server-side 不適合 local dev tool

### OpenAI Codex app (Worktrees feature)
- 「By default, Codex works in a detached HEAD. This lets Codex create several worktrees without polluting your branches.」
- 直接用 `git worktree --detach` 模式,正是本研究方向
- ([OpenAI Developers — Codex Worktrees](https://developers.openai.com/codex/app/worktrees))

### Claude Code / Cursor
- 都原生支援 worktree-per-agent pattern
- 「This pattern is now natively supported by Claude Code, OpenAI Codex, and Cursor, and has become the default coordination layer for teams running four or more concurrent AI sessions.」
- ([How to Use Git Worktrees for Parallel AI Agent Execution — Augment Code](https://www.augmentcode.com/guides/git-worktrees-parallel-ai-agent-execution))

### Gerrit / Phabricator review-merge
- 走 plumbing(`merge-tree`)+ `update-ref`,server-side 無 working tree
- 衝突 → 退回 user 手動處理(不 AI 解衝突)

### gh CLI `gh pr merge`
- 透過 GitHub API,merge 在 GitHub server 端做,client 完全不參與 merge
- 不適合 local-first vibe-pipeline

### 結論:vibe-pipeline 的定位最接近 Codex / Claude Code worktree pattern
- AI 在 worktree 解衝突(porcelain 友善)+ user main 隔離

## 3. 四個方案比對

| 方案 | 實作量 | self-dogfood OK? | working tree drift | hooks | AI 解衝突難度 | 推薦度 |
|---|---|---|---|---|---|---|
| (a) **merge worktree (detached)** | ~150 行 | ✓ | 有(救得回) | 跑 | 低(用 porcelain) | ★★★ |
| (b) `merge-tree` plumbing | ~250 行 | ✓ 完全不動 | 0 | 不跑 | **高**(AI 自寫 plumbing) | ★ |
| (c) clone 到 sandbox,merge,push 回 | ~200 行 | ✓ | 0 | 跑 | 低 | ★★(clone 慢) |
| (d) 維持現況 + 文件提醒 | 0 | ✗ | n/a | n/a | n/a | ★(放棄 self-dogfood) |

## 4. 推薦方案 (a) merge worktree detached

### 流程設計

```
user 按 AI merge
  ↓
backend /merge:
  1. preflight(working tree 乾淨 — 已實作)
  2. 在 ~/.vibe-pipeline/merge-worktrees/<projHash>/<pipelineId>/ 開
     git worktree add --detach <path> <baseBranch>
  3. append merge ticket(prompt 改用 -C "<merge-worktree>" 操作,不再用 main repo)
  4. spawn runner → AI 在 merge-worktree 內 解衝突 + commit + 驗證
  5. AI 成功後寫進 pipeline.json:
     - mergeCommit { hash, subject, ts }
     - state = merged
  6. backend 偵測到 state=merged → 自動 git update-ref refs/heads/<baseBranch> <hash>
  7. backend cleanup:git worktree remove <path>
  8. notif emit pipeline_merged
```

### user working tree 同步策略

ref 跳了但 disk 是舊的 → 兩個選擇:
- **A. 自動 sync**:backend 完 ref 後跑 `git checkout HEAD -- .`(危險,user 沒 commit 的真實工作會丟)
- **B. UI 引導 user 手動**:notif「已合併 → main,working tree 還在舊 base,點此 sync」按鈕跑 stash/checkout/pop;預設不動 user 工作
- 推薦 **B**:vibe-pipeline 哲學是「AI 不擅自動 user 沒存的工作」,sync 應該 explicit

### 邊界 / 風險

- ⚠ user 在 AI 跑期間自己 commit on main → ref 跳到 new merge commit 時,user 那輪 commit 變 dangling(沒人指向)
  - 救法:update-ref 前用 expected-old-oid 卡 race,失敗 → AI 通知 user「main 已動,請先 pull / rebase」
- ⚠ merge worktree 殘留(crash / kill)→ 啟動時 `git worktree prune` 自動清
- ⚠ vscode / git GUI 看不到 merge worktree 內進度 → 純 vibe-pipeline UI 看
- ⚠ 跨 pipeline 平行 merge:同個 base branch 兩條 pipeline 同時 merge 會 race(更動同個 ref)→ phase 5 才需處理,目前單條足夠

### 實作切點

不對齊現有 phase 4 第二刀(ticket-based merge),merge worktree 是「在那架構**外加** isolation 層」,改動點:
- `mergeTicketPrompt`:`projectPath` 改成 merge-worktree 路徑;`-C` 全部跟著
- `appendMergeTicket` / 觸發前:backend 自己開 merge worktree
- runner 主 agent prompt(mode=merge):成功 → 設 state=merged 但 mergeCommit hash 來源是 merge-worktree 的 HEAD
- backend 監聽 state→merged 時跑 update-ref + worktree remove

## 5. 結論

- **不做 (a) 對 99% user 沒影響**,只 self-dogfood 痛
- **做 (a) 預估 ~150-200 行 + 1.5-2hr**,把哲學「AI 不打擾 user」補完
- **不建議 (b)** plumbing 路線,AI 解衝突會崩潰
- **(c) clone-sandbox** 在大 repo 上慢(每次 clone)
- **若決定不做**:文件補 caveat「self-dogfood 時手動 git merge 不要走 AI merge」

要做的話開新 ref `phase4-3-merge-worktree-isolation-YYYY-MM-DD.md` 寫實作計畫。
