# vibe-pipeline

多 AI agent(執行AI + 審核AI)的 ticket / pipeline 編排器。Web 應用為主介面,將來配 `vp` CLI。每張 ticket 由 執行AI 跑、審核AI 審,iterative 模式自動迴圈到 審核AI pass;pipeline 是 ticket 的有序組合,每條跑在獨立 git branch,完成後 merge 回 base。

## 當前 phase(2026-05-10)

**Phase 3 第一刀已落地**:Pipeline runner — 主 agent (claude CLI session) 執行 ticket、worktree per pipeline、run/pause UX、notif emit on pipeline events。

**已完成**
- Phase 1 — Project / Pipeline CRUD + .vibe-pipeline/ JSON 持久化 + git init / reveal
- Phase 2 — QA drawer + claude CLI 整合 + Draft store + Spec checklist + Multi-select option
- Phase 3 第一刀 — git worktree per pipeline、runner orchestrator (claude CLI session as 主 agent + Task tool 派 sub-agent)、Pipeline state machine 加 stopping、Ticket 加 failed_iter_limit / failed_transient、Run/Pause endpoints + Frontend RunButton + polling、Crash recovery on startup、Notif store (`.runtime/notifs.jsonl`) + emit on pipeline_started/ready/paused/failed + ticket_started/done/failed (透過 fs.watch 偵測 pipeline.json 變化) + frontend inbox 接 backend

**架構決策**:Bun local server + browser(前端 Vite 5173 / 後端 Bun 3001 / `/api/*` 透過 Vite proxy)。

**還沒做(下個 iteration)**
- 實際 spawn claude 跑一張 step ticket end-to-end(需要燒 API)
- iter 迴圈實測(主 agent 可能要再調 prompt)
- Transient retry 真正觸發(orchestrator hook 在,要邏輯)
- Budget tracker / SQLite log / SKILL 蒸餾(P2+/P3)

**計畫 ref**
- [phase 1 plan(已落地)](.claude/skills/vibe-pipeline/refs/integration-plan-v1-2026-05-09.md)
- [phase 2 QA plan(已落地)](.claude/skills/vibe-pipeline/refs/integration-plan-v2-qa-2026-05-09.md)
- [phase 3 runner plan(進行中)](.claude/skills/vibe-pipeline/refs/integration-plan-v3-runner-2026-05-10.md)
- [git design](.claude/skills/vibe-pipeline/refs/git-design-2026-05-09.md)

phase 推進時主動更新本段。

## Repo 結構(物理路徑 single source of truth)

> **集中規則**:repo 的物理檔案 / 目錄結構**只在這裡寫一份**。SKILL 內不再畫樹,只寫該層的「約定 / 職責邊界 / 思想」。新增資料夾或重組時改本段,SKILL 自動跟著對。

### Repo 內

