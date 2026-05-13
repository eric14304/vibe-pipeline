# Composio agent-orchestrator(AO)精神萃取(2026-05-09)

> 來源:
> - https://github.com/ComposioHQ/agent-orchestrator(主)
> - 含 repo 內 ARCHITECTURE.md / PLUGIN_SPEC.md / observability.md / AGENTS.md / CLAUDE.md
>
> 由 subagent 擷取。本檔精煉彙總 + 保留原始觀察。

## 0. 必讀的「狀態警告」

- 6.9k stars / MIT / **production-ready, actively maintained**
- 最近 release `@composio/ao-cli@0.2.2`(2026-03-29)
- TypeScript monorepo,3,288 tests
- **與 Composio 主 tool-integration 平台幾乎無耦合**,雖掛 ComposioHQ org 下,但純粹是 git/CI/PR 編排器,沒明顯用主平台 tool catalog(未確認長期是否整合)

跟 vibe-kanban / Symphony 比:這是**最 production-ready 也最值得直接抄結構**的一個。

## 1. 一句話定位 + 與我們的核心差異

| 維度 | Composio AO | vibe-pipeline |
|---|---|---|
| 平行模型 | **橫向 fan-out**(多 issue 同時跑,各自 agent) | **縱向 iterate**(同 task,doer↔critic 收斂) |
| Agent 互動 | Worker 之間完全隔離,不對話 | doer↔critic 二元對話 |
| 訊息匯流排 | **外部系統(git branch + PR + CI status)** | 內部 SQLite + IPC |
| Reaction trigger | CI red / review comment → 自動派工 | critic verdict → 自動派工 |
| 資料持久 | **無 DB,flat JSON files** | SQLite(planned) |
| Plugin slot | **8 個明確收斂**(runtime/agent/workspace/tracker/scm/notifier/terminal/lifecycle) | runner / notification 已抽,其他未抽 |

**核心差異**:他們是「**橫向多 issue 平行**」,我們是「**縱向同題 iterate**」。並行軸不同,但 supervisor + plugin 抽象可以共用。

## 2. 對齊我們架構的核心抽象(直接借鏡)

### 2.1 Plugin slot 切 8 個,而非「什麼都能 plugin」

明確列出 8 個可換位置:
- `runtime`(tmux / ConPTY / Docker)
- `agent`(Claude Code / Codex / Aider / Cursor / OpenCode / KimiCode)
- `workspace`(git worktree)
- `tracker`(GitHub Issues / Linear)
- `scm`(GitHub / ...)
- `notifier`(Slack / desktop / ...)
- `terminal`(底層終端)
- `lifecycle`(不可插,核心)

**借鏡點**:
- 我們的 backend SKILL 已抽 `Runner` interface,但**只抽了 agent 那層**
- 應同時抽:
  - `Tracker`(讀外部 issue?Linear / GitHub / 自家 YAML)
  - `Scm`(操作 PR / branch / merge)
  - `Notifier`(已在 spec 提)
  - `Workspace`(branch only / worktree / docker?)
  - `Runtime`(stdio process / docker / SSH worker?)
- **設計哲學:不是「什麼都能 plugin」,是「明確列出哪幾個」**。其他鎖死在核心,反而學得起來

### 2.2 Session state machine 用 (state, reason) 雙欄

不是單一 enum:
- `state`: 主狀態
- `reason`: 進入這狀態的原因(可序列化、可 query)
- terminal state 顯式列舉:`done` / `terminated` / `stuck`
- `runtime_lost` reason 在 enrichment 階段偵測殭屍 session 寫回磁碟

**借鏡點**:
- 我們 SQLite `runs.status` 應拆成 `(status, reason)` 兩欄,reason 帶結構化資料
- 例:`status=paused, reason=stall_detector_3_same` vs `status=paused, reason=budget_hard_cap` vs `status=paused, reason=user_intervention_requested`
- UI / CLI 可根據 reason 顯示不同 next-action 提示
- 跟 Symphony 的 11 enum 是不同設計選擇:Symphony 細,Composio 雙欄組合更靈活

