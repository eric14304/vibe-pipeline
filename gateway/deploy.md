# FCM Gateway — Cloud Run Deploy

本檔記錄 vibe-pipeline FCM Gateway service 部署到 GCP Cloud Run 的完整流程,t4 階段落地。基礎建設(project / Firestore / service account / APIs)在 [`INFRA.md`](INFRA.md)。

## 部署目標

- **GCP project**:`vibe-pipeline`
- **Region**:`asia-east1`(與 Firestore 同區降 latency)
- **Service name**:`vp-gateway`
- **Service URL**:`https://vp-gateway-799841449136.asia-east1.run.app`(t4 deploy 後固定)
- **Identity**:`vp-gateway-runner@vibe-pipeline.iam.gserviceaccount.com`(ADC,容器內不掛 key file)
- **Auth**:`/health` 公開;`/push/*` 走 enduser bearer token;`/admin/*` 走 `MASTER_TOKEN`
- **Resources**:512 MiB RAM / 1 vCPU / max-instances=1 / min-instances=0(無流量自動 scale-to-zero,省到 $0)

## 前置(t1 已完成,僅初次需執行)

1. APIs 啟用、Firestore native @ asia-east1、service account + IAM bindings 已建好,細節 [`INFRA.md`](INFRA.md)。
2. 本機 `gcloud` 已 `gcloud auth login` + `gcloud config set project vibe-pipeline`。

## Step 1:Master token 存進 Secret Manager

Gateway 對 backend 暴露的 `/admin/*` 用 `MASTER_TOKEN` Bearer 驗證,值存 Secret Manager,Cloud Run 用 `--set-secrets` 注入成環境變數。

```bash
# 檢查 secret 是否已存在(冪等)
gcloud secrets describe master-token --project=vibe-pipeline 2>/dev/null \
  || (printf '%s' "$(openssl rand -hex 24)" \
      | gcloud secrets create master-token --data-file=- --project=vibe-pipeline)

# 授權 service account 讀 secret
gcloud secrets add-iam-policy-binding master-token \
  --member=serviceAccount:vp-gateway-runner@vibe-pipeline.iam.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor \
  --project=vibe-pipeline
```

**雷**:在 Windows / Git Bash 上 `openssl rand -hex 24` 直接 pipe 進 `gcloud secrets create` 會夾帶 CRLF (`\r\r\n`),導致 `MASTER_TOKEN` env 在 container 內含換行,bearer 比對永遠 401。**一律用 `printf '%s' "$(...)"` 去掉尾端 newline**,寫進臨時 file 再 `--data-file=` 餵。驗證:`gcloud secrets versions access latest --secret=master-token | xxd | tail -1` 結尾不該有 `0d` / `0a`。

新增 / 輪換 token:`printf '%s' "$(openssl rand -hex 24)" > /tmp/mt.txt && gcloud secrets versions add master-token --data-file=/tmp/mt.txt --project=vibe-pipeline`,後續 Cloud Run revision 自動拿 `:latest`(新 deploy 才 pin 新 version,既有 revision 不會自動換)。

## Step 2:Deploy service(`gcloud run deploy --source`)

從 `gateway/` 目錄跑(Cloud Build 會打包整個 cwd 上傳,自動偵測 Dockerfile):

```bash
cd gateway
gcloud run deploy vp-gateway \
  --source . \
  --region asia-east1 \
  --max-instances 1 \
  --min-instances 0 \
  --memory 512Mi \
  --cpu 1 \
  --service-account vp-gateway-runner@vibe-pipeline.iam.gserviceaccount.com \
  --allow-unauthenticated \
  --set-env-vars="FCM_PROJECT_ID=vibe-pipeline" \
  --set-secrets="MASTER_TOKEN=master-token:latest" \
  --project=vibe-pipeline
```

旗標說明:

