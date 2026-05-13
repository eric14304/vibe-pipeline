---
name: vibe-pipeline-backend
description: vibe-pipeline 後端 / 執行層規格與計畫 — Phase 1-5 全套(Project/Pipeline CRUD + QA + Runner + Worktree + Merge/Sync + Auto + Tailscale + TOTP auth + FCM + cross-provider sub-agent) 已落地。本 SKILL 是 spec 索引與架構記憶。SQLite log、budget tracker、`vbpl` CLI、SKILL 蒸餾 之前先讀。
---

## 現況(2026-05-11,Phase 1-5 已落地)

> 完整 phase 落地清單 / 後續打磨細節 → [`CLAUDE.md`](../../../CLAUDE.md)。本段只列「**改 backend 時要意識到的新模組**」。

### Phase 5 後 backend 多了五大模組

**`server/lib/auth/`** — TOTP 雙重驗證
- `storage.ts` 讀寫 `~/.vibe-pipeline/auth.json`(totp_secret_hash + sessions[])
- `middleware.ts` `authGuard()` — loopback bypass(127.0.0.1 / ::1 永遠過)+ bypass paths(setup/login/status)+ cookie validate → redirect /setup or /login
- `cookie.ts` `parseCookie` / `findSession` / `vp_auth`(HttpOnly + SameSite=Strict + 7d)
- `pending.ts` in-memory setup_token map(setup-init → setup-verify 5min 過期)
- `routes/auth.ts` `/api/auth/{status,setup-init,setup-verify,login,logout,sessions,reset}`

**`server/lib/push/` + `server/lib/fcm/`** — FCM Web Push
- `tokenStore.ts` 讀寫 `~/.vibe-pipeline/push-tokens.json`(register / list / removeDead)
- `fcm/index.ts` firebase-admin init + `fanoutPush(tokens, payload)` + 死 token 偵測
- `routes/push.ts` `/api/push/{config,register,unregister,tokens,test}`
- `ticketWatcher.ts` 在 ticket 狀態變化時 fanout 給所有 device tokens

**`server/lib/cli/`** — Provider 抽象(claude / codex)
- `adapter.ts` `CliAdapter` 介面 + `QASpawnOpts` / `RunnerSpawnOpts`(`needsBypassPermissions` 開關)/ `SplitSpawnOpts`
- `claudeAdapter.ts` spawn claude CLI(perf flags + 跨 provider 時加 `--dangerously-skip-permissions`)
- `codexAdapter.ts` spawn codex CLI(`-c model="..."` config override / sandbox 模式 / JSONL parse)
- `index.ts` `getAdapter(taskClass, provider)` factory
- 跨 provider sub-agent(2026-05 砍 plugin path):主 agent **永遠帶** `--dangerously-skip-permissions`,codex sub-agent 改 Bash 直呼 `codex exec --json ...`(不再經 codex-rescue plugin 那層 workspace-write sandbox)

**`server/lib/userConfig.ts` + `routes/userConfig.ts`** — 跨 project user config
- `~/.vibe-pipeline/config.json`(per-task-class qa/split/runner/**executor**/**critic**/merge → provider/model/effort)
- 2026-05-13:`subAgent` 拆成 `executor`(改 code,高 capability)+ `critic`(判 PASS/FAIL,可用便宜 model)。`coerceConfig` 自動把舊 `subAgent` key migrate 進 executor,critic 走 default
- `getTaskConfig(tc)` 給 spawn 點用;`patchUserConfig()` PUT 白名單 + provider/model/effort 三欄獨立驗

**`server/lib/runner/runnerPrompt.ts`** — RUNNER prompt
- 主迴圈第 3 步:**顯式 status 分支表**(failed_transient / failed / failed_iter_limit → 立刻暫停 pipeline + 結束 session)
- ticket commit:**`git commit -F <tmpfile>` 多段 message**(Goal / Acceptance / executor summary + verdict 鏈),不再 `-m "...\n..."` 字面 \n
- provider-aware dispatch:claude → Task tool(in-process);codex → Bash 直呼 codex CLI(避開 plugin sandbox)
- `dispatchInstructions` 拆三段(執行AI write / 審核AI read-only / merge write),codex 派審核時 `-s read-only`

