# vibe-pipeline

多 AI agent(執行AI + 審核AI)的 ticket / pipeline 編排器。Web 應用為主介面,將來配 `vp` CLI。每張 ticket 由 執行AI 跑、審核AI 審,iterative 模式自動迴圈到 審核AI pass;pipeline 是 ticket 的有序組合,每條跑在獨立 git branch,完成後 merge 回 base。

## 當前 phase(2026-05-10)

**Phase 3 第五刀已落地**:Multi-pipeline 平行執行 — config `defaults.max_parallel`(預設 2,1-8 clamp)、orchestrator slot tracker + FIFO queue per project、滿 slot 自動轉 'queued' state + emit `pipeline_queued` notif、process exit 觸發 dispatcher FIFO 接棒、TopBar N/M chip(過載紅標)、RunButton 'queued' 狀態(順位顯示 + 按鈕變取消排隊)、Settings popover 露 max_parallel 數字欄位、PUT /api/projects/:hash/config 改值即時 triggerDispatch、recovery 把 queued 也視作 stale → paused。

**Phase 3 第四刀**:Pipeline merge → base branch。Real-run e2e 驗過(vp-autotest project,squash merge into main,commit `5e9581e`)。

**已完成**
- Phase 1 — Project / Pipeline CRUD + .vibe-pipeline/ JSON 持久化 + git init / reveal
- Phase 2 — QA drawer + claude CLI 整合 + Draft store + Spec checklist + Multi-select option
- Phase 3 第一刀 — git worktree per pipeline、runner orchestrator (claude CLI session as 主 agent + Task tool 派 sub-agent)、Pipeline state machine 加 stopping、Ticket 加 failed_iter_limit / failed_transient、Run/Pause endpoints + Frontend RunButton + polling、Crash recovery on startup、Notif store (`.runtime/notifs.jsonl`) + emit on pipeline_started/ready/paused/failed + ticket_started/done/failed (透過 fs.watch 偵測 pipeline.json 變化) + frontend inbox 接 backend
- Phase 3 第二刀 — TicketDrawer 點 ticket 看內容(goal/acceptance/prompt/iter/commits/runs)、Runner 寫回 `ticket.iter.rounds[]`(n/startedAt/endedAt/executorSummary/criticVerdict/criticFeedback)、Runner 自動 git commit 每張 done ticket(`ticket(<n>): <title>`,寫 hash 到 `ticket.commits[]`)、Run log API + 解析 cost/duration/turns/tokens/result/sessionId、Drawer「pipeline 執行紀錄」section(可展開看 stdout/stderr 全文)、Polling 改不依賴 pipelines + visibilitychange/focus refetch(修 tab 切回 board 卡舊狀態)、UI 防禦(stage 同義 normalize、verdicts string/number 雙格式、totalElapsed 缺值 default)、iter labels 中文化(執行/審核/結果)
- Phase 3 第三刀 — Pipeline 操作補齊(delete pipeline、rename inline ✎、reset ticket、reset all done/failed、reveal worktree)、TopBar(真實 currentBranch、⌘O / Ctrl+O 鍵盤捷徑、theme toggle 走 localStorage 持久化、Settings disabled stub)、UX 系列(bell unread 數字、actionError 右下 toast、collapsed inbox 讀過 block 沉降 muted、ts 絕對定位右下、commit hash click-to-copy、empty pipeline 空狀態 CTA、EmptyProject 箭頭指向 TopBar、browser tab title 動態、FocusColumn 累計成本 chip + RunButton 上次 duration 預估、overflow menu 收 worktree/重跑全部/刪除、QADrawer tech leak 清除)、Backend 安全網(orchestrator state guard 擋 ready/running/stopping 的 /run、savePipeline shape 驗證 + race guard + PUT-as-upsert 擋、auto-cancel 空 QA draft)、Backend 新 endpoint(GET /branches、POST /pipelines/:id/worktree/reveal、DELETE /pipelines/:id、GET /pipelines/:id/runs[/:filename])、Project type 加 currentBranch、Rail 漏狀態色補齊(stopping / failed_iter_limit / failed_transient)+ 移除假 Archive chip
- Phase 3 第二.五刀 — iter FAIL → PASS round chain 驗證(test pipeline,$1.51,verdicts ["FAIL","PASS"] + criticFeedback 全寫入 + executor 第二輪確實 incorporate feedback + 真實 ms 時間戳)、multi-ticket 順序 + pause/resume 驗證(3-step pipeline,$1.47 split 兩段,pause 後 runner 跑完 t1 才收 paused、resume 從 t2 接,3 commit 各自獨立)、atomic write(.tmp + JSON.parse round-trip + renameSync,防 partial write / serialize 炸)、inbox panel + strip 改 flat 列表(不分 sev 群組,strip 改全 8px pip)、iter-stage-pulse 改 box 內右上角 notification badge 樣式
- Phase 3 第四刀 — Pipeline merge:`POST /pipelines/:id/merge` 用 project config `defaults.merge_strategy`(預設 squash;支援 merge/squash/ff-only),checkout base → merge → squash 模式追加 commit,衝突 / not-fast-forward / 其他 abort + 訊息;成功標 `state="merged"` + `mergedAt` + `mergeCommit{hash,subject,ts}` + emit `pipeline_merged` notif。ReadyBanner 的 View diff(改開 worktree)/ Merge 按鈕從 disabled 接通。orchestrator state guard 補擋 merged 狀態的 /run。E2E 驗過 squash → main
- Phase 3 第五刀 — Multi-pipeline 平行執行:config `defaults.max_parallel`(預設 2,clamp 1-8)+ orchestrator in-memory slot tracker + FIFO queue per project + 滿 slot 自動 'queued' state(新增到 PipelineState union + STATE_COLOR/STATE_LABEL + tokens.css teal `--queued`)+ emit `pipeline_queued` notif + process exit 觸發 dispatcher 接棒 FIFO + recovery 把 queued 視同 stale → paused。Backend 新 endpoint:GET /api/projects/:hash/config / PUT /api/projects/:hash/config(只白名單 max_parallel)/ GET /api/projects/:hash/runtime(回 N/M)。Pause endpoint 對 queued 狀態走 `cancelQueued`(從 queue 拔 + 標 paused)。前端 TopBar N/M chip(running >= max 變 queued 色,過載紅 `!`)、RunButton 'queued' 狀態(順位顯示 + 按鈕當「取消排隊」)、Settings popover(SettingsPopover.tsx)露 max_parallel 數字欄位 1-8 + 即時 triggerDispatch 補位、FocusColumn / Title rename 把 'queued' 加進 lockedByState。savePipeline race guard 加 'queued',deletePipeline 在 queued 時走 cancelQueued 拔出再刪。

