# Repo 結構(物理路徑 single source of truth)

> **集中規則**:repo 物理檔案 / 目錄結構**只在本檔寫一份**。SKILL 內不再畫樹,只寫該層的「約定 / 職責邊界 / 思想」。新增資料夾或重組時改本檔,SKILL 自動跟著對。

## Repo 內

```
vibe-pipeline/
├── CLAUDE.md                  always-on 規則 + 雷區 + 設計信條(精簡)
├── AGENTS.md                  跨 provider pointer(codex 等不認 CLAUDE.md/skills 的 AI 看這份)
├── package.json               Bun + Vite + React + TS deps
├── bun.lock
├── tsconfig.json
├── vite.config.ts             dev server(host 0.0.0.0 + allowedHosts true + /api → :3001 proxy)
├── index.html                 Vite 入口,inline theme sync script + viewport-fit=cover + manifest link
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
│   │   ├── pipeline/          BoardScreen + FocusColumn + EmptyProject + TicketDrawer + RunHistory + DiffModal
│   │   ├── pipelineCreate/    CreateCard + CreatePlaceholder
│   │   ├── init/              InitPopup (修改後直接接 BoardScreen)
│   │   ├── qa/                QADrawer + useQA (真接 backend)
│   │   ├── auth/              SetupScreen + LoginScreen + SecurityTab + AddDeviceDialog + useAuthStatus + authApi + types
│   │   ├── settings/          SettingsPopover + SettingsPopover.css(tab UI:Project / AI 任務 / 通知 / 安全)
│   │   └── dev/               StatesGallery (狀態 gallery /dev/states)
│   ├── lib/
│   │   └── fcm.ts             Firebase 前端 SDK init + getToken + register + foreground handler
│   ├── styles/                CSS(tokens / board / notif / init / drawer / qa)
│   ├── data/                  純 helper(STATE_COLOR / SEV_COLOR / fmtElapsed),mock seed 已全砍
│   ├── types/                 過渡型別 (UI-only) — pipeline.ts / notif.ts
│   ├── api/                   每 endpoint 一個 fetchXxx() — projects.ts / qa.ts
│   ├── hooks/                 useActiveProject(URL ?project=hash + localStorage fallback)
│   └── router/                (規劃) buildPath helper
│
├── server/                    後端。職責邊界見 vibe-pipeline-backend SKILL
│   ├── index.ts               Bun.serve 入口,route 表 + authGuard middleware
│   ├── routes/                純 dispatch,不寫業務邏輯
│   │   ├── projects.ts        /api/projects/* (含 pipelines CRUD + git-init + reveal)
│   │   ├── qa.ts              /api/.../qa/* (start / turn / finalize / cancel / drafts)
│   │   ├── userConfig.ts      /api/user/config GET / PUT(跨 project per-task-class model)
│   │   ├── auth.ts            /api/auth/{status,setup-init,setup-verify,login,logout,sessions,reset}
│   │   └── push.ts            /api/push/{config,register,unregister,tokens,test}
│   └── lib/                   純 IO + 邏輯,不知道 HTTP
│       ├── projectStore.ts    ~/.vibe-pipeline/state.json 讀寫
│       ├── pipelineDir.ts     <target-repo>/.vibe-pipeline/ 偵測 / 建立 / json 讀寫
│       ├── hash.ts            absolute path → 8-char sha256
│       ├── dialog.ts          OS native folder picker (osascript/powershell/zenity) + revealFolder
│       ├── userConfig.ts      ~/.vibe-pipeline/config.json
│       ├── git.ts             hasGit / gitInit
│       ├── depInstall.ts      merge 後動 deps → 自動 bun install(見 CLAUDE.md §self-dogfood 加 npm dep)
│       ├── pipelineMerge.ts   mechanical(git --no-ff)+ AI fallback merge
│       ├── git/worktree.ts    ensure / remove / prune (per pipeline)
│       ├── cli/               CliAdapter + claudeAdapter + codexAdapter + factory
│       ├── auth/              storage / middleware / cookie / pending
│       ├── push/tokenStore.ts ~/.vibe-pipeline/device_tokens.json
│       ├── fcm/index.ts       firebase-admin init + fanoutPush + dead token 偵測
│       ├── runner/            orchestrator / ticketWatcher / runnerPrompt / runLog
│       ├── notifs/store.ts    emit / list / markRead / dismiss → .runtime/notifs.jsonl
│       └── qa/                claudeCli / draftStore / systemPrompt / splitTicket / schema
│
├── shared/
│   └── types.ts               跨 backend/frontend 持久化型別
│
├── design/                    Claude Design handoff bundle(歷史紀錄,real code 已不引用)
│
├── docs/
│   ├── CHANGELOG.md           歷次大改動
│   ├── TODO.md                待動工清單(對應 phase 8 pipeline)
│   ├── refs/                  設計文件 / 競品對照 / 歷史 spec(maintainer 用)
│   │   ├── README.md          refs 目錄索引(active / archive)
│   │   └── repo-structure.md  本檔
│   └── vibe-pipeline/         enduser AI bundle(distributable)
│       ├── SKILL.md
│       ├── install.md
│       └── repl-runner.md
│
├── .claude/
│   ├── skills/                repo 內 maintainer SKILL
│   │   ├── vibe-pipeline-frontend/SKILL.md
│   │   ├── vibe-pipeline-backend/SKILL.md
│   │   ├── vibe-pipeline-cli/SKILL.md
│   │   └── vibe-pipeline-e2e/SKILL.md
│   └── rules/                 path-specific 雷區(frontmatter `paths:` 標明適用範圍)
│       ├── pwa-sw.md          SW / Workbox / vite-plugin-pwa
│       └── remote-access.md   Tailscale / TOTP / FCM / network binding
│
└── node_modules/              (gitignored)
```

## Repo 外(runtime data)

```
~/.vibe-pipeline/              global runtime,跨 project 共用(在 user home)
├── state.json                 { lastProject, recentProjects: [{path, lastOpenedAt}] }
├── config.json                user-level model defaults(per-task-class)
├── auth.json                  TOTP secret 雜湊 + sessions[]
├── device_tokens.json         FCM device tokens
└── worktrees/<projHash>/<pipelineId>/   git worktree per pipeline,平行執行用

<target-repo>/.vibe-pipeline/  每個 user target repo 內,由 init 建
├── config.json                (git tracked) project-level 設定
├── pipelines/*.json           (gitignored) 一檔一條,內含 tickets 陣列
└── .runtime/                  (gitignored)
    ├── qa-drafts/<id>.json    QA 對話 draft (含 session_id)
    ├── notifs.jsonl           backend emit 事件流(append-only)
    └── logs/<pipelineId>-<ts>.log  runner 主 agent stdout/stderr
```

`<target-repo>/.vibe-pipeline/` **不在這個 repo 內**(除非 self-dogfood),是 VP 操作的 target repo 才有。跟 user home 的 `~/.vibe-pipeline/`(global state)同名但位置不同,程式上不撞。
