# Pipeline state × condition → UI behavior matrix

**目的**:authoritative spec,寫死「pipeline 在某 state 時各 button / banner 應該長什麼樣子」。改 button 邏輯前對這份 doc;改完後到 `/dev/states` 視覺驗。

**物理檔位**:本檔(改 spec)、[StatesGallery.tsx](../../../src/features/dev/StatesGallery.tsx)(視覺實作)、[FocusColumn.tsx](../../../src/features/pipeline/FocusColumn.tsx) `RunButton` switch(實際邏輯,有 TS exhaustive `never` check)。

---

## RunButton(右上角主操作按鈕)

| pipeline.state | noTickets | label                         | className     | disabled | onClick   |
| -------------- | --------- | ----------------------------- | ------------- | -------- | --------- |
| planning       | true      | 無ticket可執行                | btn           | ✓        | —         |
| planning       | false     | ▶ 開始運行 (~lastDur)         | btn-primary   | ✗        | onRun     |
| paused         | true      | 無ticket可執行                | btn           | ✓        | —         |
| paused         | false     | ▶ 繼續 (~lastDur)             | btn-primary   | ✗        | onRun     |
| failed         | true      | 無ticket可執行                | btn           | ✓        | —         |
| failed         | false     | ▶ 重試 (~lastDur)             | btn-primary   | ✗        | onRun     |
| running        | n/a       | ⏹ 停止                        | btn-danger    | ✗        | onPause   |
| ready          | n/a       | ✓ 全部完成                    | btn           | ✓        | —         |
| merged         | n/a       | ✓ 已合併                      | btn           | ✓        | —         |

注意:
- `lastDur` = 上次 run 的 duration(若 `lastRun.durationMs` 有值才秀)
- noTickets disabled 用 `btn`(ghost-ish);可 run 用 `btn-primary` 顯眼
- 加新 PipelineState 必須在 RunButton switch 補一 case + 改本 doc + 改 [StatesGallery.tsx](../../../src/features/dev/StatesGallery.tsx) RUN_BUTTON_CASES,否則 TS exhaustive `never` 會編譯失敗

---

## ReadyBanner(allDone 才出現)

顯示條件:`done === total && pipeline.state === "ready"`(state=merged 不顯示,merged 走 ✓ 已合併 button)

| 條件                    | banner-desc 文字                         | View diff button | Merge button     |
| ----------------------- | ---------------------------------------- | ---------------- | ---------------- |
| onRevealWorktree 有     | `{branch} → {base} · N commit(s)`        | active           | 條件式           |
| onMerge 有              | 同上                                     | 條件式           | active(主要 CTA)|
| 兩個都有(常態)         | 同上                                     | active           | active           |
| 兩個都沒(BoardScreen 沒接) | 同上                                  | 不顯示           | 不顯示           |

---

## TicketCard StatusPill(每張 ticket 的狀態 chip)

由 `STATE_COLOR` / `STATE_LABEL` 兩個 Record 驅動(在 [data/pipelines.ts](../../../src/data/pipelines.ts))。

| ticket.status        | color           | label              |
| -------------------- | --------------- | ------------------ |
| draft                | --draft         | draft              |
| ready                | (沒在 STATE_COLOR map) | (沒) — **bug**:看 [data/pipelines.ts](../../../src/data/pipelines.ts) STATE_COLOR 是否補全 ticket statuses |
| running              | --running       | running            |
| paused               | --paused        | paused             |
| done                 | --done          | done               |
| failed               | --failed        | failed             |
| failed_iter_limit    | --failed        | iter 上限          |
| failed_transient     | --failed        | transient 失敗     |

注意:`STATE_COLOR` / `STATE_LABEL` 同時對 pipeline.state(planning / running / queued / paused / ready / failed / merged)和 ticket.status 兩種 enum 服務 — key 撞時要小心。

---

## OverflowMenu items(`⋯` 按鈕展開)

| item        | 顯示條件                                            | disabled 條件                              |
| ----------- | --------------------------------------------------- | ------------------------------------------ |
| 開啟 worktree | `onRevealWorktree` 有                               | (無)                                       |
| 重跑全部     | `onResetAll` 有 + `hasResettable`(有 done/failed_*)| `lockedByState`(running / queued)          |
| 刪除 pipeline | `onDelete` 有                                       | `lockedByState`                            |

`hasResettable` = `tickets.some(t.status ∈ {done, failed, failed_iter_limit, failed_transient})`

---

## 加新 state 的 SOP

加 PipelineState 或 TicketStatus 時的 checklist:
1. **`src/types/pipeline.ts`** 加進 union type
2. **`src/data/pipelines.ts`** 補 `STATE_COLOR` + `STATE_LABEL`
3. **`src/features/pipeline/FocusColumn.tsx`** `RunButton` switch 補 case(TS exhaustive 會逼你)
4. **`src/features/dev/StatesGallery.tsx`** `RUN_BUTTON_CASES` / `READY_BANNER_CASES` 加 fixture
5. **本 doc** 補表
6. 跑 `bunx tsc --noEmit`、訪 `/dev/states` 視覺確認

漏 step 4 跟 5 不會 break,但下次找 bug 會繞遠路。step 1-3 漏會編譯失敗或視覺破。
