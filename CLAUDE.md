# vibe-pipeline

多 AI agent(執行AI + 審核AI)的 ticket / pipeline 編排器。Web 應用為主介面,將來配 `vp` CLI。每張 ticket 由 執行AI 跑、審核AI 審,iterative 模式自動迴圈到 審核AI pass;pipeline 是 ticket 的有序組合,每條跑在獨立 git branch,完成後 merge 回 base。

## 當前狀態

**Phase 1-5 全套已落地 + 2026-05 後續打磨**。歷次大改動 → [`docs/CHANGELOG.md`](docs/CHANGELOG.md);Phase merge commit 查 `git log --grep "Merge pipeline/"`。**待動工** → [`docs/TODO.md`](docs/TODO.md)(對應 phase 8 pipeline `019e36fbea63-phase8`)。

**架構決策**(現狀):
- Bun local server + browser(前端 Vite 5173 / 後端 Bun 3001 / `/api/*` 透過 Vite proxy)
- Runner 主 agent 工具白名單只准 Edit/Write 改 pipeline.json + worktree 外 tmp(commit message)+ Bash 跑 read-only + git add/commit;source code 改動 100% 透過 Task 派 sub-agent
- Theme 偏好走 localStorage(URL `?theme=` 仍 override);非 backend config
- 跨 provider sub-agent:claude main → codex sub via Bash 直呼 codex CLI;主 agent 永遠帶 `--dangerously-skip-permissions`
- Sub-agent 拆 executor / critic 兩個 TaskClass:executor 真改 code 用高 capability,critic 讀 diff 判 PASS/FAIL 用便宜 model;`syncJob` 衝突解走 executor cfg
- Auth 設計:loopback IP 永遠 bypass,只非 loopback 連線強制 TOTP;本機 dev 完全不受影響

## 其他索引

- **Repo 物理結構**(檔案 / 目錄 SSOT)→ [`docs/refs/repo-structure.md`](docs/refs/repo-structure.md)
- **refs 目錄**(設計文件 / 競品 / 歷史 spec)→ [`docs/refs/README.md`](docs/refs/README.md)
- **跨 provider SKILL 路由**(改哪 dir 看哪份 SKILL)→ [`AGENTS.md`](AGENTS.md)
- **path-specific 規則**(SW / 遠端存取等)→ [`.claude/rules/`](.claude/rules/)
- **開發環境 / scripts** → [`README.md`](README.md) §快速開始 + §Scripts
- **手機遠端 setup**(Tailscale + TOTP + FCM)→ [`README.md`](README.md) §遠端存取

dir 概覽(細節去 `repo-structure.md`):

| dir | 職責 | 改 code 看哪份 SKILL |
|---|---|---|
| `src/` | React 前端 | `vibe-pipeline-frontend` |
| `server/` | Bun backend(API + runner + qa + fcm + auth) | `vibe-pipeline-backend` |
| `cli/` | `vbpl` CLI(import server/lib 直存 fs,不發 HTTP) | `vibe-pipeline-cli` |
| `shared/` | 跨 backend/frontend 持久化型別 | (跟著用方走) |
| `docs/` | CHANGELOG / TODO / refs / 散發給 enduser 的 SKILL bundle | — |
| `.claude/skills/` | maintainer 4 份 sub-SKILL | 自己 |
| `.claude/rules/` | path-specific 雷區規則(動到對應 path 才相關) | 自己 |
| `public/`, `scripts/`, `design/` | 靜態資產 / icon 生成腳本 / 設計 handoff 歷史 | — |

repo 外 runtime data:`~/.vibe-pipeline/`(global state)+ `<target-repo>/.vibe-pipeline/`(per-project),細節仍在 `repo-structure.md`。

path-specific rules(動到對應 path 加讀,別只讀 SKILL):

| 動到 path | 加讀 |
|---|---|
| `public/firebase-messaging-sw.js` / `vite.config.ts` PWA 段 / `src/lib/swUpdate.ts` / `src/lib/fcm.ts` / `src/features/system/SwUpdateBanner.tsx` | [`.claude/rules/pwa-sw.md`](.claude/rules/pwa-sw.md) |
| `server/index.ts` / `server/lib/auth/**` / `server/lib/push/**` / `server/lib/fcm/**` / `.env*` | [`.claude/rules/remote-access.md`](.claude/rules/remote-access.md) |
| `server/lib/cli/codexAdapter.ts` | [`.claude/rules/cli-codex.md`](.claude/rules/cli-codex.md) |

