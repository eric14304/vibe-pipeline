# Settings PWA tab UI/UX 重新設計(2026-05-17)

## 為什麼

PWA tab(原「通知」tab)經過數輪迭代後 UX 仍有問題,user 整理 10 點問題 + 建議資訊架構。本 ref 是執行 spec。

## User 列的問題(authoritative)

1. **Toggle 狀態不一致** — 總開關關閉但子項目顯示開啟,容易誤判
2. **整列卡片互動不清楚** — 只能點小 toggle 還是整列都能點?
3. **狀態色過重** — 開啟項目綠框綠底,視覺權重像警告
4. **Disabled 像 disabled 但沒原因** — 該加 hint
5. **說明文字層級太弱** — 尾巴一句說明跟上方關聯不夠
6. **錯誤訊息技術語** — 「通知權限: default」對 user 沒意義
7. **安裝 App 說明過長** — 資訊密度高,user 難快速判斷狀態
8. **iOS / 瀏覽器條件混在同一段文字** — 無平台偵測分流
9. **Tab 底線跟內容太近** — 缺呼吸感
10. **文案命名不一致** — 「Ticket 完成」(結果)/「Pipeline 暫停需回應」(任務狀態)/「AI 接手解衝突」(AI 行為)

## 目標資訊架構(authoritative)

```
[安裝 App section]
  狀態卡:目前尚未安裝 / 此瀏覽器不支援安裝 / ✓ 已安裝
  操作提示:依瀏覽器顯示「單一」指引(非全文堆疊)

[推播通知 section]
  權限狀態:尚未允許通知 / 已允許 / 已封鎖
  主要按鈕:啟用推播通知 / 已啟用
  次要按鈕:重新檢查權限(權限變動時用)

[通知項目 section]
  · Ticket 完成通知
  · Ticket 失敗通知
  · Pipeline 暫停通知
  · AI 衝突處理通知

  總開關未啟用前 → 全部 disabled + 顯「請先啟用推播通知」hint
```

## Ticket 拆分

### U1: PushNotificationsSection layout + gating + 視覺權重(對應 1/2/3/4/10)

**改動**:
- 主 toggle off → 子項 events 改 **disabled 灰化 + 不可操作**(原本是完全 hide,改成 disabled 看得到項目)
- 子項 events disabled 時加 hint「請先啟用推播通知」
- 整列卡片(label)整個可點切換(不只 toggle dot)— 加 hover / active state CSS
- 開啟項目視覺權重降低 — 拔綠框 + 淡綠底,**只用 toggle dot 表狀態**;卡片背景中性(panel-2)
- 文案統一「XXX 通知」格式:
  - 「Ticket 完成」→「Ticket 完成通知」
  - 「Ticket 失敗」→「Ticket 失敗通知」
  - 「Pipeline 暫停需回應」→「Pipeline 暫停通知」
  - 「AI 接手解衝突」→「AI 衝突處理通知」

**Acceptance**:
- `bunx tsc --noEmit` 過
- 主 toggle off → 4 個子項 toggle 變灰 + cursor not-allowed + 點不會切
- 主 toggle off 時整 events grid 第一行顯 hint「請先啟用推播通知」
- 整 label 卡片點任何位置都觸發 toggle(不限 dot)
- 開啟項目卡片背景中性(不再綠底),只 dot 變綠 indicator
- 4 個 label 文案改 XXX 通知 格式

### U2: InstallAppSection 拆狀態/操作 + 平台偵測分流(對應 7/8)

**改動**:
- 結構拆兩段:
  - **狀態卡**:`✓ 已安裝` / `目前尚未安裝` / `此瀏覽器不支援安裝`
  - **操作提示**:依平台偵測**只顯單一**指引
- 平台偵測(navigator.userAgent + matchMedia):
  - iOS Safari → 顯「請用 分享 → 加入主畫面」
  - Android Chrome → canInstall=true 顯「安裝 App」button;false 顯「請從網址列右側 ⊕ 安裝 icon」
  - Desktop Chrome / Edge → 同上
  - 其他(Firefox / 不支援)→ 「此瀏覽器不支援 PWA 安裝」
- 拔當前 catch-all hint「瀏覽器沒提示可安裝(可能已安裝過 / iOS Safari / 不支援);若要安裝請用瀏覽器網址列右側「⊕ 安裝」icon,或 iOS Safari「分享 → 加入主畫面」」(那串太長)

**Acceptance**:
- `bunx tsc --noEmit` 過
- 三段視覺分明:狀態卡 / 操作提示(單一 line)/ install button(若 canInstall)
- iOS Safari 不顯安裝 button 只顯「分享 → 加入主畫面」單一指引
- 已安裝顯「✓ 已安裝」狀態卡 + 無操作提示
- 不再顯混合文字

### U3: 權限狀態文案 + 「重新檢查權限」button(對應 6)

**改動**:
- `permission === "default"` 文案改:「**尚未允許通知權限**」+ hint「請在瀏覽器中允許通知,才能收到推播」
- `permission === "denied"` 文案改:「**通知權限已被瀏覽器封鎖**」+ hint「請至瀏覽器網址列設定重新允許」
- `permission === "granted" && !token` 改:「**已允許但未註冊**」+ 自動嘗試 register(或加 button)
- 加「重新檢查權限」次要 button(text button 樣式),點 → refreshPermission() — 適用 user 手動到瀏覽器改權限後回來確認

**Acceptance**:
- `bunx tsc --noEmit` 過
- 「default」文字完全消失,改友善中文
- 「重新檢查權限」button 可見且可點,點後 permission state refresh
- 各 permission state 對應文案 + hint 明確

### U4: helper text 位置 + tab 內 spacing(對應 5/9)

**改動**:
- 拔「啟用後 pipeline 完成 / 失敗會推到此裝置(背景或前景皆可)」(已拔 in commit e38cede,確認沒回潮)
- 各 helper text 緊鄰相關 section,不放最尾
- Tab bar 下方加 padding-top var(--space-3) ~ var(--space-4),頁面有呼吸感
- 各 section 之間用 divider 或明顯 gap 區隔(install / push enable / push events 三段)

**Acceptance**:
- `bunx tsc --noEmit` 過
- 視覺上三 section 明顯區隔(不再黏一起)
- helper text 都緊鄰相關控制元件
- Tab bar 下方 + content 第一個元素之間有明顯 padding

### U5: 自檢 tsc / lint / e2e + 手測各 state 組合

**Acceptance**:
- `bunx tsc --noEmit` / `bun run lint` / `bun run test:e2e` 全綠
- 手測描述 cover 所有狀態組合:
  - 未安裝 PWA + 未啟用通知(全冷狀態)
  - 已安裝 PWA + 未啟用通知
  - 已安裝 PWA + 已啟用通知 + 各 event toggle 開關
  - permission denied + 嘗試啟用(顯示阻擋文案)
  - iOS Safari(假設或 UA spoof 測平台偵測)
  - Firefox 桌面(不支援 PWA install)

## 不在 scope

- 後端 push event schema / FCM token 行為不動
- backend `routes/push.ts` 不動
- 推播實際送達不動(只改 settings UI)
