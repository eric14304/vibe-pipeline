---
name: vibe-pipeline
description: vibe-pipeline 操作手冊 — 給 AI 看的「怎麼用 vbpl 替 user 管 pipeline / ticket」精簡指南。User 把這 SKILL 安裝到 ~/.claude/skills/ 後,你會在任何 project 看到本檔,知道 host 上裝了 vbpl 工具。觸發:user 提到 vibe-pipeline / vbpl / pipeline / ticket / 「幫我跑這個 pipeline」/ 「建 ticket」/ 「審核 AI 過了沒」之類。
---

# vibe-pipeline — AI 操作手冊

User 在這台機器**可能裝了** **vibe-pipeline**(多 AI agent 的 ticket / pipeline 編排器)。完整功能介紹在 https://github.com/eric14304/vibe-pipeline 的 README。本檔教你「怎麼判斷有沒有裝 + 怎麼裝 + 裝了怎麼操作」。

## 先確認:vbpl 裝了沒?

跑 `vbpl --version`。

- **回版本號** → 已裝,跳到「心智模型」
- **`command not found`** → 引導 user 看 repo README §CLI(build + install to PATH per-OS + trouble),完事後 `vbpl --version` 驗

## 心智模型

```
project(user 的某個 git repo)
 └── pipeline(獨立 git branch, 一組相關 ticket)
       └── ticket(可獨立交付的工作單元)
              └── iter rounds(executor 改 code → critic 判 PASS/FAIL,迴圈到通過)
```

- **executor**:真改 code 的 AI sub-agent(高 capability model)
- **critic**:讀 diff 判 PASS / FAIL / PARTIAL 的 AI sub-agent(便宜 model 即可)
- **iter mode**:executor + critic 來回到 critic PASS 或達 iter 上限(預設 5)
- **step mode**:跑一次就收(no critic loop)
- **autoMerge**:全 ticket done → 自動 git merge 回 base(衝突才 AI)

## 你能做什麼(透過 vbpl CLI)

**讀(不需 backend)**:

```bash
vbpl project list                                      # 列已知 project
vbpl pipeline list --project <hash>                    # 列該 project 的 pipeline
vbpl pipeline status <pipelineId>                      # 看 pipeline 跟 ticket 即時狀態
vbpl pipeline log <pipelineId>                         # 過往 run 摘要(cost / duration / result)
vbpl ticket list --pipeline <pipelineId>               # 列 ticket
vbpl config list                                       # 看 user 的 per-task-class model 配置
```

**寫(fs 直存,不需 backend)**:

```bash
vbpl pipeline create <name> [--auto-merge] [--base-branch main]
vbpl ticket add --pipeline <id> --title "..." --mode iter
vbpl config set <key> <value>                          # e.g. runner.model claude-opus-4-7
```

**啟動 / 停 / 合併(需 backend up — `bun run server`)**:

```bash
vbpl pipeline run <pipelineId>                         # 啟動 runner
vbpl pipeline stop <pipelineId>                        # 暫停(runner 跑完當前 ticket 就停)
vbpl pipeline merge <pipelineId>                       # 合併回 base(先試 git,衝突才 AI)
vbpl pipeline sync <pipelineId>                        # 把 base 拉進 pipeline worktree
vbpl pipeline sync <id> --ai                           # 衝突時讓 AI 解
vbpl pipeline sync <id> --cancel                       # 取消同步
```

**所有指令吃 `--json`**,給你結構化資料用 JSON.parse 後判斷;沒 `--json` 印給 human 看。

## 標準操作流(常見 user 意圖)

1. **「幫我建一條 pipeline 做 X」**
   - 確認在哪個 project(`vbpl project list`,user 若沒指定就問或用當前 cwd)
   - `vbpl pipeline create <name>`
   - 用 `vbpl ticket add` 或建議 user 開 web UI 走 QA 對話讓 AI 收斂規格(複雜需求建議走 QA,簡單一張可用 CLI)

2. **「跑這條 pipeline」**
   - `vbpl pipeline run <id>` — backend 沒起會回 `NO_BACKEND` error,告訴 user 跑 `bun run server`
   - 啟動後**不等完成**,CLI 即返回,告訴 user「已啟動,看 `vbpl pipeline status <id>` 或 web UI」
   - 不要 polling status 一直問;user 真要進度自己會問

3. **「進度?」/「跑完了嗎?」**
   - `vbpl pipeline status <id> --json` 看 `state` + `tickets[].status`
   - `running` / `paused` / `ready` / `merged` / `failed` 對應 user 看得懂的中文回報
   - `paused` 多半要 user 介入(failed_transient = 暫時錯誤可繼續;failed_iter_limit = critic 連 N 輪沒過,要 user 改 ticket)

4. **「合併」**
   - `vbpl pipeline merge <id>` — backend 先試 `git merge --no-ff`,90% 直接成功
   - response `mode: "mechanical"` = 純 git 成功,沒燒 token
   - response `mode: "ai"` = 撞衝突,AI 接手解,需 1-3 分鐘
   - 失敗 reason `working_tree_dirty` → 告訴 user「main repo 工作區有未 commit 改動,先 commit 或 stash」

5. **「看這 pipeline 花了多少」**
   - `vbpl pipeline log <id> --json`,加總 `costUsd` 欄位

## 不要擅自做的事

- **不要自動 retry failed pipeline / ticket** — 失敗有原因(衝突 / critic 不認可 / token 超限),先問 user
- **不要 `merge` 撞衝突就 cancel** — backend 已自動切 AI 解衝突,讓它跑;真要砍 user 自己會說
- **不要改 user 沒拜託的 config**(`vbpl config set`) — 動 model / effort 影響 cost
- **不要碰 `~/.vibe-pipeline/state.json` / pipeline.json 手** — 走 vbpl 指令,後端有 atomic write / race guard
- **看到 `merge_blocked` notif** — 通常 user 工作區髒 / git_error,reporter 告知不主動解
- **`pipeline run` 不要塞給 backend 沒起的 user** — 先 health check,給明確提示「需 backend up」

## 出錯訊息對照

| Error code | 意思 | 怎麼回 user |
|---|---|---|
| `NO_BACKEND` | backend server 沒起 | 「先跑 `bun run server`」 |
| `NO_PROJECT` | resolveProject 找不到 | 「--project <hash> 指定 / 或先 `vbpl project add <path>`」 |
| `NOT_INITIALIZED` | project 沒 `.vibe-pipeline/` | 「跑 vbpl project add,首次進去 web UI 點自動初始化」 |
| `STATE_GUARD` | operation 不允許在當前 state | 看 state(running 要先 pause / merged 不准 run) |
| `working_tree_dirty` | merge 時 main repo 髒 | 「先 commit / stash 再 merge」 |

## 完整參考

- **README**:https://github.com/eric14304/vibe-pipeline — 安裝 / 完整功能 / Tailscale 遠端
- **CLAUDE.md**(repo 內):repo 結構 / 雷區 / 設計信條 — 改 vibe-pipeline 自己的 code 才需要看
- **子 SKILL**(repo 內 `.claude/skills/`):改 frontend / backend / cli / e2e code 才看
- **`vbpl --help`** 看每個 verb 的 flag,新功能比這份手冊新

寫指令前不確定 flag → `vbpl <noun> <verb> --help` 或 `--json` 試。本檔過時時 CLI 自己的 help 是 source of truth。