## 不踩的雷(全 repo always-on)

> path-specific 雷區(動 SW / Workbox / Tailscale auth 等才相關)搬到 [`.claude/rules/`](.claude/rules/)。本段只留改任何 code 都該記得的。

1. **不開 `<StrictMode>`** — `useEffect([])` 雙觸發會讓 QA 第一輪 AI message 跑兩次等。`src/main.tsx` 已關。
2. **token 走 `tokens.css` 變數**,別寫 hex / px 原值;新顏色加 token 不要 hard-code。
3. **theme class 用 `index.html` 的 inline script 設**,不靠 React useEffect — 否則第一個 frame 用 stale theme,有 1-frame flash。已配 localStorage 偏好(URL `?theme=` 仍 override)。
4. **HIDE_CSS / fade-up 用 `animation: none` 不用 `0s`** — `0s` 會留下 fade-up 起始 opacity:0,整個元件透明。
5. **跨畫面 state 用 URL query param**(refresh / bookmark 不掉),例外:active project hash 走 localStorage、theme 走 localStorage(URL override)。
6. **server prompt template literal 內禁用 inline backtick** — `` `code` `` 在 backtick template literal 內會關閉外層字串。任何 `.ts` 內的 template literal 都會炸,不只 `systemPrompt.ts` / `runnerPrompt.ts`。改完一律純文字 + grep 確認沒殘留 backtick。Bun `--watch` reload 噴 syntax error 後 server 不會自己復活。踩過 2 次。
7. **Backend 永遠不開 `--watch`** — default 已避(`server` script 純 `bun run`),手動加會撞 self-dogfood AI merge:衝突寫進 `server/` 檔 → watch reload → 殺 spawn 出去的 claude child → merge 中斷。改 server code 要熱 reload 自己 ctrl+c 重啟。研究紀錄與 worktree 隔離方案見 [`refs/archive/merge-isolation-2026-05-11.md`](docs/refs/archive/merge-isolation-2026-05-11.md)。
8. **server 重啟會殺 spawn 的 claude child(running pipeline → recoverStale 標 paused)** — 改 server code 前先看有沒有 pipeline 在跑,否則 user 看到 pipeline 莫名暫停。recovery 自動標 paused 但 worktree 進度保留,user 按「繼續」會從 critic 階段接續(若 doer 已交,executor 不重派,省 token)。`bun run server` 是 no-watch default,改完要手動 kill + 重啟。
9. **vite 內部模組 map cache 卡 stale `.js` 副檔名**(已防再生,但 cache 偶發要清)— `tsconfig.json` 已 `noEmit:true` 防再生 `.js`,但若舊 cache 還在,vite 會把 import 解到 `.js` URL → 撞 SPA fallback HTML → board 空白。解:`rm -rf node_modules/.vite` 重啟 vite。
10. **跨 provider sub-agent 主 agent 永遠帶 `--dangerously-skip-permissions`** — claude 主 agent 派 codex sub-agent 時,sub-agent 內部 Bash 在 `defaultMode: auto` 下會被 permission_denials 擋(主 agent 還會幻覺成功訊息)。`orchestrator.ts` 改成主 agent 永遠帶 flag,不再條件式偵測 provider。
11. **新增 / 重命名 / 刪除 SKILL 或 rule 直接改本檔表** — claude 自動讀本檔;codex 走 [`AGENTS.md`](AGENTS.md) 指回本檔。SKILL routing SSOT 在 dir 表 SKILL 欄,rule routing SSOT 在「path-specific rules」表。AGENTS.md 純 pointer,改 SKILL / rule 都不必動 AGENTS.md。
12. **AI sync 成功判定靠 git 狀態,不靠 AI stdout firstLine** — `syncJob.ts:waitAndFinish` 第一版用 `stdout.split("\n")[0].startsWith("PASS")` 判成功,AI 常把 `PASS\nSYNC_DONE` 寫在中段(`tsc passed.\n\nPASS\nSYNC_DONE`),firstLine 不匹配 → 誤判失敗 → backend `git merge --abort`(merge 已 commit,abort 是 no-op)→ 最終 worktree 已同步但 UI 顯失敗。改用 git ground truth:`!MERGE_HEAD && !conflictMarkers && behindBaseCount===0` 三條都成立才 PASS。任何「AI 回傳成功訊號」型判定都要記得 backend 自己驗 git / 檔案系統實際狀態,別信 AI 自然語言。
13. **HTML `title` 屬性 `\n` 在 Chrome / Firefox 多數版本被當空白** — multi-line tooltip 擠成一行(Firefox 較新版本會換行)。要正規 multi-line hover 必須自寫 Tooltip component;當前 sync chip / drawer 等仍用 `title` 屬性接受這視覺差。
14. **QA forceChat 不能在送訊息時清** — race condition:user 送訊息瞬間清 forceChat,backend 處理中 frontend poll 看到 disk 上仍 `draft.complete=true`(舊狀態)→ SpecReview 又跳出。改 `viewOverride: 'chat' | 'review' | null` 雙向 sticky,user 用「→ 回最終預覽」按鈕主動切。對應 backend 也修兩處:claudeCli systemPrompt 加 reopen 規則(rule 6) + draftStore auto-complete 改成只在 `!wasComplete && reply.complete !== false && 5/5` 時 fire。
15. **Pause 路徑簡化 — 沒有 graceful、沒有 `stopping` 中介**(2026-05-17 拔)— 原本「按暫停 → state=stopping → runner 跑完當前 ticket → ack 標 paused」,user 按下停止就是想立刻停(燒錢 / 跑歪 / 改主意),等一張 ticket 跑完才停反直覺;graceful ack 也讓 prompt / state machine / UI 三層各養 stopping 分支,維護不對稱。改成 stop = SIGKILL child → state=paused(跟雷 #8 server 重啟標 paused 同語意,user 按「繼續」從 critic 階段接續)。**仍可能看到殘留 `stopping`** 的場景:升級前的舊 pipeline.json、或 server 在轉 paused 那瞬間 crash;`recoverStale` server boot 一併收掉,user 不需手動清。前端 / CLI 只有單顆「停止」,不再有 graceful 暫停按鈕。設計信條:**執行中操作信號 = 立即 + 冪等**,不讓 user 猜「按下去要等多久」。歷史 graceful 設計記錄在 [`refs/archive/integration-plan-v3-runner-2026-05-10.md`](docs/refs/archive/integration-plan-v3-runner-2026-05-10.md)(保留原貌)。
16. **self-dogfood pipeline 加新 npm dep 後 main repo node_modules 不會自動同步(已 mitigate)** — sub-agent 在 worktree `bun add` 裝的套件存 worktree `node_modules`,跟 main repo 不共享。merge 回 main 時 `package.json` + `bun.lock` 帶過來。**2026-05-18 backend merge handler 已加 `ensureDepsAfterMerge`**(`server/lib/depInstall.ts`):mechanical / AI 兩條 merge path 結束都 diff `mergeCommit^1..mergeCommit` 的 `package.json` deps keys + `bun.lock`,有變就同步跑 `bun install`(失敗 emit `pipeline_merge_cleanup_failed` notif,不阻斷 merge 成功)。例外:user 自己手動 `git merge` 不會觸發,得自己 `bun install`。

## 設計信條(改 code 前對齊)

跟「不踩的雷」(反面教材)對稱的正面原則 — 改 code / 設計新 feature 時對齊。只列**已實作**且**仍持續適用**的 5 條:

1. **單一定義源** — Ticket / Pipeline / SKILL 只在 YAML / pipeline.json 一份;runtime state 是 cache。改一份能溯源到 source,不在 N 個地方各記一份各自漂走
2. **Branch 是並行邊界** — 多 pipeline 平行靠 `git branch` + 獨立 worktree 隔離,**不靠 process lock / 不靠 mutex**。git 已是 mature 的並行語意,複用比自己發明強
3. **人工 approve SKILL** — AI 永遠不直接寫 `SKILL.md`,只能 stage 候選 → user review → 人手 commit。SKILL 是行為手冊,被 AI 自己改會 drift
4. **跨 pipeline 不直傳 context** — pipeline A 學到的東西要影響 pipeline B,**走 SKILL 中介**(寫進 SKILL,B 自己讀),不要直接把 A 的 state 丟給 B 看。維持邊界乾淨
5. **Critic fail ≠ ticket fail** — Iter mode 內 critic 判 FAIL 是「下一輪繼續」的訊號,不是 ticket 死了。`failed_iter_limit` 才是死(N 輪 critic 都沒過)

> 註:原 spec 還有「exclusive lock 優先於並行」「無 max_iter 預設靠 stall detection」兩條;前者因目前沒 deploy / DB migration 這類資源沒實作,後者仍寫死 `iterLimit=5`。等 Phase 6 stall detection 落地後再恢復。