**`server/lib/pipelineMerge.ts:autoMergeNoAI()`**(2026-05-13 新)— Merge 二段式(auto + manual 都走)
- 第 1 段:`autoMergeNoAI` 純 git CLI(checkout base + `git merge --no-ff`)
  - clean → 寫 pipeline.mergeCommit + state=merged + emit `pipeline_merged`,毫秒級
  - conflict → `git merge --abort` 後回 reason="conflict" 給 caller
  - dirty / git_error → 對應 reason 標籤
- 第 2 段:`orchestrator.maybeAutoMerge` 看 reason 分流(auto-merge 用)
  - conflict → **自動升級** call `triggerMerge`(spawn AI 全套),emit `pipeline_auto_merge_started` notif **+ FCM push「🤖 X AI 接手解衝突」**(user 不在 UI 也收得到,autoMerge 場景核心情境)
  - dirty / git_error / not_found / running → 不適合 AI 自動解,emit `merge_blocked` 等 user
- 心智:autoMerge=true 是「全自動」承諾;clean case ~90% 秒結束,conflict case 跟過去一樣慢(1-3min)但無人值守 + 自動通知
- **`mergePipeline` route(manual 也走二段式,2026-05-13 對稱化)**:user 點「合併」按鈕走 POST `/merge` → 一樣 autoMergeNoAI → conflict 才 fallback triggerMerge。response 加 `mode: "mechanical" | "ai"` discriminator,CLI / Web UI handler 看 mode 分流訊息(mechanical 直接顯 commit hash;ai 顯 ticketId + 提示 watch log)。**沒人再走「直接 spawn AI」入口**(舊 manual 路徑廢)
- `alreadyMerged`(ahead=0)路徑也自動清:寫 pipeline.state=merged + 殘存 mode=merge && status ∈ failed/paused 的 ticket 改 done + 清 lastAutoMergeError。避免「git 層已 merged 但 UI 還顯失敗 banner」的狀態漂移
- 按鈕 label 從「AI 合併」→「合併」(AI 變 fallback)

**`server/lib/runner/syncJob.ts` + `syncAiPrompt.ts`**(2026-05-13 新)— Sync 寄生 `Pipeline.syncJob` 不再走 ticket
- `startSync()`:試 `git merge --no-ff baseBranch` → 乾淨/FF → state="done";衝突 → state="conflict_await"(UI 跳 modal 給 user 決定)
- `confirmAi()`:user 確認讓 AI 解 → spawn `executor` cfg(claude/codex 走 adapter),註冊 `running` map with `kind="sync"`
- `cancelSync()`:kill AI + `git merge --abort` + state="failed"
- **成功判定靠 git 三條件**(不靠 AI stdout):`!MERGE_HEAD && !conflictMarkers && behindBaseCount===0`。第一版用 AI firstLine `startsWith("PASS")` 撞坑,AI 把 `PASS\nSYNC_DONE` 寫在中段被誤判 fail
- `recoverStaleSync()`:server boot 收 `state ∈ {merging,ai_running}` 殘骸 → `merge --abort` + 標 failed
- watchdog 支援 `kind="ticket"|"sync"`:sync 死 → `merge --abort` + emit `sync_failed` notif
- 完整設計見 [`refs/sync-redesign-2026-05-13.md`](../vibe-pipeline/refs/sync-redesign-2026-05-13.md)

