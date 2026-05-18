# vp-fcm-gateway

vibe-pipeline FCM Gateway — Multi-tenant Cloud Run service。對外暴露 7 條 endpoint:enduser 用 Bearer token 註冊裝置 / 發送 push,master 用 `MASTER_TOKEN` 簽發 / 撤銷 / 列出 enduser tokens。Firestore 存 token (sha256) + device + per-minute rate limit counter,FCM HTTP v1 fan out 給該 enduser 所有 device。

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

### 7. `POST /admin/revoke-token/:tokenId`(master)

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
| `POST /push/register` `POST /push/send` `POST /push/unregister` | Enduser Bearer(Firestore 查 sha256,未 revoked) |
| `POST /admin/issue-token` `POST /admin/revoke-token/:id` `GET /admin/tokens` | `MASTER_TOKEN` Bearer(env var 比對,timing-safe) |

Token 比對 timing-safe(`auth.ts` 的 `timingSafeEqualStr`),enduser 路徑驗 token 同時更新 `lastUsedAt`。

## Rate limit

- 60 req/min per enduser token(`rateLimits/{sha32}_{epochMin}` Firestore counter,`FieldValue.increment(1)`)
- 超過回 `429 {error:"rate_limited",limit,count,resetAt}` + headers `x-ratelimit-limit / -remaining / -reset`
- counter 不主動 GC;每分鐘 doc id 不同自然滾,要清理掛 Firestore TTL 在 `expiresAt` 欄(已寫入,t1 infra 未配 TTL policy 也 OK,doc 累積緩慢)

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

## 不在本 phase scope

- Admin CLI(t3)
- Cloud Run deploy(t4)
- vibe-pipeline backend 接 gateway(t5)
- 主 repo 文件更新(t6)
