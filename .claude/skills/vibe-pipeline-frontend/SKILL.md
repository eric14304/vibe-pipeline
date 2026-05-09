---
name: vibe-pipeline-frontend
description: vibe-pipeline 前端開發規範 — shell 結構、設計 token、共用元件、加新畫面 SOP、pixel-diff 驗證、routing 慣例。改 src/features、src/shell、src/ui、src/styles、src/App.tsx 或加任何新畫面之前先讀。
---

## 當前 phase 提醒

**Phase 1+2 已落地**(2026-05-10)。

**已串 backend 的部分**
- TopBar:project list / select / open / reveal 全走 `/api/projects/*`
- BoardScreen:fetch project status / pipelines、init popup、create pipeline POST
- QADrawer:phase 2 完整接 `/api/.../qa/*`、real claude session、spec review form 寫進 pipeline
- Notifications inbox:走 `aside` slot,`collapsed/expanded` toggle(資料還是 mock)

**還是 mock 的(等之後接)**
- FocusColumn 顯示的 ticket data:從 backend 拿但執行狀態(iter / liveLog)是 UI-only,等 P2 runner 接
- `src/data/notifications.ts` NOTIFS_SEED:notification producer 還沒做,目前 frontend 顯示空 inbox
- `src/data/pipelines.ts` PROJECTS / PIPELINES:大部分 dead,留 STATE_COLOR/LABEL/fmtElapsed 給 UI 算

加新東西的優先序(P2 開始):
1. Doer / critic runner 跑起來後,FocusColumn ticket 顯示 real iter state
2. Notification producer 接上,inbox 有東西
3. Multi-pipeline 平行執行 UI
4. SKILL 候選 review UI(P3)

## 技術棧

- Bun(套件管理 + 跑腳本)+ Vite 5 + React 18 + TypeScript(strict)
- React Router v6(BrowserRouter,query param 驅動變體)
- 不裝 Tailwind / CSS-in-JS。樣式全走 prototype 移植來的 CSS + tokens.css 變數
- **不開 `<StrictMode>`**(原因見「pitfalls」段)

## Shell 結構

```
AppShell (src/shell/AppShell.tsx)        ← Notifications / Board / Pipeline Create 用
├─ topBar    slot   (default: <TopBar/>)
├─ banner    slot?  (Notifications 用)
├─ rail      slot   (左側 pipeline 列表)
├─ main      slot   (中:FocusColumn / CreatePlaceholder / 其他)
├─ aside     slot?  (右:Inbox / 其他 panel)
└─ overlay   slot?  (Drawer / Modal)

EmptyShell (src/shell/EmptyShell.tsx)    ← Init 用
└─ children  (全屏自由排版)
```

`<Drawer>` 與 `<QAScreen variant="drawer">` 自帶 `.drawer-stage` / `qa-drawer-backdrop`,不走 AppShell(它們是覆蓋型 overlay,自己處理背景)。

## src/ 內各層約定

> 物理結構樹 → root [`CLAUDE.md`](../../../CLAUDE.md) § Repo 內。本段只寫**為什麼這樣擺、什麼該放哪、什麼不該混**。

- **`features/{name}/`** 是大 feature 邊界。一個 feature 多檔(主 Screen + 子元件 + types)就獨立資料夾;單檔 < 200 行可只放 `{Name}Screen.tsx` 一檔
- **`shell/`** 只放跨 feature 共用的版面(AppShell slots、TopBar、Rail、EmptyShell)。**不放任何 feature 邏輯**
- **`ui/`** 是純展示的基礎元件(icons / Logo / PickerSelect / Button 等)。**不該知道任何 feature**
- **CSS import**:
  - 通用全域(tokens / board / notif)→ `main.tsx` 全域 import
  - feature 專用(qa / drawer / init)→ feature 元件最上面 `import "../../styles/qa.css"`,**別塞 main.tsx**
- **type 放哪**:
  - 跨 feature 共用 → `src/types/`(過渡;串接期持久化欄位將搬 `shared/types.ts`,UI-only 計算欄位留 `src/types/ui.ts`)
  - 單 feature 內用 → 該 feature 資料夾內
- **mock data 統一放 `src/data/`,不混 logic**。串接期改成從 `src/api/` fetch
- **`api/`** 每 endpoint 一個 `fetchXxx(): Promise<T>` 函式。**別在 component 裡 fetch URL 字面值**
- **`router/`** 集中 route 構造 helper(`buildPath.toBoard({project, pipeline})`),別讓字串散落各處

## 設計 token

`src/styles/tokens.css` 是從 prototype 1:1 移植過來的。**所有顏色、字型、spacing 都走 CSS 變數**,別寫 hex / px 原值。

