# FCM Gateway — GCP Infra Setup

本檔記錄 vibe-pipeline FCM Gateway(Cloud Run + Firestore + FCM)的 GCP 基礎建設配置,t1 階段落地。t2+ 撰寫 service code / deploy 時對齊本檔。

## 專案 / 區域

- **GCP project id**:`vibe-pipeline`
- **Billing**:已 link,$1/mo budget alert 設定中
- **Active account**(管理用):`eric14304@gmail.com`
- **Region**:`asia-east1`(Cloud Run + Firestore 統一,降 latency / 跨區流量費)

## 已啟用 APIs

`gcloud services enable` 一次帶起以下七個,`gcloud services list --enabled` 驗證全在:

| API | 用途 |
|---|---|
| `run.googleapis.com` | Cloud Run 跑 gateway service |
| `firestore.googleapis.com` | device token / dedup state 儲存 |
| `cloudbuild.googleapis.com` | `gcloud run deploy` source build |
| `artifactregistry.googleapis.com` | Cloud Build 產物 registry |
| `fcm.googleapis.com` | Firebase Cloud Messaging send API |
| `iam.googleapis.com` | service account / role 管理 |
| `secretmanager.googleapis.com` | `MASTER_TOKEN` 等 secret 儲存(t4 用) |

## Firestore database

- **Mode**:Native(`--type=firestore-native`)
- **Location**:`asia-east1`
- **Database id**:`(default)`
- **Free tier**:yes
- **Concurrency**:PESSIMISTIC
- 建立指令:`gcloud firestore databases create --location=asia-east1 --type=firestore-native`

## Service account(Cloud Run identity)

- **Email**:`vp-gateway-runner@vibe-pipeline.iam.gserviceaccount.com`
- **Display name**:VP Gateway Runner
- **建立指令**:`gcloud iam service-accounts create vp-gateway-runner --display-name="VP Gateway Runner"`

### IAM roles(project-level)

| Role | 用途 |
|---|---|
| `roles/datastore.user` | Firestore document 讀寫(device tokens / dedup) |
| `roles/firebasecloudmessaging.admin` | FCM HTTP v1 send messages |

兩條 binding 都用 `gcloud projects add-iam-policy-binding vibe-pipeline --member="serviceAccount:vp-gateway-runner@vibe-pipeline.iam.gserviceaccount.com" --role=<role>` 加上。

## t2+ 怎麼用 ADC(不用 service account key file)

**Cloud Run 自動注入** service account credentials:deploy 時 `--service-account=vp-gateway-runner@vibe-pipeline.iam.gserviceaccount.com`,容器內 Firebase Admin SDK / google-cloud client lib 走 ADC(Application Default Credentials)自動取 token,**不必下載 / 掛 key file**。

Node service code 範例(t2 落地):

```ts
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

initializeApp({ credential: applicationDefault(), projectId: "vibe-pipeline" });
const db = getFirestore();
const fcm = getMessaging();
```

本機開發若要連真 Firestore / FCM,跑 `gcloud auth application-default login` 一次,SDK 會抓 ADC user credential;CI / Cloud Run 環境會自動用 metadata server 拿 service account token,**程式碼不用分支**。

## MASTER_TOKEN(gateway 對外 auth)

Gateway 對 vibe-pipeline backend 暴露的 send endpoint 用 Bearer token 驗證。產生方式:

```bash
openssl rand -hex 24
# 範例輸出(48 chars hex):a3f1c2... 共 24 bytes 隨機
```

- **env var name**:`MASTER_TOKEN`
- **儲存**:t4 deploy 時寫進 Secret Manager,Cloud Run 用 `--set-secrets=MASTER_TOKEN=master-token:latest` 注入
- **vibe-pipeline backend 端**:同值寫進 backend `.env` 的 `FCM_GATEWAY_TOKEN`,呼叫 gateway 時帶 `Authorization: Bearer ${MASTER_TOKEN}`
- 一次性,洩漏 → 重 `openssl rand` 產新值,update Secret Manager + backend env,Cloud Run revision 自動拿新值

## 已驗證

- `gcloud services list --enabled` → 七個 API 全在
- `gcloud firestore databases list` → `(default)` @ asia-east1,FIRESTORE_NATIVE
- `gcloud projects get-iam-policy vibe-pipeline --flatten="bindings[].members" --filter="bindings.members:vp-gateway-runner@..."` → 兩條 role 都在
- `gcloud auth application-default print-access-token` → 拿得到 access token(ADC 可用)

## Cloud Run deployment(t4 落地)

- **Service**:`vp-gateway` @ asia-east1
- **URL**:`https://vp-gateway-799841449136.asia-east1.run.app`
- **Identity**:`vp-gateway-runner@vibe-pipeline.iam.gserviceaccount.com`
- **Scaling**:max-instances=1 / min-instances=0(scale-to-zero)
- **Resources**:512 MiB / 1 vCPU
- **Auth**:`/health` 公開;`/tokens/auto-issue` 公開(per-IP 每 UTC 日 5 token,Firestore counter `tokenIssueRateLimits/{sha256(ip)}_day_{YYYYMMDD}`);`/push/*` enduser bearer;`/admin/*` `MASTER_TOKEN`(Secret Manager `master-token:latest` 注入)
- **Env**:`FCM_PROJECT_ID=vibe-pipeline`

完整 deploy / 更新 / rollback / troubleshooting 流程見 [`deploy.md`](deploy.md)。

## 自動發 token endpoint(`POST /tokens/auto-issue`)

公開 endpoint,enduser 不必透過 maintainer 後台拿 token,可在自己手機 / 瀏覽器自助。Body `{label?: string}` 全可選,空就 fallback `auto-<ipHashSuffix4>`(`sha256(ip)` 後 4 碼)。回應跟 `/admin/issue-token` 同 schema `{tokenId, token}`,明文 token 只回一次。

防腳本 mass issue:每 IP 每 UTC 日最多 5 個 token,counter 落 `tokenIssueRateLimits/{sha256(ip)}_day_{YYYYMMDD}`(raw IP 不存)。超過回 `429 {error:"rate_limited",limit:5,count,resetAt}`,`resetAt` 為下次 UTC 00:00 epoch ms。

Cloud Run 場景 client IP 從 `X-Forwarded-For` 第一段取(GFE / load balancer 注入);本機開發走 Bun `server.requestIP()`。

```bash
curl -s -X POST https://vp-gateway-799841449136.asia-east1.run.app/tokens/auto-issue \
  -H "content-type: application/json" \
  -d '{"label":"eric-iphone"}'
# {"tokenId":"...","token":"..."}
```

`tokenIssueRateLimits` collection 同 `rateLimits` 一樣寫 `expiresAt` 欄(48h),Firestore TTL policy 可掛上去自動清(t1 infra 未配 TTL 也不會 break,doc 累積緩慢)。

## 下一步(t5 起跑點)

1. vibe-pipeline backend 改呼叫 gateway URL 發 push,移除本機 Firebase Admin code
2. enduser 設定流程 docs(t6)
3. dup-push fix(t7)
