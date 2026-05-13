# vibe-kanban 精神萃取(2026-05-09)

> 來源:
> - https://github.com/BloopAI/vibe-kanban
> - https://www.vibekanban.com/docs
>
> 由兩個 subagent 並行擷取(分別看 repo 與 docs),由本檔彙總精煉,作為 vibe-pipeline 功能發展的對照參考。**不是要抄 vibe-kanban 的功能 / UX,是抓設計精神與已被驗證可行的抽象模型。**

## 0. 必讀的「狀態警告」

**vibe-kanban 已宣布 sunsetting**(README + 官網都掛公告)。設計很成熟(26.1k stars / 2070 commits / 284 releases),但別期待後續維護。意思是:抄設計沒問題,**抄 codebase 風險自負**(不會修 bug)。從近期方向看 — 推 remote / relay / tunnel,猜測想做 SaaS 但沒能商業化所以收。

## 1. 一句話定位 + 與我們的核心差異

| 維度 | vibe-kanban | vibe-pipeline |
|---|---|---|
| 主流程 | **describe → review → ship**(人為主、agent 為工具) | **doer → critic loop**(自動為主、人為 fallback) |
| 主視覺 | Kanban 拖卡 | Pipeline run timeline + critic verdict |
| Review | 人工(看 diff、留 comment、按 PR) | critic agent 自動(critic fail 不等於 ticket fail,可重試) |
| 多 agent | 多 session 共享檔案、不共享對話(可平行 backend/frontend) | doer 與 critic 是固定二元角色 |
| 自我定位 | 「規劃與審查的加速器,不是 coding agent」 | 「ticket / pipeline 編排器,不是 coding agent」 |

**他們明確不做:critic 角色**(review 全人工)。**這是我們的差異點**,別跟他們一樣。

## 2. 對齊我們架構的核心抽象(直接借鏡)

### 2.1 「task → attempt → execution_process」三層 model

vibe-kanban 把每個需求拆成:
- **task**(=我們的 ticket):卡片 / spec
- **attempt**(=我們的 pipeline run):**一張 task 可有多個 attempt 平行**,各自綁 git branch + worktree + executor profile
- **execution_process**(=我們的 doer/critic call):attempt 內一次 process 啟動,帶 logs + repo state snapshot

**借鏡點**:
- attempt 是**一等公民**,不是 task 的隱藏實作。同 ticket 多 attempt 平行,完美對應 LLM 不確定性
- 每層都持久化(他們用 SQLite + SQLx),UI 端可重播
- 我們的 SQLite schema(`runs / iterations / interventions / budget_ledger`)應確認對齊這三層,特別是 `runs` 對應 attempt、`iterations` 對應 execution_process

### 2.2 Executor 抽象層 / Profile 機制

vibe-kanban 的 `crates/executors/src/executors/` 一個 agent CLI 一個 .rs(claude / codex / cursor / gemini / amp / copilot / droid / opencode / qwen),共用 trait(spawn → stdout 解析 → approval hook → model 切換)。

**Profile** = 同一個 agent CLI 的多個 preset(Default / Opus / Plan / Approvals…),attempt 啟動時挑一個。**換 model 不改程式碼,只改 profile**。Profile 內可有 env var,override shell env(讓不同 profile 接不同 provider:Z.ai / OpenRouter / 自架),不污染預設環境。

**借鏡點**:
- 我們的 `Runner` 介面(已寫在 backend SKILL)走同樣方向 — 一個 agent 一個 module,共用 trait
- 加上 **profile 層**:`runner_id + profile_id` 才是完整 executor 身份。`config.yaml` 應有 `runners.<id>.profiles.<name>` 結構
- profile 暴露 agent 細節(例 Codex 的 `sandbox` / `approval` / `model_reasoning_effort`,Claude Code 的 `plan` / `dangerously_skip_permissions`),用「**危險選項用名字本身警告**」原則(見 §6)

### 2.3 Workspace = git worktree + 多 repo + 多 session

vibe-kanban 的 workspace:
- 對 git 的具現化是 **worktree + 命名分支**(範例 `vk/abc123-task`)
- 一個 workspace 可掛 **多個 repo**,agent 可跨 repo 看 + coordinated change(但 git 操作仍 per-repo)
- 內含**多個 session**,session 共用檔案、不共享對話 context

**借鏡點**:
- worktree 我們已在 [P2] 規劃,但**「多 repo 一個 workspace」是新角度**。若未來有跨 repo pipeline,workspace 應是聚合單位
- 「多 session 共用檔案、各自對話」對應我們之後若想做 doer/frontend + doer/backend 並行(同 attempt 內不同 agent 並行寫不同檔)