主要變數:
- 背景: `--bg`, `--bg-elevated`, `--panel`, `--panel-2`
- 前景: `--fg`, `--fg-mute`, `--fg-faint`
- 線: `--line`, `--line-2`
- 互動: `--hover`, `--selected`, `--accent`, `--accent-soft`
- 狀態色: `--running` / `--iter` / `--done` / `--failed` / `--paused` / `--draft`(都有 `-soft` 版本)
- 字型: `--font-ui` (Geist + Noto Sans TC fallback), `--font-mono` (Geist Mono)
- shadow / radius 都有變數

主題切換靠 `<html>` 加 / 移 `light` class。深色是預設(無 class),`html.light` 覆寫變數值。

## 共用元件

### `src/ui/icons.tsx`
- 已有: `PlusIcon` / `SearchIcon` / `BellIcon` / `GearIcon` / `FolderIcon` / `ChevronIcon` / `ChevronLeftIcon` / `ChevronRightIcon` / `CheckIconSm` / `CheckIcon` / `WarnIcon` / `MergeIcon` / `CheckCircleIcon` / `CloseIcon` / `InboxEmptyIcon` / `FolderQuestionIcon` / `CopyIcon` / `RefreshIcon` / `BookIcon` / `SpinnerIcon`
- `BannerIcon({kind, small})` — kind: `warn` / `alert` / `check` / `skill` / `iter` / `dot`
- 加新 icon **先去 icons.tsx 看有沒有**,沒有才加

### `src/ui/Logo.tsx`
品牌 logo,接 `size` prop。

### `src/ui/PickerSelect.tsx`
下拉選單,有 outside-click + Esc 關閉。`{open, setOpen, value, onChange, options, icon}` props。`options: PickerOption[]` 含 `id, label, hint?, mono?`。

## 加新畫面 SOP

當 `design/vibe-pipeline/project/Prototype - X.html` 出現新畫面、或要加變體:

1. **讀全套**: HTML(看 mount 方式 + TWEAK_DEFAULTS)、`proto/X.jsx`(元件邏輯)、`proto/X.css`(樣式)
2. **搬 CSS**: `cp design/vibe-pipeline/project/proto/X.css src/styles/X.css`(不改一個字)
3. **找可重用元件**: 先翻 `src/ui/`、`src/shell/`、`src/features/pipeline/`,別重發明
4. **Port JSX → TS**: 在 `src/features/X/XScreen.tsx`(或拆多檔)
   - **className 必須與 prototype 一字不差**,DOM 結構 1:1
   - 在最上面 `import "../../styles/X.css"`
   - 不寫 comment、不 refactor、不「為清晰調整」
5. **加 route**: 在 `src/App.tsx` 加 `<Route path="/x" element={<XRoute />} />`,XRoute 用 `useTheme()` 跟 `useSearchParams()` 解 query
6. **加 pixel-diff 變體**: 在 `tests/pixel-diff.ts` 的對應 array 加項;每個變體要有 prototype HTML 對照(否則沒辦法 diff)
7. **跑驗證**: `npx tsx tests/pixel-diff.ts X` → 看到 0 px diff 才算完成

## Pixel-diff harness

`tests/pixel-diff.ts` 是維持 prototype-impl 一致性的核心。

**運作機制**:
- Playwright 起兩個 page:左邊跑 prototype HTML,右邊跑 vite dev server
- 對 prototype HTML 用 `page.route()` 攔截,把 `/*EDITMODE-BEGIN*/.../*EDITMODE-END*/` 區塊改寫,注入該變體的 TWEAK_DEFAULTS
- 兩邊都 inject `HIDE_CSS`(殺所有 animation/transition、藏 proto-jumpback 與 tweaks panel)
- 等 `document.fonts.ready` + 800 ms settle
- 截圖 → pixelmatch 比對(threshold 0.1, includeAA: false)
- 寫 `tests/.snapshots/{name}.proto.png` / `.mine.png` + `tests/.diffs/{name}.diff.png`(紅色 = 不同)

**指令**:
```bash
npx tsx tests/pixel-diff.ts            # 跑全部 (~36 變體, ~3 分鐘)
npx tsx tests/pixel-diff.ts notif      # filter: 只跑 notifications
npx tsx tests/pixel-diff.ts drawer
```

退出碼:全 0 px → 0,任何變體有 diff → 1。

**新加變體時**:
- prototype URL 要有對應檔案(否則無法對照,跳過或不加)
- 變體名稱用 `{screen}-{state}-{theme}`(底線斷字)
- `editmode` 物件對應 prototype 的 TWEAK_DEFAULTS schema
- `query` 對應我的 route 的 query param,確保 my impl 渲出同樣的 state

## 已知 pitfall(踩過,別重踩)