- `--source .` → Cloud Build 跑 `gateway/Dockerfile`(多階段 `oven/bun:1.1.34-alpine`),產 image 推 Artifact Registry。初次會自動建 `cloud-run-source-deploy` repo @ asia-east1。
- `--allow-unauthenticated` → `/health` 對外可訪;application-layer auth 在 gateway 自己處理(bearer)。
- `--service-account` → 容器內 ADC 自動拿 token,Firebase Admin SDK / Firestore client 不必 key file。
- `--max-instances 1` → 單 instance 足夠,FCM 發送 throughput 不是瓶頸,且省錢 / 避免 Firestore optimistic write contention。
- `--min-instances 0` → 無流量 scale to 0,cold start ~1.5s 可接受。
- `--set-env-vars="FCM_PROJECT_ID=vibe-pipeline"` → 給 Firebase Admin SDK 用。
- `--set-secrets="MASTER_TOKEN=master-token:latest"` → 把 secret 注入成同名 env。

Deploy 成功 stdout 會印 `Service URL: https://vp-gateway-799841449136.asia-east1.run.app`,記下來。

## Step 3:驗證

```bash
URL=https://vp-gateway-799841449136.asia-east1.run.app

# 1) /health 公開,200 ok:true
curl -sS "$URL/health"
# {"ok":true}

# 2) /admin/tokens 沒 token → 401
curl -sS -w "\n%{http_code}\n" "$URL/admin/tokens"
# {"error":"unauthorized"}  401

# 3) /admin/tokens 帶 MASTER_TOKEN → 200 {tokens:[]}
MT=$(gcloud secrets versions access latest --secret=master-token --project=vibe-pipeline)
curl -sS -H "Authorization: Bearer $MT" "$URL/admin/tokens"
# {"tokens":[]}
```

也可走 admin CLI:

```bash
cd gateway
MASTER_TOKEN="$MT" GATEWAY_URL="$URL" bun run admin list
# tokenId  label  createdAt  lastUsedAt  revoked
# ---
# (0 tokens)
```

## 更新流程(改 service code)

`gateway/index.ts` / `lib/*` 改完直接 redeploy(同樣指令,Cloud Build 重 build image,新 revision 100% traffic):

```bash
cd gateway && gcloud run deploy vp-gateway --source . --region asia-east1 --project=vibe-pipeline
```

旗標只在「需要改」時帶(env / secret / scaling);其他沿用既有 revision 設定。改 secret 但不改 code → 走 `gcloud run services update vp-gateway --region asia-east1 --set-secrets=...` 觸發新 revision 拉 secret。

## Rollback

Cloud Run revision 是 immutable,出問題切回上一版:

```bash
# 列 revision
gcloud run revisions list --service=vp-gateway --region=asia-east1 --project=vibe-pipeline

# 100% 流量切回指定 revision
gcloud run services update-traffic vp-gateway \
  --region=asia-east1 \
  --to-revisions=vp-gateway-00001-grr=100 \
  --project=vibe-pipeline
```

revision 不刪不會額外計費(scale-to-zero),保留最近 3-5 個方便 rollback。

## Troubleshooting

| 症狀 | 原因 / 解 |
|---|---|
| `/admin/*` 帶對 token 仍 401 | Secret value 含 CRLF / 尾 newline,參考 Step 1 雷 |
| Deploy 卡 `Building Container` 5+ 分鐘 | Cloud Build quota / Artifact Registry 初次建 repo;`gcloud builds list --region=asia-east1` 看狀態 |
| `Revision ... failed` Error: Container failed to start | 看 `gcloud run services logs read vp-gateway --region=asia-east1 --limit=100`,常見:env var 缺、Bun runtime panic、port 不是 `$PORT`(必須 listen 8080) |
| Firestore PERMISSION_DENIED | Service account 缺 `roles/datastore.user`,參考 [`INFRA.md`](INFRA.md) |
| FCM send 401 / 403 | Service account 缺 `roles/firebasecloudmessaging.admin`,或 FCM API 沒 enable |
| Cold start 慢(>3s) | 預期內(min-instances=0);要常駐改 `--min-instances=1`(會持續計費) |
| `curl /health` 404 | URL 拼錯或 service 已刪;`gcloud run services describe vp-gateway --region=asia-east1` 確認 |

## 後續(t5+)

- t5:vibe-pipeline backend 改用 gateway URL 發 push,移除本機 Firebase Admin code。
- t6:enduser-facing docs(發 token / register 手機 / curl 測 push)。
- 監控:Cloud Run console 看 request count / latency / error rate;Secret Manager budget alert 已在 INFRA.md。