### 2.4 Session 狀態 `Needs Attention`

vibe-kanban session 三狀態:Running / Idle / **Needs Attention**(等使用者批准)。

**借鏡點**:
- 我們的 ticket status 目前 `paused` 是個 catch-all(stall / budget / conflict / intervention 都歸 paused)。應拆出 **`needs_attention`** 子狀態,讓 UI 能 surface 真正卡住的東西
- Notifications 畫面對應的「block」severity item 就是這類

### 2.5 Repository lifecycle script 三契約

vibe-kanban 對 repo 設定要求三段 script:
- **Setup**(一次性裝依賴)
- **Dev Server**(必須印 URL 到 stdout,讓 preview 自動偵測)
- **Cleanup**(必須 idempotent)

**借鏡點**:
- 我們之後讓 critic 「跑起來看」(e.g. e2e 驗證、preview)時,需要 user 提供類似契約
- **「對 user script 提硬性 contract」這個設計哲學**值得抄 — 文件層面就把 contract 寫死,不靠約定俗成

### 2.6 Approvals model

agent 要做敏感動作前 → 存 pending approval → UI 出 button → 人按了才繼續。

**借鏡點**:
- 我們的 [P2] intervention 五型(`edit_prompt / append_prompt / redo_qa / override_pass / abort`)是「**事後**介入」
- **可以加一型 approval = 事前介入**:critic 想 reject,但 doer 標記「我要做敏感操作前先問人」 → pause 等 approval
- 對應信條 #3「人工 approve SKILL」延伸到「人工 approve dangerous action」

### 2.7 ts-rs 自動產 TS 型別

Rust struct 用 `ts-rs` macro 自動產 TypeScript 型別,前端直接 import。

**借鏡點**:
- 若我們 backend 走 Rust(待定)→ ts-rs 直接照抄
- 若走 Bun + TS → 整個 monorepo 共用 type,不用工具,但**設計上 backend 是 type single source of truth** 這原則照搬
- 目前 `src/types/` 已是 frontend 的 source。未來 backend 來時,**type 從 backend 端定義,frontend import**,不要兩邊各寫一份

### 2.8 自身暴露 MCP server

vibe-kanban 自己是 MCP server,讓外部 agent 能反過來操作 kanban(查歷史 attempt、開新 attempt、改 task 狀態)。

**借鏡點**:
- 我們 [P3] 可考慮:vibe-pipeline 也暴露 MCP server,讓 critic 能 query 歷史 run、讓外部 Claude Code 能 `/vp ticket new` 之類
- 但**暫時不用做**,等核心穩定再說

## 3. UX / Onboarding 借鏡

### 3.1 Zero-config 起手:`npx vibe-kanban`

第一次跑問三題:用哪個 agent / 用哪個 IDE / 要什麼 notification → 上路。

**借鏡點**:
- `vp init` 的 first-run 可以走同模式:三題定 doer runner / critic runner / notification 通道
- 已實作的 Init 畫面就是這個方向(顯示 `tt init` 命令 + .tickets/ tree preview)

### 3.2 Command bar (Cmd+K) 條件顯示

fuzzy search,**條件顯示**(例 Push 只有有未推 commit 才出現)。

**借鏡點**:
- 之後 Web UI / CLI 都加 command palette。命令隨 context 變化(active pipeline 才出現 `pause`、有 paused ticket 才出現 `resume`)

### 3.3 Slash command 不自造

vibe-kanban 自動發現各 agent 原生 slash command(`/compact`、`/review`、`/init`、`/model`…),不另造一套包在自己 UI 裡。

**借鏡點**:
- 我們的 chat / Q&A 介面**不要重造 agent 的 slash command 系統**。透傳即可
- 但 `vp` 自己的命令(e.g. `vp ticket new`)是另一回事,該有的還是要有

### 3.4 危險選項用名字警告

`dangerously_skip_permissions` / `danger-full-access` / `skip-permissions-unsafe` — 名字本身就是警告,文件不用花段落解釋。

**借鏡點**:
- 我們的 `exclusive: true`、`auto_merge_on_complete: true`、`force: true` 等 flag 命名遵循同原則
- Spec 已提的「破壞性操作確認 prompt」可加上「flag 名稱本身也要醒目」

## 4. 文件 / Docs 寫作借鏡

### 4.1 `llms.txt` 當官方 sitemap

一個檔列完所有 `.md` URL,LLM / agent 友善。

