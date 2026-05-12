# vibe-pipeline

多 AI agent(執行AI + 審核AI)的 ticket / pipeline 編排器。Web 應用為主介面,將來配 `vp` CLI。每張 ticket 由 執行AI 跑、審核AI 審,iterative 模式自動迴圈到 審核AI pass;pipeline 是 ticket 的有序組合,每條跑在獨立 git branch,完成後 merge 回 base。

## 當前狀態(2026-05-13)

**Phase 1-5 全套已落地 + 後續打磨**。六條 pipeline 已 merge 進 main(phase3 / phase4 / refactor / perf-claude-cli / codex-cli / phase5),chore pipeline 補完 e2e mock。self-dogfood 自我重構穩定運作,**手機可透過 Tailscale HTTPS + TOTP auth + FCM Web Push 遠端控制 + 收 ticket 通知**。

**2026-05-13 大改動**(打磨期):
- **Sync 重構(Plan C)**:`Pipeline.syncJob` 寄生欄位取代舊 `mode=sync` ticket;git-first → 衝突才 AI;新 4 endpoints `/sync` `/sync/ai` `/sync/cancel` `/sync/dismiss`。細節 → [`refs/sync-redesign-2026-05-13.md`](.claude/skills/vibe-pipeline/refs/sync-redesign-2026-05-13.md)
- **`subAgent` 拆 `executor` + `critic`**:兩個獨立 TaskClass,critic 可挑便宜 model(sonnet+medium)省 token 5-10x;userConfig 自動 migrate(舊 subAgent → executor,critic 走 default)
- **Client-side folder browser**:新 `GET /api/projects/browse?path=` endpoint,瀏覽器內導覽 host 上目錄;Tailscale 遠端開 project 走這個(native picker 跑在 host user 看不到 dialog)
- **`vbpl` CLI 落地**:`cli/` 內,reuse `server/lib/*` 直接讀寫 fs(no HTTP)。4 nouns(project/pipeline/ticket/config)+ `--json` mode。`bun run vbpl <noun> <verb>`。約定見 [`vibe-pipeline-cli` SKILL](.claude/skills/vibe-pipeline-cli/SKILL.md)
- **Auto-merge 改機械式**:`autoMerge=true` 觸發時 backend 直接 `git merge --no-ff`(不 spawn AI),clean 毫秒級 done / 衝突 emit `merge_blocked` notif 等 user 主動 AI 處理。Manual merge 維持現狀(AI 全套)。心智:auto = 便利,manual = 借 AI 一把
- **`pipelineDir.init` 改 idempotent**:`.vibe-pipeline/` partial init 殘骸自動補齊不報錯;`.gitignore` 自動補 `pipelines/`(原本漏)
- **UX 收斂**:Pipeline 執行紀錄從 TicketDrawer 拆到 pipeline-level OverflowMenu;Inbox strip 整塊觸碰 + 滾輪 preview popover;QA reopen + viewOverride 雙向

| Phase | 一句話 |
|---|---|
| 1 | Project / Pipeline CRUD + JSON 持久化 + git init |
| 2 | QA drawer + claude CLI 收斂 + Draft store |
| 3 | Pipeline runner(主 agent + Task sub-agent)/ git worktree / iter rounds / multi-pipeline 平行 / merge to base |
| 4 | E2E (Playwright mock + real) / AI merge ticket-based / UI polish(ConfirmDialog / DiffModal / 中文化) |
| 5 | 全自動化(拆 / sync / merge / prune)+ per-task model config + CLI perf flags + RWD + Tailscale + TOTP auth + FCM + cross-provider sub-agent |

各 phase 詳細落地 → `git log --grep "Merge pipeline/"`(每 phase 一條 merge commit);Phase 5 後續打磨 → 看 commit history(b4a6a13 之後 ~30+ patch)。

