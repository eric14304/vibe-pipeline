# Git 設計:多 pipeline 平行執行(2026-05-09)

> Pipeline = git branch。多條 pipeline 同時跑 = 多 branch 同時被 AI 操作。
> 用 git worktree 解,worktree 放在 target repo **外**(user home)。
> 實作落在 **[P2] runner 階段**,phase 2 (QA) 只需 schema 預留 `Pipeline.branch`。

## 1. 為什麼是 worktree(不是 clone、不是切 branch)

**切 branch(naive)**:同一資料夾 checkout 切換,同時只能看一個 branch。N 個 AI 平行寫會踩腳(都在改同一個檔)。**不可平行**。

**全 clone × N**:每條 pipeline 一個完整 clone。可平行但**重**(每份都複製整個 .git 歷史),且 commit 不即時同步,要 push/pull 才看得到。

**git worktree(我們的選擇)**:
- 只開 N 個額外資料夾,各 checkout 一個 branch
- `.git` 歷史只有一份(在原 repo),所有 worktree 共用
- 每個 worktree 額外成本 = 該 branch 的 source code 大小
- 各 worktree 改檔不互踩(不同資料夾)
- commit 即時可見(同 .git)

## 2. Layout

```
<target>/                                  # user 的主 worktree (開啟的專案)
├── .git/                                   # 真正的 .git,所有 worktree 共用
├── .vibe-pipeline/                         # metadata,git tracked
│   ├── config.json
│   └── pipelines/<id>.json                 # 含 branch / state / tickets[]
└── (user source files)

~/.vibe-pipeline/worktrees/<projHash>/<pipelineId>/   # 平行 worktree
├── .git                                    # pointer 檔,指回 <target>/.git
└── (pipeline/<name> branch 的 source)
```

**為什麼 worktree 放 target 外**
- 避免 worktree 內又有 `.vibe-pipeline/` metadata(那是 main branch 上的東西,跑進 pipeline branch 會自我參照、混淆)
- target repo 看起來乾淨,user 不會誤入 worktree
- `<projHash>` 名稱空間隔離(同台機器多個 vibe-pipeline checkout)

## 3. 生命週期(對應 git 操作)

```
1. QA 建 pipeline                pipeline.json 寫入,branch 欄位 = "pipeline/<name>"
                                   git 還沒動

2. 第一張 ticket 開跑              git -C <target> worktree add \
                                       ~/.vibe-pipeline/worktrees/<h>/<id> \
                                       -b pipeline/<name> <baseBranch>

3. doer / critic 跑               cd ~/.vibe-pipeline/worktrees/<h>/<id>
                                   spawn agent(claude / codex / ...)
                                   agent commit 落在 pipeline/<name>

4. N 條 pipeline 平行              N 個 worktree,各跑各的,零 contention

5. ready → merge                   git -C <target> merge pipeline/<name>
                                       (squash / rebase / merge,看 config.json defaults.merge_strategy)
                                   git -C <target> worktree remove ~/.../<h>/<id>

6. failed                          worktree 留著供 user 手動上去 debug
                                   pipeline.json state = "failed"
```

## 4. Concurrency 邊界

- 每條 pipeline = 1 worktree = 1 branch checkout = 1 cwd → **絕對不共享檔案**
- doer / critic spawn 時 `cwd` = worktree 路徑,不可能踩到別條
- main worktree(user 自己)跟 pipeline worktree 也獨立,user 改 source 不影響 agent
- metadata `.vibe-pipeline/pipelines/*.json` 永遠在 main worktree 寫(不在 pipeline worktree 寫)

## 5. 待決策(實作時拍)

| # | 議題 | 選項 |
|---|---|---|
| 1 | baseBranch 跑到一半被推進(別人 push 新 commit 到 main) | 自動 rebase / 提示 user / 等 pipeline 結束 |
| 2 | merge conflict | 標 `conflict` 狀態交 user 解 / [P3] AI 輔助 |
| 3 | metadata 寫入時機 | vibe-pipeline 寫 pipelines/*.json 後自動 commit / 累積等 user commit |
| 4 | orphan worktree 清理 | server 啟動時 `git worktree prune` recovery |
| 5 | single-instance lock | lock file 檔避免兩個 vibe-pipeline 同時跑同個 target |
| 6 | metadata 寫在哪個 branch | 永遠在 user 開啟時的 branch (預設 main) / 強制有專屬 metadata branch |

## 6. 對應現有 ref

- **Symphony**:每條 pipeline 一個 worktree,worktree 路徑命名空間 `.tickets/.worktrees/{slug}` — 我們改放 user home 外,避免巢狀 metadata 問題
- **vibe-kanban**:每張 ticket(他們叫 task)一個 worktree。我們是每條 pipeline 一個(因為 ticket 是 pipeline 內的子單元、共用一個 branch)
- **Composio AO**:hash-based 路徑命名空間 → 我們也用 `<projHash>/<pipelineId>` 命名,跟 Composio 同 pattern

## 7. 跟其他階段的關係

| 階段 | 用 worktree? |
|---|---|
| Phase 1(Project + Pipeline CRUD,已完成) | ❌ 沒 runner,不需要 |
| Phase 2(QA-driven ticket 建立) | ❌ QA 只是收集 spec,不執行 code |
| **[P2] runner 階段** | ✅ doer/critic spawn 在 worktree 內。**這份設計從這階段開始實作** |
| [P3] 多 pipeline scheduler | ✅ 平行調度 N 個 worktree |

## 8. 開工點(等實作時再寫)

```
server/lib/git/
├── worktree.ts        add / remove / list / prune
├── branch.ts          create / delete / merge per strategy
└── repo.ts            git -C wrapper、status / log / diff

server/lib/runner/     spawn doer/critic in worktree
                       (實作時讀本檔)
```
