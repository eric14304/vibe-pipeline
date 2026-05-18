---
paths:
  - public/firebase-messaging-sw.js
  - vite.config.ts
  - src/lib/swUpdate.ts
  - src/lib/fcm.ts
  - src/features/system/SwUpdateBanner.tsx
description: PWA / Service Worker / Workbox / vite-plugin-pwa 改動時的雷區
---

# PWA / Service Worker 雷區

改 `public/firebase-messaging-sw.js`、`vite.config.ts` 內 PWA 段、Workbox runtime cache、SW 註冊 / 更新流程前讀。

## vite-plugin-pwa 只在 production build 註冊 SW

dev mode `bun run dev`(5173)SW 不註冊(plugin 預設行為),改 SW 邏輯要 `bun run build && bun run preview` 才看得到效果。改完用 4173 preview port 測,別在 5173 dev 找不到 SW 就懷疑 plugin 壞了。Lighthouse PWA / 安裝提示 / precache 行為也只在 4173 才驗得到。

## firebase-messaging-sw.js 合併 Workbox 後改 SW 要兩段都驗

同一個 SW 同時跑 Workbox precache / runtime cache 跟 FCM push handler(`public/firebase-messaging-sw.js` 由 vite-plugin-pwa injectManifest 注入 `self.__WB_MANIFEST` 後輸出到 `dist/firebase-messaging-sw.js`)。改 SW 程式碼時:

- precache 改動 → 跑 `bun run build` 看 entries 數變化(目前 9 entries / ~640 KiB)
- push handler 改動 → 看 dist 產出的 sw 裡 push event listener 還在 + `event.waitUntil(showNotification(...))` 還在

**Android push 行為**(SW + Notification 兩段):

1. 混合 `notification+data` payload **不會 auto-display**,push handler 必須自己 `event.waitUntil(showNotification(...))`
2. 前景訊息用 `ServiceWorkerRegistration.showNotification()`,**不能**用 `new Notification()` page constructor(Android Chrome 不認)。`src/App.tsx` `useFcmBootstrap` 已先試 SW reg,desktop fallback 才用 page constructor

## Workbox runtime cache `/api/*` 只 cache GET

`registerRoute` 的 filter 必含 `request.method === 'GET'`,POST/PUT/DELETE/PATCH(`/api/run` `/pause` `/merge` `/qa/turn` `/ticket update` 等 mutation)走網路直通,不然 mutation response 被 SWR cache 回讀就死了。SWR 策略本身對 read-only 有用(離線可顯舊 + 背景 refresh),寫操作絕對不能套。Google Fonts 那兩條 route(CacheFirst / SWR)同理只應命中 GET。

## vite-plugin-pwa `registerType: 'autoUpdate'` 會 force full reload

workbox-window 預設 `controlling` event 觸發 `window.location.reload()`,user 正在打字 / 看 modal / 跑 QA 都被打斷,體感「跟突然 refresh 一樣」。VP 改用 `registerType: 'prompt'` + `<SwUpdateBanner>` 讓 user 主動點「更新」才 reload(`src/lib/swUpdate.ts` 用 workbox-window 自管 `needRefresh` state + `messageSkipWaiting`)。

要改回 `autoUpdate` 前先確認 user 體感 OK — 設計信條:**執行中操作信號才該立即冪等**,「自動 reload」由 backend 替 user 決定打斷時機,不對等。

## mobile drawer / 全螢幕用 `100dvh` 不要 `100vh`

`100vh` 在 Android Chrome 算上 nav bar 區域,底部 input 被遮。需要:

- `viewport-fit=cover`(已在 index.html 設)
- CSS 用 `100dvh`(留 `100vh` 當 fallback)
- drawer-stage z-index ≥ 50(高過 `.board-mobile-tabs` 的 40)
