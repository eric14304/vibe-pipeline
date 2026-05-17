# FCM Push Gateway 共用方案(2026-05-17,規劃中,未動工)

## 為什麼

當前 VP single-user local deploy,每 enduser 要自己開 Firebase project + 拿 keys + service account 才能用 push。Setup 門檻高,Firebase 新手撞牆。

長期想做的:**VP maintainer 自己 host 一個 push gateway**,enduser VP backend POST 推播事件到 gateway,gateway 用 maintainer 的 service account 推 FCM 到 device。enduser 不必開 FCM。

## 架構

```
[enduser device PWA]
       ↑ FCM push
[Google FCM]
       ↑ admin SDK send
[VP push gateway (maintainer host)]  ← service account key here only
       ↑ POST /push
[enduser VP backend]   ← 觸發 push 事件(ticket done / failed / etc)
       ↑ ticket event
[runner]
```

關鍵:
- **service account key 只在 gateway 端**(maintainer 機器/VPS),enduser 拿不到
- enduser VP backend 只持有 client apiKey(public,SW init firebase 用)+ device tokens(register 到 gateway)
- gateway 維護 token registry per enduser/project + send-permission 控制

## 對應改動範圍

| 元件 | 改動 |
|---|---|
| **新 service:gateway** | Cloudflare Worker / 你 VPS 上 Bun service,~200 行,endpoint `POST /push/register`、`POST /push/send`、`DELETE /push/token` |
| `server/lib/push/tokenStore.ts` | 改成轉發 register 到 gateway(不本地存)— 或本地 + gateway 雙存(本地為快取) |
| `server/lib/fcm/index.ts` | 拔掉 `firebase-admin` 直接 send,改 POST gateway |
| `.env` 簡化 | enduser 只需 `VITE_FCM_API_KEY` / `MESSAGING_SENDER_ID` / `APP_ID`(public)+ `PUSH_GATEWAY_URL` + `PUSH_GATEWAY_AUTH_TOKEN`(maintainer 發給 enduser 的 auth) |
| `public/firebase-messaging-sw.js` | 不變(仍用 firebase compat init + onBackgroundMessage),只是 backend send 路徑不同 |
| 文件 | README 改 setup section:從「自己開 Firebase」→「用 maintainer 提供的 gateway URL + token」 |

## 安全 / 信任

- maintainer 端 gateway 必須:
  - rate limit per enduser(避免被當 spam relay)
  - auth token 機制(發給每個 enduser 不同 token,可 revoke)
  - log push 內容(debug + abuse 偵測,但隱私 sensitive,可能 metadata only)
- enduser 信任 maintainer 不亂讀 push 內容 / 不亂發
- service account 洩漏 risk 集中在 maintainer 一處(易管)

## 取捨

| 維度 | 方案 0(現:enduser 自己 FCM) | 方案 B(gateway) |
|---|---|---|
| enduser setup | 麻煩(Firebase 註冊 / project / service account) | 簡單(填 gateway URL + token) |
| maintainer ops | 0 | 要 host gateway 服務 + 維護 token / rate limit |
| service account 安全 | 分散風險 | 集中 maintainer 端 |
| 隱私 | enduser device token 自己掌控 | token 集中 maintainer 端(maintainer 看得到) |
| 成本 | 各自 0(Spark plan) | maintainer 一份 0(配額大) |
| 故障點 | enduser 自己 Firebase | maintainer gateway 掛 → 所有 enduser 沒 push |

## 不在現 scope

- 短期沿用方案 0(enduser 自己 FCM)
- 動工時機:VP 有 ≥ 5 enduser 投訴 Firebase setup 麻煩,或要做 hosted VP service 時一起
- 動工前要先做:gateway service 選平台(CF Worker / VPS Bun / Render)、auth token 發放機制、rate limit policy

## Phase 對應

加入 Phase 6 候選清單(`CLAUDE.md` § Phase 6)。
