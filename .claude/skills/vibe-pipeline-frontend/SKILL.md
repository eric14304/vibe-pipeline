---
name: vibe-pipeline-frontend
description: vibe-pipeline 前端開發規範 — shell 結構、設計 token、共用元件、加新畫面 SOP、狀態 gallery 驗證、routing 慣例。改 src/features、src/shell、src/ui、src/styles、src/App.tsx 或加任何新畫面之前先讀。
---

## 當前 phase 提醒

> 完整 phase 落地 / 後續打磨清單 → [`CLAUDE.md`](../../../CLAUDE.md)。本段只列「**改前端時要意識到的新東西**」。

**Phase 1-5 全套已落地**(2026-05-11 為止 6 條 pipeline merge 進 main)。Phase 5 後 frontend 多了三大區塊:

### auth 模組(`src/features/auth/`)
TOTP 雙重驗證 — 非 loopback 連線需先 setup → bind → cookie session。
- `SetupScreen.tsx` 全屏 — 顯示 QR Code + 6 碼驗證(`/setup` route)
- `LoginScreen.tsx` 全屏 — cookie 過期後重新輸 6 碼(`/login` route)
- `SecurityTab.tsx` — SettingsPopover 內「安全」tab,顯示 active sessions + 撤銷 + 重置 TOTP + 擴增裝置
- `AddDeviceDialog.tsx` — 擴增裝置時顯 QR 給新裝置掃
- `useAuthStatus` hook — 全域 auth state(bound / sessions)
- `authedFetch` wrapper — 401 自動 redirect `/login`(避免在 setup/login 頁無限循環)
- App.tsx router 加 `/setup` `/login` routes

### Settings popover Tab UI(`src/features/settings/`)
925 行 stacked 區塊改 4-tab(Project / AI 任務 / 通知 / 安全)。
- 固定寬度 480px,切 tab 不抖
- 「已儲存 ✓」chip 升級到 tab bar 右側全域(原本在 Project section header)
- mobile 全螢幕 + 右上 ✕ icon
- AI 任務 task row 用 `display:contents` desktop pass-through grid / mobile flex column + select grid `1fr 2fr 1fr`(model 欄佔 2 倍)
- 「安全」tab 僅在 `authStatus.bound === true` 時顯示

### FCM Web Push(`src/lib/fcm.ts` + App.tsx + Settings 通知 tab)
Firebase web SDK + Service Worker。
- `initFCM` / `requestAndRegisterToken` / `setupForegroundHandler` / `unregisterToken`
- 前景訊息走 `ServiceWorkerRegistration.showNotification()`(Android Chrome 不認 `new Notification()`)
- Service Worker 在 `public/firebase-messaging-sw.js`,push event 自己 `event.waitUntil(showNotification(...))`(不依賴 FCM SDK auto-display)
- PWA manifest `public/manifest.json` + icon SVG/PNG(`scripts/gen-icons.ts` ImageMagick 產)

### Mobile RWD(全套 12 個 `@media (max-width:767.98px)`)
- BoardScreen bottom tab bar:Pipeline / Ticket 切換(取代 Rail + FocusColumn 並排)
- Drawer / Settings popover / DiffModal 改全螢幕(`position: fixed inset: 0 height: 100dvh`)
- TopBar 收合:project switcher / theme / settings 仍 inline,「開啟資料夾」hide
- 自動合併 toggle 從 focus-head 移到 ⋯ menu(MenuItem ● / ○ 點切換不關 menu)
- hover-only 互動全補 touch 等效(overflow menu / chip click-to-copy / focus-visible / @media (hover:none) fallback)

### Icon 統一
- Action button 內 Unicode glyph(↺ ✂ 🗑 🤖 ⊘ ⌫)全換 SVG(RefreshIcon / ScissorsIcon / TrashIcon / ProhibitIcon)
- close ✕ 對齊 SettingsPopover 風格(32×32 + svg 16 + border-radius 6 + hover bg)
- 保留純 semantic 符號(分支 ⎇、play ▶、sync ⇣、unit ⏱ ↺ $)

**已串 backend 的部分**(Phase 5 後新增)
- `/api/user/config` GET/PUT — SettingsPopover AI 任務 tab(2026-05-13 拆 executor / critic,6 row)
- `/api/auth/*` — setup / login / sessions / reset / status
- `/api/projects/browse?path=` — TopBar「選擇其他資料夾…」走 browse modal(Tailscale 用)
- `/api/projects/:h/pipelines/:id/sync` + `/sync/{ai,cancel,dismiss}` — `SyncStatusBar` / `SyncConflictModal`(FocusColumn 內)走新 syncJob contract

