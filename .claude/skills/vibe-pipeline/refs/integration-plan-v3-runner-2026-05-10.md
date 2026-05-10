# 串接計畫 v3:Pipeline runner(2026-05-10)

> Phase 3 = 真正執行 ticket。Pipeline 從「靜態 metadata」變「會跑的 agent 任務」。
> 物理路徑 → root [`CLAUDE.md`](../../../../CLAUDE.md)。

## 1. 7 個決策(已對焦)

| # | 議題 | 決定 |
|---|---|---|
| 1 | 主 agent 在哪 | **claude CLI session**(一個總領 AI,跑在 backend 起的 subprocess) |
| 2 | Sub-agent | 主 agent 用 **Task tool** 派(Claude Code 原生 sub-agent) |
| 3 | iter 迴圈 | 主 agent 派執行AI Task → 拿輸出 → 派審核AI Task → 沒過 feedback 進下一輪 |
| 4 | Pause | **跑完當前 ticket 才停**,加 `stopping` 中間態 |
| 5 | State sync | **Polling 1-2s**(frontend fetch pipeline.json) |
| 6 | cwd | **每 pipeline 一個 git worktree**(`~/.vibe-pipeline/worktrees/<projHash>/<pipelineId>/`,沿用 git-design ref) |
| 7a | iter 上限 | 每張 ticket 帶 `iterLimit`(預設 5)+ `iterStopAtLimit`(預設 true) |
| 7b | Transient fail | **auto-retry 3 次 + 指數 backoff**(2s / 4s / 8s),都失敗才 pause |

## 2. Vertical slice

```
1. user 在 Board 右上角點「開始運行」
   ↓
2. POST /api/projects/:hash/pipelines/:id/run
   ↓
3. backend:
   ├─ 建/重用 worktree (~/.vibe-pipeline/worktrees/<h>/<id>)
   ├─ pipeline.state = "running"
   └─ spawn claude CLI 主 agent (見 §4),cwd=worktree
   ↓
4. 主 agent 進迴圈:
   讀 pipeline.json
   ├─ pipeline.state == "stopping" → 標 paused、結束
   ├─ 沒 status=draft/ready 的 ticket → 標 ready、結束
   └─ 找第一張 status=draft/ready 的 ticket
        ├─ 標 ticket.status = "running"
        ├─ 寫回 pipeline.json
        ├─ 跑 ticket(見 §5,iter or step)
        ├─ 跑完 → 標 done / failed
        ├─ 寫回 pipeline.json
        └─ 回迴圈頭
   ↓
5. user 中途點「暫停」
   POST /pipelines/:id/pause
   backend 標 pipeline.state = "stopping"
   frontend 顯示 spinner + 「停止中…」
   主 agent 跑完當前 ticket 看到 stopping → 標 paused → 退出
   frontend polling 看到 paused → 顯示「已暫停」
   ↓
6. user 點「繼續」
   POST /pipelines/:id/run(同 run endpoint)
   backend 標 running、重 spawn 主 agent → 從第一個 draft/ready ticket 接續
```

## 3. State machine

### Pipeline state
```
planning ──開始──> running ──暫停──> stopping ──主agent ack──> paused
                  └──全部 ticket done──> ready
                  └──ticket failed (stop policy)──> paused
                  └──主agent crash──> running (stale,需 recovery 標 paused)
paused ──繼續──> running
ready ──merge──> merged ([P3] git ops 才有)
```

### Ticket state(已存在 + 新增)
```
draft  → ready (主 agent 開始跑前) → running → done
                                              └── failed (各種原因)
                                              └── failed_iter_limit (達 iter 上限)
                                              └── failed_transient (auto-retry 都失敗)
```

`failed_*` 是診斷子型;UI 上都顯 failed。

## 4. 主 agent 設計

### Spawn

```bash
claude -p \
  --output-format stream-json \
  --session-id <pipelineId-runner-uuid> \
  --system-prompt "<RUNNER_PROMPT,見下>" \
  --disallowedTools "Edit Write" \   # 主 agent 不直接改 source,只透過 Task 派執行AI 改
  "<initial user msg: 開始跑 pipeline,當前狀態見 .vibe-pipeline/pipelines/<id>.json>"
```