**`server/lib/qa/{claudeCli,draftStore}.ts`** — QA 確認輪契約 + reopen
- 5/5 收齊不立刻 complete=true,加一輪「以下是整理的 spec,確認建立嗎?」+ 三選一(`建立 ticket` / `我要再調整` / `從頭重來`)字面值嚴格
- append-system-prompt reminder 每輪重念契約 + 放行 Read/Grep/Glob/read-only Bash
- 2026-05-13 reopen 規則(rule 6):前輪 AI 自己回 complete=true + user 又送訊息(非「建立 ticket」字面)→ complete 必須改回 false,當需求補充處理
- `draftStore.appendTurn` auto-complete safety net 改 `!wasComplete && reply.complete !== false && 5/5` 才 fire — 尊重 AI 在 reopen 時的 false,不再硬 force=true

**`server/lib/pipelineDir.ts`** — init idempotent + createdAt 排序
- 2026-05-13:`.vibe-pipeline/` 已存在但內容缺(partial init 殘骸)→ 補齊不報錯
- `.gitignore` 自動補 `.vibe-pipeline/.runtime/` + `.vibe-pipeline/pipelines/`(原本只加 runtime,漏 pipelines)
- route 層也砍 hasInit 前置 guard,把 idempotent 完全交給 pipelineDir.init
- **`listPipelines` 改用 `Pipeline.createdAt` 排序**(2026-05-13):取代靠 id 開頭 hex timestamp(AI / fixture 手 craft 的假 id 會排亂)。讀檔時無 `createdAt` 欄位自動 backfill 用 id-ts 當 fallback;新建 pipeline `createPipeline` route 寫真 `Date.now()`。CLI `pipeline create` 也吃 project config `defaults.auto_merge`(原本漏,跟 web UI 不一致)

**`server/routes/projects.ts`** — Client-side folder browser
- `GET /api/projects/browse?path=` 回 `{path, parent, sep, home, drives, entries: [{name, isDir}]}`
- 沒帶 path → home dir;Windows 額外列可用磁碟(C:\ / D:\ ...)
- 給 Tailscale 遠端用(native picker 跑在 host user 看不到 dialog)

**還沒做**:transient retry 真實作測試、SQLite log / runs.db、budget tracker UI、`vbpl` CLI、log/notif GC、diag endpoint 清理。

要開工 backend 前:

1. 看你的事屬於「補 phase 1-3 細節」、「擴張到 [P2] runner 完整實測」、「P3+」哪一段
2. **Phase 1-3 補丁** → 讀本 SKILL「已落地架構」段 + 對應 ref
3. **P2 runner 完整 / git merge** → 讀「完整規格」段 + [refs/git-design-2026-05-09.md](../vibe-pipeline/refs/git-design-2026-05-09.md) + [refs/integration-plan-v3-runner-2026-05-10.md](../vibe-pipeline/refs/integration-plan-v3-runner-2026-05-10.md)
4. **完整規格** → [refs/spec-2026-05-09.md](../vibe-pipeline/refs/spec-2026-05-09.md)
5. 開工前回報「我要做 X,屬 Phase 1-3 補 / [P2] / [P3],預估 Y」

## 已落地架構 (Phase 1-3 第一刀)

### 技術選型

- **Bun** 跑 backend(`bun run server` 起 process,port 3001)
- 內建用足:`Bun.serve`(HTTP)/`Bun.spawn`(claude CLI)/`Bun.file`(fs)
- 不裝 Express / Fastify / Hono(Bun.serve 夠用)
- 不裝 ORM(JSON 檔即可,SQLite 等 P2 加 runner 才用)
- Schema 驗證:目前信任 JSON 結構;`shared/types.ts` 的 `isCompleteSpec()` 是少數 runtime 驗證

### 資料夾職責邊界

> 物理路徑 → root [`CLAUDE.md`](../../../CLAUDE.md) § Repo 內 / Repo 外。本段只寫**邊界規則**。