### 2.3 殭屍 session 偵測寫回(invariant)

「死掉但沒回報」是分散式系統最常見 bug。Composio 把它提升到 invariant 等級:
- enrichment 階段每次都掃 active session
- 偵測 runtime 已不存在的 → 自動寫 `state=stuck, reason=runtime_lost` 到磁碟
- 不靠 process 自己 cleanup(它都死了還能 cleanup 什麼)

**借鏡點**:
- spec 已提 `[P2] Crash recovery: 中途 OS 死機 → 偵測孤兒 → 標 failed`
- Composio 教的是:**這不該是「啟動時做一次」,而是每次 reconcile 都做**
- 跟 Symphony §2.4 的 reconciliation-driven recovery 是同精神

### 2.4 把外部系統當訊息匯流排

不發明自己的 IPC,直接讓 git branch + PR + CI status 當 agent 之間的協調媒介:
- Agent A 推 branch → CI 跑 → CI 結果寫回 PR → Reaction 偵測 PR 狀態變化 → 自動派回 Agent A 修
- Reviewer 留 comment → GitHub webhook → Reaction → 自動派回對應 agent
- Agent crash 也不掉狀態,因為 state 在 git / PR / CI 那邊

**借鏡點**:
- 我們的 doer↔critic 不需要走外部(同 process 內就能傳 verdict)
- 但 **「pipeline 跨 ticket 的訊息傳遞」可以走 git commit / PR comment**:
  - ticket A 完成 → commit message 帶結構化 metadata
  - ticket B 啟動時讀 git log,從 commit 拿 ticket A 的 output 作 context
