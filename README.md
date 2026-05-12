# vibe-pipeline

多 AI agent(執行 + 審核)的 ticket / pipeline 編排器。每張 ticket 由 **執行 AI** 跑、**審核 AI** 審,迭代模式自動迴圈到審核 pass。Pipeline 是有序 ticket 列表,跑在獨立 git branch 上,完成後 merge 回 base。

平常用 Web UI,終端機則有 `vbpl` CLI。兩邊共用同一套 backend lib,沒有 HTTP-only 路徑。

---

## 快速開始

需要 [Bun](https://bun.sh)(≥ 1.1)+ Git。

```bash
bun install

# 開兩個 terminal 分開跑(推薦):
bun run dev           # 前端 Vite (5173)
bun run server        # 後端 Bun (3001,不 watch)
# 開 http://127.0.0.1:5173/board
```

`bun run dev:all` 可一次起兩個,但內部用 `server:watch` — **不要在跑 AI merge 時用**(熱重載會殺掉 runner 子程,merge 中斷)。日常開發如不會觸發 merge 才用 `dev:all`,否則分開跑保險。

打包 CLI 成單檔 binary:

```bash
bun run cli:build           # Windows
bun run cli:build:mac       # macOS arm64
bun run cli:build:linux     # Linux x64
# → dist-cli/vbpl[.exe]
```

---

## 架構

```
┌──────────────────────────────────────────────────────────────┐
│  Web UI (Vite + React 18)                                    │
│   ↓ /api/* proxy                                             │
│  Bun server (3001)                                           │
│   ↓ spawn                                                    │
│  AI runner (claude-code / codex CLI)                         │
│   ↓ Task / Bash                                              │
│  執行 AI sub-agent          審核 AI sub-agent                │
│  (真的改 code,高 capability)  (讀 diff 判 PASS/FAIL,可便宜) │
└──────────────────────────────────────────────────────────────┘

vbpl CLI ─── read 操作:直接 reuse server/lib/*
         └── spawn / kill 操作:POST 給 backend(避免子程孤兒)
```

每個 task class 的 AI 配置(model + reasoning effort 各自可選):

| Task class | 預設 | 用途 |
|---|---|---|
| `qa` | sonnet-4-6 / low | 跟 user 對話收斂 ticket 規格 |
| `split` | sonnet-4-6 / low | One-shot 判「這該拆 N 張」 |
| `runner` | opus-4-7 / medium | Pipeline 主 agent(編排 ticket) |
| `executor` | opus-4-7 / high | 寫 / 改 code |
| `critic` | sonnet-4-6 / medium | 讀 diff,PASS / FAIL / PARTIAL |
| `merge` | opus-4-7 / high | 衝突解 |

從 Settings 可逐項切 provider(claude / codex)+ model。

---

## 功能

- **Pipeline = 有序 ticket 列表**,跑在獨立 git branch,worktree 隔離在 `~/.vibe-pipeline/worktrees/<projHash>/<pipelineId>/`
- **QA drawer**:跟 AI 聊出 ticket 規格;AI 看到 scope 跨多件獨立工作會自動建議拆分
- **迭代模式**:執行 → 審核 → retry 迴圈到 PASS 或達 iter 上限
- **自動合併**(全 ticket done + `autoMerge=true`):後端先試純 `git merge --no-ff`,撞衝突才 spawn AI
- **同步**:把 base 拉進 pipeline worktree,同 git-first → 衝突才 AI 的二段式
- **跨 provider sub-agent**:claude main → Task tool;codex → Bash 直呼 `codex exec`
- **PWA + Tailscale + TOTP**:桌機跑 server,手機透過 Tailscale HTTPS 連入,非 loopback 強制 TOTP,FCM push ticket 事件到手機
- **CLI `vbpl`**:4 nouns(project / pipeline / ticket / config)+ `--json` mode;spawn 操作走 backend HTTP 避免子程孤兒
- **狀態恢復**:server 重啟時自動掃 pipeline 收斂 stale `running`/`stopping`;runtime watchdog 抓死 PID

---

## CLI

```bash
# 安裝(跑完 bun run cli:build 後)
mkdir ~/bin && cp dist-cli/vbpl* ~/bin/   # 把 ~/bin 加進 PATH

# 常用指令
vbpl project list
vbpl pipeline list --project <hash>
vbpl pipeline status <id>
vbpl pipeline run <id>                                          # 啟動 runner(需要 backend)
vbpl pipeline log <id>                                          # 過往 run 摘要
vbpl ticket add --pipeline <id> --title "..." --mode iter
vbpl config set runner.model claude-opus-4-7
vbpl pipeline sync <id>                                         # git merge base → worktree
vbpl pipeline sync <id> --ai                                    # 讓 AI 解衝突
vbpl pipeline merge <id>                                        # AI merge 回 base
```

每個 verb 都吃 `--json`,搭配 `jq` / PowerShell `ConvertFrom-Json` 寫 script 用。

---

## 遠端存取(Tailscale)

1. 桌機 + 手機都裝 Tailscale,登入同 tailnet
2. 桌機跑 `tailscale serve --https=443 http://localhost:5173`
3. 手機開 `https://<machine>.<tailnet>.ts.net`,安裝成 PWA
4. 首次非 loopback 連線 → TOTP 設定(掃 QR 加進 Authenticator,之後每個 session 輸入 6 碼登入)
5. Settings →「Push Notifications」開啟推播,ticket 事件會到手機

詳細 FCM service-account 設定見 [`CLAUDE.md`](CLAUDE.md) § 手機遠端使用方式。

---

## Repo 結構

```
src/         前端(Vite + React)
server/      Bun 後端(routes 純 dispatch,lib/ 純邏輯)
cli/         vbpl CLI(reuse server/lib/*)
shared/      跨前後端持久化型別
.claude/     給編輯本 repo 的 AI 用的 SKILL / refs
public/      靜態(PWA manifest、service worker、icons)
tests/e2e/   Playwright(mock CI 模式 + real 模式)
```

每層有對應 SKILL 文件在 `.claude/skills/` 內描述慣例 — 動非 trivial 改動前先讀:

- [vibe-pipeline](.claude/skills/vibe-pipeline/SKILL.md) — 產品定位 / scope / 外部對照
- [vibe-pipeline-frontend](.claude/skills/vibe-pipeline-frontend/SKILL.md) — UI 慣例
- [vibe-pipeline-backend](.claude/skills/vibe-pipeline-backend/SKILL.md) — server / runner / sync
- [vibe-pipeline-cli](.claude/skills/vibe-pipeline-cli/SKILL.md) — CLI 慣例
- [vibe-pipeline-e2e](.claude/skills/vibe-pipeline-e2e/SKILL.md) — Playwright 覆蓋矩陣

---

## 當前狀態

Phase 1-5 全套已落地(CRUD + QA + Runner + Worktree + Merge/Sync + Auto + Tailscale + TOTP + FCM + cross-provider sub-agent + CLI)。**Self-dogfood**:本專案靠自己的 pipeline 推進自己的開發。

可運作但未打磨:
- Budget tracker UI(成本上限後端已強制執行,缺前端 dashboard)
- Transient retry fixture(沒自然 reproduction case)
- iOS PWA push(Android 驗過,iOS 需手動「加入主畫面」+ 16.4 以上)
- `vbpl pipeline log --follow`(目前 one-shot 不會 tail)

---

## Scripts

| 指令 | 用途 |
|---|---|
| `bun run dev` | Vite 前端(5173) |
| `bun run server` | Bun 後端(3001,不 watch) |
| `bun run server:watch` | 後端熱重載(self-merge 期間別用 — `bun --watch` reload 會殺掉 spawn 出去的 runner 子程) |
| `bun run dev:all` | 同時跑兩個 |
| `bun run build` | `tsc -b && vite build` |
| `bun run lint` | Biome lint |
| `bun run test:e2e` | Playwright mock 模式(CI 預設) |
| `bun run test:e2e:real` | Playwright real 模式(燒 token,opt-in) |
| `bun run vbpl <noun> <verb>` | CLI 開發模式(不用每次 rebuild) |
| `bun run cli:build` | 把 CLI 編成單檔 binary |
| `bun run icons` | 從 `public/icon.svg` 重產 PWA icons(需 ImageMagick) |

---

## License

目前未明確開放,以個人 / 協作使用為主。要釐清特定用途請開 issue。
