# pause-simplify pipeline 跑前 + 第一次 run 踩雷紀錄(2026-05-17)

跑 [pause-simplify](pause-simplify-2026-05-17.md) pipeline 前置 + 跑 t1/t2 時連續踩到的 robustness / UX bug 整理。獨立列,因為跟 pause-simplify 本身 spec 無關(spec 是「簡化 pause」,這些 bug 是 VP 自己各層的 robustness gap)。

8 個問題,3 已進 pause-simplify spec(B6/B7/B8),5 是新發現該另開 pipeline 修。

---

## B1【新】backend `createPipeline` 沒對缺欄位補預設

**症狀**:user 透過 `POST /api/projects/:hash/pipelines` 帶不全的 body(漏 `branch` / `state`),backend 照寫進磁碟。Frontend `Rail.tsx:99` 跑 `p.branch.replace(/^pipeline\//, "")` 撞 undefined → 整頁炸 + console TypeError + RailItem error boundary message。

**根因**:`server/routes/projects.ts:167` `createPipeline` handler 假設 caller 都帶齊欄位(UI CreateCard 會算 `branch = "pipeline/" + name`、vbpl pipeline create 也帶)。但 endpoint 是 public API,任何 caller 漏就直接寫壞 pipeline。

**修法**:handler 內 default:
- `branch ??= "pipeline/" + slugify(name)`
- `state ??= "planning"`
- `autoMerge ??= resolved.auto_merge`(已有,留)

**Acceptance**:`POST /api/projects/:hash/pipelines body={"name":"x"}` 寫出磁碟 pipeline.json 有 branch + state + autoMerge,frontend 不炸。

---

## B2【新】`vbpl ticket update --mode iter` 沒同步建 iter 結構

**症狀**:把 step ticket 改 mode=iter,只改 mode + iterLimit,**沒建 `iter: {current,verdicts,rounds}` 結構**。Resume 跑 → 主 agent 看到 `mode=iter` 但 `iter=undefined` → fallback 行為:把整個 ticket dump 寫回,但 dump 內容用 codex in-memory 舊版本(step) → mode 被寫回 step + iter 還是 undefined + status=done。

**根因**:`cli/commands/pipeline.ts` ticket update 命令只改傳入欄位,沒對「mode 變 iter 但缺 iter 結構」做 sanity init。

**修法**:
- vbpl `ticket update --mode iter`:若原 ticket 無 iter,自動建 `{current:0, verdicts:[], rounds:[]}`
- vbpl `ticket update --mode step`:若有 iter,可選 keep 或 clean(預設 keep,給 user 後悔餘地)
- (或在 backend savePipeline 統一處理 — 更穩,因為任何 caller 都覆蓋)

**Acceptance**:`vbpl ticket update --mode iter --ticket N` 之後 ticket 內 iter object 存在且結構合法。Resume 跑不撞 fallback bug。

---

## B3【新】主 agent 對 `mode=iter 且 iter=undefined` 的 fallback 不嚴謹

**症狀**:見 B2。主 agent resume paused iter (但 iter 結構缺) → 收尾蓋掉成 step。

**根因**:`server/lib/runner/runnerPrompt.ts` 主迴圈規則沒明寫「mode=iter ready/paused ticket 但 iter 結構缺 → 自己建空 iter + 從 round 1 init」。codex 主 agent 自己 improvise → 行為不可預期。

**修法**:runnerPrompt 補規則:
- 「跑 iter ticket 前,若 `ticket.iter` 不存在,先寫入 `{current:0, verdicts:[], rounds:[]}` 再進步驟 1」
- 「不准修改 ticket.mode」(strict 規則,主 agent 不該動 mode 欄位)

**Acceptance**:測試 case:預建 `mode=iter status=ready iter=undefined` ticket,跑完 ticket.mode 仍是 iter,ticket.iter 結構合法。

---

## B4【新】主 agent 動到還沒跑的 ticket 的 iter.stage