```
vibe-pipeline/
├── CLAUDE.md                  本檔(always-on)
├── package.json               Bun + Vite + React + TS deps
├── bun.lock
├── tsconfig.json
├── vite.config.ts             dev server,串接期加 /api → :3001 proxy
├── index.html                 Vite 入口,有 inline theme sync script
│
├── src/                       前端。約定見 vibe-pipeline-frontend SKILL
│   ├── App.tsx                router (BrowserRouter + Routes)
│   ├── main.tsx               React mount,import 全域 CSS (tokens/board/notif)
│   ├── shell/
│   │   ├── AppShell.tsx       slot-based shell (topBar/banner/rail/main/aside/overlay)
│   │   ├── EmptyShell.tsx     全屏自由排版 (Init 用)
│   │   ├── TopBar.tsx
│   │   └── Rail.tsx
│   ├── ui/                    跨 feature 通用基礎元件
│   │   ├── icons.tsx          ~20 個 icon + BannerIcon kind switch
│   │   ├── Logo.tsx
│   │   └── PickerSelect.tsx
│   ├── features/
│   │   ├── notifications/     NotificationsScreen + InboxColumn + NotifBanner
│   │   ├── pipeline/          BoardScreen + FocusColumn + EmptyProject
│   │   ├── pipelineCreate/    CreateCard + CreatePlaceholder
│   │   ├── init/              InitScreen (全屏 prototype) + InitPopup (modal,phase 1 用)
│   │   ├── drawer/            DrawerStage + 4 個 state 元件 (prototype 用,還沒接資料)
│   │   └── qa/                QADrawer + useQA (phase 2 — 真接 backend) + QAScreen (prototype 4 variant)
│   ├── styles/                從 prototype 1:1 移植
│   │   ├── tokens.css         設計 token (CSS 變數,顏色/字型/spacing)
│   │   ├── board.css
│   │   ├── notif.css
│   │   ├── init.css
│   │   ├── drawer.css
│   │   └── qa.css
│   ├── data/                  mock seed (尚未全接 backend)
│   │   ├── pipelines.ts       STATE_COLOR/LABEL + fmtElapsed (PROJECTS dead, 之後刪)
│   │   └── notifications.ts   NOTIFS_SEED + SEV_COLOR + SECTION_LABEL
│   ├── types/                 過渡型別 (UI-only)
│   │   ├── pipeline.ts        UI 計算用 IterState / ChatMsg 等
│   │   └── notif.ts           InboxState / InboxFilter / NotifItem (UI display)
│   ├── api/                   每 endpoint 一個 fetchXxx() 函式
│   │   ├── projects.ts        /api/projects/* 全部
│   │   └── qa.ts              /api/.../qa/* (start/turn/finalize/cancel/drafts/getDraft)
│   ├── hooks/
│   │   └── useActiveProject.ts  URL ?project=hash + localStorage fallback
│   └── router/                (規劃) buildPath helper
│
├── server/                    後端。職責邊界見 vibe-pipeline-backend SKILL
│   ├── index.ts               Bun.serve 入口,route 表
│   ├── routes/                純 dispatch,不寫業務邏輯
│   │   ├── projects.ts        /api/projects/* (含 pipelines CRUD + git-init + reveal)
│   │   └── qa.ts              /api/.../qa/* (start / turn / finalize / cancel / drafts)
│   └── lib/                   純 IO + 邏輯,不知道 HTTP
│       ├── projectStore.ts    ~/.vibe-pipeline/state.json 讀寫
│       ├── pipelineDir.ts     <target-repo>/.vibe-pipeline/ 偵測 / 建立 / json 讀寫
│       ├── hash.ts            absolute path → 8-char sha256
│       ├── dialog.ts          OS native folder picker (osascript/powershell/zenity) + revealFolder
│       ├── git.ts             hasGit / gitInit
│       ├── git/
│       │   └── worktree.ts    ensure / remove / prune (per pipeline,~/.vibe-pipeline/worktrees/<h>/<id>)
│       ├── runner/
│       │   ├── orchestrator.ts spawn 主 agent (claude session) + log file + recoverStale
│       │   ├── ticketWatcher.ts fs.watch pipeline.json + diff status → emit ticket_* notif
│       │   └── runnerPrompt.ts RUNNER_BEHAVIOR_PROMPT (主 agent 流程定義)
│       ├── notifs/
│       │   └── store.ts       emit / list / markRead / dismiss → .runtime/notifs.jsonl
│       └── qa/
│           ├── claudeCli.ts   spawn `claude -p` + parseReply 4-fallback + enforceContract
│           ├── draftStore.ts  qa-drafts/<id>.json fs CRUD + appendTurn + markStarted
│           ├── systemPrompt.ts  QA_BEHAVIOR_PROMPT (鎖死) + DEFAULT_OPENING_MESSAGE
│           └── schema.ts      QA_REPLY_SCHEMA + re-export TicketSpec / QAReply / isCompleteSpec
│
├── shared/                    跨 backend/frontend 持久化型別
│   └── types.ts               Project / TicketSpec / QAReply / Turn / Draft / NOTIF_EVENTS
│
├── design/                    Claude Design 匯出的 handoff bundle
│   └── vibe-pipeline/
│       ├── README.md          設計師給 coding agent 的引導
│       ├── chats/             8 份設計過程對話 (chat1.md ~ chat8.md)
│       └── project/
│           ├── Prototype - {Notifications,Board,Init,Pipeline Create,Ticket Drawer,Ticket QA}.html
│           ├── Prototype Overview.html
│           ├── Wireframe v3.html
│           ├── proto/         {board,notif,init,drawer,qa}.{jsx,css} + tokens.css
│           ├── wireframes/    早期 wireframe jsx
│           ├── tweaks-panel.jsx
│           └── ...
│
├── tests/                     pixel-diff harness
│   ├── pixel-diff.ts          主測試,跑 36 個變體 (notif×18 + board×4 + create×2 + init×2 + drawer×8 + qa×2)
│   ├── smoke.ts               Playwright launch debug
│   ├── crop-diff.ts           crop 指定區域 (debug AA noise)
│   ├── find-diff.ts           找差異 bbox + raw px count
│   ├── .snapshots/            (gitignored) 各變體 .proto.png + .mine.png
│   └── .diffs/                (gitignored) 各變體 .diff.png
│
├── .claude/
│   ├── skills/
│   │   ├── vibe-pipeline/
│   │   │   ├── SKILL.md       主 SKILL (產品定位 / 設計信條 / ref deep-dive)
│   │   │   └── refs/          規格與外部對照,列在下方 § refs
│   │   ├── vibe-pipeline-frontend/SKILL.md
│   │   └── vibe-pipeline-backend/SKILL.md
│   └── settings.local.json    (若有) 個人 settings
│
└── node_modules/              (gitignored)
```

### Repo 外(runtime data,不在 repo 內)

