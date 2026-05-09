---
name: vibe-pipeline-backend
description: vibe-pipeline 後端 / 執行層規格與計畫 — 目前 0 行 backend 程式碼,本 SKILL 是 spec 索引與架構記憶。實作 doer/critic runner、SQLite log、git branch / worktree、notification 通道、Q&A 收斂引擎、budget tracker、`vp` CLI 之前先讀。
---

## 現況(2026-05-09)

**目前 repo 內沒有任何 backend / runtime / persistence 程式碼。** 所有畫面跑在 mock 資料上。

**進入串接期** — 第一刀範圍見下節。本 SKILL 餘下章節是**完整規格與計畫**(MVP / P2 / P3),不是「現在就做」的清單。

要開工 backend 前:

1. 確認你做的事屬於「**第一刀串接(stub-first)**」還是「擴張到完整 MVP 規格」
2. **第一刀** → 讀本 SKILL「stub-first 起手」段 + [refs/integration-plan-v1-2026-05-09.md](../vibe-pipeline/refs/integration-plan-v1-2026-05-09.md)
3. **擴張 MVP** → 讀完整規格 [refs/spec-2026-05-09.md](../vibe-pipeline/refs/spec-2026-05-09.md)
4. 開工前回報「我要做 X,屬 stub-first 哪步 / [M] / [P2] / [P3],預估 Y」

## stub-first 起手(現在的範圍)

第一條 vertical slice:**空狀態 → 選資料夾 → init popup → 後端紀錄**。

### 技術選型

- **Bun** 跑 backend(`bun run server` 起 process,port 3001)
- 內建用足:`Bun.serve`(HTTP)/`bun:sqlite`(暫不用)/`Bun.spawn`(後續)/`Bun.file`(fs)
- 不裝 Express / Fastify / Hono(Bun.serve 夠用)
- 不裝 ORM(這版只寫 JSON 檔,不碰 SQLite)
- Schema 驗證:**這版不做**(直接信任 JSON 結構,壞了拋 error)

### 資料夾職責邊界

> 物理路徑 → root [`CLAUDE.md`](../../../CLAUDE.md) § Repo 內 / Repo 外。本段只寫**邊界規則**。

- **`server/index.ts`** 只做:啟 `Bun.serve`、解 URL、dispatch 到對應 route。**不寫業務邏輯**
- **`server/routes/*`** 純 dispatch:解 body、call `lib/`、包 response envelope。**不直接 IO**
- **`server/lib/*`** 純 IO + 邏輯,**不知道 HTTP**(可被 `vp` CLI 直接 import 用,不經 server)。每檔一個職責,別跨層
- **`server/types.ts`** 只放 server 內部 type(routes ↔ lib 之間)。**持久化型別不放這**(那是 `shared/types.ts` 的事)
- **`shared/types.ts`** 是**前後端共用持久化 schema** 的 single source of truth。前端 `import "../../shared/types"`,後端同樣 import。不要兩邊各定一份
- **`~/.vibe-pipeline/state.json`** 只存 global runtime(user 開過的 projects + last selected)。**不存 pipeline / ticket 細節**,那些都從各 project 的 `.vibe-pipeline/` 內讀

### 第一版 API endpoint

```
GET  /api/projects                           列最近開過的 project
POST /api/projects/select                    開原生 dialog,回 {path}
POST /api/projects/open                      body {path},加進 recents,標 last opened
GET  /api/projects/:hash/status              回 {hasInit, name, path}
POST /api/projects/:hash/init                建 .vibe-pipeline/ 結構

GET  /api/projects/:hash/pipelines           列所有 pipeline (掃 .vibe-pipeline/pipelines/*.json)
POST /api/projects/:hash/pipelines           body {name, baseBranch, ...} → 自動產 id 寫檔
GET  /api/projects/:hash/pipelines/:id       讀單條
PUT  /api/projects/:hash/pipelines/:id       覆寫單條 (含 tickets 陣列)
```

### Response envelope

統一 `{ ok: true, data }` 或 `{ ok: false, error: { code, message } }`。
常見 error code:`not_found` / `permission_denied` / `dialog_cancelled` / `invalid_path` / `not_initialized` / `already_initialized`。

### Project hash 規則

`hash = sha256(absolute_path).slice(0, 8)` — 跟 Composio AO 同 pattern(避免 absolute path 進 URL)。

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
**不存 pipeline / ticket 細節**,那些都從各 project 的 `.vibe-pipeline/` 內讀。

### 安全 invariants(學 Symphony)

- `POST /init` 必須 assert path 在合理範圍(防 user 拿 `/` / `~` 去 init)
- json 寫入用 atomic rename(`writeFile tmp + rename`)避免半寫狀態
- 所有 fs 操作 normalize 路徑,防 `..` 跳出 project root

### 不做的(留下階段)

- SQLite log(`runs.db`)— 沒 runner 不需要
- git 操作 — 寫進 JSON 的 `branch` 欄位先當預期名,不真建
- Schema migration — 直接 v1 schema,壞了再說
- 認證 / CORS — 本機 server,信任 user
- File watcher — 第一版 refresh 才更新
- Init 後 `git init` — 留給 user 自行處理

走完這條,我們有「**檔案層的 ticket 編排器骨架**」,後續加 runner / SQLite 才有依託。

---

# 完整規格(MVP / P2 / P3)

下面是長期的完整規格,**不是現在就做**。stub-first 跑完一輪、痛點浮現後,再從這邊挑下一塊擴張。

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
│  • Executor      (doer + critic runner loop)     │
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

-- 一輪 doer→critic
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
  doer.run(prompt) → output, tokens
  log iteration(doer_out, tokens)
  if no critic: break
  critic.run(output, AC) → verdict, plan
  log iteration(critic_out, verdict, plan)
  if verdict == pass: break
  if stall_detector(): set ticket=paused; break  ([P2])
  if budget_hard_cap(): finish current iter then pause  ([P2])
  prompt = build_next_prompt(prompt, plan)
```

### Pipeline-step ticket
```
doer.run(prompt) → output
critic?.run(output, AC) → verdict
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
3. Critic plan 精修(粗略缺失 → 精準下輪 doer prompt)
4. Pipeline 編排(一坨想法 → ticket 序列)
5. Stall intervention(卡住時引導使用者修)
6. SKILL candidate 審核(AI 提議 → 引導決定納入)

每個 session 紀錄到 SQLite(可 resume / replay)。Q&A 用的 CLI 可獨立指定(跟 doer/critic 不一定相同)。

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

- 提到 `vp` CLI、`.vibe-pipeline/`、SQLite、git branch/worktree、doer/critic、Q&A 引擎、budget、notification、stall detection、intervention 任何一項
- 開工新 backend 模組
- Web UI 要從 mock 切真實後端

不確定算前端還後端 → 預設前端(因為目前 0 行 backend code,任何寫程式都偏前端);若內容明確涉及上面任何 backend 概念再轉本 SKILL。