**症狀**:這次 run pipeline 跑 t1 時,**t3.iter.stage 被寫成 "critic"**(t3 還沒被 dispatch)。t3 也沒 commit、沒 rounds,只有 stage 被亂寫。

**根因**:**未確認**。猜測:codex 主 agent 用 PowerShell 寫 pipeline.json 時,某次操作影響到不該動的 ticket。可能 `$j.tickets | Where-Object n -eq N` 選錯,或 dump 整個 tickets[] 時用了舊 state。

**修法**:
- 先補 debug 紀錄看哪個 PowerShell command 寫了 t3
- 改 runnerPrompt strict:「**只准動當前 dispatch 的 ticket,不准動其他 ticket 的任何欄位**」
- backend savePipeline 加防護:detect 一輪 mutation 內動了多張 ticket 的 iter / status / commits → log warning

**Acceptance**:跑 N 張 pipeline 過程中,每張 ticket 只在自己被 dispatch 的時間段被改動。寫測試模擬。

---

## B5【新】FocusColumn frontend `isIter && ticket.iter` 顯示「執行中」誤判

**症狀**:我 reset pipeline 時預建 `iter: {current:0, stage:"doer", verdicts:[], rounds:[]}`,UI 顯示 7 張 ticket 全「執行中」。

**根因**:`src/features/pipeline/FocusColumn.tsx:1277-1330` 邏輯:`isIter && ticket.iter` 為真 → 進「in-progress」UI;`inProgress = current<limit && stage!=="done"` → 顯示 stage chip + iter row。**沒考慮「iter 物件存在但實際還沒跑(rounds=[])」這個中間態**。

**修法**(二選一):
- A. 改判定:`ticket.iter && ticket.iter.rounds.length > 0` 才算「跑過」,否則「還沒跑」(走 1331 branch)
- B. iter 物件 always 預建(由 backend savePipeline 補,iter ticket 一定有 iter 結構),frontend 改用 `ticket.status === 'ready'` 判「還沒跑」而非看 iter 物件

A 改 frontend 一處;B 改 backend + frontend 多處但 schema 一致性更好。建議 A 短期、B 長期。

**Acceptance**:`mode=iter status=ready` ticket (有或沒有 iter object) frontend 都顯示「未執行 / ready」chip,不顯示「執行中」row。

---

## B6【已進 pause-simplify spec t1】REPL 啟動 pipeline 按停止假裝成功

**狀態**:已寫進 [pause-simplify-2026-05-17.md](pause-simplify-2026-05-17.md) §t1 B 方案(`stopImmediate` 偵測無 entry → 拒絕 + 回 `repl_external` 錯誤)。

---

## B7【已進 pause-simplify spec 主軸】graceful pause 不穩

**狀態**:這就是 pause-simplify 主軸,全砍 graceful 留 immediate。

---

## B9【新,2026-05-17 19:30 補】backend orchestrator 對 runner child 非 0 exit 沒處理 → state 卡 running

**症狀**:vp-robustness-fix 第一次 run 撞 codex API `429 Too Many Requests`:
- log 顯 `exited code=1` + `{"type":"turn.failed","error":{"message":"exceeded retry limit, last status: 429 Too Many Requests"}}`
- 但 5 分鐘後 `vbpl pipeline status` 顯 `state=running`、ticket 全 ready 沒動、`running` map entry 沒清
- user 看 UI 沒任何錯誤訊號,以為還在跑

**根因**:`server/lib/runner/orchestrator.ts` runner child 的 exit handler 只在 normal exit(code=0)走收尾路徑,**非 0 exit / 主 agent 因 API error / quota / network 死掉**時:
- `running` map entry 沒清(或 ticketWatcher 沒 stop)
- pipeline.state 沒從 running 改 paused
- 該輪 ticket(若有)status 沒標 failed_transient
- 沒 emit pipeline_paused notif

