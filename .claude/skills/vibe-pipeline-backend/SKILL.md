---
name: vibe-pipeline-backend
description: vibe-pipeline 後端 / 執行層的職責邊界、約定與 invariants。Phase 1-5 已落地,本 SKILL 是改 server/ 內 code 時要對齊的 canonical reference(不追歷史,歷史在 CHANGELOG.md)。
---

## 開工前

1. 看 root [`CLAUDE.md`](../../../CLAUDE.md) — repo 結構 / 雷區 / 設計信條 / 架構決策
2. 歷次大改動 / 已 final 不做 / Phase 進度 → [`CHANGELOG.md`](../../../docs/CHANGELOG.md)
3. 動非 trivial 改動前回報 scope(預估 N 行 / 影響哪些 routes / 是否動 schema)

## 技術選型(現狀)

- **Bun** 跑 backend(`bun run server`,port 3001,no-watch default)
- 內建用足:`Bun.serve`(HTTP)/ `Bun.spawn`(claude / codex CLI)/ `Bun.file`(fs)
- 不裝 Express / Fastify / Hono / ORM
- Schema 驗證:信任 JSON 結構,`shared/types.ts:isCompleteSpec()` 是少數 runtime 驗證

## 資料夾職責邊界

> 物理路徑樹 → root [`CLAUDE.md`](../../../CLAUDE.md) § Repo 結構。本段只寫**邊界規則**。

- **`server/index.ts`** 只做:啟 `Bun.serve`、解 URL、authGuard middleware、dispatch 到 route。**不寫業務邏輯**
- **`server/routes/*`** 純 dispatch:解 body、call `lib/`、包 response envelope。**不直接 IO**
- **`server/lib/*`** 純 IO + 邏輯,**不知道 HTTP**(可被 `vbpl` CLI 直接 import,不經 server)。每檔一個職責,別跨層
- **`server/lib/qa/*`** QA 子系統 — claude CLI 整合 / draft store / 系統 prompt / parsing
- **`server/lib/cli/*`** Provider 抽象 — claude / codex adapter,給 QA / split / runner 三處用同一介面
- **`server/lib/runner/*`** Pipeline runner — orchestrator / runnerPrompt / runLog / ticketWatcher / syncJob
- **`server/lib/auth/*`** TOTP middleware + storage + cookie + pending setup tokens
- **`server/lib/push/*` + `server/lib/fcm/*`** Web Push token store + firebase-admin fanout
- **`shared/types.ts`** 跨前後端持久化 schema 的 single source of truth(`Pipeline / Ticket / TicketSpec / QAReply / Turn / Draft / NOTIF_EVENTS / TaskClass`)。**不要兩邊各定一份**
- **`~/.vibe-pipeline/state.json`** 只存 global runtime(projects 清單 / last opened)。不存 pipeline / ticket 細節
- **`<target>/.vibe-pipeline/.runtime/`** gitignored 暫存(qa-drafts / notifs.jsonl / logs)

## API 約定

完整 route table 看 `server/index.ts`(Phase 5 後變動快,SKILL 不 snapshot)。主要 namespace:

- `/api/projects/*` — project CRUD / select / open / reveal / git-init / status / branches / runtime / **browse**(client-side folder browser)
- `/api/projects/:hash/pipelines[/:id][/run|/stop|/merge|/sync(|/ai|/cancel|/dismiss)|/worktree/reveal|/runs|/tickets]`
- `/api/projects/:hash/qa/*` — drafts / start / turn / finalize / cancel / split
- `/api/projects/:hash/config`、`/api/user/config` — project + user level
- `/api/auth/*` — TOTP setup / login / sessions / reset
- `/api/push/*` — FCM token register / unregister / config / test

**Response envelope**:統一 `{ ok: true, data }` 或 `{ ok: false, error: { code, message } }`。
常見 error code:`not_found` / `permission_denied` / `dialog_cancelled` / `invalid_path` / `not_initialized` / `already_initialized` / `state_guard` / `working_tree_dirty` / `internal_error`。

**Project hash**:`sha256(absolute_path).slice(0, 8)`。Pipeline id:`<12-hex-ms-ts>-<slug>`(本機時間序,但**排序靠 `Pipeline.createdAt` 不靠 id**,id 可能是 fixture 假造)。

## 子系統設計重點

### QA(`server/lib/qa/`)