```
~/.vibe-pipeline/              global runtime,跨 project 共用(在 user home,跟 target repo 內的 .vibe-pipeline/ 不衝突,只是同名)
├── state.json                 { lastProject, recentProjects: [{path, lastOpenedAt}] }
└── worktrees/<projHash>/<pipelineId>/   git worktree per pipeline (Phase 3 落地),平行執行用

<target-repo>/.vibe-pipeline/  每個 user target repo 內,由 init 建
├── config.json                (git tracked) project-level 設定
├── pipelines/*.json           (git tracked) 一檔一條,內含 tickets 陣列 (id 格式: <12-hex-ms-ts>-<slug>)
└── .runtime/                  (gitignored) 執行期暫存
    ├── qa-drafts/<id>.json    QA 對話 draft (含 session_id,可 resume / 之後可當 memory)
    ├── notifs.jsonl           backend emit 的事件流 (append-only,Phase 3)
    └── logs/<pipelineId>-<ts>.log  runner 主 agent stdout/stderr (Phase 3)
```

注意:`<target-repo>/.vibe-pipeline/` **不在這個 repo 內**(除非自我 dogfood),是 vibe-pipeline 操作的 target repo 才有。跟 user home 的 `~/.vibe-pipeline/`(global state)同名但位置不同,程式上不會撞。

## refs(設計與外部對照)

`.claude/skills/vibe-pipeline/refs/` 下有:

| 檔 | 用途 |
|---|---|
| [`spec-2026-05-09.md`](.claude/skills/vibe-pipeline/refs/spec-2026-05-09.md) | 完整 [M]/[P2]/[P3] 功能清單(2026-05-09 版,「不是最終結果」) |
| [`integration-plan-v1-2026-05-09.md`](.claude/skills/vibe-pipeline/refs/integration-plan-v1-2026-05-09.md) | 第一條 vertical slice 完整計畫(現在這刻最該讀) |
| [`vibe-kanban-2026-05-09.md`](.claude/skills/vibe-pipeline/refs/vibe-kanban-2026-05-09.md) | BloopAI vibe-kanban 對照(已 sunset、26k stars、人為主編排) |
| [`symphony-2026-05-09.md`](.claude/skills/vibe-pipeline/refs/symphony-2026-05-09.md) | OpenAI Symphony 對照(reference impl、22.7k stars、寄生 Linear、無 DB) |
| [`composio-ao-2026-05-09.md`](.claude/skills/vibe-pipeline/refs/composio-ao-2026-05-09.md) | Composio agent-orchestrator 對照(production-ready、6.9k stars、橫向 fan-out) |
| [`integration-plan-v2-qa-2026-05-09.md`](.claude/skills/vibe-pipeline/refs/integration-plan-v2-qa-2026-05-09.md) | Phase 2 計畫:QA-driven ticket 建立(claude CLI session、drawer UI、fenced JSON 約定) |
| [`git-design-2026-05-09.md`](.claude/skills/vibe-pipeline/refs/git-design-2026-05-09.md) | 多 pipeline 平行的 git worktree 設計 — [P2] runner 階段才實作,phase 2 預留欄位 |

新加 ref 規範見主 SKILL「外部對照 ref」段最後。

## 開發環境

```bash
bun install                                            # 裝套件
bun run dev                                            # Vite frontend → http://127.0.0.1:5173/
# bun run server                                       # (規劃中) Bun backend → http://127.0.0.1:3001/
bunx tsc --noEmit                                      # TypeScript check

# Prototype 對照 server (做前端 / 跑 pixel-diff 才需要)
cd design/vibe-pipeline/project && bunx serve -l 5174 .

# Pixel-diff (確認 prototype 對齊)
npx tsx tests/pixel-diff.ts                            # 全部 36 變體
npx tsx tests/pixel-diff.ts notif                      # filter
```

## 三 SKILL 對應路由

- 改前端(畫面 / 元件 / styles / route / API 串接) → **`vibe-pipeline-frontend`**
- 做 backend(Bun server / fs / spawn / SQLite / runner / Q&A / budget) → **`vibe-pipeline-backend`**
- 思考 scope / 決策優先順序 / 看完整功能清單 / 看外部產品對照 → **`vibe-pipeline`**(主)

## 不踩的雷(最關鍵 5 條)

1. **不開 `<StrictMode>`** — `useEffect([])` 雙觸發會破 pixel-diff(QA 重複初始 turn 等)。`src/main.tsx` 已關。
2. **CSS 從 prototype 1:1 搬,DOM/className 一字不差** — pixel-diff 靠這個,改了就破。token 走 `tokens.css` 變數,別寫 hex / px 原值。
3. **theme class 用 `index.html` 的 inline script 設**,不靠 React useEffect — 否則第一個 frame 用 stale theme,變體切換有 1-frame flash。
4. **HIDE_CSS 用 `animation: none` 不用 `0s`** — `0s` 會留下 fade-up 起始 opacity:0 狀態,整個元件透明。
5. **跨畫面 state 用 URL query param,不用 React Context / global store** — pixel-diff 靠這個驅動變體;refresh 不掉 state;bookmark / 分享連結直接帶完整 context。例外:active project hash(`useActiveProject()` hook,fallback localStorage)、theme(已實作)。