### 1. **不用 `<StrictMode>`**
React StrictMode 在 dev 會把 `useEffect([])` 觸發兩次。`QAScreen` 的初始 `emitTurn(0)` 會雙觸發產生重複 AI 訊息,pixel-diff 直接掛掉 5%。`src/main.tsx` 已關。**不要再加回來**(StrictMode 的好處 < pixel parity 的需求)。

### 2. **theme class 必須在 React mount 前同步設好**
`index.html` 內 inline `<script>` 讀 `?theme=` 設 `html.light` class。原因:若靠 React `useEffect`,第一個 frame 會用 stale theme 渲染,變體切換有 1-frame flash → diff 失敗。

### 3. **animation 要 `none`,不要 `0s`**
HIDE_CSS 用 `animation: none !important`。曾經寫 `animation-duration: 0s`,但 `fade-up` keyframe 起始是 `opacity: 0`,duration 0s 後仍套用「from」狀態 → 整個元件透明。

### 4. **字型 ready 才能截圖**
若沒等 `document.fonts.ready`,中文字 fallback 字型差幾 px,diff 會出現整段文字邊緣噪音。

### 5. **`page.route()` URL 用 regex 不用 string**
Playwright 預設把 string URL 當 glob 解,`?` 變萬用字元,query string 永遠不匹配。所以注入 EDITMODE 失效。**用 `new RegExp(...)` 強制字面匹配**。

### 6. **prototype dev-only UI 要在注入時關掉**
`Prototype - Ticket Drawer.html` 有個 `state-switcher-pill`(底部 4 顆 state 切換按鈕,`showSwitcher: true` 時出現)。我的實作沒這個 UI(它是 designer 的 dev tool),所以注入時 `showSwitcher: false`。同類:tweaks panel 與 proto-jumpback 也都是 dev-only,HIDE_CSS 藏掉。

### 7. **Sub-pixel AA 噪音(< 50 px)是可接受的**
某些 dashed border、SVG dot 在不同瀏覽器 context 會有 ±1 sub-pixel 差,屬 anti-aliasing 級噪音。視覺上不可區分。當前 4/36 變體有此狀況(全 < 0.01%)。要追求絕對 0 px 不切實際,接受門檻 < 50 px / variant。

### 8. **加新 feature 要避開 prototype 命名空間**
`src/styles/qa.css` 是 prototype 全屏 QA(QAScreen 4 變體)留下的,定了一堆 `.qa-*` class(含 `.qa-body { display: grid }`)。Phase 2 我加了 QADrawer 用 `.qa-body` 結果被 grid 拉伸,bubble 高度暴增。

**修法**:新 feature 用獨立 prefix(這次走 `qadr-`),完全脫離 prototype 命名空間。改 prototype 的 css 不可行(會破 pixel-diff),我們的責任是繞開。

### 9. **CSS template literal 內不用 backtick**
`server/lib/qa/systemPrompt.ts` 是 Bun 跑的 .ts,內含一大段 template literal 系統 prompt。寫 markdown 風文檔時手癢用了 `` `optionsMode` `` 框 inline code,backtick 直接終止字串、parse fail、backend crash、frontend 收到 500 + 空 body → "Unexpected end of JSON input"。

**修法**:template literal 內所有 inline code 用引號或 plain 文字。同樣套用到 frontend 的 .ts/.tsx 內 template string。

## Routing 慣例

所有畫面都靠 query param 控變體。共用 param:
- `?theme=light|dark`(沒給預設 light)

各畫面專屬:
- `/notifications`: `?state=` `?filter=` `?density=`
- `/board`: `?density=` `?creating=1`
- `/init`: 無
- `/drawer`: `?state=`
- `/qa`: `?variant=` `?autoplay=0|1`

加新 query param 時,**同步更新 pixel-diff 的對應 variant 跟 spec(本 SKILL 表格)**。

## Mock data

`src/data/pipelines.ts`:
- `PIPELINES`: 4 條範例 pipeline(feat-auth, feat-search, refactor-api, infra-ci)
- `PROJECTS`: 4 個專案
- `STATE_COLOR` / `STATE_LABEL`: 狀態 → 色/標籤映射(**這兩個不算 mock,是 UI 共用 token,留著**)
- `fmtElapsed(seconds)`: 秒 → "MM:SS"(同上)

`src/data/notifications.ts`:
- `NOTIFS_SEED`: 8 條範例通知
- `SEV_COLOR` / `SECTION_LABEL`: severity 映射(共用 token,留著)

**串接期改造**:
- `PIPELINES` / `PROJECTS` / `NOTIFS_SEED` 從 const → fetch from backend(透過下面「API 串接慣例」)
- pixel-diff 的「demo data 滿」變體**保留**(對照 prototype 用),但跑時用「**注入 mock fixture**」模式 — 例如 fetch URL 在測試環境攔截後回 PIPELINES const。已實作畫面繼續通過 pixel-diff
- 真實 runtime data 都從 backend 來

