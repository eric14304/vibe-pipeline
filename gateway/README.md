# vp-fcm-gateway

vibe-pipeline FCM Gateway — Multi-tenant Cloud Run service。對外暴露 8 條 endpoint:enduser 用 Bearer token 註冊裝置 / 發送 push,master 用 `MASTER_TOKEN` 簽發 / 撤銷 / 列出 enduser tokens,另一條公開 `POST /tokens/auto-issue` 給 enduser 自助拿 token(per-IP daily limit)。Firestore 存 token (sha256) + device + per-minute rate limit counter,FCM HTTP v1 fan out 給該 enduser 所有 device。

對應的 GCP infra(project / SA / Firestore / IAM role)在 `INFRA.md`,本檔只談 service code 本身。

## 目錄結構

```
gateway/
  index.ts          Bun.serve entry + route 表
  types.ts          request / response 型別
  lib/
    firestore.ts    Firebase Admin app + Firestore client(ADC)
    fcm.ts          firebase-admin/messaging fan-out + device CRUD
    auth.ts         Bearer extract + master / enduser 驗證
    tokens.ts       24-byte base64url 生成 + sha256 hash + Firestore CRUD
    rateLimit.ts    per-token per-minute Firestore counter(60 req/min)
  package.json      deps: firebase-admin, @google-cloud/firestore
  tsconfig.json     strict + noUncheckedIndexedAccess
  Dockerfile        oven/bun:1.1.34-alpine,multi-stage,CMD=bun run index.ts
  .gcloudignore     排 node_modules / .env / tests
```

## Firestore schema

- `enduserTokens/{tokenId}` — `{sha256, label, createdAt, lastUsedAt, revoked}`(明文 token 不存,只存 sha256)
- `tokens/{enduserId}/devices/{deviceId}` — `{deviceToken, label, createdAt, lastSentAt}`
- `rateLimits/{tokenSha}_{epochMinute}` — `{count, keyId, minute, expiresAt}`(`expiresAt` 給 Firestore TTL policy 用,t1 infra 未設 TTL 也不會 break,counter doc 自然滾)
- `tokenIssueRateLimits/{ipHash}_day_{YYYYMMDD}` — `{count, ipHash, ymd, expiresAt}`(`POST /tokens/auto-issue` per-IP daily counter,`ipHash = sha256(ip)`,UTC day key,`expiresAt` 設 48h 後給 TTL policy 自然清)

## Local dev

1. 安裝依賴(在 gateway/ 內):
   ```bash
   cd gateway
   bun install
   ```
2. 提供 ADC 給本機(只需做一次):
   ```bash
   gcloud auth application-default login
   ```
3. 設 master token + project id:
   ```bash
   export MASTER_TOKEN=$(openssl rand -hex 24)
   export GCP_PROJECT_ID=vibe-pipeline
   echo "MASTER_TOKEN=$MASTER_TOKEN"
   ```
4. 啟動 dev server(hot reload):
   ```bash
   bun run dev
   # listening on :8080
   ```

無 `gcloud auth application-default login` 也可以啟,但任何打到 Firestore / FCM 的 endpoint 會回 500(SDK 拿不到 credential)。`/health` 不碰 Firestore,可獨立驗 server 起得來。

## Typecheck

```bash
cd gateway
bunx tsc --noEmit
```

預期 0 error。

## Curl 範例(7 endpoints)

假設 `MASTER_TOKEN` 已設,gateway 跑在 `http://localhost:8080`。

### 1. `GET /health`(公開)

```bash
curl -s http://localhost:8080/health
# {"ok":true}
```

### 2. `POST /admin/issue-token`(master)

```bash
curl -s -X POST http://localhost:8080/admin/issue-token \
  -H "Authorization: Bearer $MASTER_TOKEN" \
  -H "content-type: application/json" \
  -d '{"label":"eric-laptop"}'
# {"tokenId":"a1b2c3...","token":"<32-char base64url 明文,只回一次>"}
```

把明文 token 存起來,以下 enduser endpoint 都帶它。

```bash
export ENDUSER_TOKEN=<上面的 token>
```

### 3. `GET /admin/tokens`(master)

```bash
curl -s http://localhost:8080/admin/tokens \
  -H "Authorization: Bearer $MASTER_TOKEN"
# {"tokens":[{"tokenId":"...","label":"eric-laptop","createdAt":...,"lastUsedAt":null,"revoked":false}, ...]}
```

### 4. `POST /push/register`(enduser)

```bash
curl -s -X POST http://localhost:8080/push/register \
  -H "Authorization: Bearer $ENDUSER_TOKEN" \
  -H "content-type: application/json" \
  -d '{"deviceToken":"<FCM-device-registration-token>","label":"pixel-8"}'
# {"ok":true,"deviceId":"<safe-id>"}
```

### 5. `POST /push/send`(enduser)

```bash
curl -s -X POST http://localhost:8080/push/send \
  -H "Authorization: Bearer $ENDUSER_TOKEN" \
  -H "content-type: application/json" \
  -d '{"title":"Ticket done","body":"#42 critic PASS","ticketId":"42"}'
# {"sent":1,"failed":[]}
```

`data` 欄(可選)會原樣帶進 FCM `data` payload;`ticketId`(可選)也會塞進 `data.ticketId`。`failed[]` 列出每台 device 的 FCM error + code,`registration-token-not-registered` / `invalid-registration-token` 會自動從 Firestore 刪掉那筆 device。

### 6. `POST /push/unregister`(enduser)

```bash
curl -s -X POST http://localhost:8080/push/unregister \
  -H "Authorization: Bearer $ENDUSER_TOKEN" \
  -H "content-type: application/json" \
  -d '{"deviceToken":"<FCM-device-registration-token>"}'
# {"ok":true,"removed":1}
```

