# Settings popover 全面重新設計(2026-05-17)— 按參考圖

## 為什麼

User 給 3 張 ChatGPT 生成的參考圖,要全 Settings(Project / AI 任務 / PWA 三個 tab)按圖樣式重做 + 確保 RWD。

## 參考圖(authoritative — sub-agent 必 Read)

- Project tab → [`images/settings-redesign/project-tab.png`](images/settings-redesign/project-tab.png)
- AI 任務 tab → [`images/settings-redesign/ai-tab.png`](images/settings-redesign/ai-tab.png)
- PWA tab → [`images/settings-redesign/pwa-tab.png`](images/settings-redesign/pwa-tab.png)

**做任何 ticket 前 sub-agent 必 Read 對應 image 確認 layout / spacing / color / icon usage**,以圖為準,文字描述當輔助。

## 設計風格(authoritative)

### 共用 row pattern(每個設定項一致樣式)

```
┌────────────────────────────────────────────────────────────┐
│ [icon] 標題             [右側 control]    [hint 灰小字]    │
│        副標(subtitle 灰)                                   │
└────────────────────────────────────────────────────────────┘
```

- **左**:小 icon(emoji or SVG)+ 標題粗 + subtitle 灰小字(可選)
- **中右**:control(select / toggle / input / button)
- **最右**:hint 灰小字(說明 / 提示)
- 卡片:1px var(--line) border + var(--radius) 圓角 + padding var(--space-3)
- 多 row 用 vertical gap var(--space-2),不放 row 之間 divider

### Section pattern

- Section title:粗體 + 上下 margin
- Section body:可選 wrapper(bordered card / 直接列 rows)
- Section 分組:用 gap 或 sub-card 區隔(例如 AI 任務內「全域」/「進階」兩 group)

### Amber 小提醒 card(footer hint)

- 底部 footer 用淡 amber/yellow bg card:`background: color-mix(in srgb, #f0c674 12%, var(--panel))`
- 圖示「💡 小提醒」+ 段落文字 灰深(--fg-mute)
- 用在每 tab 底部給 user 提示

### RWD

- breakpoint 600px(對齊現有 SettingsPopover.css 慣例)
- mobile(< 600px):row 從 horizontal(label 左 / control 右)→ stacked(label 上 / control 下),全寬
- 卡片內 padding 縮(--space-2)
- tab bar 不變(scroll if 多)

## 各 tab 設計細節

### Project tab(對應參考圖 1)

- 每 row 三欄:label / control / hint
- 項目(對應現有):
  - 平行上限(1–8 條) [input number] 「達上限後新 Run 排隊」
  - Base branch 預設用於新建 pipeline [text input] 「新 pipeline 從這個 branch 切」
  - Cost 上限 USD,0 = 無限 [input number] 「每條 pipeline 累計成本上限」
  - 自動合併 每條 pipeline 可自設 [toggle] 「啟用後,符合條件時將自動合併到 base」
- 底「💡 小提醒」amber card:「以上設定會套用到新建立的 pipeline,已存在的 pipeline 不受影響」

### AI 任務 tab(對應參考圖 2)

- 分兩 group(各自 bordered card):
  - **全域 provider / model 設定**:
    - QA Spec(規格收斂)→ Provider / Model
    - Ticket Split(大任務拆小)→ Provider / Model
    - Main Agent(任務執行)→ Provider / Model
  - **進階設定(可依需求調整)**:
    - Executor(執行 AI:改 code)→ Model / Effort(reasoning effort)
    - Critic(審核 AI,判 PASS/FAIL)→ Model / Effort
    - Merge Agent(合併處理)→ Model / Effort
- 每 row:左 icon + label + subtitle / 右 dropdown(s)
- 底「💡 小提醒」amber:「這裡的設定套用到所有 project」

### PWA tab(對應參考圖 3)

- **安裝為 App** section:
  - 三 chip 卡片並排(mobile collapse stack):
    - 「✓ 已安裝」或 「尚未安裝」狀態
    - 「Chrome / Edge / Android」+ icon + 「安裝」button(若 canInstall)
    - 「iOS Safari」+ icon + 「分享 → 加入主畫面」hint
  - 依平台偵測強調當前 user 用的那個 chip,其他淡化
