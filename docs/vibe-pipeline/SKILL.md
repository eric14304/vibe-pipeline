---
name: vibe-pipeline
description: vibe-pipeline 操作手冊 — 給 AI 看的「怎麼用 vbpl 替 user 管 pipeline / ticket」精簡指南。User 把這 SKILL 安裝到 ~/.claude/skills/ 後,你會在任何 project 看到本檔,知道 host 上裝了 vbpl 工具。觸發:user 提到 vibe-pipeline / vbpl / pipeline / ticket / 「幫我跑這個 pipeline」/ 「建 ticket」/ 「審核 AI 過了沒」之類。
---

# vibe-pipeline — AI 操作手冊

User 在這台機器**可能裝了** **vibe-pipeline**(多 AI agent 的 ticket / pipeline 編排器)。完整功能介紹在 repo 的 [`README.md`](../../README.md)。本檔教你「怎麼判斷有沒有裝 + 怎麼裝 + 裝了怎麼操作」。

## 先確認:vbpl 裝了沒?

跑 `vbpl --version`。

- **回版本號** → 已裝,跳到「心智模型」
- **`command not found`** → 引導 user 看 [`install.md`](install.md)(build + install to PATH per-OS + trouble),完事後 `vbpl --version` 驗

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
vbpl ticket show --pipeline <id> --ticket <n>          # 看單張 ticket 細節
vbpl config list                                       # 看 user 的 per-task-class model 配置
```

**寫(fs 直存,不需 backend)**:

```bash
vbpl pipeline create <name> [--auto-merge] [--base-branch main]
vbpl ticket add --pipeline <id> --title "..." --mode iter
vbpl ticket update --pipeline <id> --ticket <n> [--title/--goal/--prompt/--acceptance/--mode/--status/--iter-limit ...]
vbpl ticket remove --pipeline <id> --ticket <n>
vbpl config set <key> <value>                          # e.g. runner.model claude-opus-4-7
```

**啟動 / 停 / 合併(需 backend up — `bun run server`)**:

```bash
vbpl pipeline run <pipelineId>                         # 啟動 runner
vbpl pipeline stop <pipelineId>                        # 停止(SIGKILL runner → state=paused;按「繼續」從 critic 階段接續)
vbpl pipeline merge <pipelineId>                       # 合併回 base(先試 git,衝突才 AI)
vbpl pipeline sync <pipelineId>                        # 把 base 拉進 pipeline worktree
vbpl pipeline sync <id> --ai                           # 衝突時讓 AI 解
vbpl pipeline sync <id> --cancel                       # 取消同步
```

**所有指令吃 `--json`**,給你結構化資料用 JSON.parse 後判斷;沒 `--json` 印給 human 看。

## 進階:REPL 主 agent 模式(省 Agent SDK 額度)

**背景**:2026-06-15 後 Anthropic 把 `claude -p`(non-interactive CLI)拆出獨立 Agent SDK 額度桶(Pro $20 / Max 5x $100 / Max 20x $200 / 月),用完按 full API rate。VP 預設的 `vbpl pipeline run` 走 backend orchestrator,backend spawn `claude -p` 跑主 agent + sub-agent → 全吃這個 Agent SDK 桶。

**替代路徑**:讓**另一個 claude REPL session**(`claude --dangerously-skip-permissions`)扮演主 agent — REPL 屬 interactive,走 plan 互動池(大、補貼)。Task 派的 sub-agent 也算同 session,**整條 pipeline 走 interactive 池,不動 Agent SDK 桶**。

### 何時建議走 REPL 模式

- user 有 CC 在旁(像你正在跟他對話)、願意盯著看
- 想省 Agent SDK 額度(尤其 Pro / Max 5x 桶小)
- pipeline 不是過夜 / 遠端跑

### 何時仍用 backend(`vbpl pipeline run`)

- 過夜 / 長 pipeline / 無人值守
- user 在手機 / 遠端、要 FCM push 通知
- 需要平行多 pipeline(REPL 一次只能跑一條)
- e2e mock 測試

### 怎麼跑(只是 CC 的你,離手讓 user 操作)

1. **你自己用 vbpl 建 pipeline / ticket**(`vbpl pipeline create` + `vbpl ticket add` × N),**不要按 run**
2. 告訴 user「pipeline 已備好,我幫你開 REPL 視窗」,然後用 Bash 跑:
   ```bash
   powershell -Command "Start-Process cmd -ArgumentList '/k claude --dangerously-skip-permissions' -WindowStyle Normal"
   ```
   (macOS / Linux 上換對應 terminal launcher;確認 user OS 後再執行)
3. 給 user **4 行 paste-ready** 指令(替換成實際絕對路徑):
   ```
   Read <repo>/docs/vibe-pipeline/repl-runner.md
   PIPELINE_JSON: <target-project>/.vibe-pipeline/pipelines/<pipelineId>.json
   WORKTREE: ~/.vibe-pipeline/worktrees/<projHash>/<pipelineId>
   開始
   ```
4. user 貼進新 cmd 視窗 Enter → REPL 自己 Read 兩個檔(`repl-runner.md` 框架 + `server/lib/runner/runnerPrompt.ts` 主 agent 行為)→ Task 派 sub-agent 跑完
5. 跑完 user 回來告訴你結果,你決定下一步(看 diff / commit / merge / 啟新 pipeline)

`docs/vibe-pipeline/repl-runner.md` 是 paste-ready 指令的標準範本,絕對路徑替換時兩個 placeholder(`__FILL_ME__`)很明顯。

### 注意事項

- REPL 那個 session 跟你**完全隔離**,不知道你跟 user 聊過什麼。Prompt 內所有它需要的 path 都要寫絕對路徑
- pipeline.json 仍是 source of truth,REPL 寫,web UI 跟你照樣讀得到 state
- **backend 的 `running` Map 不會有這條** → web UI 不會顯示「running indicator」、watchdog 不救;但 disk 真實狀態 OK
- Pause = 直接 Ctrl+C 那個 REPL,不是 API
- 長 pipeline 撐不撐得住看 REPL context window(超過 200k token 會出問題)

## 標準操作流(常見 user 意圖)

1. **「幫我建一條 pipeline 做 X」**
   - 確認在哪個 project(`vbpl project list`,user 若沒指定就問或用當前 cwd)
   - `vbpl pipeline create <name>`
   - 用 `vbpl ticket add` 或建議 user 開 web UI 走 QA 對話讓 AI 收斂規格(複雜需求建議走 QA,簡單一張可用 CLI)

2. **「跑這條 pipeline」**
   - **首選**:走 backend — `vbpl pipeline run <id>`(backend 沒起會回 `NO_BACKEND` error,告訴 user 跑 `bun run server`)
   - **替代(省 Agent SDK 額度)**:走 REPL 主 agent 模式 — 見上方「進階」段,適合 dogfood / CC 配 VP / 不過夜
   - 啟動後**不等完成**,告訴 user「已啟動,看 `vbpl pipeline status <id>` 或 web UI」
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
| `STATE_GUARD` | operation 不允許在當前 state | 看 state(running 要先「停止」/ merged 不准 run) |
| `working_tree_dirty` | merge 時 main repo 髒 | 「先 commit / stash 再 merge」 |

## 完整參考

- **README**:repo 的 [`README.md`](../../README.md) — 安裝 / 完整功能 / Tailscale 遠端
- **CLAUDE.md**(repo 內):repo 結構 / 雷區 / 設計信條 — 改 vibe-pipeline 自己的 code 才需要看
- **子 SKILL**(repo 內 `.claude/skills/`):改 frontend / backend / cli / e2e code 才看
- **`vbpl --help`** 看每個 verb 的 flag,新功能比這份手冊新

寫指令前不確定 flag → `vbpl <noun> <verb> --help` 或 `--json` 試。本檔過時時 CLI 自己的 help 是 source of truth。
