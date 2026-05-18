# Pause 簡化:graceful 全拔,只留「停止」(2026-05-17)

## 為什麼

graceful pause(`state=stopping` → 主 agent 跑完當前 ticket 自己看到 → 標 paused 退出)實測**不穩**:

- codex 主 agent 不保證每輪迴圈 re-read pipeline.json,t3 收尾後沒看 state 就 dispatch t4 → t4 又跑完才停(2026-05-17 repl-test-2 實測)
- claude 主 agent 也仰賴 prompt 自律,非 backend 強制
- 體感「按了沒反應」(實際是延遲 1-2 張 ticket 才停)

決定:**全砍 graceful 路徑**,UI / API / CLI 只留 immediate(SIGKILL + 同步寫 paused)。語意上 = 「停止」,不再叫「暫停」。

## Out of scope

- 不改 ticket 狀態語意(running ticket 仍被標 paused)
- 不動 sync / merge / queue 流程的 state guard(只是 stopping 這個值消失,其他 transitional state 不動)
- 不做 migration script(recoverStale 已會把殘留 stopping 自動修成 paused)

## 影響面 grep 結果

backend / frontend / cli / e2e / docs 共 16 個檔有 `stopping` 出現(`docs/refs/` 歷史 ref 不在內,不動):

```
server/lib/runner/orchestrator.ts        14 處  ← 主要邏輯
server/routes/projects.ts                 5 處  ← API handler
server/index.ts                           1 處  ← route comment
server/lib/runner/runnerPrompt.ts         3 處  ← 主 agent 行為 prompt
src/features/pipeline/FocusColumn.tsx    10 處  ← 雙按鈕 UI
src/features/pipeline/BoardScreen.tsx     3 處
src/features/dev/StatesGallery.tsx        1 處
src/data/pipelines.ts                     2 處
src/shell/Rail.tsx                        1 處
src/api/projects.ts                       ── (mode 參數)
shared/types.ts                           1 處  ← PipelineState union
cli/commands/pipeline.ts                  3 處  ← pause cmd + --immediate flag
README.md                                 1 處
.claude/skills/vibe-pipeline-backend/SKILL.md  1 處
.claude/skills/vibe-pipeline-e2e/SKILL.md      2 處
docs/refs/state-matrix-2026-05-10.md      3 處  ← 拔 stopping 列
```

## Ticket 拆分(建議 4 張 step + 1 張 iter 驗收)

### t1 (step):backend 拔 graceful 路徑 + REPL 模式偵測

**Goal**:`pausePipeline` handler 只跑 immediate,移除 `orchestrator.stop()`,`state="stopping"` 從 PipelineState union 拔掉。**REPL 啟動的 pipeline(`running` map 無 entry)按停止 → 拒絕 + 回 warning**(不假裝停了,B 方案)。

**改動**:
- `server/routes/projects.ts:pausePipeline`:刪 body.mode 解析、刪 graceful 分支,固定走 stopImmediate(queued 仍走 cancelQueued)。回傳改 `{ok:true}`(不再回 mode)
- `server/lib/runner/orchestrator.ts`:刪 `stop()` 函式(stopImmediate 保留)。`stopImmediate` 內的 state guard 從 `running/stopping` 改成只 `running`
- **`server/lib/runner/orchestrator.ts:stopImmediate`:加 REPL 偵測** — `running.get(k)` 無 entry 時 **不**寫 paused、回 `{ok:false, error:"此 pipeline 由 REPL 啟動,backend 無對應 process。請至 REPL 視窗結束 (Ctrl+C / 關視窗)", code:"repl_external"}`。對應 handler 回 409 + 該訊息
- `shared/types.ts`:`PipelineState` union 拔 `"stopping"`;`ApiErrorCode` 加 `"repl_external"`
- 其他 server 端引用 stopping 的地方(`pipelineDir.ts` / `pipelineMerge.ts` / `runnerPrompt.ts`)— 凡是 state guard / read check 含 stopping 的條件全拔
- `server/lib/runner/runnerPrompt.ts`:主迴圈步驟 2 拔 stopping 分支
- `server/index.ts:168` route comment 改
- **`docs/repl-runner.md`** 加段落:「user 要中斷 → 直接關 REPL 視窗 / Ctrl+C,**不要**按 UI 停止」+ 解釋 backend 偵測不到 REPL agent 會回 `repl_external` 錯誤