## API 串接慣例

### Vite proxy

`vite.config.ts` 設 `server.proxy['/api'] = 'http://127.0.0.1:3001'`,前端只打 `/api/*` 相對路徑,自動轉去 backend。

### Fetch / 資料層

**不引 react-query / SWR / Redux**(避免架構爆炸)。第一刀走最簡:
- 建 `src/api/` 目錄,每個 endpoint 一個 `fetchXxx()` 函式回 `Promise<T>`
- 在 component 用 `useEffect + useState` 自管 loading / error
- 重複出現的模式抽 `useApi(fetcher)` custom hook

之後若 cache invalidation / refetch / optimistic update 變痛了,**再考慮**引 react-query。**不要預先設計**。

### Type 共用

backend 是 schema authority。**不要前端 `src/types/` 跟 backend 各維護一套**。

短期過渡:
- backend 端定 `shared/types.ts`(由 backend SKILL 規範位置)
- 前端 import 同檔
- monorepo 結構:`shared/` 在 root,前後端都 `import "../shared/types"`

**目前 `src/types/pipeline.ts` 與 `src/types/notif.ts` 是過渡狀態**:加了 UI-only 計算欄位(如 `iter.totalElapsed`、`liveLog`)。串接時:
- 把「持久化欄位」抽到 `shared/types.ts`(backend 為主)
- UI-only 計算欄位放 `src/types/ui.ts` 並 extends 持久化 type

### Endpoint 命名

- `GET /api/projects`
- `POST /api/projects/select`
- `POST /api/projects/:hash/init`
- `GET /api/projects/:hash/pipelines`
- 等。完整列表在後端 SKILL「stub-first 起手」段

### 錯誤處理

backend 一律回 `{ ok: true, data }` 或 `{ ok: false, error: { code, message } }`。前端的 `fetchXxx()` 在 ok=false 時 throw,讓 useEffect 的 catch 接。**別把 4xx 當例外丟,正常流程也可能回 not_found**(例 init popup 偵測 .vibe-pipeline/ 不存在是預期狀態,不是錯)。

## 跨畫面 navigation + state

### URL 是 source of truth

跨畫面共享的 state(active project / theme / 當前看哪個 pipeline)**全走 URL query param 或 path**。不要塞 React Context 或 global store。理由:
- pixel-diff 已經靠 query param 驅動變體,連續性
- refresh 不掉 state
- bookmark / 分享連結直接帶完整 context

例:
- `/board?project=a3b4f1e2` — 看哪個 project
- `/board?project=a3b4f1e2&pipeline=feat-auth` — 看哪條 pipeline
- `?theme=dark` — 主題

例外:**會頻繁變動但不需要 URL 反映**的(如 banner 動畫狀態、未讀計數的本地 optimistic 值)用 component state 即可。

### 跨 route 的真正全域 state

只兩個:
- **`active project hash`** — `useActiveProject()` hook,讀 URL `project` param;當沒 param 時 fallback 到 `localStorage.lastProject` 並重定向到 `?project={hash}`
- **`theme`** — 已實作(URL `theme=` + `index.html` 同步 script)

其他都別放全域。

### Navigation 慣例

- 用 `useNavigate()` 跳 route(不用 `<a href>`,除非真要新分頁)
- 跨畫面跳轉**保留 query param**(`navigate(\`/drawer?project=\${project}&ticket=\${id}\`)`)
- 寫一個 `src/router/buildPath.ts` helper 集中所有 route 構造,避免散落字串

## 空狀態畫面

**Prototype 沒設計過**,串接期要新增。設計直接走 prototype 的 token 體系自由創作。

四個空狀態:
1. **沒選 project**: TopBar 顯示「點這選資料夾」,Rail / Focus 都空,中央放引導文字 + 大按鈕
2. **有 project + 沒 .vibe-pipeline/**: Modal `InitPopup` 蓋上,Board 在背後 dim
3. **有 project + 有 .vibe-pipeline/ 但沒 pipeline**: Rail 只有「+ 新 pipeline」,Focus 放 empty illustration
4. **有 pipeline 但沒 ticket**: Focus head 正常顯示,list 區放 empty illustration

實作位置:
- 「沒選 project」放 `src/features/pipeline/EmptyProject.tsx`
- 「沒 .vibe-pipeline/」彈 `src/features/init/InitPopup.tsx`(**新元件**,跟 InitScreen 共享 init.css 但走 modal 形式)
- 「沒 pipeline」與「沒 ticket」放 `src/features/pipeline/EmptyStates.tsx`(兩個小元件)

**這些變體 pixel-diff 暫不跑**(沒 prototype 對照)。寫好後自己 review render OK 即可。後續若 prototype 補了空狀態設計,再加 diff variants。