**借鏡點**:
- 我們之後若有官方 docs,直接放 `/llms.txt`(指向所有 docs page)
- 對 SKILL 系統也適用:`.claude/skills/llms.txt` 列完所有 SKILL.md 路徑

### 4.2 每個概念頁先給「定義一句話」再展開

workspace / session / command bar / MCP 都這樣寫,沒有行銷話術鋪陳。

**借鏡點**:
- 我們三個 SKILL 已大致這樣做(主 SKILL 開頭就一句話定位)
- Docs 寫作時:每個 concept 一句話定義 → 然後例子 → 最後 contract / API

### 4.3 文件結構分區

vibe-kanban 八大區:**Agents / Core Features / Cloud Features / Integrations / Self-Hosting / Settings / Workspaces / Security**。明顯側重 Workspace(12 篇)+ Cloud(12 篇)。

**他們缺什麼**:沒 architecture / 資料模型頁、沒 API reference、沒 CLI flag 完整 ref、沒 changelog、沒 concepts overview 把 issue/workspace/session/attempt 關係畫圖。

**借鏡點**:
- 我們的 docs(未來)應**有** concepts overview 圖(pipeline / ticket / run / iteration 關係)
- **有** CLI ref(`vp --help` 自動產)
- **有** SQLite schema 頁(從 migration 自動產)

## 5. 我們明確不做 / 走不一樣的方向

| 他們有 | 我們不做 / 走不同 | 原因 |
|---|---|---|
| Kanban 拖卡 UI | Pipeline run timeline | 我們是自動 loop 為主,看板拖卡是給人為主流程的 |
| Cloud / Relay / WebRTC tunnel | 不做(至少 P3 前) | scope 爆炸,且非核心 |
| Tauri desktop app | 不做 | Web 應用 + CLI 已涵蓋 |
| 內建 dev server preview / PTY 在 UI | 不做(至少 P2 前) | 是 nice-to-have,不是核心。critic 要「跑起來看」可走 sandbox 路線 |
| GitHub OAuth + 內建 PR UI | 走 `gh` CLI | 跟他們一樣外包給 `gh`,不重造輪子 |
| 多 repo workspace | 暫不做 | 單 repo 還沒做穩 |
| Plan mode 是 profile | 不一定 | Q&A engine 是我們對「規劃」的解法,跟 plan mode 性質不同 |
| Mobile remote pairing | 完全不做 | 跟產品定位無關 |

## 6. Top 3 最值得學的設計決策

### #1 Attempt 是一等公民
同一個需求允許多次嘗試、平行嘗試、保留歷史 attempt 比較,完美對應 LLM 不確定性。**比「一張 ticket 一條 branch」彈性高一個量級**。我們的 `runs` table 本質上已是 attempt,但 UI / CLI 應 surface 這層概念,而不是只談 ticket。

### #2 Executor = profile,不是程式碼分支
同一 agent CLI 多個 preset(Default / Opus / Plan / Approvals),attempt 啟動挑一個。**換 model / 換 provider 不改程式**。Profile 可帶 env var override shell env,讓多 provider 共存乾淨。

### #3 內部 model 直接驅動 TS 型別
Rust backend (or 任何 backend) 是 type single source of truth,前端永遠跟得上 schema 變動。Monorepo 重構成本驟降。我們應確保 backend 來時不要前後端各寫一份 type。

## 7. 待解 / 未確認的點

- vibe-kanban 的 approvals UX flow 細節(只看到 model,沒看到實際 UI)
- 自身 MCP server 暴露的具體 tool 集合(未抓到)
- critic 角色是否曾出現在 roadmap(從 model 名沒看到,推測從未做)
- Cloud features 的 12 篇細節(只看到分區,沒展開)
- VS Code 擴充的具體做什麼(未涵蓋)

之後若需要這些點,可重新查 https://github.com/BloopAI/vibe-kanban 或 https://www.vibekanban.com/docs。

---

# Appendix A. GitHub repo 原始萃取

> 由 subagent 抓 repo / src 結構萃取,保留原始觀察供回溯。

### 一句話定位
給 coding agent 用的 Kanban 看板:把每張 ticket 變成「在隔離 worktree 裡跑某個 agent」的執行單位,讓人類在同一個 UI 裡規劃、監看多個 agent 並行幹活、審 diff、開 PR。Slogan「Get 10X more out of Claude Code, Codex or any coding agent」。

