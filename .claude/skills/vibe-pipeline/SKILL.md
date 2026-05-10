---
name: vibe-pipeline
description: vibe-pipeline 專案總覽 — 產品定位、已實作畫面與功能、未實作功能(指向 ref)、設計信條、開發環境。在這個 repo 裡思考 scope、決策優先順序、判斷某需求是否在計畫內、回答「這個東西要不要做 / 做到哪」之前先讀。
---

> 當前 phase / 架構決策 / 開發環境 / 雷區 / repo 結構樹 → 在 root [`CLAUDE.md`](../../../CLAUDE.md) (always-on)。
> 本 SKILL 是 deep-dive:產品定位、已實作畫面細節、設計信條、未實作功能、外部對照 ref。

## 一句話定位

vibe-pipeline 是 **多 AI agent(執行AI + 審核AI)的 ticket / pipeline 編排器**,以 Web 應用為主介面,將來會配 `vp` CLI。每張 ticket 由 執行AI 跑、審核AI 審,iterative 模式會自動迴圈到 審核AI pass;pipeline 是 ticket 的有序組合,每條跑在獨立 git branch 上,完成後 merge 回 base。

## 產品形態

- **主介面**: Web 應用(Bun + Vite + React 18 + TypeScript)
- **CLI**: 命令名 `vp`(規劃中,跟 Web 共用底層)
- **資料**: phase 1-3 已落地,真接 backend(無 mock seed)

## Routes

| route | 用途 |
|---|---|
| `/` | redirect `/board` |
| `/board` | 主介面(Rail + FocusColumn + Inbox) |
| `/dev/states` | 狀態 gallery(改 RunButton / ReadyBanner 等視覺驗收用) |

之前 phase 1 prototype variant routes(`/notifications` `/init` `/drawer` `/qa`)已於 phase 3-5 砍掉,連同 pixel-diff 整套(playwright / pixelmatch / pngjs / 4 個 prototype component / NOTIFS_SEED / PIPELINES seed / tests/ 整個刪)。設計時確認 pixel-diff 不救,專心做 production code。`design/` 留歷史紀錄,real code 已不引用。

## 未實作 / 計畫中

主 spec 在 [refs/spec-2026-05-09.md](refs/spec-2026-05-09.md)(2026-05-09 版,使用者標示「不是最終結果,以後會更新」)。包含三層:

- `[M]` MVP — 專案 init、Ticket/Pipeline schema CRUD、執行AI+審核AI、iterative loop、branch lifecycle、SQLite log、exclusive lock、CLI 命令集
- `[P2]` Phase 2 — Q&A 收斂引擎、stall detection、intervention 五型、budget tracker、context retrieval、worktree 並行、TUI dashboard
- `[P3]` Phase 3 — AI 輔助 merge 衝突、多 pipeline 並行 scheduler、plugin、第三方通知

之後若有更新版 spec,新增 `refs/spec-YYYY-MM-DD.md` 並在這裡 update 索引。**不要直接覆蓋舊 ref**,留下歷史。

## 外部對照 ref

設計新功能 / 推進 backend 前,參考類似產品的成熟設計。三個 ref 都做過同類型(multi-agent / coding-agent orchestrator)但走不同路線,**互相補位**。

### [refs/archive/vibe-kanban-2026-05-09.md](refs/archive/vibe-kanban-2026-05-09.md)
BloopAI vibe-kanban(**已 sunset** 但設計成熟,26k stars)。**人為主、agent 為工具**的 kanban 編排器。
- **task → attempt → execution_process 三層 model**(對應我們的 ticket → run → iteration)
- **Executor = profile,不是程式碼分支**(換 model / 換 provider 不改程式)
- **`Needs Attention` session 狀態**(對應我們的 paused 子狀態)
- **Repository lifecycle script 三契約**(setup / dev / cleanup)
- **Approvals 事前介入機制**(補我們 intervention 五型缺的「事前」這格)
- 不抄:Kanban 拖卡 UI、Cloud / Relay、Tauri、多 repo workspace