- 這比 SQLite 跨 ticket query 更**透明可審**(commit 是 single source of truth,符合信條 #1)

### 2.5 Reaction:外部事件 → 自動派工

`reaction` 是 first-class 概念,不是 if-else:
- CI red → 自動把 log 丟回 agent
- Reviewer comment → 自動轉派
- 在 YAML 裡聲明 `reaction.on.{ci_failed, review_comment, ...}`

**借鏡點**:
- 我們的 critic verdict → next iter prompt 本質上就是 reaction
- intervention 五型也是 reaction(使用者介入觸發某 action)
- **抽成 first-class:`Reaction` interface,trigger + handler + payload**
- 配置層:`config.yaml reactions.{critic_fail, stall, budget_warn, conflict}.action`(讓 user 自訂處理)
- 跟 stall detection / budget tracker 整合 — 它們都是 reaction trigger

### 2.6 Convention over configuration + hash-based 路徑

- config 路徑 SHA256 → 多 checkout 不撞名
- user-facing 用短名(`int-1`)、runtime 用 hash-prefixed(`a3b4-int-1`)
- 同 repo 多份 config 可同機跑多份

**借鏡點**:
- 我們 worktree 路徑命名:`.tickets/.worktrees/{pipeline_name}` 簡單但**可能撞名**(同 user 兩個 vibe-pipeline checkout)
- 改:`.tickets/.worktrees/{hash8}-{pipeline_name}/`,hash 從 repo 路徑算
- runtime data 路徑也走同 pattern:`~/.vibe-pipeline/{repo_hash}/`

### 2.7 結構化 JSON log + correlation id + `/api/observability`

- log on stderr,JSON 格式
- `x-correlation-id` 串聯整個 trace
- dashboard 不直讀檔,從 `/api/observability` endpoint 拉

**借鏡點**:
- 我們之後 backend 的 logging:必須結構化 JSON,而非 text
- 每個 run 一個 correlation id,跨 doer / critic / git ops 都帶
- Web UI 不直讀 SQLite(避免 schema 改 UI 跟著掛),走 API endpoint
- 為 Phase 2 TUI / Phase 3 Web dashboard 鋪路

### 2.8 No-database 設計(反向參考)

Composio 沒 DB,純 YAML config + flat JSON 檔(`~/.agent-orchestrator/`、`running.json`、`last-stop.json`)。

**借鏡點**:
- 我們已決定上 SQLite — **這是反向參考**
- 但能學的:**MVP 期 SQLite 可以用最簡 schema + JSON column**(把複雜結構化欄位塞 JSON,先不 normalize),減少 migration 成本
- 真正關鍵狀態(running pipeline list、active workers)**也可以 mirror 到 flat JSON**,讓 crash 後人能直接看 / 編輯

### 2.9 Plugin spec 文件化

repo 內有 `PLUGIN_SPEC.md`、`ARCHITECTURE.md`、`observability.md`、`SECURITY-AUDIT-SUMMARY.md`,**寫得很正規**。是「自己也用 Claude Code 開發」的 dogfooding repo,所以特別重視文件。

**借鏡點**:
- 我們 backend 來了之後,docs 結構就照這個切:
  - `ARCHITECTURE.md` — 一張圖 + 各模組職責
  - `PLUGIN_SPEC.md` — 每個 plugin slot 的 interface
  - `OBSERVABILITY.md` — log / metric / trace 規範
  - `SECURITY.md` — workspace invariants / approval policy
- vibe-kanban Docs 也提到「**他們缺 architecture 頁**」— Composio 補了這個洞,值得學

## 3. 我們明確不做 / 走不一樣的方向

| 他們有 | 我們不做 / 走不同 | 原因 |
|---|---|---|
| 橫向 fan-out 多 issue 平行 | 縱向同題 iterate | 核心差異點 |
| 沒有 critic 自動審 | doer↔critic 二元 | 核心差異點 |
| 8 個 plugin slot 全開放 | 先抽 runner / notifier / tracker 三個 | 一次別開太多,scope 控制 |
| Tracker 必須(GitHub/Linear) | 自家 `.tickets/` YAML 為主 | 信條 #1 |
| 純 flat files | SQLite | critic loop 歷史值得留 |
| Web dashboard 是核心 UI | TUI [P2] / Web [P3] | 前期 CLI + 已實作的 React 畫面已足 |

## 4. Top 3 最值得學的設計決策

### #1 把外部系統當訊息匯流排
不發明自己的 IPC,讓 git branch + PR + CI status 當 agent 之間的協調媒介。簡單、可觀察、agent crash 也不掉狀態。我們可考慮:跨 ticket context 走 git commit metadata 而非 DB query。

### #2 Plugin slot 切 8 個且收斂(不是「什麼都能 plugin」)
明確列出哪幾個位置可換、其他鎖死在核心。反而讓使用者學得起來。我們應抽 `Tracker / Scm / Notifier / Workspace / Runtime` 五個 slot,加上已抽的 `Runner`,**不要再多**。

### #3 Session state machine `(state, reason)` + 殭屍偵測寫回
把「死掉但沒回報」提升到 invariant 等級,每次 reconcile 都掃,不靠 process 自己 cleanup。配合 reason 欄位讓 UI 能顯示 actionable 訊息。

## 5. 待解 / 未確認的點

- 與 Composio 主平台 tool catalog 的長期整合計畫(目前無顯著耦合)
- Web dashboard 用什麼 framework(可能 Next.js,未確認)
- Reaction system 的 YAML 完整 schema
- `/api/observability` 暴露的具體欄位

之後若需要這些點,直接看 https://github.com/ComposioHQ/agent-orchestrator 的 ARCHITECTURE.md / PLUGIN_SPEC.md。

---

# Appendix. 原始萃取(由 subagent 整理)

### 一句話定位
「在隔離的 git worktree 裡平行 spawn 多個 AI coding agent,讓它們自動修 CI、回 review,你只在一個 dashboard 監督。」repo 自稱「The Orchestration Layer for Parallel AI Agents」。

### 核心抽象
- **Agent**:具體幹活的 coding agent(Claude Code / Codex / Aider / Cursor / OpenCode / KimiCode),被當成可替換的 backend
- **Orchestrator**:中央協調器,決定 spawn 誰、把什麼回饋丟給誰、何時結束
- **Session**:一次 agent 工作的完整生命週期單位,(state, reason) 兩欄,terminal `done / terminated / stuck`
- **Workspace (git worktree)**:每個 agent 一個獨立 worktree + branch,物理隔離
- **Tracker / SCM / Notifier**:外部世界的接口抽象
- **Reaction**:對「CI 失敗」「review comment 進來」的自動處理規則
- **Plugin slot**:8 個可插拔位置(runtime / agent / workspace / tracker / scm / notifier / terminal / lifecycle)

### 主要功能模組
- 平行 spawn 多 agent,各自 worktree + branch + PR
- Reaction system:CI red → 自動把 log 丟回 agent;reviewer 留 comment → 自動轉派
- Web dashboard(localhost:3000)
- `ao` CLI:`ao start <repo-url>` 一鍵啟動
- YAML 設定檔(`agent-orchestrator.yaml`),Zod 驗證
- Plugin 架構:每 slot 一個 TS interface,第三方可實作(例 openclaw-plugin)
- Tracker:GitHub Issues、Linear
- Multi-runtime:tmux(mac/Linux 預設)、ConPTY/process(Windows)、Docker
- Observability:結構化 JSON log on stderr + 落地 snapshot,`x-correlation-id` 串聯
- Multi-instance:不同 config 路徑用 SHA256 hash 命名空間隔離

### 運作模型
- **Supervisor pattern**,中央調度,不是 peer-to-peer
- 平行為主,每 session 在自己 worktree 跑,完全隔離(無共享 in-memory state)
- 訊息傳遞靠**外部系統當匯流排**:git branch ↔ PR metadata ↔ CI logs ↔ review comments
- 失敗處理靠 reaction rules + state machine。`stuck` 是顯式 terminal state,有 `runtime_lost` reason 在 enrichment 階段偵測殭屍 session 寫回磁碟
- Human-in-the-loop:dashboard 監看 + 你親自 review PR;auto-merge 是可選的設定

### 與 model / tool 整合
- Agent 是 plugin slot,不綁特定模型 — 任何 CLI 型 coding agent 都能接,藉由 terminal/runtime 抽象
- **與 Composio 主平台關係薄弱**:Composio 主業是 1000+ app tool integration,但這 repo 沒顯著用到主平台 tool catalog,純粹 git/CI/PR 編排器(未確認長期計畫)

### 工作流程
1. `npm install -g @aoagents/ao` → `ao start <repo-url>`
2. 自動產生 `agent-orchestrator.yaml`
3. orchestrator 從 tracker 拉 issue,spawn agent
4. 每個 agent 在 `~/.agent-orchestrator/{hash}-{projectId}/` 下自己的 worktree 工作,推 branch、開 PR
5. CI 跑 / reviewer 留言 → reaction 把訊息丟回對應 agent 修
6. 在 dashboard 看 session 狀態、attach 進 tmux 看細節、或讀 `/api/observability`
7. PR 通過 → merge

### 技術棧
- TypeScript(88%)、pnpm、monorepo(`packages/{ao, cli, core, plugins, web, integration-tests}`)
- 執行層:tmux / ConPTY / Docker
- 儲存:**無資料庫**,YAML config + flat JSON 檔
- Web dashboard(Next.js 類,未確認版本)
- 3,288 test cases、MIT、6.9k stars

### Repo 觀察
- 6.9k stars / 930 forks / 372 open issues / 422 open PRs / 1,206 commits / 3,288 tests
- MIT、TypeScript monorepo
- production-ready,actively maintained,最近 release 2026-03-29
- 文件齊(AGENTS.md / CLAUDE.md / ARCHITECTURE.md / PLUGIN_SPEC.md / observability.md / SECURITY-AUDIT-SUMMARY.md),含設計文件 HTML
- **「自己也用 Claude Code 開發」的 dogfooding repo**
- 近期方向:state machine 改造、CLI 重設計、npm global install 修正、onboarding — 偏 polish 階段