- 第一輪:`claude/codex -p --session-id <uuid> --system-prompt QA_BEHAVIOR_PROMPT --disallowedTools "Edit Write Task" "<msg>"`
- 後續輪:`--resume <sessionId> --append-system-prompt "<reminder>"`
- session-id 由我們生(`crypto.randomUUID()`),非 CLI 給
- 工具策略:**只擋 Edit / Write / Task**(改檔 + sub-agent),其他開放讓 AI 查專案
- **Reply parsing 4 層 fallback**:fenced json → 直接 object → 抽第一個 `{}` → 包成 `{message, options:[], complete:false, spec:null}` 不崩
- **Contract enforcement**:AI 宣告 `complete=true` 但 5 欄 spec 缺一 → 強制改回 `false`,user 不會看到空白 SpecReview
- **確認輪契約**:5/5 收齊不立刻 complete,加一輪三選一(`建立 ticket` / `我要再調整` / `從頭重來`)字面值嚴格
- **Reopen 規則**:前輪 AI 自回 complete=true + user 又送訊息(非「建立 ticket」字面)→ complete 必須改回 false 當需求補充
- `draftStore.appendTurn` auto-complete 只在 `!wasComplete && reply.complete !== false && 5/5` 才 fire — 尊重 AI 在 reopen 時的 false

### Runner(`server/lib/runner/`)

- 主 agent 支援 claude 與 codex(provider 鏈一致化:主 = X → sub 也用 X)
- **`--dangerously-skip-permissions` 永遠帶** — 跨 provider sub-agent 必要(codex sub-agent 內部 Bash 在 auto 模式會被擋)
- 主 agent 工具白名單:Edit/Write 改 pipeline.json + worktree 外 tmp(commit message)+ Bash read-only + git add/commit;**source code 改動 100% 透過 sub-agent 派發**
- Sub-agent 拆兩個 TaskClass:`executor`(改 code,高 capability)+ `critic`(讀 diff 判 PASS/FAIL,可便宜 model)
- ticket commit 用 `git commit -F <tmpfile>` 多段 message,不用 `-m "...\n..."` 字面 \n
- provider-aware dispatch:claude → Task tool;codex → 主 agent 用 `spawn_agent` → `wait_agent` → `close_agent` 三步 atomic in-process 序列(取代舊 Bash `codex exec` subprocess);`codexAdapter.spawnRunner` 自動加 `-c features.multi_agent=true`;工具限制走 sandbox 模式分流(executor / merge = `workspace-write`,critic = `read-only`)
- **Stop = SIGKILL immediate**:user 按「停止」→ orchestrator SIGKILL child + 標 `state=paused`。**沒有 graceful 路徑、沒有 `stopping` 中介 state**(2026-05-17 簡化,見 root CLAUDE.md §Pause 路徑簡化)
- `recoverStale` server boot 掃 stale `running` → paused;同時修 legacy `stopping` 殘留(舊 schema 升級無痛);watchdog 抓死 PID

### Merge / Sync 二段式(`pipelineMerge.ts` + `syncJob.ts`)

兩者對稱:**git-first → 衝突才 AI**。

- `autoMergeNoAI()`:`git checkout base + git merge --no-ff`,clean → state=merged + emit `pipeline_merged`;conflict → `merge --abort` + reason="conflict";dirty/git_error → 對應 reason
- `mergePipeline` route(manual)和 `orchestrator.maybeAutoMerge`(auto)看 reason 分流:conflict → 升級 `triggerMerge`(spawn AI);dirty/git_error → emit `merge_blocked`
- **autoMerge 升級時 emit `pipeline_auto_merge_started` + FCM push**「🤖 AI 接手解衝突」(autoMerge 場景 user 不在現場)
- response 加 `mode: "mechanical" | "ai"` discriminator;CLI / Web UI 依此分流訊息
- `alreadyMerged`(ahead=0)路徑也自動清:state=merged + 殘存 failed merge ticket 改 done + 清 lastAutoMergeError
- **Sync 成功判定靠 git 三條件**(不靠 AI stdout):`!MERGE_HEAD && !conflictMarkers && behindBaseCount===0`。理由見 root CLAUDE.md §AI sync 成功判定靠 git
- `syncJob.recoverStaleSync()`:server boot 收 `state ∈ {merging, ai_running}` 殘骸 → `merge --abort` + 標 failed
- 完整設計 → [`docs/refs/archive/sync-redesign-2026-05-13.md`](../../../docs/refs/archive/sync-redesign-2026-05-13.md)

### Auth(`server/lib/auth/`)