- **推播通知** section:
  - 狀態 banner(若 permission != granted):「尚未允許通知權限」+「重新檢查權限」button
  - 主 toggle:「啟用推播通知」(label 左 + toggle 右)
  - 啟用後:4 個通知 row(icon + 標題 + subtitle / toggle):
    - 🟢 Ticket 完成通知 / 「ticket 跑完通知」
    - 🔴 Ticket 失敗通知 / 「ticket 失敗通知」
    - 🟡 Pipeline 暫停通知 / 「pipeline 暫停需回應通知」
    - 🟣 AI 衝突處理通知 / 「auto-merge 衝突 AI 處理通知」
  - 未啟用主 toggle 時 4 row 全部 disabled + 灰
- 底 hint「請先啟用推播通知,需先允許瀏覽器通知權限」

## Ticket 拆分

### S1: Settings 共用 row pattern + 卡片樣式 + amber hint card(基礎建設)

**改動**:
- `src/features/settings/SettingsPopover.css`(可能新增 settings-redesign.css)加 utility classes:
  - `.settings-row`:flex layout horizontal,label 左 control 中右 hint 最右,卡片 border + radius + padding
  - `.settings-row-label`:icon + title + subtitle
  - `.settings-row-control`:right-align controls
  - `.settings-row-hint`:灰小字 max-width 限制
  - `.settings-section`:section wrapper
  - `.settings-section-title`:section title
  - `.settings-tip-card`:amber hint card(icon + text)
  - RWD mobile (< 600px):row → flex-direction:column,hint margin-top
- 不改既有功能,只建 utility

**Acceptance**:
- `bunx tsc --noEmit` 過
- CSS 樣式可 reuse,desktop / mobile 視覺對齊參考圖

### S2: Project tab 套新 row pattern

**改動**:
- `src/features/settings/SettingsPopover.tsx` Project tab 區塊重寫
- 每 setting field 套 `.settings-row`(icon + label + subtitle + control + hint)
- 底加 amber tip card「以上設定會套用到新建立的 pipeline,已存在的 pipeline 不受影響」

**Acceptance**:
- `bunx tsc --noEmit` 過
- 視覺對齊參考圖 1(row 一致 / hint 右側 / amber tip 底部)
- 功能(input / toggle)不變

### S3: AI 任務 tab 套新 row pattern + 分組

**改動**:
- AI 任務 tab 重寫,分兩 bordered group:
  - 全域 provider / model 設定(QA / Ticket Split / Main Agent)
  - 進階設定(Executor / Critic / Merge Agent,加 Effort dropdown)
- 每 row 左 icon + label + subtitle / 右 dropdown(s)
- 底 amber tip card

**Acceptance**:
- `bunx tsc --noEmit` 過
- 視覺對齊參考圖 2
- model / effort dropdown 功能不變

### S4: PWA tab 三 chip 安裝卡 + 通知 section 重做

**改動**:
- `InstallAppSection` 重寫:三 chip 卡片並排 + 平台偵測強調當前
- `PushNotificationsSection` 重寫:狀態 banner + 主 toggle + 4 通知 row + amber hint
- 4 通知 row 套 `.settings-row`(icon + label + subtitle + toggle)
- 加「重新檢查權限」button(於狀態 banner 內)
- 對應 [`settings-pwa-tab-redesign-2026-05-17.md`](settings-pwa-tab-redesign-2026-05-17.md) U1-U3 改動(可能 conflict,以這版為準)

**Acceptance**:
- `bunx tsc --noEmit` 過
- 視覺對齊參考圖 3
- 主 toggle off → 4 row disabled
- 平台偵測對應 chip 強調

### S5: RWD mobile breakpoint 驗證

**改動**:
- 各 tab 在 < 600px 視覺 OK:row stacked / 卡片全寬 / chip 並排能 stack / amber card 不擠
- `/dev/states` 或 settings 直接 mobile 模擬器看
- 若有過寬 / overflow 修

**Acceptance**:
- `bunx tsc --noEmit` 過
- Chrome devtools mobile 模擬器(375 / 414 / 768)三 tab 都不破版

### S6: 自檢 tsc / lint / e2e + 手測

**Acceptance**:
- tsc / lint / e2e 全綠
- 手測描述涵蓋三 tab × desktop / mobile = 6 case
- 對齊參考圖 layout(executor 描述哪些對齊 / 哪些妥協)

## 不在 scope

- 不改 backend(setting persistence / push register / cost limit logic)
- 不改既有 setting key / schema
- 不重新設計 tab bar 本身
- 不改 ConfirmDialog / 其他 popup 元件樣式
