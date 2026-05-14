# vibe-pipeline

多 AI agent(執行AI + 審核AI)的 ticket / pipeline 編排器。Web 應用為主介面,將來配 `vp` CLI。每張 ticket 由 執行AI 跑、審核AI 審,iterative 模式自動迴圈到 審核AI pass;pipeline 是 ticket 的有序組合,每條跑在獨立 git branch,完成後 merge 回 base。

## 當前狀態

**Phase 1-5 全套已落地 + 2026-05 後續打磨**。Phase 表、歷次大改動、已 final 決定不做的清單在 [`docs/CHANGELOG.md`](docs/CHANGELOG.md);本檔不再追歷史,只保留現狀規則。

**架構決策**(現狀):
- Bun local server + browser(前端 Vite 5173 / 後端 Bun 3001 / `/api/*` 透過 Vite proxy)
- Runner 主 agent 工具白名單只准 Edit/Write 改 pipeline.json + worktree 外 tmp(commit message)+ Bash 跑 read-only + git add/commit;source code 改動 100% 透過 Task 派 sub-agent
- Theme 偏好走 localStorage(URL `?theme=` 仍 override);非 backend config
- 跨 provider sub-agent:claude main → codex sub via Bash 直呼 codex CLI;主 agent 永遠帶 `--dangerously-skip-permissions`
- Sub-agent 拆 executor / critic 兩個 TaskClass:executor 真改 code 用高 capability,critic 讀 diff 判 PASS/FAIL 用便宜 model;`syncJob` 衝突解走 executor cfg
- Auth 設計:loopback IP 永遠 bypass,只非 loopback 連線強制 TOTP;本機 dev 完全不受影響

**Phase 6 候選**(尚未動工)
- **iOS PWA push 實測** — iOS 16.4+ 已支援 Web Push 但需先「加入主畫面」,目前只在 Android 驗過

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
├── docs/
│   ├── SKILL.md               主 SKILL — enduser AI 操作手冊(distributable artifact;enduser cp 進 ~/.claude/skills/vibe-pipeline/SKILL.md)
│   ├── install.md             完整 install 手冊(per-OS / trouble),README §CLI pointer 過來
│   └── refs/                  設計文件 / 競品對照 / 歷史 spec(maintainer 用,enduser 不裝)
│
├── .claude/
│   ├── skills/                repo 內 maintainer SKILL(改 vibe-pipeline 自己 code 的 AI 用,不散發)
│   │   ├── vibe-pipeline-frontend/SKILL.md  改 src/ 用
│   │   ├── vibe-pipeline-backend/SKILL.md   改 server/ 用
│   │   ├── vibe-pipeline-cli/SKILL.md       改 cli/ 用
│   │   └── vibe-pipeline-e2e/SKILL.md       寫 / 改 / 跑 e2e 用
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

`docs/refs/` 下有:

**Active(當前還參考)**:

| 檔 | 用途 |
|---|---|
| [`spec-2026-05-09.md`](docs/refs/spec-2026-05-09.md) | 完整 [M]/[P2]/[P3] 功能清單 |
| [`integration-plan-v3-runner-2026-05-10.md`](docs/refs/integration-plan-v3-runner-2026-05-10.md) | Phase 3 整段(第一/二/二.五/三/四刀)落地紀錄 + 待第五刀清單 |
| [`git-design-2026-05-09.md`](docs/refs/git-design-2026-05-09.md) | 多 pipeline 平行的 git worktree 設計 |
| [`state-matrix-2026-05-10.md`](docs/refs/state-matrix-2026-05-10.md) | Pipeline state × condition → UI behavior 決策表(改 button / banner 前對齊) |
| [`merge-isolation-2026-05-11.md`](docs/refs/merge-isolation-2026-05-11.md) | self-dogfood AI merge 撞 vite/bun watch 的研究紀錄;結論不做(99% user 不踩),phase 5+ 多人 self-dogfood 才回頭做 |
| [`claude-cli-spawn-perf-2026-05-11.md`](docs/refs/claude-cli-spawn-perf-2026-05-11.md) | claude CLI spawn 加速 — QA/split/runner 三處 flag 改動量測(QA/split 省 80-90% cost)+ 風險 + 衍生 |
| [`sync-redesign-2026-05-13.md`](docs/refs/sync-redesign-2026-05-13.md) | Sync 重構(Plan C)— 從 mode=sync ticket 拆成 pipeline.syncJob;state machine + 4 endpoints + AI 衝突解 prompt 設計 + 「靠 git 判定不靠 AI stdout」雷紀錄 |