**Acceptance**:
- `bunx tsc --noEmit` 通過
- `grep -rn "stopping" server/ shared/` 0 hit(歷史 docs/refs 除外)
- `POST .../pause` 對 backend-runner pipeline:不帶 body 也 work,SIGKILL + 寫 state=paused
- `POST .../pause` 對 REPL-runner pipeline:回 409 + `repl_external` code + 中文訊息
- `recoverStale` 仍能把磁碟上殘留 stopping pipeline 修成 paused(舊資料相容)
- `docs/repl-runner.md` 內有 REPL 模式中斷方法說明

### t2 (step):frontend 拔雙按鈕、改文字「停止」

**Goal**:UI 移除 graceful 按鈕,只留「停止」單按鈕,api 簽名拔 mode 參數。

**改動**:
- `src/api/projects.ts`:`pausePipeline()` 拔 mode 參數,POST 不帶 body
- `src/features/pipeline/FocusColumn.tsx`:雙按鈕變單按鈕,文字「停止」(不是「暫停」),色用原 immediate 那顆的 danger 色
- `src/features/pipeline/BoardScreen.tsx`:`stopMode` 解析簡化(完全拔,直接呼 `pausePipeline(id)`)
- `src/features/pipeline/focus.css`:刪 graceful/immediate 雙按鈕並排樣式,單按鈕 fall back
- `src/features/dev/StatesGallery.tsx`:刪 stopping 狀態 demo
- `src/data/pipelines.ts`、`src/shell/Rail.tsx`、`src/features/pipeline/TicketDrawer.tsx`:任何 stopping 視覺處理(chip / banner / 文字「停止中」)全拔
- 用詞統一:UI 文字、tooltip、aria-label 全改「停止」/「Stop」,不再叫 pause

**Acceptance**:
- `bunx tsc --noEmit` 通過
- `grep -rn "stopping\|graceful" src/` 0 hit
- 手測:按「停止」→ runner child SIGKILL + UI 立刻顯示 paused(沒中介「停止中」狀態)
- `/dev/states` gallery 無 stopping 卡

### t3 (step):CLI `vbpl pipeline stop` 拔 `--immediate` flag

**Goal**:`vbpl pipeline stop`(**本來就叫 stop,不是 pause**)拔 `--immediate` flag,行為固定 immediate。內部變數 / 註解若還叫 pause 改成 stop。

**改動**:
- `cli/commands/pipeline.ts`:stop cmd 拔 `--immediate` flag 解析,POST 不帶 body
- 輸出文字改:`{ stopped: true, pipelineId: id }`(不再有 mode field)
- help / usage 文字同步,移除 `[--immediate]` 標示
- 內部變數 / 註解若還叫 pause 改成 stop

**Acceptance**:
- `bunx tsc --noEmit` 通過
- `vbpl pipeline stop <id>` 立即砍 runner + 寫 paused
- `vbpl pipeline stop --immediate <id>` 報 unknown flag 或忽略
- `grep -rn "graceful" cli/` 0 hit

### t4 (step):e2e 測試 + state-matrix ref 更新

**Goal**:既有 pause 測試適配 immediate 行為、**補新測試 case** 確保 immediate 真的不等 ticket 收尾、state-matrix ref 拔 stopping 列。

**改動 — 既有測試 update**:
- `tests/e2e/mock/runner-flow.spec.ts:98` 「Pause running → state 變 paused」:assertion 改成「按停止後立即 paused,不論 ticket 在哪段」(原本可能等 `pauseAfterTicketIndex`)
- `tests/e2e/helpers/mock-control.ts`:`pauseAfterTicketIndex` 如果只 graceful 用,拔掉。其他 spec 任何 stopping 中介斷言改 immediate
- 跑 `bun run test:e2e` 全綠