### [refs/archive/symphony-2026-05-09.md](refs/archive/symphony-2026-05-09.md)
OpenAI Symphony(**reference impl,不會當產品線維護**,22.7k stars)。**寄生 Linear、無 DB、純 reconcile** 的 Codex 1:1 dispatcher。
- **`WORKFLOW.md` 模式**(prompt + config + hooks 同檔、版控、熱 reload、front matter typed config)
- **Run Attempt 11 個明確 lifecycle state**(不是 success/fail 二分)
- **三層 timeout**(read / turn / stall)分開語意
- **Reconciliation-driven recovery**(每 tick 校對 source of truth,不靠 durable scheduler state)
- **Service / Agent 硬邊界**(orchestrator 只 read,mutate 全丟 agent)
- **Continuation retry vs exponential backoff 兩條路徑分開**
- **Workspace safety invariants**(cwd MUST 在 workspace、sanitize 規則、bash -lc hook)
- 不抄:寄生外部 tracker、無 DB、綁 Codex 一個 backend

### [refs/archive/composio-ao-2026-05-09.md](refs/archive/composio-ao-2026-05-09.md)
Composio agent-orchestrator(**production-ready,actively maintained**,6.9k stars)。**橫向 fan-out 多 issue 平行**的 supervisor。三個 ref 中最值得直接抄結構。
- **Plugin slot 切 8 個且收斂**(runtime / agent / workspace / tracker / scm / notifier / terminal / lifecycle)— 不是「什麼都能 plugin」
- **Session state machine `(state, reason)` 雙欄**(我們 SQLite `runs.status` 應拆成這形)
- **殭屍 session 偵測寫回 invariant**(每次 reconcile 都掃,不靠 process 自己 cleanup)
- **把外部系統當訊息匯流排**(git branch + PR + CI status,不發明 IPC)
- **Reaction 是 first-class 概念**(審核AI verdict / stall / budget warn / conflict 都是 reaction trigger)
- **結構化 JSON log + correlation id + `/api/observability`**(Web UI 不直讀 SQLite)
- **hash-based 路徑命名空間**(同 user 多 checkout 不撞名)
- 不抄:無 DB、橫向 fan-out 主流(我們是縱向 iterate)

### Top 跨 ref 共識(三家都做)
- **每個 attempt / session / run 一個 git worktree + branch + 隔離 cwd**
- **Workspace cwd 與路徑必須 sanitize、有 invariant 防 traversal**
- **Multi-agent CLI 走 subprocess + stdio**,不是 SDK / API
- **Reconciliation > Durable scheduler state**(state 對得上 source of truth 比保存 in-flight context 重要)

### 加新 ref 流程
- 命名 `refs/{產品名}-{YYYY-MM-DD}.md`
- 結構:§0 狀態警告 / §1 一句話定位+核心差異 / §2 借鏡點 / §3 不抄方向 / §4 Top 3 / §5 待解 / Appendix 原始萃取
- 在本段加索引條目,描述「對方主路線一句話 + 重點借鏡 bullet」

## 設計信條(從 spec 蒸餾,實作時別丟)

1. **單一定義源** — Ticket / Pipeline / SKILL 只在 YAML,SQLite 是執行狀態的快取
2. **Branch 是並行邊界** — 不靠 worktree、不靠 lock,靠 git branch 隔離
3. **人工 approve SKILL** — AI 永遠不直接寫 SKILL.md,只能 stage 候選
4. **跨 pipeline 不直傳 context** — 一律走 SKILL 中介
5. **Critic fail 不等於 ticket fail** — Iterative 會重試,Pipeline-step 走 `on_fail` action
6. **Exclusive lock 永遠優先於並行** — Deploy/DB 不管在哪 branch 都鎖
7. **無 `max_iter` 預設** — 用 stall detection 替代次數上限

## 開發環境 / 子 SKILL 對應

→ 都在 root [`CLAUDE.md`](../../../CLAUDE.md)。本 SKILL 不重複。