### 核心抽象(從 `crates/db/src/models/`)
- **project**:綁一個 git repo
- **task**:看板上的一張卡(有 spec / 描述)
- **task_attempt**:同一張 task 的「一次嘗試」,綁定 git branch + worktree + executor profile
- **execution_process**:一個 attempt 裡實際 spawn 出去的 process(agent CLI、dev server、setup script 等),帶 logs 與 repo state snapshot
- **session**:對話/互動 session
- **workspace / workspace_repo**:跨 repo 的工作區概念
- **coding_agent_turn**:agent 的一輪對話/動作
- **merge / pull_request**:把 attempt 結果整合回去
- **executor profile**:agent 的設定檔(用哪個 CLI、哪個 model、什麼 args)

### 主要功能模組
1. Kanban 板:拖拉 task 改狀態
2. Attempt orchestration:同一 task 多次/平行嘗試,各自 worktree + branch
3. Executor 抽象層(`crates/executors`):統一介面套到 10+ 個 agent CLI
4. 內建 diff viewer + inline review comment
5. 內建 dev server / preview proxy:每 attempt 自帶可啟動 dev server,內建 browser preview 含 devtools / inspect / device emulation
6. 內建 terminal:每 attempt 一個 PTY
7. PR 整合:auto-generate PR description、走 GitHub review、merge
8. Approvals:agent 動作前的人類核可機制
9. Notification 通道
10. MCP 支援:自己也是 MCP server,讓 agent 能反向操作 kanban
11. PR monitor:背景輪詢 PR 狀態
12. Remote / relay 模式:整套 relay-* crates 撐遠端部署 + 自架 tunnel
13. Tauri desktop app

### 多 agent CLI 整合
支援:Claude Code, Codex, Gemini CLI, GitHub Copilot, Amp, Cursor, OpenCode, Droid, CCR, Qwen Code。

整合 = subprocess。每 agent 一個 .rs(claude.rs / codex.rs / cursor.rs / ...),共用 `command.rs` 跑 process、`logs/` 收 stdout、`stdout_dup.rs` 同時轉發、`mcp_config.rs` 注入 MCP 設定、`model_selector.rs` 選 model、`profile.rs` 是 executor 的可序列化設定、`approvals.rs` hook agent 動作核可。另有 `acp/` 子目錄推測對應 Agent Client Protocol。

排程:每 attempt 開 git worktree → spawn agent CLI → stream stdout 進 SQLite + WS push 給 UI。

### 工作流程
1. `npx vibe-kanban` 起服務
2. 連 GitHub repo 建 project
3. 在 kanban 開 task,寫 spec
4. 點 Start attempt → 選 executor profile → 系統開 worktree、開 branch、spawn agent
5. UI 即時看 stream log / terminal / dev server preview
6. agent 跑完 → 看 diff,inline 留 review comment
7. 不滿意 → 開新 attempt,或續跑現有 attempt
8. 滿意 → 開 PR(AI 寫 description) → merge

### 技術棧
- 後端:Rust workspace,Axum(推測),SQLx + SQLite(local)/ Postgres(remote 模式),ts-rs 把 Rust struct 自動產 TS 型別
- 前端:React + TypeScript + Vite + Tailwind,monorepo 切 `local-web` / `remote-web` / `web-core`
- 打包:pnpm workspace,Cargo workspace,`npx-cli` 包成單一 npm 套件
- 桌面:Tauri
- 遠端:自家 relay(WebRTC + WS + tunnel)
- License:Apache-2.0

### Repo 觀察
- 26.1k stars / 2.7k forks / 2070 commits / 284 releases(最新 v0.1.44, 2026-04)
- Topics: agent, ai-agents, kanban, management, task-manager
- Apache-2.0
- 521 open issues 顯示需求面廣
- **狀態:已宣布 sunsetting**

---

# Appendix B. Docs 原始萃取

> 由 subagent 抓 https://www.vibekanban.com/docs 全站萃取。

### 核心心智模型
產品自我定位是「**規劃與審查的加速器**」,不是 coding agent 本身。核心命題:「開發瓶頸不在寫 code,而在 plan 與 review」。工作流被刻意壓成三步——**describe → review → ship**。

心智模型分兩階段:
1. 在 kanban 上把「想要什麼」描述清楚成 issue
2. 把 issue 丟進「workspace」這個被 git worktree 隔離的執行盒讓 agent 跑,人只負責看 diff、留 inline comment、決定要不要 PR

Agent 是被抽象掉的可換零件;產品本身只擁有「issue / workspace / session」這套架構。**Agent 不能自主 push / merge,所有對外 git 動作必須人類授權**——這是它的安全骨架。

