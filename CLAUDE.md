# vibe-pipeline

多 AI agent(執行AI + 審核AI)的 ticket / pipeline 編排器。Web 應用為主介面,將來配 `vp` CLI。每張 ticket 由 執行AI 跑、審核AI 審,iterative 模式自動迴圈到 審核AI pass;pipeline 是 ticket 的有序組合,每條跑在獨立 git branch,完成後 merge 回 base。

## 當前 phase(2026-05-11)

**Phase 4 完成**(e2e + AI merge ticket-based + UI polish)+ **Phase 5 落地**(自動拆 ticket / 自動 sync / 自動 merge / 自動 prune / per-task model config / CLI perf flags)。phase3 / phase4 / refactor / perf-claude-cli 四條 pipeline 全 merge 進 main,**self-dogfood 自我重構成果穩定運作中**。

**Phase 3 第四刀(舊)→ 第五刀(本 phase)**:Phase 3 第四刀的機械 merge 已被 Phase 4 ticket-based AI merge 取代;`/merge` 端點現在 append synthetic merge ticket 走 runner 主流程。merge strategy 鎖死 `merge --no-ff`(squash / ff-only 跟新版 auto-rebase + sync chip 不相容,refactor pipeline 已砍掉設定)。

**已完成**
- Phase 1 — Project / Pipeline CRUD + .vibe-pipeline/ JSON 持久化 + git init / reveal
- Phase 2 — QA drawer + claude CLI 整合 + Draft store + Spec checklist + Multi-select option
- Phase 3 第一刀 — git worktree per pipeline、runner orchestrator (claude CLI session as 主 agent + Task tool 派 sub-agent)、Pipeline state machine 加 stopping、Ticket 加 failed_iter_limit / failed_transient、Run/Pause endpoints + Frontend RunButton + polling、Crash recovery on startup、Notif store (`.runtime/notifs.jsonl`) + emit on pipeline_started/ready/paused/failed + ticket_started/done/failed (透過 fs.watch 偵測 pipeline.json 變化) + frontend inbox 接 backend
- Phase 3 第二刀 — TicketDrawer 點 ticket 看內容(goal/acceptance/prompt/iter/commits/runs)、Runner 寫回 `ticket.iter.rounds[]`(n/startedAt/endedAt/executorSummary/criticVerdict/criticFeedback)、Runner 自動 git commit 每張 done ticket(`ticket(<n>): <title>`,寫 hash 到 `ticket.commits[]`)、Run log API + 解析 cost/duration/turns/tokens/result/sessionId、Drawer「pipeline 執行紀錄」section(可展開看 stdout/stderr 全文)、Polling 改不依賴 pipelines + visibilitychange/focus refetch(修 tab 切回 board 卡舊狀態)、UI 防禦(stage 同義 normalize、verdicts string/number 雙格式、totalElapsed 缺值 default)、iter labels 中文化(執行/審核/結果)
- Phase 3 第三刀 — Pipeline 操作補齊(delete pipeline、rename inline ✎、reset ticket、reset all done/failed、reveal worktree)、TopBar(真實 currentBranch、⌘O / Ctrl+O 鍵盤捷徑、theme toggle 走 localStorage 持久化、Settings disabled stub)、UX 系列(bell unread 數字、actionError 右下 toast、collapsed inbox 讀過 block 沉降 muted、ts 絕對定位右下、commit hash click-to-copy、empty pipeline 空狀態 CTA、EmptyProject 箭頭指向 TopBar、browser tab title 動態、FocusColumn 累計成本 chip + RunButton 上次 duration 預估、overflow menu 收 worktree/重跑全部/刪除、QADrawer tech leak 清除)、Backend 安全網(orchestrator state guard 擋 ready/running/stopping 的 /run、savePipeline shape 驗證 + race guard + PUT-as-upsert 擋、auto-cancel 空 QA draft)、Backend 新 endpoint(GET /branches、POST /pipelines/:id/worktree/reveal、DELETE /pipelines/:id、GET /pipelines/:id/runs[/:filename])、Project type 加 currentBranch、Rail 漏狀態色補齊(stopping / failed_iter_limit / failed_transient)+ 移除假 Archive chip
- Phase 3 第二.五刀 — iter FAIL → PASS round chain 驗證(test pipeline,$1.51,verdicts ["FAIL","PASS"] + criticFeedback 全寫入 + executor 第二輪確實 incorporate feedback + 真實 ms 時間戳)、multi-ticket 順序 + pause/resume 驗證(3-step pipeline,$1.47 split 兩段,pause 後 runner 跑完 t1 才收 paused、resume 從 t2 接,3 commit 各自獨立)、atomic write(.tmp + JSON.parse round-trip + renameSync,防 partial write / serialize 炸)、inbox panel + strip 改 flat 列表(不分 sev 群組,strip 改全 8px pip)、iter-stage-pulse 改 box 內右上角 notification badge 樣式
- Phase 3 第四刀 — Pipeline merge:`POST /pipelines/:id/merge` 用 project config `defaults.merge_strategy`(預設 squash;支援 merge/squash/ff-only),checkout base → merge → squash 模式追加 commit,衝突 / not-fast-forward / 其他 abort + 訊息;成功標 `state="merged"` + `mergedAt` + `mergeCommit{hash,subject,ts}` + emit `pipeline_merged` notif。ReadyBanner 的 View diff(改開 worktree)/ Merge 按鈕從 disabled 接通。orchestrator state guard 補擋 merged 狀態的 /run。E2E 驗過 squash → main
- Phase 3 第五刀 — Multi-pipeline 平行執行:config `defaults.max_parallel`(預設 2,clamp 1-8)+ orchestrator in-memory slot tracker + FIFO queue per project + 滿 slot 自動 'queued' state(新增到 PipelineState union + STATE_COLOR/STATE_LABEL + tokens.css teal `--queued`)+ emit `pipeline_queued` notif + process exit 觸發 dispatcher 接棒 FIFO + recovery 把 queued 視同 stale → paused。Backend 新 endpoint:GET /api/projects/:hash/config / PUT /api/projects/:hash/config(只白名單 max_parallel)/ GET /api/projects/:hash/runtime(回 N/M)。Pause endpoint 對 queued 狀態走 `cancelQueued`(從 queue 拔 + 標 paused)。前端 TopBar N/M chip(running >= max 變 queued 色,過載紅 `!`)、RunButton 'queued' 狀態(順位顯示 + 按鈕當「取消排隊」)、Settings popover(SettingsPopover.tsx)露 max_parallel 數字欄位 1-8 + 即時 triggerDispatch 補位、FocusColumn / Title rename 把 'queued' 加進 lockedByState。savePipeline race guard 加 'queued',deletePipeline 在 queued 時走 cancelQueued 拔出再刪。**PUT body charset guard**:沒帶 charset=utf-8 / 非 application/json → 400 拒絕,防 shell caller cp950 mojibake 寫進 pipeline.json
- Phase 4 第一/二刀 e2e — Playwright 雙模式(mock CI / real 手動)、12 mock spec / 55 test 全綠、real 套 vp-autotest scaffold + iter ticket 真跑驗過。詳見 `vibe-pipeline-e2e` SKILL
- Phase 4 第三刀 AI merge ticket-based — `/merge` 改 append 一張 `mode="merge"` synthetic ticket 走 runner 主流程,`mergeTicketPrompt()` sub-agent 用 `git -C "<projectPath>"` 操作 main repo,主 agent 解析 PASS / FAIL / FAIL_NORETRY 三種 sub-agent 回應(致命條件不再浪費 iter);merge ticket 帶上完整 ticket 歷史(title/goal/acceptance/commits)讓 AI 解衝突 + 寫精煉 commit message。preflight working tree 髒直接 409 不 spawn agent;失敗 merge ticket 重試走「reset → re-run」不重複 append。default merge_strategy 改 `merge`(--no-ff,保留 ticket commit chain)
- Phase 4 第四刀 UI polish — ConfirmDialog 取代 native window.confirm(Promise hook + danger 變體 + Esc/Enter 鍵);TicketCard 顯 goal sub-line + iter rounds 多 row 垂直排列 + 「執行→審核→結果」三段 stage(結果顯 PASS/FAIL/PARTIAL);RunButton spawning「啟動中…」過場;Rail item state-aware 第二行(▶ #N title / 可合併入 main / 已併入 main / 上次活動 N 分鐘前);InboxItem read/unread 改單 dot 兩種樣式(實心/空心);prompt 用 react-markdown 渲染;mode label / STATE_LABEL 全中文;DiffModal(point worktree vs base 完整 diff,React Portal 跳出 fade-up transform 牢籠)。focus-head 加可點 +N -M 統計 chip(任何狀態都看得到 worktree diff);recoverStale 補 orphan ticket 修復(running ticket pipeline 已 paused 的錯位);QA pipelineContext snapshot(QA AI 看 pipeline 內既有 ticket 避免重複)
- Phase 4 雜項 — `.vibe-pipeline/pipelines/` 改 ignored(merge 後 redundant 於 git commit chain);`/api/projects/:hash/status` 順帶 return mergeStrategy;diff-stat polling endpoint(running 時 3s 抓 worktree +N -M)
- **Phase 5 — Pipeline 全自動化 + 模型 / 性能調控**:
  - **AI 拆 ticket**:QA AI 在 complete=true 最後輪可填 splitInto(N 個完整 spec),SpecReview 顯 toggle「拆 N 張 / 保 1 張」,零額外 latency 寫進 backend。獨立 `✂ AI 拆分` 按鈕也走 splitTicketSpec(老 ticket 補救用,~76s)
  - **AI sync**:`POST /pipelines/:id/sync` append synthetic `mode="sync"` ticket,sub-agent 在 worktree 內 rebase base → branch,衝突 AI 解 + ticket.commits[].hash remap(配對 subject)。落後 chip 顯 `⇣ 落後 N`,點擊觸發。merge / sync 共用 `--no-ff` strategy 鎖
  - **AI 自動 merge**:project / pipeline-level `auto_merge` config,ready 後 backend 自動 append merge ticket;FocusColumn / CreateCard 用 `.toggle-pill` switch UI(高度對齊 .btn);文案「自動合併」
  - **AI merge 完 auto-rebase worktree**:orchestrator 偵測 state=merged → `git -C <wt> rebase <baseBranch>` 預期 FF;worktree HEAD 跟 main 同步,後續 sync chip 自然 0,banner 不會 false-positive 觸發 re-merge
  - **Worktree 生命週期**:刪 pipeline 預設 prune worktree(`worktree.removeQuiet`)+ 獨立 `⊘ 清除 worktree` 按鈕;merged 後 auto-prune(節省 VSCode 開太多 worktree 卡)。未合併 prune / 刪除顯 ⚠ 警告 banner + 「強制清除/刪除」label
  - **User-level config**:`~/.vibe-pipeline/config.json` 跨 project 共用,per-task-class (qa/runner/subAgent/merge) 可設 model / effort;SettingsPopover 露 selector;`getTaskConfig()` runtime 讀,動態套到 spawn args
  - **CLI spawn perf flags**:三處 spawn(QA/split/runner)加 `--setting-sources ""` / `--strict-mcp-config` + 空 MCP / `--disable-slash-commands`;split / runner 多 `--no-session-persistence`(QA 多輪 resume 不能加,已避開)。QA / split 省 ~80-90% cost(cache_creation 19500/14500 → 0)+ 14-22% cold start。詳見 [refs/claude-cli-spawn-perf-2026-05-11.md](.claude/skills/vibe-pipeline/refs/claude-cli-spawn-perf-2026-05-11.md)
  - **Ticket-level 操作**:TicketDrawer 把 reset/拆分/刪除收 head 內 toolbar(原本 body 底太遠);mode chip 可點直接 toggle step ↔ iter;iter 上限 input 1-5(coerceSpec clamp);QA system prompt 補強 `splitInto` 規則 + `iterLimit` 上限
  - **QA 體驗**:user 送出訊息 → 立刻寫 disk(claude 跑前的中繼狀態),中途關 drawer 接續看得到剛送的話 + thinking dots(useQA poll AI 寫回);finalize 取消的 split-check / triConfirm 流程整套移除,改成 QA AI 內含 splitInto
  - **Notif / toast 補齊**:create / pause / delete / rename / reset ticket / reset all 都有成功 toast(對齊 merge / sync / run)
  - **ConfirmDialog 強化**:`warning?: string` 欄(紅框 + ⚠ icon);`tertiaryLabel` 三選一(`useTriConfirm()`);danger=true 時 autoFocus 取消鈕 + Enter 不觸發 confirm(避免 user 亂打 Enter 出事)
- **Phase 5 雜項** — `Bun.serve idleTimeout: 255`(default 10s 太短,split / claude call 會被砍);`bun run server` 改 no-watch default,`server:watch` 給 dev;self-dogfood AI merge 必須關 watch(server 衝突會 reload 殺 child claude);TopBar bell 拿掉,inbox strip 改 bell + 數字 badge;merge ticket / sync ticket UI 顯「執行 → 結果」兩段(無 critic);diff stat / sync polling 等

**架構決策**:Bun local server + browser(前端 Vite 5173 / 後端 Bun 3001 / `/api/*` 透過 Vite proxy)。Runner 主 agent 工具白名單只准 Edit/Write 改 pipeline.json + Bash 跑 read-only 指令 + git add/commit;source code 改動 100% 透過 Task 派 sub-agent。Theme 偏好走 localStorage(URL `?theme=` 仍 override 給分享連結用),非 backend config — 簡單 + 無 round-trip + first-paint 不閃。

**還沒做(下個 iteration)**
- Transient retry 真正觸發測試(沒自然 fixture,需 fault injection;低優先,留 production 真踩到再補)
- Budget tracker UI(backend cost_limit_usd 已落地會擋 /run + 發 budget notif,UI 顯示「目前累積」之類的 dashboard 缺)
- Phase 5 e2e mock 覆蓋(autoMerge / splitInto / sync / prune worktree / userConfig 等新功能)
- self-dogfood 不靠手動 merge 的方案 → merge worktree isolation,規模 ~150 行,看 [refs/merge-isolation-2026-05-11.md](.claude/skills/vibe-pipeline/refs/merge-isolation-2026-05-11.md);99% user 不踩,當前不投入
- runner spawn 的 `--setting-sources` 還沒砍(留給 Task sub-agent 讀 user/project CLAUDE.md);若日後把 sub-agent context 全 push 進 prompt,可拿 ~13% 額外 cache 改善
- **手機遠端控制路線**:Tailscale + RWD + auth 層 + 可能 PWA push。先做 RWD(以 768px 為 breakpoint,Board / Drawer / TopBar / 表單 / Modal 全收;hover-only 互動補 touch 等效),auth + PWA push 後續再補

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
├── pipelines/*.json           (gitignored) 一檔一條,內含 tickets 陣列;runtime 紀錄 merge 後 redundant 於 git commit chain
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
| [`merge-isolation-2026-05-11.md`](.claude/skills/vibe-pipeline/refs/merge-isolation-2026-05-11.md) | self-dogfood AI merge 撞 vite/bun watch 的研究紀錄;結論不做(99% user 不踩),phase 5+ 多人 self-dogfood 才回頭做 |
| [`claude-cli-spawn-perf-2026-05-11.md`](.claude/skills/vibe-pipeline/refs/claude-cli-spawn-perf-2026-05-11.md) | claude CLI spawn 加速 — QA/split/runner 三處 flag 改動量測(QA/split 省 80-90% cost)+ 風險 + 衍生 |

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
8. **self-dogfood(vibe-pipeline 改 vibe-pipeline 自己)跑 AI merge 前要關 `--watch`** — AI 在 main repo 跑 `git merge` 會寫 conflict markers;若衝突落在 `server/` 檔,bun `--watch` reload backend 會連帶殺掉 spawn 出去的 claude child session,merge 中斷。`src/` 衝突只 vite 紅 overlay 但 child 不死(可忽略 overlay,F5 等做完)。解法:平常 `bun run server`(no watch)就好;只有改 server code 想熱 reload 才用 `bun run server:watch`,且 watch 模式下不要按 AI merge。end user 跑 VP 對別 project 不會有這問題(他不改 VP 自己 server code)。研究紀錄見 [`merge-isolation-2026-05-11.md`](.claude/skills/vibe-pipeline/refs/merge-isolation-2026-05-11.md);徹底解只能上 merge worktree 隔離(~150 行,當前不投入)。
9. **server 重啟會殺 spawn 的 claude child(running pipeline → recoverStale 標 paused)** — 改 server code 前先看有沒有 pipeline 在跑,否則 user 看到 pipeline 莫名暫停。recovery 自動標 paused 但 worktree 進度保留,user 按「繼續」會從 critic 階段接續(若 doer 已交,executor 不重派,省 token)。
10. **vite 內部模組 map cache 卡 stale `.js` 副檔名** — 如果以前 src/ 有過 stale `.js`(已刪),vite 仍會把 import 解到 `.js` URL → 撞 SPA fallback HTML → board 空白。解:`rm -rf node_modules/.vite` + 重啟 vite。`tsconfig.json` 已加 `noEmit: true` 防再生 `.js`,但 vite cache 需手清。
11. **Bun.serve default `idleTimeout` 10s 太短** — QA / split / claude CLI call 都 ≥ 10s,會被 Bun 砍掉連線。`server/index.ts` 設 `idleTimeout: 255`(bun 上限 ~4.25min)。
12. **改 backend 後 backend stale 不自覺** — `bun run server` 是 no-watch default,改完要手動 kill + 重啟。watch 模式踩雷 #8,只有開發 server code 才開。
13. **inline backtick 雷不只 systemPrompt.ts / runnerPrompt.ts** — 任何 template literal 內 `` `code` `` 都會炸。改完 grep 一下確認沒殘留 inner backtick。

## 手機遠端使用方式

透過 Tailscale 把桌機 VP 暴露給手機,搭配 FCM Web Push 收 ticket / pipeline 事件通知。

### 前置需求

- 桌機與手機都安裝並登入同一個 Tailscale 帳號(同 tailnet)
- 取得桌機的 Tailscale IP(`100.x.x.x`,在 Tailscale 控制台或 `tailscale ip -4` 看)
- 桌機防火牆允許 5173 / 3001 入站(僅限 tailnet 介面)

### 連線步驟

1. backend 預設以 `0.0.0.0` 監聽(`server/index.ts` 已設,不要改回 `127.0.0.1`,否則手機連不到)
2. 桌機開 vite + backend(`bun run dev` / `bun run server`)
3. 手機瀏覽器開 `http://<tailscale-ip>:5173`,即可看到 Board
4. 若手機端 API 全部失敗(CORS 紅字),檢查桌機 `.env` 的 `ALLOWED_ORIGINS` 是否含手機端 origin(例如 `http://100.x.x.x:5173`);多個來源逗號分隔

### 啟用推播通知

1. 手機開 VP 後進 TopBar 的 Settings → Push Notifications
2. 點「啟用通知」→ 瀏覽器跳系統權限對話框,選允許
3. 狀態變「已啟用」即訂閱完成(token 寫進 backend)
4. 之後 ticket 開始 / 完成 / 失敗、pipeline ready / merged / failed 事件會推到手機;點通知直接跳轉對應 pipeline / ticket
5. **離線補送**:手機離線(關螢幕 / 沒網路)時,push 由 FCM 伺服器暫存,裝置上線後自動補送(FCM 預設保留 28 天);不需 VP 端做 queue

### TOTP 雙重驗證

非 loopback 連線(手機透過 Tailscale 進來)會被 `authGuard` 攔截,需走 TOTP。loopback(`127.0.0.1` / `::1`)永遠 bypass,本機開發完全不受影響。

**首次設定流程**

1. 手機開 `http://<tailscale-ip>:5173`,首次無 secret 會被導去 `/setup`
2. 畫面顯示 QR Code,用 Authenticator App(Google Authenticator / 1Password / Authy 等)掃描,加入帳號 `vibe-pipeline`
3. 輸入 App 產生的 6 碼驗證碼 → 成功後 secret 寫進 `~/.vibe-pipeline/auth.json`,同時下發 session cookie(`vp_auth`,HttpOnly + SameSite=Strict,7 天)
4. 自動跳回 `/board`

**Cookie 過期後重新登入**

- session cookie 預設 7 天,過期或手動 `/api/auth/logout` 後,受保護 endpoint 回 401 + `redirect=/login`
- 手機被導去 `/login`,輸入 Authenticator App 當下 6 碼即可重新拿到 cookie(不需重新掃 QR — secret 已存在桌機)
- 多裝置:不同手機 / 桌機各自 login 取得獨立 session,可在 SettingsPopover → 安全性 看 active sessions 並單獨踢除

**Windows auth.json 權限提醒**

- `~/.vibe-pipeline/auth.json` 存 TOTP secret(等同密碼)
- 程式呼叫 `fs.chmod(0o600)` 在 POSIX(macOS / Linux)真實生效;**Windows 上 NTFS ACL 不被這 call 改動**
- Windows 使用者請手動確認:檔案總管右鍵 `C:\Users\<你>\.vibe-pipeline\auth.json` → 內容 → 安全性 → 編輯 → 移除 Users / Everyone,只保留目前使用者讀寫
- 若桌機是個人 PC 且唯一帳戶為自己,user profile 目錄預設 ACL 已隔離其他 user,可略過(但多帳戶 / 工作機建議手動確認)

### HTTPS 需求(實機推播)

- FCM Web Push 規範要求 service worker 跑在 secure context;`localhost` 例外免 HTTPS,但 `http://100.x.x.x:5173` 不算 secure → 手機實機無法註冊 push subscription
- 解法:桌機跑 `tailscale serve https / http://localhost:5173`,Tailscale 簽 Let's Encrypt 給 `<machine>.<tailnet>.ts.net`,手機改開該 HTTPS URL
- backend(3001)也建議走 `tailscale serve` 或同網域 reverse proxy,讓前端 `/api/*` 同 origin 不用再開 CORS

### 環境變數設定

寫進桌機的 `.env`(已加進 `.gitignore`,別 commit)。

| 變數 | 取得位置 | 用途 |
|---|---|---|
| `FCM_SERVICE_ACCOUNT_JSON` | Firebase console → 專案設定 → 服務帳戶 → 產生新的私密金鑰(整段 JSON inline 貼進 env) | backend 用 Admin SDK 發送 push;與下方 `_PATH` 二選一 |
| `FCM_SERVICE_ACCOUNT_PATH` | 同上,下載 JSON 後存檔,填絕對路徑 | 同上,適合不想把 JSON inline 進 env 的情境 |
| `FCM_API_KEY` | Firebase console → 專案設定 → 您的應用程式 → Web app → SDK setup | 前端 Firebase SDK init |
| `FCM_MESSAGING_SENDER_ID` | 同上 | 前端 init |
| `FCM_APP_ID` | 同上 | 前端 init |
| `FCM_VAPID_KEY` | Firebase console → Cloud Messaging → Web 設定 → Web Push 憑證 → 產生金鑰組 | 前端 `getToken({ vapidKey })` 用 |
| `ALLOWED_ORIGINS` | 手動列舉 | backend CORS 白名單,逗號分隔(例:`http://localhost:5173,http://100.64.0.5:5173,https://desktop.tailnet.ts.net`) |

### 安全提醒

- service account JSON **絕對不要 commit**;`.env` / 金鑰檔放在 repo 外,或確認 `.gitignore` 有蓋到
- service account 權限等同 Firebase 專案 admin;洩漏即可任意推播給所有 token
- `ALLOWED_ORIGINS` 不要放 `*`,僅列實際使用的 origin
- VP 已加 TOTP auth 層(非 loopback 連線強制),但 Tailscale tailnet 仍是最外層邊界;不要把 5173 / 3001 暴露到 public internet
