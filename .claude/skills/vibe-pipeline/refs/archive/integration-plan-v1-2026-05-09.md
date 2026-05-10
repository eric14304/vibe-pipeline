# 串接計畫 v1(2026-05-09)

> 從「6 個 pixel-perfect 畫面 + mock data」進入「真實 backend 串接」的第一階段計畫。
> 這份是 **plan**,不是 spec。實作走完一輪後若決策有變,加 v2 ref(別覆蓋)。
>
> **物理路徑** → root [`CLAUDE.md`](../../../../CLAUDE.md) § Repo 內 / Repo 外。本檔只列**範圍**(第一刀做哪些檔案、不做哪些)。

## 1. 第一條 vertical slice

從**空狀態**走完一條最小可用流程:

```
1. 啟動 → 空 board (no pipeline / no ticket)
2. TopBar 點專案切換器 → 選本地資料夾(透過 backend 開原生 dialog)
3. backend 偵測該資料夾 .vibe-pipeline/ 是否存在
   ├─ 沒有 → 彈 InitPopup 詢問是否自動初始化
   │   └─ user 同意 → backend 跑 init (建 .vibe-pipeline/ + 寫 .gitignore + 預設 config.json)
   │       └─ 完成 → InitPopup 關 → 切回空 board (此時 已 ready 加 ticket)
   └─ 有 → 直接載入 (此時讀 .vibe-pipeline/ 內現有 ticket / pipeline 顯示)
4. 空 board 上點「+ 新 pipeline」 → CreateCard → 寫進 .vibe-pipeline/pipelines/<id>.json (id 自動產生:<12-hex-ms-ts>-<slug>)
5. 進到該 pipeline → 「+ ticket」 → 修改 pipeline.json 的 tickets 陣列 → PUT 整條 pipeline
```

**範圍外**(這次不做,留下階段):
- 執行AI / 審核AI runner spawn
- SQLite log
- git branch / worktree 操作
- Q&A 引擎、stall detection、budget tracker、notification 通道

走完這條,我們有「**檔案層的 ticket 編排器骨架**」,後續加 runner / SQLite 才有依託。

## 2. 架構決策:Bun local server + browser

```
┌──────────────────────────────────┐
│ Browser (http://127.0.0.1:5173)  │
│ Vite dev server + React frontend │
└──────────────┬───────────────────┘
               │ HTTP / WS via /api/*
               │ (Vite proxy)
               ▼
┌──────────────────────────────────┐
│ Bun backend server (port 3001)   │
│ - HTTP server (Bun.serve)        │
│ - fs / spawn / dialog            │
│ - 之後: bun:sqlite, git wrapper  │
└──────────────────────────────────┘
               │
               ▼
       本地檔案系統 + .vibe-pipeline/
```

**為什麼 Bun**:已經用 Bun 跑 Vite,加一個 `bun run server` 自然;`bun:sqlite` / `Bun.spawn` / `Bun.file` 全內建,不用裝 better-sqlite3 / node-pty 等。**未來要包 Tauri 也能無縫遷**(Tauri sidecar 直接跑這個 Bun process)。

## 3. 第一刀 backend 範圍

只做這些,其他不碰:

### 3.1 Project 模組
- `Project { path, name, hasInit, lastOpenedAt }`
- 持久化:`~/.vibe-pipeline/state.json`(global,跨 repo;記 user 開過的 projects + last selected)
- API:
  - `GET /api/projects` — 列最近開過的
  - `POST /api/projects/select` — 開原生 dialog 讓 user 選資料夾,回 path
  - `POST /api/projects/open` — body: `{path}`,標 last opened
  - `GET /api/projects/:hash/status` — 該 project 的 .vibe-pipeline/ 偵測結果

### 3.2 Init 模組
- `POST /api/projects/:hash/init` — 在指定 project 建 .vibe-pipeline/ 結構
  - 建 `.vibe-pipeline/{config.json, pipelines/}`
  - 預設 `config.json` 用簡化版(只填 `defaults.base_branch: main`、其他留空)

### 3.3 Pipeline CRUD(JSON 層,tickets 內嵌)
- `GET /api/projects/:hash/pipelines` — 掃 `.vibe-pipeline/pipelines/*.json`
- `POST /api/projects/:hash/pipelines` — 寫一份新 YAML
- `GET /api/projects/:hash/tickets` — 掃 `.vibe-pipeline/tickets/*.json`
- `POST /api/projects/:hash/tickets` — 寫一份新 YAML
- 都還沒做 schema 驗證,先求能寫能讀

**這版不做**:
- 任何 SQLite(等加 runner 才需要)
- 任何 git 操作(寫進 YAML 的 branch 欄位先空著或寫預期名)
- Schema 驗證 / migration(等用一陣子覺得痛了再加)

## 4. Project 路徑 hash 規則(學 Composio AO)

`hash = sha256(absolute_path).slice(0, 8)`

用途:
- API path 不直接帶 absolute path(`/api/projects/a3b4f1e2/status` vs `/api/projects/Users/eric/code/foo/status`)
- 同一台機器多個 vibe-pipeline checkout 不撞名
- 未來 worktree / runtime data 路徑也走同 pattern

UI 顯示用短名(專案資料夾名),routing 用 hash。

## 5. 前端對應改動

### 5.1 TopBar 專案切換器
- 目前是 mock(PROJECTS const)→ 改 fetch `/api/projects`
- 點「選擇其他資料夾…」 → call `/api/projects/select`
- 拿到 path → 切 active project → 跳 `/board?project={hash}`

### 5.2 BoardScreen
- 掃 `useSearchParams().get("project")` → fetch `/api/projects/:hash/status`
- 沒 project param → **預設空 board + 提示先選專案**(這是新狀態,要設計)
- 有 project + 沒 .vibe-pipeline/ → 渲染 InitPopup
- 有 project + 有 .vibe-pipeline/ → 載 pipelines(目前空就空著)