**架構決策**:Bun local server + browser(前端 Vite 5173 / 後端 Bun 3001 / `/api/*` 透過 Vite proxy)。Runner 主 agent 工具白名單只准 Edit/Write 改 pipeline.json + Bash 跑 read-only 指令 + git add/commit;source code 改動 100% 透過 Task 派 sub-agent。Theme 偏好走 localStorage(URL `?theme=` 仍 override 給分享連結用),非 backend config — 簡單 + 無 round-trip + first-paint 不閃。

**還沒做(下個 iteration)**
- Transient retry 真正觸發測試(沒自然 fixture,需 fault injection;低優先,留 production 真踩到再補)
- Budget tracker(P2+;不需 SQLite,直接 sum log JSON)
- Settings 畫面其餘欄位(default base branch / merge_strategy / cost 上限等;phase 3-5 已露 max_parallel,其他保留)
- atomic write 已落地;**charset guard for PUT body 還沒**(real frontend fetch 沒事,只 shell 端 mojibake 風險)
- log/notif GC 已落地(per-pipeline 留 10 / 全 project 留 500)
- Phase 3-5 e2e 留給 user 手動(orchestrator 不會 spawn 巢狀 claude session 跑覆蓋)

**已 final 決定**(不再討論)
- Theme 偏好 → localStorage(URL `?theme=` 仍 override)
- Worktree 位置 → global `~/.vibe-pipeline/worktrees/<projHash>/<pipelineId>/`
- vp-autotest project(`d:/sugarfungit/vp-autotest`,hash `cf94d1b2`)— Claude 跑 runner 測試專用,user 主 project 不污染
- **Pixel-diff 不救**(2026-05-10 phase 3-5 砍):prototype variant routes(/init, /drawer, /qa, /notifications)+ NotifBanner / NotificationsScreen / DrawerStage / QAScreen / InitScreen 全刪,tests/ 整個刪,playwright/pixelmatch/pngjs 從 devDeps 移除,`bun run diff` script 移除。design/ 留作歷史紀錄不再對齊
- log/notif GC 走 per-pipeline 10 / 全 project 500 上限,trigger 在 /run spawn 前

