# Sync 重構(Plan C)— 2026-05-13

把 pipeline worktree 跟 base branch 對齊的功能(sync)從「append synthetic ticket 走 runner」拆成「pipeline-level state + git-first → 衝突才 AI」。

## 動機 — 為什麼不再寄生 ticket

舊設計(phase 3-4):

```
user 點同步
  → appendSyncTicket(mode="sync", status="ready") append 到 pipeline.tickets[]
  → orchestrator.start(pipeline) → runner 主 agent 抓第一個可跑 ticket
  → 派 sub-agent 跑 syncTicketPrompt(rebase + 衝突解 + 驗證)
```

踩到的問題(2026-05-12 self-dogfood 撞到):

1. **runner 不一定先跑 sync** — 主 agent 從前往後找第一個可跑 ticket。前面若有 `paused` / `ready` ticket(很常見),sync ticket 排在 N 號被蓋住,user 按「同步」啟動的卻是別張 ticket → 同步意圖被劫持。
2. **synthetic ticket 污染 timeline** — `tickets[]` 該是 user 視角的工作清單,塞 mode=sync 進去 user 心智不一致(「我何時加過這張?」)。
3. **沒有衝突使用者知情同意關卡** — base 跟 worktree 平行修改撞到時,AI 直接代解,user 在不知情況下被燒 token + 拿到別人的解法。**有衝突應該停下來問 user**。
4. **AI 用 rebase 大量 replay** — 為了讓 worktree 不留 merge commit,舊 syncTicketPrompt 用 `git rebase` 把 branch 上的 ticket commits 全 replay 一次,hash 都變;成本高 + 邊界 case 多(rebase --skip / --abort / hash remap)。

## Plan C — 直接 git merge,衝突才 AI

設計三條:

1. **pipeline-level state**:`Pipeline.syncJob: SyncJob` 寄生欄位(不在 `tickets[]` 內),純 metadata + 狀態機。
2. **git-first**:backend 直接 `git merge --no-ff <baseBranch>`,90% 情況沒衝突就毫秒級 done。
3. **衝突→ user 決定**:有衝突就停在 `conflict_await`,UI 彈 modal 給 user「讓 AI 解」/「跳過 abort merge」。確認後才 spawn AI。

## State machine

```
                  ┌──────────────────────────────────────────┐
                  │  idle (or syncJob undefined)             │
                  └──────────────────────────────────────────┘
                       │ user 點「同步」
                       ▼
                  ┌──────────────────────────────────────────┐
                  │  merging                                 │
                  │  (backend 跑 git merge --no-ff,<1s)     │
                  └──────────────────────────────────────────┘
                  │ merge clean / FF        │ 衝突
                  ▼                         ▼
              ┌─────────┐         ┌──────────────────┐
              │  done   │         │  conflict_await  │
              │ (顯示後  │         │  (UI 跳 modal)   │
              │  user 點 │         └──────────────────┘
              │   ✕ 關)  │         │ user「讓 AI 解」 │ user「跳過」
              └─────────┘         ▼                 ▼
                    │       ┌──────────────┐    ┌────────────┐
                    │       │  ai_running  │    │   failed   │
                    │       │ (spawn AI    │    │ (abort      │
                    │       │  解衝突)     │    │  merge)    │
                    │       └──────────────┘    └────────────┘
                    │       │ git ground-truth check
                    │       ▼ (MERGE_HEAD 消失+無 conflict markers+behindCount=0)
                    │  ┌─────────┐ 否     ┌────────┐
                    │  │  done   │  ←──── │ failed │
                    │  └─────────┘        └────────┘
                    │                           │
                    └──── dismiss ──────────────┘ → syncJob 清掉,回 idle
```

`SyncJob` 型別見 `shared/types.ts`:

```ts
export type SyncJobState = "merging" | "conflict_await" | "ai_running" | "failed" | "done";
export type SyncJob = {
  state: SyncJobState;
  startedAt: number;
  endedAt?: number;
  behindCount: number;
  conflictFiles?: string[];      // conflict_await / failed 用
  aiPid?: number;                 // ai_running:給 watchdog / cancel
  liveLog?: string;
  reason?: string;                // failed 時填
  mergeCommit?: { hash, subject, ts };  // done 時填
};
```

## Endpoints

| Method | Path | 行為 |
|---|---|---|
| POST | `/sync` | 啟動 sync。試 git merge。回 `{state, behind, conflictFiles?}` |
| POST | `/sync/ai` | conflict_await 階段 user 確認 → spawn AI 解 |
| POST | `/sync/cancel` | 取消(任 active 狀態都吃)。kill AI(若有)+ `git merge --abort` + 標 failed |
| POST | `/sync/dismiss` | 收尾 done/failed → 把 `syncJob` 從 pipeline.json 拿掉 |
| GET | `/sync-status` | 只回 `behind` 數(legacy,fallback「落後 N · 同步」按鈕用) |

## AI 衝突解 prompt(`syncAiPrompt.ts`)

跟舊 `syncTicketPrompt` 不同 — **不負責跑 git merge / rebase**(backend 已啟動),AI 工作:

1. 讀每個衝突檔(在 `worktreePath`)
2. Edit 解衝突 markers
3. `git -C <wt> add <file>`
4. 全解完 `git -C <wt> commit --no-edit`(沿用 git 自動 merge commit message)
5. 跑 tsc 驗證(若有)
6. 回應 `PASS\nSYNC_DONE` 或 `FAIL\n<reason>`

