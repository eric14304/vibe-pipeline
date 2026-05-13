---
name: vibe-pipeline-frontend
description: vibe-pipeline 前端開發規範 — shell 結構、設計 token、共用元件、加新畫面 SOP、狀態 gallery 驗證、routing 慣例。改 src/features、src/shell、src/ui、src/styles、src/App.tsx 或加任何新畫面之前先讀。
---

## 開工前

1. root [`CLAUDE.md`](../../../CLAUDE.md) — repo 結構 / 雷區 / 設計信條 / 架構決策
2. 歷次大改動 / Phase 進度 → [`CHANGELOG.md`](../../../docs/CHANGELOG.md)

Phase 5 後 `src/` 加了 `features/auth/`(TOTP)+ `lib/fcm.ts`(Web Push)+ Settings 4-tab UI + 全套 mobile RWD(`@media (max-width:767.98px)`)。改這些段前看現有檔案,別憑記憶。

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

## Inline style 政策(對齊社群共識)

React 本身不禁 inline style,但社群有清楚的優先序:

**普遍禁止(universal anti-pattern)**:magic value
- `marginTop: 8`、`color: '#abc'`、`gridTemplateColumns: "130px ..."`
- 不論 inline 或 CSS class 都該走 token(`var(--space-2)` / `var(--accent)` 等)
- 違反本條 = 違反本 repo SKILL 既定政策(line 下方「設計 token」段)

**強烈建議走 CSS class**:多 property 堆積
- `style={{ display: 'flex', padding: 10, background: '...' }}` 這種 ≥ 3 properties 的塊狀 style
- 理由:可讀性、可重用、可 hover/focus/media query、render 不 churn 物件
- 抽進 feature 資料夾內 `<Feature>.css`,元件最上方 `import "./<Feature>.css"`

**允許 inline 的場景**:
1. **動態計算值**(由 props / state 算出,無法 class 靜態表達)— e.g. `style={{ transform: \`translateX(${offset}px)\` }}`
2. **單一 / 兩個 token 值的微調**— e.g. `style={{ color: 'var(--accent)' }}`、`style={{ marginTop: 'var(--space-3)' }}`
3. **conditional style 不便用 class 表達** — 但能 class swap 就 class swap

class 命名走 BEM-ish 或 feature prefix(避雷 #1 prototype 命名空間殘留),不 reuse prototype 留下的 class。

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

### Button CTA 三檔強度(2026-05-13)

`tokens.css` 內 button 三檔,視覺強度低 → 高:

| Class | 樣式 | 用途 |
|---|---|---|
| `btn` | panel-2 灰底 + line border | 中性 / 純功能(取消 / overflow menu / 純資訊按鈕)|
| `btn-accent` | 透明 accent 10% 底 + accent 邊 + accent 字 | **次要 CTA**,跟主 CTA 並排時用(e.g. `+ ticket` 在 RunButton 旁邊) |
| `btn-primary` | accent 填 + 白字 | 主動作(RunButton 開始/繼續/重試;empty pipeline 的 + ticket)|

**互斥規則**:同一視覺區域內**最多一顆 btn-primary**。範例:`+ ticket` 跟 `RunButton` 在 pipeline header 並排 — pipeline 有 ticket 時 RunButton 是 primary、+ ticket 降 `btn-accent`;沒 ticket 時 RunButton disabled,+ ticket 升 primary。避免兩顆都搶眼 user 不知按哪個。

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

root [`CLAUDE.md`](../../../CLAUDE.md) 雷區 #1-16 是全 repo 公用,本段只列 src/ 特有:

1. **新 feature 避開 prototype 命名空間殘留** — `src/styles/qa.css` 是 prototype 留的 `.qa-*` class(含 `.qa-body { display: grid }`)。Phase 2 加 QADrawer 用 `.qa-body` 被 grid 拉伸 bubble 高度暴增。修法:新 feature 走獨立 prefix(QADrawer 用 `qadr-*`),不要 reuse prototype class

## Routing 慣例

跨畫面共享 state 全走 URL query param(refresh 不掉、bookmark 帶完整 context)。例外:`active project hash` 走 localStorage、`theme` 走 localStorage(URL `?theme=` 仍 override)。

主要 route:
- `/` → redirect `/board`
- `/board` 主畫面;`?project=<hash>&pipeline=<id>&ticket=<id>` 帶 context
- `/dev/states` 狀態 gallery(改 RunButton / ReadyBanner 視覺驗收)
- `/setup` / `/login` TOTP

`STATE_COLOR` / `STATE_LABEL` / `SEV_COLOR` / `fmtElapsed` 在 `src/data/` 是純 helper(原本的 mock seed 已全砍);新 helper 可加進這層。

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

## 觸發本 SKILL 的場景

- 改 `src/features/*` / `src/shell/*` / `src/ui/*` / `src/styles/*` / `src/App.tsx`
- 加新畫面 / 新 route / 新 modal / popover
- 動 token / theme / button 強度分級
- 改 mobile RWD 或 portal 行為