cwd = worktree path。`--max-budget-usd` 可選(之後 budget tracker [P2] 加)。

### System prompt(草案)

```
你是 vibe-pipeline 的 pipeline runner orchestrator。

## 你的職責
1. 讀取當前 pipeline 狀態(從 .vibe-pipeline/pipelines/<id>.json)
2. 找第一張 status="draft" 或 "ready" 的 ticket,從上往下
3. 標該 ticket status="running",寫回 JSON
4. 跑該 ticket(見「跑 ticket 流程」)
5. 跑完更新 ticket status,寫回 JSON
6. **每次寫回 JSON 後,重新讀一次,看 pipeline.state**
   - state=="stopping" → 標 pipeline.state="paused",結束
   - state=="running" 且還有未跑 ticket → 回到步驟 2
   - 所有 ticket done → 標 pipeline.state="ready",結束

## 跑 ticket 流程

### mode=step(單次任務)
- Task(prompt=ticket.prompt + ticket.acceptance) → 拿輸出
- 自己依 acceptance 判斷成功與否(可信任 sub-agent 報告 + 自己看 worktree 狀態)
- 標 ticket.status = "done" or "failed"

### mode=iter(迭代任務)
- 迴圈到 iterLimit(沒填走 5):
  1. 派執行AI:Task(prompt + 上輪審核 feedback,如有)
  2. 拿執行AI 輸出
  3. 派審核AI:Task("驗收這次執行對照 acceptance,通過/不通過 + 具體 feedback")
  4. 審核 pass → 標 ticket done,跳出迴圈
  5. 審核 fail → 把 feedback 加進下輪執行AI prompt
- 跑完 iterLimit 還沒過:
  - iterStopAtLimit=true(預設)→ 標 ticket failed_iter_limit + pipeline.state=paused,結束
  - iterStopAtLimit=false → 標 ticket failed_iter_limit,繼續下一張

## 失敗處理
- Task 子任務 transient error(API rate limit / network)→ retry 3 次 + 等 2s/4s/8s,都失敗才標 failed_transient + pipeline pause
- Task 子任務 judgment refuse / 其他錯誤 → 直接標 ticket failed + pipeline pause

## 工具使用
- 讀 pipeline.json:Read
- 寫 pipeline.json:由於 --disallowedTools "Edit Write",你**不能**直接寫,改用 **Bash echo / cat tee** 寫(暫時方案)
- 派 sub-agent:Task
- 查專案:Read / Grep / Glob / Bash(read-only)

## 不要做
- 不要直接改 source code(那是執行AI 的工作)
- 不要跳過 ticket 的迭代上限
- 不要無視 pipeline.state="stopping"
```

(草案,實作會再 iterate。)

### Backend tracking

```ts
// server/lib/runner/orchestrator.ts (新)
const orchestrators = new Map<string, Bun.Subprocess>(); // pipelineId → process

export function startRunner(projectPath: string, pipelineId: string) { ... }
export function stopRunner(projectPath: string, pipelineId: string) { ... } // sets pipeline.state = "stopping"
export function isRunning(pipelineId: string): boolean { ... }
```

Backend 啟動時:scan 所有 pipeline,若 state="running" 但對應 process 不在(crash 後重啟)→ 標 paused(stale recovery)。

## 5. API endpoints(新增)

```
POST /api/projects/:hash/pipelines/:id/run        建/重用 worktree + spawn 主 agent
POST /api/projects/:hash/pipelines/:id/pause      標 pipeline.state="stopping"
                                                  (主 agent 跑完當前自己標 paused)
POST /api/projects/:hash/pipelines/:id/abort      [P3] 強制 kill 主 agent + 標 paused
                                                  (這版不做)
GET  /api/projects/:hash/pipelines/:id            (已存在)— frontend polling 用
```

`run` 同時當「繼續」(從 paused → running)。

## 6. Frontend 改動

