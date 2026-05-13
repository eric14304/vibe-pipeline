# Changelog / 決策日誌

歷史紀錄 + 設計決策來源。CLAUDE.md 是「現狀規則」,本檔是「為何變成現狀 / 過去考慮過什麼」。

新版本變動規則:每次有架構級改動或設計決策落地時加日期分段;CLAUDE.md 只更動 canonical reference 段。

---

## Phase 1-5 落地表

每 phase 一條 merge commit,詳細落地紀錄查 `git log --grep "Merge pipeline/"`;Phase 5 後續打磨在 `b4a6a13` 之後 ~30+ patch + 2026-05-13 大改動。

| Phase | 一句話 |
|---|---|
| 1 | Project / Pipeline CRUD + JSON 持久化 + git init |
| 2 | QA drawer + claude CLI 收斂 + Draft store |
| 3 | Pipeline runner(主 agent + Task sub-agent)/ git worktree / iter rounds / multi-pipeline 平行 / merge to base |
| 4 | E2E (Playwright mock + real) / AI merge ticket-based / UI polish(ConfirmDialog / DiffModal / 中文化) |
| 5 | 全自動化(拆 / sync / merge / prune)+ per-task model config + CLI perf flags + RWD + Tailscale + TOTP auth + FCM + cross-provider sub-agent |

六條 pipeline 已 merge 進 main:phase3 / phase4 / refactor / perf-claude-cli / codex-cli / phase5,chore pipeline 補完 e2e mock。Self-dogfood 自我重構穩定運作,**手機可透過 Tailscale HTTPS + TOTP auth + FCM Web Push 遠端控制 + 收 ticket 通知**。

---

## 2026-05-13 大改動(Phase 5 後續打磨期)

- **Sync 重構(Plan C)**:`Pipeline.syncJob` 寄生欄位取代舊 `mode=sync` ticket;git-first → 衝突才 AI;新 4 endpoints `/sync` `/sync/ai` `/sync/cancel` `/sync/dismiss`。細節 → [`docs/refs/sync-redesign-2026-05-13.md`](docs/refs/sync-redesign-2026-05-13.md)
- **`subAgent` 拆 `executor` + `critic`**:兩個獨立 TaskClass,critic 可挑便宜 model(sonnet+medium)省 token 5-10x;userConfig 自動 migrate(舊 subAgent → executor,critic 走 default)
- **Client-side folder browser**:新 `GET /api/projects/browse?path=` endpoint,瀏覽器內導覽 host 上目錄;Tailscale 遠端開 project 走這個(native picker 跑在 host user 看不到 dialog)
- **`vbpl` CLI 落地**:`cli/` 內,reuse `server/lib/*` 直接讀寫 fs(no HTTP)。4 nouns(project/pipeline/ticket/config)+ `--json` mode。`bun run vbpl <noun> <verb>`。約定見 [`vibe-pipeline-cli` SKILL](.claude/skills/vibe-pipeline-cli/SKILL.md)
- **Auto-merge 二段式**:`autoMerge=true` 觸發時 backend 先 `git merge --no-ff`(機械式,~90% clean case 毫秒級 done);**撞衝突 → 自動 fallback 到 spawn AI 全套** + emit notif + FCM push「🤖 AI 接手解衝突」(autoMerge 核心情境就是 user 不在現場,所以推播必要)。dirty / git_error 等非 AI 能解的失敗才 emit `merge_blocked` 等 user。心智:autoMerge 是「全自動」承諾;速度收益留在 clean 場景
- **Manual merge 也走 git-first 二段式**:跟 auto-merge 對稱化。`mergePipeline` route 改成先試 `autoMergeNoAI`,衝突才 fallback `triggerMerge`。response 加 `mode: "mechanical" | "ai"` discriminator;CLI / Web UI handler 依 mode 分流顯示。按鈕 label「AI 合併」→「合併」(AI 變 fallback)。`alreadyMerged` 路徑也補寫 pipeline state=merged + 清殘存 failed merge ticket
- **CLI mutate 操作走 backend HTTP**(`cli/lib/api.ts`):`vbpl pipeline run / stop / merge / sync --ai / sync --cancel` 走 POST,避免 CLI 自己 spawn child 後 CLI 退出 → child 孤兒 / orchestrator running map 蒸發。其他 verb(list / show / create / delete / config 等)維持 fs 直存,read 不受 backend 起沒起影響
- **`Pipeline.createdAt` 欄位**:取代 id 內嵌 hex timestamp 當排序依據(AI / fixture 手 craft 的假 id 會排亂)。`listPipelines` 讀檔時若無此欄位自動 backfill 用 id-ts;新 pipeline 寫真 `Date.now()`。CLI `pipeline create` 同步讀 project config `defaults.auto_merge` 預設值(原本漏)
- **`pipelineDir.init` 改 idempotent**:`.vibe-pipeline/` partial init 殘骸自動補齊不報錯;`.gitignore` 自動補 `pipelines/`(原本漏)
- **UX 收斂**:Pipeline 執行紀錄從 TicketDrawer 拆到 pipeline-level OverflowMenu;Inbox strip 整塊觸碰 + 滾輪 preview popover;QA reopen + viewOverride 雙向;CTA 視覺強度三檔(`btn` / `btn-accent` / `btn-primary`),+ ticket 跟 RunButton 主色互斥避免兩顆都搶眼;`bun run start` 一指令包 preview + server(production-like)
- **主 SKILL 重定位**(2026-05-13 後段):從「設計信條 + 競品對照 + 產品形態混雜的 maintainer doc」改成「給 enduser AI 看的 vbpl 操作手冊」。refs 從 `.claude/skills/vibe-pipeline/refs/` 搬到 `docs/refs/`,SKILL 變 distributable;設計信條搬進 CLAUDE.md;競品對照合一為 `docs/refs/competitor-refs.md`