## 關鍵雷:成功判定用 git 狀態,不用 AI stdout

第一版判 isPass 用 `stdout.split("\n")[0].startsWith("PASS")` — 撞坑:AI 常把 PASS 寫在中段(`tsc passed.\n\nPASS\nSYNC_DONE`),firstLine 不以 PASS 開頭就誤判失敗,然後 backend 跑 `git merge --abort`(此時 merge 已 commit,abort 是 no-op),最終**worktree 已同步但 UI 顯失敗**。

修正:`syncJob.ts:waitAndFinish` 完全不靠 AI 字串,直接 git ground truth:

```ts
const hasConflictMarkers = git status --porcelain 含 UU/AA/DD/AU/UA/DU/UD
const mergeHeadExists = fs.existsSync(.git/MERGE_HEAD)
const behindAfter = git rev-list --count HEAD..baseBranch

const isPass = !hasConflictMarkers && !mergeHeadExists && behindAfter === 0;
```

三條都成立 → 視為成功,worktree 是 source of truth。失敗時 reason 也 git-derived,不再貼 AI raw stdout。

## RunningProcess.kind:ticket vs sync

`orchestrator.ts` 的 `running: Map<key, RunningProcess>` 加 `kind: "ticket" | "sync"`。共用 map 讓:
- `isRunning(hash, id)` 自動擋掉「同步中又按 /run」等衝突操作
- `runningCount` / max_parallel slot 一致計算
- watchdog 同迴圈處理兩種,死法不同 recovery 不同:
  - `kind="ticket"` 死 → 寫 pipeline.state="paused"
  - `kind="sync"` 死 → `git merge --abort` + `syncJob.state="failed"`

`syncJob.ts` 透過 exposed helper `orchestrator.registerSyncRunning(...)` / `unregisterRunning(...)` 註冊。

## Server boot recovery

`server/index.ts` 啟動時 per project 跑:
- `orchestrator.recoverStale(path)` — 收 ticket runner stale
- `syncJob.recoverStaleSync(path)` — 收 sync 殘餘:`state="merging"|"ai_running"` 表示 server 重啟前 sync 在跑,proc 已蒸發 → `git merge --abort` + 標 failed + reason="server 重啟,sync AI 蒸發"

## Frontend(`SyncStatusBar` + `SyncConflictModal`)

`FocusColumn.tsx` 內兩個 component。Pipeline header 同步按鈕區域依 `pipeline.syncJob.state` 渲染五種 chip:

| state | 視覺 |
|---|---|
| `undefined` + `behind > 0` | 「落後 N · 同步」按鈕(legacy fallback,沒 syncJob 時) |
| `merging` | spinner +「同步中… git merge」(disabled) |
| `conflict_await` | accent 邊 chip「遇衝突(N 檔)」+ ✓ AI 解 / ✕ 跳過 icon button + 同時 portal 彈 modal 強提示 |
| `ai_running` | spinner +「AI 解衝突 · <elapsed>」+ ✕ 取消 |
| `failed` | failed 色「同步失敗」+ ↻ 重試 / ✕ 關 |
| `done` | done 色「已同步」+ ✕ 關 |

action buttons 22x22 icon-only(RefreshIcon / CloseIcon / CheckIconSm),fit chip-style 不破壞 head 行高。

**`syncActive`** flag(`syncJob.state ∈ {merging, conflict_await, ai_running}`)鎖 `RunButton` / OverflowMenu lockedByState 維度,避免 user 在 sync 進行時按「繼續」起 runner 撞 worktree。

## Modal portal 慣例

`SyncConflictModal` 用 `createPortal` 渲染到 `document.body`,逃 `.focus-head` 的 transform / overflow 鎖。`.modal-backdrop` `position: fixed; z-index: 1000`,`.modal-card` 內含 title / body / actions。同套樣式給 `SyncConflictModal` / `TopBar` 手動路徑 modal / 將來其他 dialog。

## Migration:歷史 mode=sync ticket

砍法保守 — `TicketMode "sync"` enum 值**沒從 `shared/types.ts` 拿掉**(歷史 pipeline.json 已落地的 sync ticket 還在資料裡)。改動:

- `pipelineDir.ts` 刪 `appendSyncTicket` function(沒人呼了)
- `runner/syncTicketPrompt.ts` 整檔刪
- `runner/runnerPrompt.ts` 砍 `mode='sync'` 區塊(110 行 rebase + hash remap 流程)
- `FocusColumn.tsx` 渲染時 `.filter(t => t.mode !== 'sync')`,歷史 sync ticket 不顯
- `qa.ts` 內 `t.mode === 'sync'` 防呆 guard **保留**(歷史 sync ticket 仍可能被 user 誤點編輯)

新建 pipeline 不會再生 mode=sync ticket。Merged pipelines 內歷史 ticket 純存檔。

## 留下的事

- e2e mock `sync-ticket.spec.ts` 已對齊新 contract(走 syncJob endpoints 不是舊 ticket 路徑)
- iOS PWA push 真實機測未做(unrelated)
- `--setting-sources` 還沒砍(留給 Task sub-agent 讀 user/project CLAUDE.md;若日後改 sub-agent prompt 全 push 進 prompt 可拿 ~13% cache 改善)