- **`server/index.ts`** 只做:啟 `Bun.serve`、解 URL、dispatch 到對應 route。**不寫業務邏輯**
- **`server/routes/*`** 純 dispatch:解 body、call `lib/`、包 response envelope。**不直接 IO**
- **`server/lib/*`** 純 IO + 邏輯,**不知道 HTTP**(可被 `vp` CLI 直接 import 用,不經 server)。每檔一個職責,別跨層
- **`server/lib/qa/*`** QA 子系統 — claude CLI 整合 / draft store / 系統 prompt / parsing。獨立子目錄,跟其他 lib 分開
- **`shared/types.ts`** 是**前後端共用持久化 schema** 的 single source of truth。前端 import,後端 import,不要兩邊各定一份。`Pipeline / Ticket / TicketSpec / QAReply / Turn / Draft / NOTIF_EVENTS` 都在這
- **`~/.vibe-pipeline/state.json`** 只存 global runtime(user 開過的 projects + last selected)。**不存 pipeline / ticket 細節**,那些都從各 project 的 `.vibe-pipeline/` 內讀
- **`<target>/.vibe-pipeline/.runtime/`** gitignored 暫存。目前只有 `qa-drafts/<id>.json`

### API endpoints

完整清單見 `server/index.ts` 的 route table(Phase 5 後新增很多,這裡不再 snapshot 易過期)。主要 namespace:
- `/api/projects/*` — project CRUD / select / open / reveal / git-init / status / branches / runtime
- `/api/projects/:hash/pipelines[/:id][/run|/pause|/merge|/sync|/worktree/reveal|/runs|/tickets]` — pipeline / ticket 操作
- `/api/projects/:hash/qa/*` — QA drafts / start / turn / finalize / cancel / split
- `/api/projects/:hash/config`、`/api/user/config` — project-level + user-level config
- `/api/auth/*` — TOTP setup / login / sessions
- `/api/push/*` — FCM token register / unregister / config / test

### Response envelope

統一 `{ ok: true, data }` 或 `{ ok: false, error: { code, message } }`。
常見 error code:`not_found` / `permission_denied` / `dialog_cancelled` / `invalid_path` / `not_initialized` / `already_initialized` / `internal_error`。

### Project hash 規則

`hash = sha256(absolute_path).slice(0, 8)` — 跟 Composio AO 同 pattern。Pipeline id 規則 `<12-hex-ms-ts>-<slug>`(本機時間序、不撞)。

### QA 子系統設計重點(Phase 2 落地)

**Claude CLI 整合(`server/lib/qa/claudeCli.ts`)**
- 第一輪:`claude -p --output-format json --session-id <uuid> --system-prompt <QA_BEHAVIOR_PROMPT> --disallowedTools "Edit Write Task" "<user message>"`
- 後續輪:`claude -p --resume <sessionId> --output-format json --disallowedTools "Edit Write Task" --append-system-prompt "<reminder>" "<user message>"`
- session-id 由我們生(`crypto.randomUUID()`),非 claude 給
- 工具策略:**只擋 Edit / Write / Task**(改檔 + sub-agent),其他放行讓 AI 在收斂時可查專案 / 跑 read-only 命令(Bash + Read + Grep + Glob + WebFetch + MCP 都開)
- output-format json wrap result in `{type:"result", result:"<text>", session_id, ...}`,我們抽 `.result` 再 parse

**Reply parsing 4 層 fallback(`parseReply`)**
1. fenced ` ```json {...} ``` ` block
2. 直接 JSON object
3. 文字中找第一個 `{...}`
4. 都失敗 → 包成 `{message: <raw>, options: [], complete: false, spec: null}` — flow 不崩

**Contract enforcement(`enforceContract`)**
即使 AI 宣告 `complete=true`,如果 `spec` 不完整(5 欄缺一)→ **強制改回 `complete=false`**。AI 偷跑攔下,user 不會看到空白 SpecReview。

**Draft store(`server/lib/qa/draftStore.ts`)**
- `<target>/.vibe-pipeline/.runtime/qa-drafts/<draftId>.json`
- Draft schema 含 `sessionId`(claude session)/ `sessionStarted`(已跑過第一輪)/ `complete`(最後一輪 reply.complete)/ `turns[]`(完整 history)/ `spec`(累進填)
- `appendTurn` 同時加 user + ai turn,合併 `spec` 累積、更新 `complete`

