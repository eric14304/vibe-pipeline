---
paths:
  - server/index.ts
  - server/lib/auth/**
  - server/lib/push/**
  - server/lib/fcm/**
  - .env
  - .env.example
description: 手機遠端 setup(Tailscale + TOTP + FCM)相關雷區
---

# 遠端存取雷區

改 auth / push / FCM / network binding / CORS 設定前讀。背景見 [`README.md` §遠端存取](../../README.md)。

## Windows `auth.json` NTFS ACL chmod 0o600 不生效

`~/.vibe-pipeline/auth.json` 存 TOTP secret 雜湊,程式 `fs.chmod(0o600)` 在 Windows NTFS 沒效果。個人 PC 單帳戶 OK(user profile 預設已隔離),多帳戶 / 工作機要手動右鍵 → 安全性 → 移除 Users/Everyone。

## Tailscale HTTPS 不可省

FCM service worker 要 secure context,`http://100.x.x.x:5173` 不算 secure → push 訂閱不會註冊。手機必須走:

```
tailscale serve --https=443 http://localhost:4173
```

走 preview port(4173),不是 dev port(5173),因為 SW 只在 production build 註冊(見 `rules/pwa-sw.md`)。

## `server/index.ts` 必須 `0.0.0.0` 監聽

改回 `127.0.0.1` 手機連不到,Tailscale 介面也算非 loopback。

## `ALLOWED_ORIGINS` 不要放 `*`

TOTP 是 auth 層但 CORS 也是邊界,Tailscale tailnet 不該假設絕對安全。

## 離線 push 補送靠 FCM 不靠 VP

手機離線時 FCM server 暫存 28 天,VP 端不做 queue;debug 時別找 VP backend 的 queue,沒有。

## Push 走 maintainer gateway,enduser 不開 Firebase

2026-05-19 起 VP backend 拔掉 `firebase-admin`,改 POST maintainer host 的 push gateway(`https://vp-gateway-799841449136.asia-east1.run.app`,Cloud Run asia-east1 / max-instances=1 / $1/mo budget alert)。

- enduser `.env` 只需 `PUSH_GATEWAY_URL` + `PUSH_GATEWAY_TOKEN`(bearer,可被 revoke);**沒有 Firebase service account key 在 enduser 端**
- `server/lib/push/tokenStore.ts` 改成轉發 register / unregister 到 gateway;本地不再存 device tokens
- `server/lib/fcm/index.ts` 拔 firebase-admin,改 `fetch(gateway + '/push/send', ...)`;死 token 偵測由 gateway 端 Firestore registry 做
- 沒填 gateway 環境變數 → backend 啟動正常,push fanout 直接 no-op(不報錯,只是 user 收不到)
- gateway source 在 repo 內 `gateway/`(Bun + Firestore + firebase-admin),deploy 步驟見 `gateway/README.md`
- 舊「enduser 自己開 Firebase」path 已 deprecated,不要回頭加 firebase-admin 到 server/

完整 spec / 取捨 → [`docs/refs/archive/fcm-push-gateway-2026-05-17.md`](../../docs/refs/archive/fcm-push-gateway-2026-05-17.md)。