**修法**:
- exit handler 加分支:`code !== 0` 或 stdout 含 `"turn.failed"` / `"thread.failed"` → 視同 transient error
- 寫 pipeline.state="paused" + ticket.status="failed_transient"(若該輪有 ticket 在 running) + emit `pipeline_paused` notif
- recoverStale 同 case 補:啟動時掃到 pipeline.state=running 但無 running map entry → 修成 paused + failed_transient

**Acceptance**:
- 模擬 runner child 非 0 exit(mock 或 inject `kill -9` 模擬 crash):pipeline.state 自動變 paused
- codex 429 / claude quota / network drop 三類 transient error 各一個 e2e case 驗
- recoverStale 啟動掃到 stale running pipeline 自動修

---

## B8【舊發現,**沒**進 spec】runLog.ts parser 只認 claude 格式

**症狀**:codex provider 跑的 pipeline,RunHistory drawer 看到 `costUsd / numTurns / sessionId / usage` 全 null/0。log 檔本身完整,只是 parser 不認 codex JSONL schema。

**根因**:`server/lib/runner/runLog.ts:111-145` `parseFullLog` 寫死認 claude CLI 格式(`total_cost_usd / num_turns / session_id / usage.{input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens}`)。codex 是不同 schema:`{type:"turn.completed", usage:{input_tokens, cached_input_tokens, output_tokens, reasoning_output_tokens}}` + `thread_id` 不是 `session_id`。

**修法**:`parseFullLog` 加 codex 分支(偵測第一行是 `thread.started` → 走 codex 解析路徑)。map:
- `thread_id` → sessionId
- `turn.completed.usage.input_tokens` → usage.input
- `turn.completed.usage.cached_input_tokens` → usage.cacheRead
- `turn.completed.usage.output_tokens` → usage.output
- `turn.completed.usage.reasoning_output_tokens` → 新欄位 `reasoning`(shared/types.ts UsageDelta 加)
- numTurns:數 `turn.started` event
- costUsd:codex 沒提供 token-to-USD,只能算 turn-level 或留 null
- duration:從 first `thread.started` ts → last log line ts

**Acceptance**:codex 跑的 pipeline RunHistory drawer 顯示 sessionId / numTurns / usage(input/output/cacheRead/reasoning);costUsd 若 codex 沒提供,UI 顯「—」不是 "$0"。

---

## 建議 ticket 拆分(若開新 pipeline 修)

| # | Bug | Mode | iterLimit |
|---|---|---|---|
| 1 | B1 createPipeline 補預設 | iter | 2 |
| 2 | B2 vbpl ticket update --mode iter 自動建 iter | iter | 2 |
| 3 | B3 runnerPrompt 補「iter 結構自建 + 不准動 mode」 + B4 「只准動當前 ticket」 strict 規則 | iter | 2 |
| 4 | B5 FocusColumn「ready iter 不顯示執行中」(走方案 A 短期) | iter | 2 |
| 5 | B8 runLog.ts 加 codex 格式 parser | iter | 2 |
| 6 | 全套自檢 + grep 確認 | iter | 2 |

B3+B4 合張因為都改 runnerPrompt,改完一起驗。B6/B7 不另開 ticket(已在 pause-simplify 跑)。

跑這條建議在 pause-simplify **跑完之後**(避免改 server code 同時 backend code 變動撞 race),除非 user 明確要並行。

## 注意事項

- 本次 run 連續踩 5 個新發現 bug,**設計層面值得 review**:很多狀態 mutation 沒 schema-level invariant(backend / cli / frontend 各自做 partial init / partial 解讀)。Phase 6 候選可考慮:**pipeline.json / ticket 物件加 schema 驗證**(寫入前 zod / typebox 過一次),不准 partial state 寫進磁碟
- 若 B3 + B4 落地強化 runnerPrompt,要小心 codex 主 agent 對 strict 規則的遵守度(本來就有漂移問題)— 可能要搭配 backend savePipeline 加「防護寫入」(reject 非預期 mutation pattern)