**架構決策**(現狀):
- Bun local server + browser(前端 Vite 5173 / 後端 Bun 3001 / `/api/*` 透過 Vite proxy)
- Runner 主 agent 工具白名單只准 Edit/Write 改 pipeline.json + worktree 外 tmp(commit message)+ Bash 跑 read-only + git add/commit;source code 改動 100% 透過 Task 派 sub-agent
- Theme 偏好走 localStorage(URL `?theme=` 仍 override);非 backend config
- 跨 provider sub-agent:claude main → codex sub via Bash 直呼 codex CLI(2026-05 砍掉 codex-rescue plugin path);主 agent 永遠帶 `--dangerously-skip-permissions`
- Sub-agent 拆 executor / critic 兩個 TaskClass(2026-05-13):executor 真改 code 用高 capability,critic 讀 diff 判 PASS/FAIL 用便宜 model;`syncJob` 衝突解走 executor cfg
- Auth 設計:loopback IP 永遠 bypass,只非 loopback 連線強制 TOTP;本機 dev 完全不受影響

**還沒做(下個 iteration)**
- Transient retry 真正觸發測試(沒自然 fixture,需 fault injection;低優先,留 production 真踩到再補)
- Budget tracker UI(backend cost_limit_usd 已落地會擋 /run + 發 budget notif,UI 顯示「目前累積」之類的 dashboard 缺)
- self-dogfood 不靠手動 merge 的方案 → merge worktree isolation,規模 ~150 行,看 [refs/merge-isolation-2026-05-11.md](.claude/skills/vibe-pipeline/refs/merge-isolation-2026-05-11.md);99% user 不踩,當前不投入
- runner spawn 的 `--setting-sources` 還沒砍(留給 Task sub-agent 讀 user/project CLAUDE.md);若日後把 sub-agent context 全 push 進 prompt,可拿 ~13% 額外 cache 改善
- **CLI 後續**:`vbpl` 已落地 + `bun run cli:build` 打包成單檔 binary(Windows/macOS/Linux),`bun run vbpl ...` 或 binary 都可用。**還沒做**:shell completion / `vbpl pipeline log --follow` log streaming / CI release artifact 自動 build
- **iOS PWA push 實測**:iOS 16.4+ 已支援 Web Push 但需先「加入主畫面」,目前只在 Android 驗過
- **背景 push 待人工觸發測試**:測過 `/api/push/test` 鎖屏可收;runner 真實 pipeline 完成事件 → push 還沒實機跑過(ticketWatcher 路徑已寫好,缺最後一哩驗證)
- **runner 主 agent 鎖 claude**:SettingsPopover 雖然 runner 欄位讓 user 可選 codex,實際上 `runnerPrompt.ts` 全是 claude-isms(Task tool / subagent_type / Edit/Write 規則),codex 主 runner 跑起來會忽略 sub-agent 派發指令,iter 紀律破功。要支援 codex 主 runner 需 rewrite prompt provider-agnostic(Task tool 換成 Bash 派下一層 CLI 統一寫法)或寫 codex-flavored 變體,~200-300 行 prompt 重設計。目前最務實做法是 UI 禁掉 runner=codex 選項 / backend `getTaskConfig("runner")` 強制 fallback claude,但暫不擋(待真正實作前看是否有 user 誤選)

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
├── AGENTS.md                  跨 provider pointer(codex 等不認 CLAUDE.md/skills 的 AI 看這份,指向 CLAUDE.md + SKILL)
├── package.json               Bun + Vite + React + TS deps
├── bun.lock
├── tsconfig.json
├── vite.config.ts             dev server(host 0.0.0.0 + allowedHosts true + /api → :3001 proxy)
├── index.html                 Vite 入口,有 inline theme sync script + viewport-fit=cover + manifest link
├── .env / .env.example        FCM keys / ALLOWED_ORIGINS / VITE_API_BASE_URL(.env gitignored)
├── public/
│   ├── manifest.json          PWA manifest(name / icons / display:standalone / theme_color)
│   ├── firebase-messaging-sw.js  Service Worker(push event 自處理 + showNotification)
│   ├── icon.svg               SVG 主 icon(對齊 TopBar Logo)
│   └── icon-{192,512}.png     ImageMagick 從 SVG 產(`bun run icons`)
├── scripts/
│   └── gen-icons.ts           SVG → PNG 工具腳本(需 ImageMagick)
│
├── cli/                       vbpl CLI。約定見 vibe-pipeline-cli SKILL
│   ├── vbpl.ts                entry — parseArgs + dispatch noun → commands/*
│   ├── commands/{project,pipeline,ticket,config}.ts   noun × verb 實作
│   └── lib/{args,output,project}.ts                   參數解析 / 統一輸出 / project 解析
│   (透過 import server/lib/* 直接讀寫 fs,不發 HTTP;bun run vbpl 入口)
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
│   │   ├── pipeline/          BoardScreen + FocusColumn + EmptyProject + TicketDrawer + RunHistory + DiffModal + ticketDrawer.css
│   │   ├── pipelineCreate/    CreateCard + CreatePlaceholder
│   │   ├── init/              InitPopup (修改後直接接 BoardScreen)
│   │   ├── qa/                QADrawer + useQA (真接 backend)
│   │   ├── auth/              SetupScreen + LoginScreen + SecurityTab + AddDeviceDialog + useAuthStatus + authApi + types
│   │   ├── settings/          SettingsPopover + SettingsPopover.css(tab UI:Project / AI 任務 / 通知 / 安全)
│   │   └── dev/               StatesGallery (狀態 gallery /dev/states)
│   ├── lib/
│   │   └── fcm.ts             Firebase 前端 SDK init + getToken + register + foreground handler
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
│   ├── index.ts               Bun.serve 入口,route 表 + authGuard middleware
│   ├── routes/                純 dispatch,不寫業務邏輯
│   │   ├── projects.ts        /api/projects/* (含 pipelines CRUD + git-init + reveal)
│   │   ├── qa.ts              /api/.../qa/* (start / turn / finalize / cancel / drafts)
│   │   ├── userConfig.ts      /api/user/config GET / PUT(跨 project per-task-class model 設定)
│   │   ├── auth.ts            /api/auth/{status,setup-init,setup-verify,login,logout,sessions,reset}
│   │   └── push.ts            /api/push/{config,register,unregister,tokens,test}
│   └── lib/                   純 IO + 邏輯,不知道 HTTP
│       ├── projectStore.ts    ~/.vibe-pipeline/state.json 讀寫
│       ├── pipelineDir.ts     <target-repo>/.vibe-pipeline/ 偵測 / 建立 / json 讀寫
│       ├── hash.ts            absolute path → 8-char sha256
│       ├── dialog.ts          OS native folder picker (osascript/powershell/zenity) + revealFolder
│       ├── userConfig.ts      ~/.vibe-pipeline/config.json(跨 project,per-task-class model/effort)
│       ├── git.ts             hasGit / gitInit
│       ├── git/
│       │   └── worktree.ts    ensure / remove / prune (per pipeline,~/.vibe-pipeline/worktrees/<h>/<id>)
│       ├── cli/
│       │   ├── adapter.ts     CliAdapter 介面 + QASpawnOpts / RunnerSpawnOpts / SplitSpawnOpts(needsBypassPermissions 開關)
│       │   ├── claudeAdapter.ts spawn claude CLI(perf flags + 跨 provider 時加 --dangerously-skip-permissions)
│       │   ├── codexAdapter.ts spawn codex CLI(`-c model="..."` + sandbox + JSONL parse)
│       │   └── index.ts       getAdapter() factory by provider
│       ├── auth/
│       │   ├── storage.ts     ~/.vibe-pipeline/auth.json(totp_secret_hash + sessions[])
│       │   ├── middleware.ts  authGuard(loopback bypass + bypass paths + cookie check → /setup/login redirect)
│       │   ├── cookie.ts      parseCookie / findSession / vp_auth cookie(HttpOnly + SameSite=Strict + 7d)
│       │   └── pending.ts     in-memory setup_token map(setup-init → setup-verify 中間 5min 過期)
│       ├── push/
│       │   └── tokenStore.ts  ~/.vibe-pipeline/device_tokens.json(register / list / removeDead)
│       ├── fcm/
│       │   └── index.ts       firebase-admin init + fanoutPush + dead token 偵測
│       ├── fcm.ts             (legacy 同上 path,index.ts 是新版,index 優先)
│       ├── runner/
│       │   ├── orchestrator.ts spawn 主 agent (claude session) + log file + recoverStale + cross-provider bypass 旗標
│       │   ├── ticketWatcher.ts fs.watch pipeline.json + diff status → emit ticket_* notif + FCM fanout
│       │   ├── runnerPrompt.ts RUNNER_BEHAVIOR_PROMPT (主 agent 流程 + ticket commit -F tmpfile + failed_transient 暫停 + provider-aware Task 派發)
│       │   └── runLog.ts       parse .runtime/logs/<pid>-<ts>.log → cost/duration/turns/tokens/result/sessionId
│       ├── notifs/
│       │   └── store.ts       emit / list / markRead / dismiss → .runtime/notifs.jsonl
│       └── qa/
│           ├── claudeCli.ts   spawn claude/codex(走 adapter)+ parseReply 4-fallback + enforceContract + 確認輪 reminder
│           ├── draftStore.ts  qa-drafts/<id>.json fs CRUD + appendTurn + markStarted
│           ├── systemPrompt.ts  QA_BEHAVIOR_PROMPT(含確認輪契約)+ DEFAULT_OPENING_MESSAGE
│           ├── splitTicket.ts 獨立 splitTicketSpec(老 ticket 補拆用)
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
│   │   ├── vibe-pipeline-backend/SKILL.md
│   │   └── vibe-pipeline-e2e/SKILL.md
│   └── settings.local.json    (若有) 個人 settings
│
└── node_modules/              (gitignored)
```

### Repo 外(runtime data,不在 repo 內)

```
~/.vibe-pipeline/              global runtime,跨 project 共用(在 user home,跟 target repo 內的 .vibe-pipeline/ 不衝突,只是同名)
├── state.json                 { lastProject, recentProjects: [{path, lastOpenedAt}] }
├── config.json                user-level model defaults(per-task-class qa/runner/subAgent/merge/split → provider/model/effort)
├── auth.json                  TOTP secret 雜湊 + sessions[](Phase 5)
├── device_tokens.json         FCM device tokens(Phase 5)
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
| [`sync-redesign-2026-05-13.md`](.claude/skills/vibe-pipeline/refs/sync-redesign-2026-05-13.md) | Sync 重構(Plan C)— 從 mode=sync ticket 拆成 pipeline.syncJob;state machine + 4 endpoints + AI 衝突解 prompt 設計 + 「靠 git 判定不靠 AI stdout」雷紀錄 |

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

## 五 SKILL 對應路由

- 改前端(畫面 / 元件 / styles / route / API 串接) → **`vibe-pipeline-frontend`**
- 做 backend(Bun server / fs / spawn / SQLite / runner / Q&A / budget) → **`vibe-pipeline-backend`**
- 改 / 加 CLI 指令(`vbpl`,`cli/` 內) → **`vibe-pipeline-cli`**
- 寫 / 改 / 跑 E2E(Playwright mock + real,覆蓋矩陣) → **`vibe-pipeline-e2e`**
- 思考 scope / 決策優先順序 / 看完整功能清單 / 看外部產品對照 → **`vibe-pipeline`**(主)

> ⚠️ **同步義務**:新增 / 重命名 / 刪除 SKILL 時,**必須同步更新 [`AGENTS.md`](AGENTS.md) 的 pointer 列表**。AGENTS.md 給 codex / 其他不認 claude SKILL 系統的 AI 看,用 pointer 引導他們 Read 對應 SKILL.md。Claude 自己不會自動讀 AGENTS.md,所以這條規則放這裡提醒人類 / 編輯 SKILL 的人:**改 SKILL 結構記得同步 AGENTS.md**。

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
14. **vite 6+ `allowedHosts` 預設只認 localhost** — Tailscale hostname / IP 連進來會被「Blocked request. This host is not allowed」擋。`vite.config.ts` 設 `allowedHosts: true`(網路存取已由 Tailscale tailnet 邊界控)。
15. **Service Worker `event.waitUntil(showNotification)` 必須自己寫** — 混合 `notification+data` payload 在 Android Chrome 上不會 auto-display。`public/firebase-messaging-sw.js` 的 push handler 必須自己 parse + 顯示。
16. **Android Chrome 不認 `new Notification()` page constructor** — 前景訊息要 `ServiceWorkerRegistration.showNotification()`,desktop fallback 才用 page constructor。`src/App.tsx` 的 `useFcmBootstrap` 已先試 SW reg。
17. **mobile drawer / 全螢幕用 `100dvh` 不要 `100vh`** — `100vh` 在 Android Chrome 算上 nav bar 區域,底部 input 被遮。需要 `viewport-fit=cover`(已在 index.html 設)+ CSS 用 `100dvh`(留 `100vh` 當 fallback)+ drawer-stage z-index ≥ 50(高過 `.board-mobile-tabs` 的 40)。
18. **跨 provider sub-agent 需要 `--dangerously-skip-permissions`** — claude 主 agent 派 `Task({ subagent_type: "codex-rescue" })` 時,sub-agent 內部 Bash 跑 `node codex-companion.mjs` 在 `defaultMode: auto` 下會被 permission_denials 擋,主 agent 還會幻覺成功訊息。`orchestrator.ts` 偵測 `subAgent.provider===codex || merge.provider===codex` 自動加 flag。
19. **改 SKILL 結構記得同步 [AGENTS.md](AGENTS.md)** — claude CLI 自動讀 SKILL.md,codex 等其他 AI 只讀 AGENTS.md(指向 CLAUDE.md + SKILL pointer 清單)。新增 / 重命名 / 刪除 SKILL 兩處都要改。
20. **AI sync 成功判定靠 git 狀態,不靠 AI stdout firstLine** — `syncJob.ts:waitAndFinish` 第一版用 `stdout.split("\n")[0].startsWith("PASS")` 判成功,AI 常把 `PASS\nSYNC_DONE` 寫在中段(`tsc passed.\n\nPASS\nSYNC_DONE`),firstLine 不匹配 → 誤判失敗 → backend `git merge --abort`(merge 已 commit,abort 是 no-op)→ 最終 worktree 已同步但 UI 顯失敗。改用 git ground truth:`!MERGE_HEAD && !conflictMarkers && behindBaseCount===0` 三條都成立才 PASS。任何「AI 回傳成功訊號」型判定都要記得 backend 自己驗 git / 檔案系統實際狀態,別信 AI 自然語言。
21. **HTML `title` 屬性 `\n` 在 Chrome / Firefox 多數版本被當空白** — multi-line tooltip 擠成一行(Firefox 較新版本會換行)。要正規 multi-line hover 必須自寫 Tooltip component;當前 sync chip / drawer 等仍用 `title` 屬性接受這視覺差。
22. **QA forceChat 不能在送訊息時清** — race condition:user 送訊息瞬間清 forceChat,backend 處理中 frontend poll 看到 disk 上仍 `draft.complete=true`(舊狀態)→ SpecReview 又跳出。改 `viewOverride: 'chat' | 'review' | null` 雙向 sticky,user 用「→ 回最終預覽」按鈕主動切。對應 backend 也修兩處:claudeCli systemPrompt 加 reopen 規則(rule 6) + draftStore auto-complete 改成只在 `!wasComplete && reply.complete !== false && 5/5` 時 fire。

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