### Onboarding
單一指令 `npx vibe-kanban`。第一次跑問三件:用哪個 coding agent、用哪個 IDE、要什麼 notification。接著決策:登入 GitHub/Google(才能用 kanban、issue、team)或跳過(只能用 workspace)。登入後系統自動建一個 personal organization 和 starter project。

### 概念與術語
- **Issue**:規劃單位。欄位 title / description / priority / assignee / tags。生命週期 To Do → In Progress → In Review → Done(加 Backlog / Cancelled 兩個隱藏狀態)。支援 sub-issue,但**子完成不會自動完成 parent**(刻意設計)
- **Workspace**:一個目標的隔離執行盒,內含多個 repo + 多個 session。對 git 的具現化是 worktree + 命名分支(`vk/abc123-task`)
- **Session**:workspace 內的單一 agent 對話 thread。**多 session 共享檔案、不共享對話 context**。三狀態:Running / Idle / **Needs Attention**(等使用者批准)
- **Agent**:外部 CLI 的 adapter,不是內建 LLM
- **Profile / Variant**:同一 agent 多個設定檔(Default / Opus / Plan / Approvals…)
- **Attempt**:同一 issue 可開多個 workspace 平行嘗試
- **Tag**:可重用的文字片段(prompt 模板用)

### 配置
七大分頁,分四層 scope:
- **Global / User**:General(主題、預設 agent、editor、git 分支前綴、worktree 目錄、通知音效、push notification、telemetry、送出快捷鍵 Enter vs Ctrl+Enter)、Agents、MCP Servers
- **Project-level**:Projects、Repositories(三 script:Setup / Dev Server / Cleanup)
- **Org-level**:Organization Settings、Remote Projects
- **Per-agent**:Profile 內的 env vars 會 override shell env

Agent 設定粒度做得很細,例如:
- Codex:`sandbox`(read-only / workspace-write / danger-full-access)、`approval`(untrusted / on-failure / on-request / never)、`model_reasoning_effort`、`model_reasoning_summary`
- Claude Code:`plan`、`dangerously_skip_permissions`
- Droid:`autonomy` 階梯
- 共通:`append_prompt`

### 整合
- **GitHub**:刻意做窄,完全靠外部 `gh` CLI
- **Azure Repos**:獨立頁
- **MCP Server**:一鍵裝模板(Playwright / Sentry / Notion)或手動 JSON;**per-agent 綁定**
- **VSCode 擴充**:獨立頁
- **vibe-kanban 自己的 MCP server**:讓外部 agent 反向操作
- **Editor**:VS Code / Cursor / Windsurf / Zed / Neovim,支援 Remote SSH host
- **Browser**:內建 preview,自動偵測 dev server 印的 URL;**click-to-component** 把 React/Vue/Svelte/Astro/HTML 元件 metadata 直接灌進 chat context

### 工作流模式
- Single agent / single session 直線跑
- **Multi-session per workspace**:一 workspace 內 backend / frontend 開不同 session
- **Multi-attempt per issue**:同 issue 開多個 workspace 平行
- **Multi-repo workspace**:一 workspace 掛多 repo
- **Plan mode**:Claude Code / Codex 有專屬「先規劃後執行」profile
- **Slash command 在 chat 內輸入**:自動發現各 agent 原生 slash command(`/compact`、`/review`、`/security-review`、`/init`、`/pr-comments`、`/model`…)
- **Mobile remote access**:host 機產 pairing code,手機到 cloud.vibekanban.com 配對

### 治理 / 安全 / 失敗處理
- agent 沒 push / merge 權,所有外送動作要人按
- 危險操作走 agent profile 的 sandbox / approval 旗標
- Conflict:跳 dialog 列出衝突檔,讓人在 editor 解、標 resolved
- **Rebase early、PR early** 寫成最佳實踐
- Auth 全外包(`gh` CLI、OAuth)
- 失敗模式文件只列三種:sparse-checkout 撞到的「empty codebase」、`RUST_LOG=debug` 收 verbose log、砍 OS application data dir 重置
- Self-host 走 Docker Compose:Postgres + ElectricSQL + remote server + Caddy 自動 HTTPS
- 有 responsible disclosure 頁

### 文件結構
八大區:**Agents(10 篇,一 agent 一頁)/ Core Features / Cloud Features(12 篇)/ Integrations / Self-Hosting / Settings / Workspaces(12 篇)/ Security**。

明顯**缺**:architecture / 資料模型頁、API reference、CLI flag 完整 ref、changelog / migration、pricing 比較、concepts overview 圖、critic / 自動審查機制(產品根本沒做這層)。