**重要 UX 慣例變更**(2026-05-13)
- **Pipeline 執行紀錄拆出 TicketDrawer** → 改在 pipeline header OverflowMenu「執行紀錄」開 `PipelineHistoryDrawer`(scope 對齊:pipeline-level data 不該塞 ticket-level drawer 底)
- **Inbox strip 整塊觸碰** → 個別 dot 不再各自 button(太小難點),整塊變單一 `<button>`;hover 進入 + 滾輪切換 preview;preview popover portal 到 body(`.inbox-col` 有 `overflow:hidden`)
- **QA `viewOverride`** → `'chat' | 'review' | null`,雙向蓋過 `draft.complete` 自動切;user 在 SpecReview 「繼續討論」 / chat 「→ 回最終預覽」對應切換。**不要在送訊息時清 override**(會撞 race condition,backend 還沒寫回 disk 時 SpecReview 又跳出)
- `/api/push/*` — config / register / unregister / tokens / test

**還沒做**
- iOS PWA push 實測
- 真實 pipeline 完成事件 → push 端對端驗
- FCM / RWD 對應 e2e mock spec

## UI 防禦規則(來自 runner real-run 踩到的雷)

Runner 寫進 pipeline.json 的欄位**不一定符合 type union 字面值**(主 agent 會自由發揮,即使 system prompt 寫死)。FocusColumn / TicketDrawer 渲染前要做 normalize:
- `iter.totalElapsed` 可能 undefined → 用 `?? 0`,別直接 `+ tick`(NaN)
- `iter.current` 可能 0(mid-run) → 顯示用 `Math.max(1, current)`
- `iter.stage` 可能寫成 "executing" / "reviewing" 等 → regex normalize 成 doer / critic / done(在 IterStages 內)
- `iter.verdicts` 可能 string `"PASS"/"FAIL"/"PARTIAL"` 或舊 mock 的 `1/0/-1` → Verdict type 雙格式,Verdicts 元件 case-insensitive
- `iter.rounds[*].criticVerdict` 同上,IterRounds 取 `.toUpperCase()`

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

`<TicketDrawer>` 與 `<QADrawer>` 自帶 `.drawer-stage` / `qa-drawer-backdrop`,不走 AppShell(它們是覆蓋型 overlay,自己處理背景)。

## Portal 慣例(2026-05-13 起)

任何「視覺上要全螢幕中央 / 浮在所有 UI 上」的元件 — `SyncConflictModal`、`PipelineHistoryDrawer`、Inbox preview popover、TopBar 手動路徑 / browse modal — **一律用 `createPortal` 渲染到 `document.body`**。

理由:祖先若有 `overflow: hidden`(`.inbox-col`、各 drawer panel)或 `transform: ...`(focus-head)會把 `position: fixed` 子元素 clip 在區域內;就近渲染肉眼看似置中但實際被切。Portal 出 body 才真正脫離祖先 stacking / clipping。

樣式統一(`board.css`):
- `.modal-backdrop` `position: fixed; inset: 0; z-index: 1000; background: color-mix(in srgb, #000 72%, transparent); display: flex; align-items: center; justify-content: center`
- `.modal-card` 內含 `.modal-title` / `.modal-body` / `.modal-actions`

寫新 modal / popover 前 → 直接用這套 class + `createPortal`,別自己刻 backdrop。

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

phase 3-5 後 prototype variant + pixel-diff 已砍。新畫面流程:

1. **找可重用元件**: 先翻 `src/ui/`、`src/shell/`、`src/features/pipeline/`,別重發明
2. **建 component**: `src/features/X/XScreen.tsx`,接真 backend(`api.*`)— 不再 mock
3. **加 CSS**: 用 `tokens.css` 變數,別寫 hex / px 原值
4. **加 route**: 在 `src/App.tsx` 加 `<Route>`,用 `useTheme()` 同步 theme
5. **狀態 gallery**: 多 state 的元件加進 `src/features/dev/StatesGallery.tsx`(`/dev/states`),fixture 涵蓋所有 (state × condition) 組合
6. **加 TS exhaustive switch**:`switch (s) { case ... } default: const _: never = s`,加新 state 沒接 case 編譯就 fail

## Pitfall

### 1. **不用 `<StrictMode>`**
React StrictMode 在 dev 會把 `useEffect([])` 觸發兩次。`src/main.tsx` 已關,不要加回來。

### 2. **theme class 在 React mount 前同步設好**
`index.html` 內 inline `<script>` 讀 `?theme=` + localStorage,設 `html.light` class。靠 React `useEffect` 會 first-paint flash。

### 3. **animation 要 `none`,不要 `0s`**
`animation: none !important`。`0s` 對 `fade-up` 等 from-opacity-0 keyframe 仍套起始狀態,元件透明。

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