**System prompt(`server/lib/qa/systemPrompt.ts`)**
- `QA_BEHAVIOR_PROMPT` 寫死契約(輸出格式 / 5 欄定義 / 收斂規則 / 工具使用原則 / 風格)— 不可改
- `DEFAULT_OPENING_MESSAGE` 給 backend fallback;phase 2 frontend 寫死第一句,backend 路徑暫不用
- 注意:**template literal 內絕對不能用 backtick**,backtick 會終止字串導致 backend crash(踩過兩次)

### Project state 持久化

`~/.vibe-pipeline/state.json`:
```json
{
  "lastProject": "/Users/eric/code/foo",
  "recentProjects": [
    {"path": "/Users/eric/code/foo", "lastOpenedAt": 1715234567000}
  ]
}
```

### 安全 invariants(學 Symphony)

- `POST /init` 必須 assert path 在合理範圍(防 user 拿 `/` / `~` 去 init)
- json 寫入 atomic(暫時直接寫,之後可加 tmp + rename)
- 所有 fs 操作 normalize 路徑,防 `..` 跳出 project root

---

# 完整規格(MVP / P2 / P3)

下面是長期的完整規格 / 未來方向。Phase 1-5 已落地大部分項目;剩 SQLite log / budget tracker / `vbpl` CLI / SKILL 蒸餾 等 P2+ 項目。

## 整體架構

```
┌──────────────────────────────────────────────────┐
│  Web UI (Bun + Vite + React)   ← 已實作 (mock)  │
└────────────────────────┬─────────────────────────┘
                         │ TBD: API / IPC / file watcher
┌────────────────────────┴─────────────────────────┐
│  Core (TypeScript / Bun runtime)                 │
│  ─────────────────────────────────────────────   │
│  • Schema layer  (JSON loader / validator)       │
│  • Executor      (執行AI + 審核AI runner loop)     │
│  • Workspace     (git branch / merge / worktree) │
│  • Storage       (.vibe-pipeline/ + SQLite runtime)    │
│  • Q&A engine    (cross-cutting,六個 use sites) │
│  • Budget tracker(三層 caps)                    │
│  • Notification  (channel adapters)              │
└────────────────────────┬─────────────────────────┘
                         │ stdin / arg / file
┌────────────────────────┴─────────────────────────┐
│  External CLI runners (claude-cli / codex-cli /…)│
│  External git, filesystem, notification channels │
└──────────────────────────────────────────────────┘

vp CLI(命令名) ← 同 core 走相同 API
```

**單一 process 模型**(MVP):Web UI 直接跑同 process 的 core(透過 Vite dev server proxy 或 Tauri-like 後台);CLI 是另一個入口,共用同個 core lib。生產環境:Tauri 包桌面 app,或 local-first server。

## Storage layout