**計畫 ref**
- [phase 1 plan(已落地)](.claude/skills/vibe-pipeline/refs/archive/integration-plan-v1-2026-05-09.md)
- [phase 2 QA plan(已落地)](.claude/skills/vibe-pipeline/refs/archive/integration-plan-v2-qa-2026-05-09.md)
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
│   │   ├── pipeline/          BoardScreen + FocusColumn + EmptyProject + TicketDrawer + RunHistory + ticketDrawer.css
│   │   ├── pipelineCreate/    CreateCard + CreatePlaceholder
│   │   ├── init/              InitPopup (修改後直接接 BoardScreen)
│   │   ├── qa/                QADrawer + useQA (真接 backend)
│   │   ├── notifications/    InboxColumn (panel + strip,flat list)
│   │   └── dev/               StatesGallery (狀態 gallery /dev/states)
│   ├── styles/                CSS(原本從 prototype 移植,phase 3-5 後 prototype variant 砍了,這些是 real UI 用的)
│   │   ├── tokens.css         設計 token (CSS 變數,顏色/字型/spacing)
│   │   ├── board.css          board / focus / iter-stage / ticket card
│   │   ├── notif.css          inbox panel + strip + item
│   │   ├── init.css           InitPopup
│   │   ├── drawer.css         共用 drawer base(TicketDrawer + QADrawer 共用)
│   │   └── qa.css             QADrawer
│   ├── data/                  純 helper(STATE_COLOR / SEV_COLOR / fmtElapsed),mock seed 已全砍
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
│       │   ├── runnerPrompt.ts RUNNER_BEHAVIOR_PROMPT (主 agent 流程定義 + iter rounds 寫法 + ticket commit 流程)
│       │   └── runLog.ts       parse .runtime/logs/<pid>-<ts>.log → cost/duration/turns/tokens/result/sessionId
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
├── design/                    Claude Design 匯出的 handoff bundle(初期設計參考,目前 prototype variant + pixel-diff 已砍)
│   └── vibe-pipeline/
│       ├── README.md          設計師給 coding agent 的引導
│       ├── chats/             8 份設計過程對話 (chat1.md ~ chat8.md)
│       └── project/           prototype HTML / proto jsx / wireframes(歷史紀錄,real code 已不引用)
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

**Active(當前還參考)**:

| 檔 | 用途 |
|---|---|
| [`spec-2026-05-09.md`](.claude/skills/vibe-pipeline/refs/spec-2026-05-09.md) | 完整 [M]/[P2]/[P3] 功能清單 |
| [`integration-plan-v3-runner-2026-05-10.md`](.claude/skills/vibe-pipeline/refs/integration-plan-v3-runner-2026-05-10.md) | Phase 3 整段(第一/二/二.五/三/四刀)落地紀錄 + 待第五刀清單 |
| [`git-design-2026-05-09.md`](.claude/skills/vibe-pipeline/refs/git-design-2026-05-09.md) | 多 pipeline 平行的 git worktree 設計 |
| [`state-matrix-2026-05-10.md`](.claude/skills/vibe-pipeline/refs/state-matrix-2026-05-10.md) | Pipeline state × condition → UI behavior 決策表(改 button / banner 前對齊) |

**Archive(已落地或一次性閱讀)**:`refs/archive/` 下:`integration-plan-v1` / `integration-plan-v2-qa`(phase 1/2 計畫,均已落地)/ `vibe-kanban` / `symphony` / `composio-ao`(競品對照,設計初期一次性參考)。需要再翻時還在 git 裡。

新加 ref 規範見主 SKILL「外部對照 ref」段最後。

## 開發環境

```bash
bun install                                            # 裝套件
bun run dev                                            # Vite frontend → http://127.0.0.1:5173/
bun run server                                         # Bun backend → http://127.0.0.1:3001/
bun run dev:all                                        # 同時跑兩個(concurrently)
bunx tsc --noEmit                                      # TypeScript check
bun run build                                          # 產 dist/
```

routes:
- `/` → redirect `/board`
- `/board` → 主介面
- `/dev/states` → 狀態 gallery(改 RunButton / ReadyBanner 視覺驗收)

## 四 SKILL 對應路由

- 改前端(畫面 / 元件 / styles / route / API 串接) → **`vibe-pipeline-frontend`**
- 做 backend(Bun server / fs / spawn / SQLite / runner / Q&A / budget) → **`vibe-pipeline-backend`**
- 寫 / 改 / 跑 E2E(Playwright mock + real,覆蓋矩陣) → **`vibe-pipeline-e2e`**
- 思考 scope / 決策優先順序 / 看完整功能清單 / 看外部產品對照 → **`vibe-pipeline`**(主)

## 不踩的雷

1. **不開 `<StrictMode>`** — `useEffect([])` 雙觸發會讓 QA 第一輪 AI message 跑兩次等。`src/main.tsx` 已關。
2. **token 走 `tokens.css` 變數**,別寫 hex / px 原值;新顏色加 token 不要 hard-code。
3. **theme class 用 `index.html` 的 inline script 設**,不靠 React useEffect — 否則第一個 frame 用 stale theme,有 1-frame flash。已配 localStorage 偏好(URL `?theme=` 仍 override)。
4. **HIDE_CSS / fade-up 用 `animation: none` 不用 `0s`** — `0s` 會留下 fade-up 起始 opacity:0,整個元件透明。
5. **跨畫面 state 用 URL query param**(refresh / bookmark 不掉),例外:active project hash 走 localStorage、theme 走 localStorage(URL override)。
6. **server prompt template literal 內禁用 inline backtick** — `` `code` `` 在 backtick template literal 內會關閉外層字串。改寫純文字。踩過兩次。
7. **改 `server/lib/qa/systemPrompt.ts` 或 `runnerPrompt.ts` 後 grep `\``** 確認沒殘留 inner backtick。Bun --watch reload 噴 syntax error 後 server 不會自己復活。