**Archive(已落地或一次性閱讀)**:`docs/refs/archive/` 下 — phase 1/2 計畫已落地;`docs/refs/competitor-refs.md` 是 vibe-kanban / symphony / composio-ao 競品對照合集(設計初期一次性參考)。

新加 ref 寫進 `docs/refs/`,Active 加進上表;落地或不再參考時搬 `archive/`。

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
6. **server prompt template literal 內禁用 inline backtick** — `` `code` `` 在 backtick template literal 內會關閉外層字串。任何 `.ts` 內的 template literal 都會炸,不只 `systemPrompt.ts` / `runnerPrompt.ts`。改完一律純文字 + grep 確認沒殘留 backtick。Bun `--watch` reload 噴 syntax error 後 server 不會自己復活。踩過 2 次。
7. **self-dogfood(vibe-pipeline 改 vibe-pipeline 自己)跑 AI merge 前要關 `--watch`** — AI 在 main repo 跑 `git merge` 會寫 conflict markers;若衝突落在 `server/` 檔,bun `--watch` reload backend 會連帶殺掉 spawn 出去的 claude child session,merge 中斷。`src/` 衝突只 vite 紅 overlay 但 child 不死(可忽略 overlay,F5 等做完)。解法:平常 `bun run server`(no watch)就好;只有改 server code 想熱 reload 才用 `bun run server:watch`,且 watch 模式下不要按 AI merge。end user 跑 VP 對別 project 不會有這問題(他不改 VP 自己 server code)。研究紀錄見 [`merge-isolation-2026-05-11.md`](docs/refs/merge-isolation-2026-05-11.md);徹底解只能上 merge worktree 隔離(~150 行,當前不投入)。
8. **server 重啟會殺 spawn 的 claude child(running pipeline → recoverStale 標 paused)** — 改 server code 前先看有沒有 pipeline 在跑,否則 user 看到 pipeline 莫名暫停。recovery 自動標 paused 但 worktree 進度保留,user 按「繼續」會從 critic 階段接續(若 doer 已交,executor 不重派,省 token)。`bun run server` 是 no-watch default,改完要手動 kill + 重啟。
9. **vite 內部模組 map cache 卡 stale `.js` 副檔名**(已防再生,但 cache 偶發要清)— `tsconfig.json` 已 `noEmit:true` 防再生 `.js`,但若舊 cache 還在,vite 會把 import 解到 `.js` URL → 撞 SPA fallback HTML → board 空白。解:`rm -rf node_modules/.vite` 重啟 vite。
10. **Android Chrome push 行為(SW + Notification 兩段)** — (1) 混合 `notification+data` payload **不會 auto-display**,`public/firebase-messaging-sw.js` push handler 必須自己 `event.waitUntil(showNotification(...))`;(2) 前景訊息用 `ServiceWorkerRegistration.showNotification()`,**不能**用 `new Notification()` page constructor(Android Chrome 不認)。`src/App.tsx` `useFcmBootstrap` 已先試 SW reg,desktop fallback 才用 page constructor。
11. **mobile drawer / 全螢幕用 `100dvh` 不要 `100vh`** — `100vh` 在 Android Chrome 算上 nav bar 區域,底部 input 被遮。需要 `viewport-fit=cover`(已在 index.html 設)+ CSS 用 `100dvh`(留 `100vh` 當 fallback)+ drawer-stage z-index ≥ 50(高過 `.board-mobile-tabs` 的 40)。
12. **跨 provider sub-agent 主 agent 永遠帶 `--dangerously-skip-permissions`** — claude 主 agent 派 codex sub-agent 時,sub-agent 內部 Bash 在 `defaultMode: auto` 下會被 permission_denials 擋(主 agent 還會幻覺成功訊息)。`orchestrator.ts` 改成主 agent 永遠帶 flag,不再條件式偵測 provider。
13. **改 SKILL 結構記得同步 [AGENTS.md](AGENTS.md)** — claude CLI 自動讀 SKILL.md,codex 等其他 AI 只讀 AGENTS.md(指向 CLAUDE.md + SKILL pointer 清單)。新增 / 重命名 / 刪除 SKILL 兩處都要改。
14. **AI sync 成功判定靠 git 狀態,不靠 AI stdout firstLine** — `syncJob.ts:waitAndFinish` 第一版用 `stdout.split("\n")[0].startsWith("PASS")` 判成功,AI 常把 `PASS\nSYNC_DONE` 寫在中段(`tsc passed.\n\nPASS\nSYNC_DONE`),firstLine 不匹配 → 誤判失敗 → backend `git merge --abort`(merge 已 commit,abort 是 no-op)→ 最終 worktree 已同步但 UI 顯失敗。改用 git ground truth:`!MERGE_HEAD && !conflictMarkers && behindBaseCount===0` 三條都成立才 PASS。任何「AI 回傳成功訊號」型判定都要記得 backend 自己驗 git / 檔案系統實際狀態,別信 AI 自然語言。
15. **HTML `title` 屬性 `\n` 在 Chrome / Firefox 多數版本被當空白** — multi-line tooltip 擠成一行(Firefox 較新版本會換行)。要正規 multi-line hover 必須自寫 Tooltip component;當前 sync chip / drawer 等仍用 `title` 屬性接受這視覺差。
16. **QA forceChat 不能在送訊息時清** — race condition:user 送訊息瞬間清 forceChat,backend 處理中 frontend poll 看到 disk 上仍 `draft.complete=true`(舊狀態)→ SpecReview 又跳出。改 `viewOverride: 'chat' | 'review' | null` 雙向 sticky,user 用「→ 回最終預覽」按鈕主動切。對應 backend 也修兩處:claudeCli systemPrompt 加 reopen 規則(rule 6) + draftStore auto-complete 改成只在 `!wasComplete && reply.complete !== false && 5/5` 時 fire。
17. **codex CLI spawn 不要加 `--ignore-user-config`** — 該 flag 把 `~/.codex/config.toml` 內 `provider = codex_local_access`(ChatGPT auth)設定 ignore 掉,fallback default OpenAI API 模式 → 用 `auth.json` 內 internal/beta key(`agt_codex_...`)撞 401 Unauthorized,主 runner 起不來。`codexAdapter.commonExecArgs` 已移除該 flag,保留 `--ignore-rules` + `-c mcp_servers={}` 維持隔離(不引 user MCP / rules 干擾)。Performance 損失極小 vs auth 全壞,得失不對稱。