### Board 右上角按鈕
- pipeline.state="planning"/"paused" → 顯「▶ 開始運行」
- pipeline.state="running" → 顯「⏸ 暫停」
- pipeline.state="stopping" → 顯「停止中…」+ spinner,disabled
- pipeline.state="ready" → 顯「✓ 全部完成」+ (之後加 merge 按鈕)

### Polling
```ts
useEffect(() => {
  if (pipeline.state === "running" || pipeline.state === "stopping") {
    const id = setInterval(refetchPipeline, 1500);
    return () => clearInterval(id);
  }
}, [pipeline.state]);
```

### Ticket card
- status="running":pulse 動畫
- status="failed_iter_limit":顯 N/N 輪用盡標籤
- status="failed_transient":顯「網路 / API 暫時錯誤」標籤 + retry 提示

## 7. Backend 模組

```
server/
├── routes/
│   └── projects.ts              + run / pause endpoints
├── lib/
│   ├── runner/                  (新)
│   │   ├── orchestrator.ts      spawn / track / stop 主 agent
│   │   ├── runnerPrompt.ts      RUNNER_PROMPT 常數(類似 QA_BEHAVIOR_PROMPT)
│   │   └── recovery.ts          server 啟動時掃 stale running pipelines
│   └── git/                     (新,當下 phase 3 第一刀做)
│       └── worktree.ts          add / remove / list / prune
```

## 8. 範圍外(這次不做)

- Pipeline 完成後的 merge(squash / rebase / merge,跟 base branch)→ [P3]
- Budget tracker(token / $ 累計、上限暫停)→ [P2]+
- SQLite log(`runs.db`)→ [P2]
- Worktree orphan 清理(server 啟動 prune)→ 簡單版做,進階 [P3]
- Multi-pipeline 同時跑(這版單 pipeline)→ [P3]
- Ticket 中途編輯 / 重排 → 跑到的 ticket lock,後面的可改

## 9. 待解 / 開工會浮現的問題