---

## 已 final 決定(不再討論,搬到這段表示不會做)

- **Theme 偏好 → localStorage**(URL `?theme=` 仍 override)
- **Worktree 位置 → global** `~/.vibe-pipeline/worktrees/<projHash>/<pipelineId>/`
- **vp-autotest project**(`d:/sugarfungit/vp-autotest`,hash `cf94d1b2`)— Claude 跑 runner 測試專用,user 主 project 不污染
- **Pixel-diff 不救**(2026-05-10 phase 3-5 砍):prototype variant routes(/init, /drawer, /qa, /notifications)+ NotifBanner / NotificationsScreen / DrawerStage / QAScreen / InitScreen 全刪,tests/ 整個刪,playwright/pixelmatch/pngjs 從 devDeps 移除,`bun run diff` script 移除。design/ 留作歷史紀錄不再對齊
- **log/notif GC** 走 per-pipeline 10 / 全 project 500 上限,trigger 在 /run spawn 前
- **Self-dogfood AI merge worktree isolation 不做** — 99% user(對別 project 用 VP)不會踩 `--watch` reload 殺 child 問題;只有 VP 改自己時要避免。研究紀錄見 [`docs/refs/merge-isolation-2026-05-11.md`](docs/refs/merge-isolation-2026-05-11.md);實作 ~150 行不划算
- **Runner spawn `--setting-sources` 不砍** — 保留給 Task sub-agent 讀 user/project CLAUDE.md。砍掉省 ~13% cache 但 sub-agent 失去 context 繼承,得失不對稱
- **Runner 主 agent 永遠是 claude(不支援 codex 主 runner)** — `runnerPrompt.ts` 全是 claude-isms(Task tool / subagent_type 規則),codex 跑會忽略 sub-agent 派發指令 iter 紀律破功。要 codex 主 runner 需 ~200-300 行 prompt 重寫成 provider-agnostic,投入產出不對稱。Phase 6 會從 UI 拿掉 codex runner 選項

---

## 計畫 ref(歷史 spec / 設計文件)

- [phase 1 plan(已落地)](docs/refs/archive/integration-plan-v1-2026-05-09.md)
- [phase 2 QA plan(已落地)](docs/refs/archive/integration-plan-v2-qa-2026-05-09.md)
- [phase 3 runner plan(進行中)](docs/refs/integration-plan-v3-runner-2026-05-10.md)
- [git design](docs/refs/git-design-2026-05-09.md)
- [完整功能 spec](docs/refs/spec-2026-05-09.md)
- [state matrix](docs/refs/state-matrix-2026-05-10.md)
- [claude CLI spawn perf](docs/refs/claude-cli-spawn-perf-2026-05-11.md)
- [sync 重構](docs/refs/sync-redesign-2026-05-13.md)
- [merge worktree isolation 研究(不做)](docs/refs/merge-isolation-2026-05-11.md)
- [競品對照](docs/refs/competitor-refs.md)