### 7. `POST /tokens/auto-issue`(公開,per-IP daily limit)

無 Bearer 需求,讓 enduser 在自己手機 / 瀏覽器自助拿一支 token,不必跑 maintainer 後台。

```bash
curl -s -X POST http://localhost:8080/tokens/auto-issue \
  -H "content-type: application/json" \
  -d '{"label":"my-phone"}'
# {"tokenId":"a1b2c3...","token":"<32-char base64url 明文>"}
```

- Body `label`(可選,字串非空才認):給 maintainer 後台辨識用;沒填 / 空字串 → fallback 為 `auto-<ipHashSuffix4>`(`sha256(ip)` 最後 4 字)。raw IP 不落 Firestore。
- 回應跟 `/admin/issue-token` 同 schema:`{tokenId, token}`,**`token` 明文只回一次**,當場拿去 `POST /push/register`。
- 限流:每 IP 每 UTC 日最多 5 個 token(Firestore `tokenIssueRateLimits/{sha256(ip)}_day_{YYYYMMDD}` counter)。超過回 `429 {error:"rate_limited",limit:5,count,resetAt}`(`resetAt` 為下次 UTC 00:00 epoch ms)。
- IP 來源:優先 `X-Forwarded-For` 第一段(Cloud Run / proxy 必填),再退 `X-Real-IP`,最後 `server.requestIP()`。

### 8. `POST /admin/revoke-token/:tokenId`(master)

```bash
curl -s -X POST http://localhost:8080/admin/revoke-token/<tokenId> \
  -H "Authorization: Bearer $MASTER_TOKEN"
# {"ok":true,"tokenId":"<tokenId>"}
```

被 revoke 的 token 之後打 `/push/*` 一律 401。

## Auth 規則速查

| 路徑 | 需要 |
|---|---|
| `GET /health` | — |
| `POST /tokens/auto-issue` | — (per-IP 每 UTC 日 5 個 token) |
| `POST /push/register` `POST /push/send` `POST /push/unregister` | Enduser Bearer(Firestore 查 sha256,未 revoked) |
| `POST /admin/issue-token` `POST /admin/revoke-token/:id` `GET /admin/tokens` | `MASTER_TOKEN` Bearer(env var 比對,timing-safe) |

Token 比對 timing-safe(`auth.ts` 的 `timingSafeEqualStr`),enduser 路徑驗 token 同時更新 `lastUsedAt`。

## Rate limit

- 60 req/min per enduser token(`rateLimits/{sha32}_{epochMin}` Firestore counter,`FieldValue.increment(1)`)
- 5 issues/day per IP for `POST /tokens/auto-issue`(`tokenIssueRateLimits/{sha256(ip)}_day_{YYYYMMDD}`,UTC day key,`resetAt` 為下次 UTC 00:00)
- 超過回 `429 {error:"rate_limited",limit,count,resetAt}` + headers `x-ratelimit-limit / -remaining / -reset`
- counter 不主動 GC;doc id 隨時間滾,要清理掛 Firestore TTL 在 `expiresAt` 欄(per-minute 寫 2 分後,per-day 寫 48 小時後)

## Docker

```bash
cd gateway
docker build -t vp-fcm-gateway .
docker run --rm -p 8080:8080 \
  -e MASTER_TOKEN=$MASTER_TOKEN \
  -e GCP_PROJECT_ID=vibe-pipeline \
  -v $HOME/.config/gcloud:/root/.config/gcloud \
  vp-fcm-gateway
```

Cloud Run 上不必掛 gcloud config volume,ADC 走 metadata server。

## Admin CLI 使用

`gateway/admin.ts` 是給 maintainer 用的小 Bun script(`vp-gw-admin`),封裝 3 條 `/admin/*` endpoint,免每次手打 curl + Bearer header。執行端要先 `export MASTER_TOKEN=<與 gateway 同值>`,可選 `export GATEWAY_URL=<base url>`(default `http://localhost:8080`,prod 改 Cloud Run service URL)。沒設 `MASTER_TOKEN` 直接 exit 1,沒設 `GATEWAY_URL` 預設 local。

啟動方式(在 gateway/ 內):

```bash
bun run admin <subcommand> [args]
# 或
bun run admin.ts <subcommand> [args]
```

3 個 subcommand:

### `issue --label=<name>`

簽發新的 enduser token(POST `/admin/issue-token`),回 JSON `{tokenId, token}`。**`token` 是明文,gateway 只存 sha256,只回這一次,當場存起來。**

```bash
export MASTER_TOKEN=<master>
bun run admin issue --label=eric-laptop
# {
#   "tokenId": "a1b2c3...",
#   "token": "<32-char base64url 明文>"
# }
# [admin] plaintext token shown ONCE — store it now; gateway only keeps sha256
```

### `revoke <tokenId>`

撤銷指定 enduser token(POST `/admin/revoke-token/:tokenId`)。被 revoke 的 token 之後打 `/push/*` 一律 401。

```bash
bun run admin revoke a1b2c3deadbeef
# {"ok":true,"tokenId":"a1b2c3deadbeef"}
```

### `list`

列出所有 enduser token(GET `/admin/tokens`),印 table:`tokenId / label / createdAt / lastUsedAt / revoked`。

```bash
bun run admin list
# tokenId                   label                 createdAt             lastUsedAt            revoked
# ---------------------------------------------------------------------------------------------------
# a1b2c3...                 eric-laptop           2026-05-19 03:12:01   2026-05-19 04:08:22   no
# (1 tokens)
```

任一 subcommand 加 `--help` 印該指令說明;不帶任何參數印整體 usage。

## 不在本 phase scope

- Cloud Run deploy(t4)
- vibe-pipeline backend 接 gateway(t5)
- 主 repo 文件更新(t6)