`.vibe-pipeline/` 結構樹 → root [`CLAUDE.md`](../../../CLAUDE.md) § Repo 外。本段只寫規則:
- `.vibe-pipeline/` 是 **target repo 根目錄底下**(不是 vibe-pipeline 自己的 repo),由 `vp init` 建
- `pipelines/*.json` 一檔一條,tickets 陣列內嵌。檔名 = id = `<12-hex-ms-ts>-<slug>` (時間序排,本機不撞)。git tracked,是 **single source of truth**(信條 #1)
- 加 runner / SQLite 時再決定執行期暫存放哪、是否要 gitignore(目前未建)

## SQLite tables(`runs.db`)

WAL mode,所有寫入用 transaction。最低 schema:

```sql
-- 一張 ticket 跑一次(可能多 iteration)
runs (
  id          TEXT PRIMARY KEY,    -- ULID
  ticket_id   TEXT NOT NULL,
  pipeline_id TEXT,
  branch      TEXT,
  started_at  INTEGER NOT NULL,
  ended_at    INTEGER,
  status      TEXT NOT NULL,        -- running / paused / done / failed / aborted
  exit_reason TEXT
);

-- 一輪 執行AI→審核AI
iterations (
  id         TEXT PRIMARY KEY,
  run_id     TEXT NOT NULL REFERENCES runs(id),
  n          INTEGER NOT NULL,
  doer_out   TEXT,
  doer_ms    INTEGER,
  doer_tokens_in  INTEGER,
  doer_tokens_out INTEGER,
  critic_out TEXT,
  verdict    TEXT,                  -- pass / fail / null
  plan       TEXT,
  progress   TEXT,                  -- first / better / same / worse  ([P2])
  cost_usd   REAL,
  ts         INTEGER NOT NULL
);

-- 使用者介入紀錄
interventions (
  id        TEXT PRIMARY KEY,
  run_id    TEXT NOT NULL REFERENCES runs(id),
  iter_n    INTEGER,
  type      TEXT NOT NULL,          -- edit_prompt / append_prompt / redo_qa / override_pass / abort
  payload   TEXT,
  ts        INTEGER NOT NULL
);

-- Budget ledger
budget_ledger (
  id         TEXT PRIMARY KEY,
  scope      TEXT NOT NULL,         -- ticket / pipeline / daily
  scope_id   TEXT NOT NULL,
  cost_usd   REAL NOT NULL,
  tokens     INTEGER,
  ts         INTEGER NOT NULL
);
```

**Schema migration**(`[P2]`):每次 schema 動就 bump version,寫到 `_meta` table,啟動時自動 migrate 上來。

## 執行模型

### Iterative ticket
```
loop:
  執行AI.run(prompt) → output, tokens
  log iteration(doer_out, tokens)
  if no 審核AI: break
  審核AI.run(output, AC) → verdict, plan
  log iteration(critic_out, verdict, plan)
  if verdict == pass: break
  if stall_detector(): set ticket=paused; break  ([P2])
  if budget_hard_cap(): finish current iter then pause  ([P2])
  prompt = build_next_prompt(prompt, plan)
```

### Pipeline-step ticket
```
執行AI.run(prompt) → output
審核AI?.run(output, AC) → verdict
if verdict == fail:
  match on_critic_fail:
    halt (default)         → set pipeline=paused, notify
    escalate_to_iterative  → switch ticket mode, re-enter loop
    prompt_user            → wait for intervention
```

### Pipeline 推進
```
for ticket in pipeline.steps:           # 嚴格 sequential
  acquire branch lock                   # 同 branch 一次只能一張
  if ticket.exclusive: acquire global lock
  run ticket
  if ticket.status != done: pipeline=paused; break
all done → if auto_merge_on_complete: merge
```

## Workspace lifecycle

```
vp pipeline run <id>
  ├─ git checkout -b pipeline/{slug} {base_branch}
  ├─ for each ticket:
  │   └─ run + commit on this branch
  ├─ on complete:
  │   ├─ rebase onto latest base_branch
  │   ├─ on conflict: pause + notify, wait for resume
  │   └─ merge per merge_strategy (squash / merge / rebase)
  └─ on failure: leave branch, mark pipeline=failed/paused
```

`[P2]` Worktree 模式:pipeline 設 `isolated: true` → `git worktree add .vibe-pipeline/.worktrees/{slug}`,完成 `git worktree remove`。失敗時 worktree 留著供人上去看。

## Runner 介面

每家 CLI 包成統一介面:

```ts
interface Runner {
  id: string;                  // "claude-cli" / "codex-cli" / ...
  detect(): Promise<boolean>;  // 掃 $PATH,沒裝就回 false
  authCheck(): Promise<{ok: boolean; msg?: string}>;  // [P2]
  invoke(args: {
    prompt: string;
    cwd: string;
    timeoutMs?: number;
  }): Promise<{
    text: string;
    tokensIn?: number;
    tokensOut?: number;
    costUsd?: number;
    exitCode: number;
  }>;
}
```

MVP runners:`claude-cli`、`codex-cli`(其他依使用者環境動態列出)。

## Q&A 收斂引擎(`[P2]`)

Cross-cutting primitive,六個 use sites:
1. Ticket 創建(模糊敘述 → goal/AC/prompt/mode)
2. AC 定義(模糊目標 → 可驗證 AC checklist)
3. Critic plan 精修(粗略缺失 → 精準下輪 執行AI prompt)
4. Pipeline 編排(一坨想法 → ticket 序列)
5. Stall intervention(卡住時引導使用者修)
6. SKILL candidate 審核(AI 提議 → 引導決定納入)

每個 session 紀錄到 SQLite(可 resume / replay)。Q&A 用的 CLI 可獨立指定(跟 執行AI / 審核AI 不一定相同)。

UI 對應:`/qa` 畫面已實作 4 variants(`drawer` / `chat` / `form` / `step`)。串接時 backend 推 turn 給 UI,UI 收回答送回 backend。


## Budget tracker(`[P2]`)

三層 caps,每層分 soft / hard:

| 層 | 配置位置 | soft 觸發 | hard 觸發 |
|---|---|---|---|
| Ticket | `ticket.budget_override` 或 `defaults.ticket_budget` | 通知 | 當前 iter 跑完才停 |
| Pipeline | `pipeline.budget` 或 `defaults.pipeline_budget` | 通知 | 當前 ticket 跑完才停 |
| Daily / project | `config.json budget.daily` | 通知 | 當前 ticket 跑完才停 |

**Hard cap 不砍中途**(信條延伸:不損毀 SQLite 一致性)。Pricing table 在 `config.json budget.pricing`,使用者可改。

## Notification 通道

| 通道 | MVP / [P2] / [P3] | 觸發事件 |
|---|---|---|
| Terminal print + bell | `[M]` | pipeline complete / fail |
| Stall warning | `[P2]` | stall detector 觸發 |
| Budget threshold | `[P2]` | 觸 soft / hard cap |
| Merge conflict | `[P2]` | rebase 衝突 |
| Desktop (osascript / notify-send) | `[P2]` | 同上,可選 |
| 寫檔給其他工具讀 | `[P2]` | 同上,可選(`.vibe-pipeline/.runtime/notifications/*.json`) |
| Email / Slack webhook | `[P3]` | 同上 |

UI 對應:`/notifications` 已實作。Backend 推到一個 in-memory channel(或 `.runtime/` 內 file),UI poll 或 SSE 拉。

## CLI(`vp`)

完整命令清單在 ref [spec-2026-05-09.md](../vibe-pipeline/refs/spec-2026-05-09.md) §7。摘要:

```
vp init
vp ticket {new,edit,show,list,run,cancel}
vp pipeline {new,edit,show,list,run,pause,resume}
vp status
vp config {edit,show}
vp skill {list,review,approve}      [P2]
vp budget {show,set}                [P2]
vp log show <run_id>                [P2]
vp qa start <type>                  [P2]
```

CLI 與 Web UI 共用同一個 core lib;CLI 不重發明 — 只是 thin wrapper。

## Resume / 中斷

- `[M]` 工具中斷後重啟 → 掃 SQLite `runs WHERE status='running' OR 'paused'` → 列 paused 的提示 resume
- `[P2]` Crash recovery:啟動時 `runs.status='running' AND ts < now-5min` → 標 failed(orphan)
- `[P2]` 跨 session 接續:paused state 完整持久化,resume 時還原 prompt context

## 觸發本 SKILL 的場景

- 提到 `vp` CLI、`.vibe-pipeline/`、SQLite、git branch/worktree、執行AI / 審核AI、Q&A 引擎、budget、notification、stall detection、intervention 任何一項
- 開工新 backend 模組
- Web UI 要從 mock 切真實後端

不確定算前端還後端 → 預設前端(因為目前 0 行 backend code,任何寫程式都偏前端);若內容明確涉及上面任何 backend 概念再轉本 SKILL。
