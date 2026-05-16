# 外部對照 ref — 競品借鏡索引

設計新功能 / 推進 backend 前,參考類似產品的成熟設計。三家都做過同類型(multi-agent / coding-agent orchestrator)但走不同路線,**互相補位**。

完整萃取在 `archive/` 四檔,本檔是「重點借鏡 + 不抄方向」濃縮索引。

---

## [archive/torque-2026-05-16.md](archive/torque-2026-05-16.md)

**runtorque/torque**(2026-05 新出,v1.1.0,23 stars,active)— macOS-first 桌面 multi-agent orchestrator,group / engineer / worker 三層,**MCP 物理隔離寫權限**。深度低(只看 README),要落地任一借鏡點前先挖對應 docs/。

**借鏡點**:
- **MCP scoping** — per-agent `.mcp.json` + `X-Torque-Cell-Id` header,daemon server 端 filter tool list(physical contract,no override flag)。解 VP 當前「禁止改 pipeline.json」純 prompt 自律的 leak 風險
- **Action = Jinja2 template + transitions DAG**(`implement → review → merge`)— prompt 重用,等 VP 有重複 ticket 套路再評估
- **Engineer wave 模式** — batch N parallel workers → 等齊 → review → 派下波。VP 線性派,跨 pipeline 才平行
- **Hooks 即時 event stream**(`SessionStart / PreToolUse / PostToolUse / Stop` → daemon `/events`)— 粒度到 tool call。VP 只到 ticket status

**不抄**:macOS-first / iTerm2 Toolbelt / pywebview native app / group 抽象 / inline terminal cell

---

## [archive/vibe-kanban-2026-05-09.md](archive/vibe-kanban-2026-05-09.md)

**BloopAI vibe-kanban**(已 sunset 但設計成熟,26k stars)— 人為主、agent 為工具的 kanban 編排器。

**借鏡點**:
- **task → attempt → execution_process 三層 model**(對應我們的 ticket → run → iteration)
- **Executor = profile,不是程式碼分支**(換 model / 換 provider 不改程式)
- **`Needs Attention` session 狀態**(對應我們的 paused 子狀態)
- **Repository lifecycle script 三契約**(setup / dev / cleanup)
- **Approvals 事前介入機制**(補我們 intervention 五型缺的「事前」這格)

**不抄**:Kanban 拖卡 UI、Cloud / Relay、Tauri、多 repo workspace

---

## [archive/symphony-2026-05-09.md](archive/symphony-2026-05-09.md)

**OpenAI Symphony**(reference impl,不會當產品線維護,22.7k stars)— 寄生 Linear、無 DB、純 reconcile 的 Codex 1:1 dispatcher。

**借鏡點**:
- **`WORKFLOW.md` 模式**(prompt + config + hooks 同檔、版控、熱 reload、front matter typed config)
- **Run Attempt 11 個明確 lifecycle state**(不是 success/fail 二分)
- **三層 timeout**(read / turn / stall)分開語意
- **Reconciliation-driven recovery**(每 tick 校對 source of truth,不靠 durable scheduler state)
- **Service / Agent 硬邊界**(orchestrator 只 read,mutate 全丟 agent)
- **Continuation retry vs exponential backoff 兩條路徑分開**
- **Workspace safety invariants**(cwd MUST 在 workspace、sanitize 規則、bash -lc hook)

**不抄**:寄生外部 tracker、無 DB、綁 Codex 一個 backend

---

## [archive/composio-ao-2026-05-09.md](archive/composio-ao-2026-05-09.md)

**Composio agent-orchestrator**(production-ready,actively maintained,6.9k stars)— 橫向 fan-out 多 issue 平行的 supervisor。**三個 ref 中最值得直接抄結構**。

**借鏡點**:
- **Plugin slot 切 8 個且收斂**(runtime / agent / workspace / tracker / scm / notifier / terminal / lifecycle)— 不是「什麼都能 plugin」
- **Session state machine `(state, reason)` 雙欄**(我們 SQLite `runs.status` 應拆成這形)
- **殭屍 session 偵測寫回 invariant**(每次 reconcile 都掃,不靠 process 自己 cleanup)
- **把外部系統當訊息匯流排**(git branch + PR + CI status,不發明 IPC)
- **Reaction 是 first-class 概念**(審核AI verdict / stall / budget warn / conflict 都是 reaction trigger)
- **結構化 JSON log + correlation id + `/api/observability`**(Web UI 不直讀 SQLite)
- **hash-based 路徑命名空間**(同 user 多 checkout 不撞名)

**不抄**:無 DB、橫向 fan-out 主流(我們是縱向 iterate)

---

## Top 跨 ref 共識(三家都做)

- **每個 attempt / session / run 一個 git worktree + branch + 隔離 cwd**
- **Workspace cwd 與路徑必須 sanitize、有 invariant 防 traversal**
- **Multi-agent CLI 走 subprocess + stdio**,不是 SDK / API
- **Reconciliation > Durable scheduler state**(state 對得上 source of truth 比保存 in-flight context 重要)

---

## 加新 ref 流程

- 命名 `archive/{產品名}-{YYYY-MM-DD}.md`
- 結構:§0 狀態警告 / §1 一句話定位+核心差異 / §2 借鏡點 / §3 不抄方向 / §4 Top 3 / §5 待解 / Appendix 原始萃取
- 在本檔上面加索引條目,描述「對方主路線一句話 + 重點借鏡 bullet」