**改動 — 新測試 case(必加)**:
- `tests/e2e/mock/runner-flow.spec.ts` 加 case:**「ticket 跑中段按停止 → ticket 直接標 paused」**(不是等該 ticket 收尾)— 驗證 SIGKILL 真的中斷,不再有 graceful 延遲
- 加 case:**「按停止 → pipeline.state 從 running 直接到 paused,不經 stopping」**(grep API response / poll state 確認無 stopping 中介值露出)
- 加 case(可選):CLI smoke — `vbpl pipeline stop <id>` 呼 backend,state 變 paused(若 cli 在 e2e harness 內可呼)

**改動 — ref / SKILL**:
- `.claude/skills/vibe-pipeline-e2e/SKILL.md`:覆蓋矩陣 graceful 列拔 / 改成 immediate 描述,加新測試 case 進矩陣
- `docs/refs/state-matrix-2026-05-10.md`:state column 拔 stopping;running 的「按停止」action 結果直接寫 paused

**Acceptance**:
- `bun run test:e2e` 全綠(含新 case)
- 新增至少 2 個 case(中段停止 + 無 stopping 中介)
- `grep -rn "stopping\|graceful" tests/e2e/` 0 hit
- state-matrix.md 內無 stopping 行
- e2e SKILL 覆蓋矩陣已反映 immediate-only

### t5 (step):docs / SKILL / CLAUDE.md 同步

**Goal**:對外文件 + maintainer SKILL 全部反映新行為。

**改動**:
- `CLAUDE.md`「不踩的雷」加一項:graceful pause 拔掉的理由 + 何時還會看到殘留 stopping(recoverStale 自動修)
- `CLAUDE.md`「架構決策」段如有提 graceful 也拔
- `docs/SKILL.md`(distributable)+ `AGENTS.md`:pause / stop 描述同步
- `.claude/skills/vibe-pipeline-backend/SKILL.md` 內 pause 相關段更新
- `README.md` 若有「按暫停」描述改「按停止」
- `docs/refs/sync-redesign-2026-05-13.md`:檢查 sync state guard 是否依賴 stopping,若有附 note 標已拔

**Acceptance**:
- `grep -rn "stopping\|graceful" CLAUDE.md AGENTS.md docs/SKILL.md README.md .claude/skills/` 0 hit(除歷史 ref 註腳)
- `docs/CHANGELOG.md` 加一條 2026-05-17 「pause 簡化」記錄

### t6 (iter,iterLimit=2):全套自檢

**Goal**:跑完上面 5 張後,做 end-to-end 驗證,catch 漏網之魚。

**Prompt**(executor):跑 `bunx tsc --noEmit`、`bun run lint`、`bun run test:e2e`,然後 grep 全 repo `stopping` / `graceful` 確認只剩 `docs/refs/archive/`、`docs/refs/integration-plan-v3-runner-*` 等歷史 ref 內有(不動),其他乾淨。若有殘留報出來補修。

**Acceptance**(critic 驗):
- tsc / lint / e2e 全綠
- `grep -rn "stopping\|graceful" --exclude-dir=node_modules --exclude-dir=archive .` 只有歷史 ref 命中
- 手測描述:UI 按「停止」→ 立即 paused、CLI 同效、無 stopping 中介狀態漏出

## 設計確認(動工前對齊)

- ✅ 全砍 graceful(user 已確認,「規劃後送 VP,直接用停止,暫停拔掉」)
- ✅ `vbpl pipeline pause` **改名 `stop`,`pause` 直接砸**(VP 還沒發布,不留 alias)
- ✅ frontend 按鈕文字「停止」;icon 留 t2 內 user 看 PR 時調(stop-square 或 X)
- ✅ recoverStale 內針對殘留 stopping 的 path:保留處理(向後相容磁碟舊資料)。已自動 → paused,無需 migration script

## 風險

- self-dogfood 跑這條 pipeline 時 user 若按「停止」會把跑這條的 codex 主 agent 砍掉 → 中途停在某 ticket。recoverStale 會把該 ticket 標 paused,worktree 進度保留,user 按繼續可接(critic 階段不重派 executor)
- t1 改 `shared/types.ts` PipelineState union 後,t2 frontend 沒同步前 tsc 會炸 — 必須 t1+t2 同一個 worktree branch 一起 ship(或 t1 暫留 stopping 在 union、t2 拔)。建議 t1 + t2 之間不分開 branch
- e2e mock 內若 fixture pipeline.json 寫死 state="stopping",t4 同時要清