## 設計信條(改 code 前對齊)

跟「不踩的雷」(反面教材)對稱的正面原則 — 改 code / 設計新 feature 時對齊。只列**已實作**且**仍持續適用**的 5 條:

1. **單一定義源** — Ticket / Pipeline / SKILL 只在 YAML / pipeline.json 一份;runtime state 是 cache。改一份能溯源到 source,不在 N 個地方各記一份各自漂走
2. **Branch 是並行邊界** — 多 pipeline 平行靠 `git branch` + 獨立 worktree 隔離,**不靠 process lock / 不靠 mutex**。git 已是 mature 的並行語意,複用比自己發明強
3. **人工 approve SKILL** — AI 永遠不直接寫 `SKILL.md`,只能 stage 候選 → user review → 人手 commit。SKILL 是行為手冊,被 AI 自己改會 drift
4. **跨 pipeline 不直傳 context** — pipeline A 學到的東西要影響 pipeline B,**走 SKILL 中介**(寫進 SKILL,B 自己讀),不要直接把 A 的 state 丟給 B 看。維持邊界乾淨
5. **Critic fail ≠ ticket fail** — Iter mode 內 critic 判 FAIL 是「下一輪繼續」的訊號,不是 ticket 死了。`failed_iter_limit` 才是死(N 輪 critic 都沒過)

> 註:原 spec 還有「exclusive lock 優先於並行」「無 max_iter 預設靠 stall detection」兩條;前者因目前沒 deploy / DB migration 這類資源沒實作,後者仍寫死 `iterLimit=5`。等 Phase 6 stall detection 落地後再恢復。

## 手機遠端使用方式

Tailscale + TOTP + FCM 完整 setup 流程(裝 / 連 / 啟通知 / FCM env 表)見 [`README.md`](README.md) §遠端存取。本段只記 README 沒提的雷:

- **Windows `auth.json` NTFS ACL** — `~/.vibe-pipeline/auth.json` 存 TOTP secret 雜湊。程式 `fs.chmod(0o600)` 在 Windows NTFS 不生效,個人 PC 單帳戶 OK(user profile 目錄預設已隔離),多帳戶 / 工作機要手動右鍵 → 安全性 → 移除 Users/Everyone
- **HTTPS 不可省** — FCM service worker 要 secure context,`http://100.x.x.x:5173` 不算 secure → push 訂閱不會註冊。手機必須走 `tailscale serve --https=443 http://localhost:5173`
- **`server/index.ts` 必須 `0.0.0.0` 監聽** — 改回 `127.0.0.1` 手機連不到,Tailscale 介面也算非 loopback
- **`ALLOWED_ORIGINS` 不要放 `*`** — TOTP 是 auth 層但 CORS 也是邊界,Tailscale tailnet 不該假設絕對安全
- **離線 push 補送靠 FCM 不靠 VP** — 手機離線時 FCM server 暫存 28 天,VP 端不做 queue;debug 時別找 VP backend 的 queue,沒有