- **主 agent 怎麼寫 pipeline.json**:`--disallowedTools "Edit Write"` 擋了 Edit/Write,但主 agent 需要更新 ticket.status。可選:
  - (a) 開放 Edit/Write 但 prompt 嚴格規定只改 .vibe-pipeline/pipelines/* 內的 status 欄
  - (b) 走 Bash:`echo` / `tee` 把 JSON 蓋寫(粗暴但可控)
  - (c) 提供一個 `vp-pipeline` CLI / wrapper script,主 agent 用 Bash 呼叫
  - 我傾向 (c),最乾淨,有命令邊界
- **Task tool 在 `claude -p` 模式真的可用嗎**:需實測。如果不行,fallback 到 Bash + recursive `claude -p`(Q2 選項 B)
- **stale running 偵測**:server crash 後 pipeline.state 留 "running",怎麼判定 process 真的死了?(PID 留 disk?過期時間?)
- **主 agent 退出 code**:正常結束 vs error?stream-json 結尾要 parse 確認
- **Worktree 第一張 ticket 跑前建立、最後一張完成後保留(讓 user merge)**
- **iterLimit 達 → 標 failed_iter_limit 但 worktree 留著,user 上去看 → 修 / 改 acceptance / 強制 done**

## 10. 第一刀(可立刻動手的最小 slice)

砍 §7 的「全集」,先做能跑的最小:

1. **Worktree 建立** (`server/lib/git/worktree.ts`):add / remove
2. **主 agent spawn + 基本 prompt** (`server/lib/runner/orchestrator.ts`):支援單條 ticket 跑、ticket status 更新走 Bash echo > json
3. **Run / pause endpoints**(基礎)
4. **Frontend 右上角按鈕 + polling**
5. **iter 迴圈先跳過,只先做 step mode**(iter 留下個 sprint)
6. **Transient retry 暫不做,直接 pause**(7b 留下個 sprint,等實測踩雷)

第一刀目標:**user 點「開始運行」→ 主 agent 跑一張 step ticket → 標 done → frontend polling 顯示完成**。Iter / 多 ticket / retry 等基本流程穩了再加。

## 11. 第二刀(已落地 2026-05-10)

第一刀跑出來最大空洞:**runner 跑完了,但畫面只看得到 status,看不到「過程中發生什麼」**。沒 iter 輪次明細、沒 commit、沒成本、沒 log。

### 做了什麼

1. **TicketDrawer**(新):點 board 上的 ticket card 開右側 600px drawer,顯示 goal / acceptance / prompt / iter 概況 / iter 輪次明細 / commits / liveLog / reason / pipeline 執行紀錄
2. **Runner 寫回 iter 明細**:RUNNER_BEHAVIOR_PROMPT 加 `ticket.iter.rounds[]` 寫入規範:每輪 append `{ n, startedAt, endedAt, executorSummary, criticVerdict("PASS"/"FAIL"/"PARTIAL"), criticFeedback }`,同步更新 `current` / `stage("doer"/"critic"/"done")` / `verdicts`
3. **Runner 自動 git commit**:每張 ticket done 後 → `git status` → 有改動就 `git add -A` + `git commit -m "ticket(<n>): <title>"` + `git rev-parse HEAD` → append 到 `ticket.commits[]`(`{hash, subject, ts}`)
4. **Run log API**:`GET /pipelines/:id/runs` 回所有 run summary(parse `.runtime/logs/<pid>-<ts>.log` 末尾 JSON 拆 cost/duration/turns/tokens/result/sessionId/exitCode);`GET /pipelines/:id/runs/:filename` 回單筆完整 detail(stdout / stderr 全文)
5. **RunHistory 元件**:drawer 內卡片式展開/收合,每張 run 顯示時間 / exit / 摘要 / duration / cost / turns / tokens
6. **Runner 工具白名單鬆綁**:Bash 加 `git add` / `git commit` / `git diff` / `git rev-parse`(僅限 ticket commit 流程),其他寫操作仍禁
7. **Polling 重寫**:原本 `[project, pipelines]` 雙依賴 + 條件 `pipelines.some(running)` → 切走 tab 被 `setInterval` throttle 卡舊狀態。改成只依賴 `project`、永遠跑 1.5s + visibilitychange / focus refetch。Notifs polling 同樣加 visibility/focus
8. **UI 防禦**:
   - `totalElapsed` 缺值 → default 0(原本 `undefined + tick = NaN`)
   - `current=0` mid-run → 顯示 max(1, current)
   - `stage` 不認的字面(runner 寫過 "executing")→ regex normalize 到 doer/critic/done
   - `verdicts` 接 `(1|0|-1)[]` 與 string `("PASS"/"FAIL"/...)` 雙格式
   - drawer IterRounds 的 verdict chip case-insensitive
9. **i18n**:iter labels 中文化(`doer→執行` / `critic→審核` / `verdicts→結果`)
10. **CommitRef + IterRound 型別**:加進 `src/types/pipeline.ts`,Ticket 加 optional `commits?: CommitRef[]`、IterState 加 optional `rounds?: IterRound[]`

### Real-run 自檢結果

reset test pipeline → 跑 → 結果:
- exit 0、cost $1.20、duration 3m47s、11 turns
- `ticket.iter.rounds[0]`:n=1, startedAt/endedAt, executorSummary 中文 363 字, criticVerdict="PASS"
- `ticket.iter.verdicts: ["PASS"]`、`current=1`、`stage="done"`
- `ticket.commits[0]`:hash `bf74aa84afb53af9346bb1ba6a7cb90da2299538`(7位 `bf74aa8`)、subject `ticket(1): Repo 健檢:tsc + ESLint 設置與修零`
- 實 git log 看得到 commit、worktree `git status --porcelain` = 0 行

### 還沒做(待第三刀)

- iter mode FAIL → 第二輪實測(這次 1 round PASS,失敗 retry 路徑沒驗)
- Transient retry 真正觸發測試
- 主 agent 寫的 startedAt/endedAt 看起來是估的(整千 ms),已收緊 prompt 要求 `Bash "date +%s%3N"` 抓真實值,要重跑驗
- 多 ticket 順序 + 中途 paused → 介入 → 繼續
- Worktree 位置最終決策(global vs target 內)

走完第一刀,我們有 phase 3 骨架。