- `authGuard()`:loopback IP(`127.0.0.1` / `::1`)永遠 bypass + setup/login/status path bypass + cookie validate → redirect `/setup` or `/login`
- `vp_auth` cookie:HttpOnly + SameSite=Strict + 7d
- TOTP secret 寫 `~/.vibe-pipeline/auth.json`(`fs.chmod(0o600)` Windows NTFS 不生效,見 [`.claude/rules/remote-access.md`](../../../.claude/rules/remote-access.md))
- setup_token 是 in-memory map,5min 過期 — server restart 期間中斷的 setup 必須重來

### Push(`server/lib/push/` + `server/lib/fcm/`)

- `tokenStore`:`~/.vibe-pipeline/device_tokens.json`(register / list / removeDead)
- `fcm/index.ts`:firebase-admin init + `fanoutPush(tokens, payload)` + 死 token 偵測自動 remove
- `ticketWatcher.ts`:fs.watch pipeline.json + diff status → emit ticket_* notif + FCM fanout
- 前景 / 背景 push 行為差異雷見 [`.claude/rules/pwa-sw.md`](../../../.claude/rules/pwa-sw.md) §Android push 行為

### CLI adapter(`server/lib/cli/`)

- `CliAdapter` 介面 + `QASpawnOpts` / `RunnerSpawnOpts`(`needsBypassPermissions`)/ `SplitSpawnOpts`
- `claudeAdapter`:perf flags + 跨 provider 加 `--dangerously-skip-permissions`
- `codexAdapter`:`-c model="..."` config override / `-s read-only|workspace-write` sandbox / JSONL parse
- `getAdapter(taskClass, provider)` factory
- 加新 provider → 實作 `CliAdapter`,接 `getAdapter` switch,prompt 維持 provider-agnostic

### User config(`server/lib/userConfig.ts`)

- `~/.vibe-pipeline/config.json` per-task-class:`qa / split / runner / executor / critic / merge` → `{ provider, model, effort }`
- `coerceConfig` migration:舊 `subAgent` key → `executor`,critic 走 default
- `getTaskConfig(tc)` 給 spawn 點用;`patchUserConfig()` PUT 白名單 + 三欄獨立驗

### Pipeline dir(`server/lib/pipelineDir.ts`)

- `init()` idempotent — partial init 殘骸補齊不報錯
- `.gitignore` 自動補 `.vibe-pipeline/.runtime/` + `.vibe-pipeline/pipelines/`
- `listPipelines` 用 `Pipeline.createdAt` 排序,無欄位 backfill 用 id-ts
- 寫入路徑 normalize 防 `..` 跳出 project root(safety invariant)

## 安全 invariants

- `POST /init` assert path 合理(防 `/` / `~` 當 project root)
- json 寫入 atomic(tmp + rename),避免 crash 中斷後檔案半段
- fs 操作 normalize 路徑,防 path traversal
- `ALLOWED_ORIGINS` CORS 白名單不放 `*`(雷見 root CLAUDE.md 手機遠端段)
- **pipelines/*.json mutation 一律走 backend(vbpl / API)**,**禁止任何外部 caller(包括對話 AI / Python 腳本 / Edit / Write / mv)直接 fs write**。理由:race guard / savePipeline validation / running 中 ticket 鎖 / main agent dispatch 全在 backend 內;直接 fs 繞過所有保護,造成 state corruption(已踩:reset/swap/race guard bypass 多次)。例外:**只有 backend 本身重啟 recovery 程式碼**可在 backend 內走 `pipelineDir.writePipeline` 直接寫
  - 對 AI:跑中 pipeline → 一律 `vbpl pipeline stop` + `vbpl ticket update/add/remove` + `vbpl pipeline run`,不准 Python / Edit / mv 直接 patch `.vibe-pipeline/pipelines/*.json`
  - paused pipeline 改動雖無 race risk,**仍走 vbpl** 維持單一 mutation 通道(future MCP scope / audit log 才能 cover)

## 待動工(動到走 ScopeReport)

清單在 [`docs/TODO.md`](../../../docs/TODO.md)(對應 phase 8 pipeline)。backend 相關:#1 FCM gateway / #2 vbpl server cmd / #5 secret 洩漏偵測 / #7 backend self-heal / #8 pipeline delete cascade / #10 worktree staleness。

## 觸發本 SKILL 的場景

- 改 `server/` 內任何檔(routes / lib / runner / qa / auth / push / fcm / cli adapter)
- 加新 endpoint / 動 response envelope / 改 error code
- 處理 pipeline state machine / merge / sync 邏輯
- 跟 claude / codex CLI spawn 相關
- 動 `~/.vibe-pipeline/` 內任何 json

不確定算前端還後端 → 看碰的檔在 `src/` 還 `server/`,各歸各 SKILL。