### 5.3 InitPopup(新元件)
- 全屏 popup or modal(模式待定,**先做 modal 不擋 board**)
- 內容大致借用 InitScreen 的卡片設計(`init-card`),但加上「一鍵自動 init」按鈕(call `POST /init`)+「我自己跑 `vp init`」(關 popup)
- 完成後關閉,觸發 board 重 fetch status

### 5.4 CreateCard(已實作)
- onSubmit 從現在的 local state 改成 `POST /api/projects/:hash/pipelines`
- 成功後切到該 pipeline

## 6. 「空狀態」設計(沒 prototype 對照)

**Prototype 沒設計過空狀態**,只有 demo data 滿的版本。這版我們要新增空狀態:

- **沒選 project**: TopBar 顯示「點這選資料夾 →」,Rail / Focus 都空,中央放引導
- **有 project + 沒 .vibe-pipeline/**: Modal InitPopup 蓋上,Board 在背後 dim
- **有 project + 有 .vibe-pipeline/ 但沒 pipeline**: Rail 只有「+ 新 pipeline」按鈕,Focus 放 empty illustration「**還沒任何 pipeline,點左邊建立第一條**」
- **有 pipeline 但沒 ticket**: Focus head 正常顯示,list 區放 empty illustration「**還沒 ticket,點右上「+ ticket」開始**」

這幾個空狀態畫面**沒 pixel-perfect 對照**,設計直接走 prototype 的 token 體系自由創作。Pixel-diff 暫時跳過這些變體,有 prototype 才比。

## 7. API 與資料模型 stub schema

```ts
// shared/types.ts (前後端共用,backend 是 source of truth)

type Project = {
  path: string;            // absolute
  hash: string;            // sha256(path).slice(0,8)
  name: string;            // basename(path)
  hasInit: boolean;     // .vibe-pipeline/ 是否存在
  lastOpenedAt: number;    // unix ms
};

type Pipeline = {
  id: string;            // <12-hex-ms-ts>-<slug>
  name: string;
  branch: string;        // 預期 branch 名,git 沒實際建
  baseBranch: string;
  state: "planning" | "running" | "paused" | "ready" | "failed" | "merged";
  tickets: Ticket[];     // 內嵌,不另外存
};

type Ticket = {
  id: string;
  n: number;
  title: string;
  status: "draft" | "ready" | "running" | "paused" | "done" | "failed";
  mode: "step" | "iter";
  goal?: string;
  acceptance?: string[];
  prompt?: string;
};
```

**注意**:這跟 `src/types/pipeline.ts` 已有的 type 大致對齊但**不完全相同**(那邊是 mock 用,有些欄位是 UI 計算用如 `iter` / `liveLog`)。串接時:
- backend 只回「**持久化欄位**」(從 JSON 讀的)
- 前端用 backend 回的 + 自己算 UI-only 欄位
- 不要兩邊各維護一套 type — 之後共用 `shared/types.ts`(backend 為主)

## 8. 對焦過的設計信條(沿用主 SKILL,挑這次相關)

- **#1 單一定義源**:Pipeline / Ticket 在 JSON,backend 是 schema authority,前端不另存
- **#2 Branch 是並行邊界**:這版還沒做 git ops,但 schema 已預留 `branch` 欄
- **#5 Critic fail 不等於 ticket fail**:這版沒 runner,但 ticket schema 預留 `mode`(step/iter)為將來 審核AI loop 鋪路

## 9. 對焦過的 ref 借鏡(挑這次用得到的)

- **Composio AO**:
  - **hash-based 路徑命名空間**(本計畫 §4)
  - **(state, reason) 雙欄**(這版先用單 enum,加 reason 欄留空,之後加用)
- **Symphony**:
  - **Service / Agent 硬邊界**:backend 這版只「讀寫 YAML + 偵測 fs」,所有 mutate 邏輯往後推給 runner(沒做但邊界先畫好)
  - **Workspace safety invariants**:`POST /init` 必須 assert path 在合理範圍(防 user 把 `/` 拿去 init)
- **vibe-kanban**:
  - **Type single source of truth**:`shared/types.ts`,前後端共用(本計畫 §7)
  - **Repository lifecycle script**:這版不做,但 config.json 預留 `setup / dev / cleanup` script 欄
- **Symphony WORKFLOW.md 模式**:這版不採用(我們是分散 YAML),但**注意保留可走那條路的彈性** — 別把 `pipelines/*.json` 寫死成只能機器讀,之後外接 prompt template 仍要能塞

## 10. 待解 / 開工會浮現的問題

- **原生 dialog API**:Bun 沒內建 file dialog,要 spawn 系統工具?(macOS `osascript`、Windows `powershell` Get-FileDialog、Linux `zenity`)。或前端走 webkitdirectory input(但這只能選資料夾,沒法給 absolute path 給 backend → 失敗)。**最可能解**:Bun spawn OS dialog 工具
- **同一專案多 user / 多 instance**:目前假設單 user 單 instance。第二個 instance 開同專案怎麼處理?(lock file?)
- **檔案監聽**:user 從 IDE 直接編輯 `.vibe-pipeline/*.json`,UI 要不要即時更新?第一版**不做**(refresh 才更新),之後可加 `chokidar` watcher
- **CORS / 認證**:本機 server 跑在 localhost:3001,前端 5173。Vite proxy `/api/*` 過去就好,不需要 CORS。**沒做認證**(本機,信任 user)。
- **Init 後是否要 `git init`** 若該資料夾沒 git?第一版**不做**,init 只建 .vibe-pipeline/,git init 留給 user
