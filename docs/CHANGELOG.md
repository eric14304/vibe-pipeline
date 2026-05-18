# Changelog / 決策日誌

歷史紀錄 + 設計決策來源。CLAUDE.md 是「現狀規則」,本檔是「為何變成現狀 / 過去考慮過什麼」。

寫入規則:每次架構級改動或設計決策落地往**後 append** 日期分段(舊在上、新在下);CLAUDE.md 只更動 canonical reference 段。每個 bullet 一個概念,非顯而易見的 why 加一句。

---

## 2026-05-13(Phase 5 後續打磨)

- Sync 重構(Plan C):`Pipeline.syncJob` 寄生欄位取代舊 `mode=sync` ticket;git-first → 衝突才 AI
- `subAgent` 拆 `executor` + `critic`:critic 可挑便宜 model 省 token 5-10x;userConfig 自動 migrate
- Client-side folder browser:Tailscale 遠端開 project 走 `GET /api/projects/browse`,native picker 失效改瀏覽器內導覽
- `vbpl` CLI 落地:`cli/` 內 reuse `server/lib/*` 直存 fs(no HTTP),4 nouns + `--json` mode
- Auto-merge 二段式:先 `git merge --no-ff`(~90% clean case 毫秒級);撞衝突自動 fallback AI + FCM push
- Manual merge 對稱 git-first:`mergePipeline` 改先試 mechanical;response 加 `mode: "mechanical" | "ai"` discriminator
- CLI mutate 走 backend HTTP:`run / stop / merge / sync` 走 POST,避免 CLI 退出後 child 孤兒
- `Pipeline.createdAt`:取代 id 內嵌 hex timestamp 當排序依據(AI 手 craft 假 id 會排亂)
- `pipelineDir.init` 改 idempotent:partial 殘骸自動補齊;`.gitignore` 自動補 `pipelines/`
- UX 收斂:Pipeline 執行紀錄拆 OverflowMenu;CTA 三檔強度(`btn` / `btn-accent` / `btn-primary`)互斥
- 主 SKILL 重定位:從 maintainer doc 改成 enduser AI 操作手冊;refs 搬 `docs/refs/`,SKILL 變 distributable

---

## 2026-05-14

- `cost_limit_usd` enforcement 改 per-pipeline 累積:不再跨 pipeline 加總互擋
- Provider 鏈一致化:主 agent 是 X → sub-agent 跟著 X;executor / critic / merge 全 snap 成 `runner.provider`
- codex 主 runner 改 in-process `spawn_agent` pattern:需 `[features] multi_agent = true`;達到 claude-claude 同級 in-process 速度
- `coerceConfig` silent snap migration:讀 config 自動 snap provider 一致;PUT mismatch 擋掉
- Background push 真實 pipeline 事件觸發 e2e 驗證(vp-autotest `push-verify`)
- Push event per-type toggle:`pushEvents` 4 key(ticket_done / ticket_failed / pipeline_paused / auto_merge_conflict)
- `vbpl pipeline log --follow`:tail -f 模式,debug pipeline 卡 / 看 runner 進度
- runner prompt 重構:iter step 1 寫 partial round 修 elapsed 00:00 假象;dispatchProtocol 抽共通段 ~20KB→~17.6KB;砍 transient retry dead code
- Phase 6 候選大幅收斂:5 項評估後砍(個人 vibe 工具不需 / 邏輯矛盾 / free mitigation 已夠);剩 iOS PWA push 實測

---

## 2026-05-17

- PWA Workbox 整合(`pwa-workbox`):vite-plugin-pwa injectManifest 跟 firebase-messaging-sw.js 合併為單一 SW;precache(9 entries / ~640 KiB)+ runtime cache(`/api/*` SWR / Google Fonts / Navigation fallback)。dev mode 不註冊 SW,要 `bun run build && bun run preview` 才驗
- PWA `registerType: autoUpdate → prompt`(`pwa-update-prompt`):原 autoUpdate 體感像突然 refresh;改 prompt + `<SwUpdateBanner>` 等 user 主動點才 reload
- Pause 路徑簡化:`stopping` 中介 state 全拔,stop = SIGKILL → paused immediate。動機:按停止就想立刻停,等 ticket 跑完反直覺;graceful 三層分支維護不對稱。設計信條「執行中操作信號 = 立即 + 冪等」

---

## 2026-05-18

- `ensureDepsAfterMerge`:merge 後 diff `package.json` deps + `bun.lock`,變動就 `bun install`(失敗 emit notif 不阻斷)。背景:self-dogfood pipeline 加新 dep merge 回 main 後撞「Cannot find package」
- `bun run start` enduser script vs `dev` maintainer script 拆;`sub:*` script +100 port(5273 / 3101 / 4273)給 sub-agent 自起 stack
- CLAUDE.md 瘦身 285→89 行:物理 tree 抽 `repo-structure.md`(SSOT);refs 表抽 `refs/README.md`;手機遠端段刪指 README
- `docs/TODO.md` 落地 + Phase 8 pipeline `019e36fbea63-phase8` 開:14 項候選收一處
- Settings full-redesign + pixel-polish 全 revert(`8bb47fb` / `09af96d` / `24dcf5c`);backup branch `backup/settings-pixel-polish-pre-revert` 保留。reason:redesign 後元素全放大 ~1.5x,實用時「各種元素都好大」+「兩 tab 樣式不一致」。經驗:**mockup-driven AI polish 容易過度 scale + 失去既有 design language**,critic 不會抓
- Frontend toast → Inbox emit 拔:BoardScreen 只走 `setActionError`(5s toast),不再 `postNotif`。reason:user 反問「前端動作不該進 Inbox」
- 文件 / SKILL 結構重整:跨檔「雷 #N」brittle 引用改 §descriptive anchor(13 處);AGENTS.md 砍到 9 行純 pointer(SSOT 回 CLAUDE.md dir 表);`.claude/rules/` 新增 path-specific 規則檔(pwa-sw / remote-access / cli-codex);`docs/refs/` active 14 → 5 個 + archive 6 → 17;CHANGELOG 精煉收斂 + 結構整理(已 final / 計畫 ref 段上移到日期 entries 前)

---

## 2026-05-19

- `vbpl server` 系列落地:enduser / AI 以 `vbpl server start|status|logs|restart|stop` 管 backend,不再要求記 `bun run server` 或留 terminal 掛著
- CLI mutating commands auto-start backend:`pipeline run|stop|merge|sync` 透過 local start lock 防 race,同時兩個 CLI 只會 spawn 一個 backend
- Windows detach 驗證補齊:`Bun.spawn(..., detached:true, stdio:file, windowsHide:true)` 關 terminal 不帶死 backend;避免 Node #36808 / `fork` 類 IPC detach 雷
- Backend access log 加上 `[access] METHOD /api/... STATUS Nms`,讓 `vbpl server logs -f` 可直接驗證 live request tail
- README / enduser SKILL / install.md 改成 `vbpl server start` 主軸;`bun run server|dev|start` 收斂為 maintainer source-workflow 備註
- `vbpl pipeline delete` cascade(phase8 t6):一條指令清 worktree dir + git branch + pipeline.json;running / queued state 拒絕(STATE_GUARD「先 stop」);`--force` 跳 confirm prompt
- `RunHistory` 加失敗原因 + ticket 進度 diff + codex 條件隱藏空欄(phase8 t5):runner exit 寫 `failureReason` / `ticketsBefore` / `ticketsAfter`;codex run 不顯成本/回合/Tokens(本來就無資料,避免「—」雜訊)
- Runner 主迴圈強制每輪重讀 pipeline.json(`b096cc8`):codex 主 agent 偷懶用 context cache 跳過 disk re-read,實測 user 跑中加 ticket 看不到 → 跑完自宣告完成。prompt 強硬語氣明標「絕對不准用 context tickets 記憶」
- `refactor` pipeline merge(`6118f02`):**CSS dead code 清理**(`src/styles + features/**/*.css` scope 鎖死,t1);**SW `/api/*` GET 改 `NetworkOnly`**(去 polling flicker,t2);activate handler `caches.delete("api-cache")` 清舊 cache;dist 651→636 KiB
- Audit log `user_action` 加 `via` 欄(`1526488`):cli / browser / other 三值;vbpl CLI fetch 自帶 `User-Agent: vbpl-cli`,backend `detectVia(req)` 讀 UA 寫 audit。debug 「mystery run」(audit 抓到但 user 沒按)時可秒判 source
- `vbpl` binary 統一放 `~/.vibe-pipeline/bin/vbpl.exe`(對齊 pyenv / cargo / nvm「per-tool dir」慣例);舊 `~/bin` / `/usr/local/bin` install path 從文檔 / PATH 拔
- `/acp`(add+commit+push)+ `/doc`(文件整理)slash commands 落地;`/acp` global,VP 慣例(中文 subject + Co-Authored-By 動態 model 名)
- Pipeline `019e3c96c5df-refactor`、`019e36fbea63-phase8`(全 6 ticket)merge 進 main
- **FCM push gateway MVP 落地**(`019e3d04e68a-fcm-gateway` t1-t5):maintainer host 集中 service account key,enduser 不必開 Firebase。Cloud Run asia-east1(`https://vp-gateway-799841449136.asia-east1.run.app`)+ Firestore per-token registry(multi-tenant)+ max-instances=1 service-level cap + $1/mo budget alert(abuse / runaway 雙保險)。gateway source 在 `gateway/`(~500 行 Bun service),admin CLI `vp-gw-admin` 發 / revoke / list token。設計 ref → [`refs/archive/fcm-push-gateway-2026-05-17.md`](refs/archive/fcm-push-gateway-2026-05-17.md)
- **Backend 拔 `firebase-admin`** 改 POST gateway(hard cutover,無 fallback):`server/lib/push/tokenStore.ts` 改成轉發 register / unregister;`server/lib/fcm/index.ts` `fanoutPush` 改 `fetch(gateway/push/send, Bearer token)`;沒填 `PUSH_GATEWAY_URL` / `PUSH_GATEWAY_TOKEN` 時 no-op(backend 啟動正常,只是不推)。enduser `.env.example` push 段精簡為 gateway URL + bearer token + 純 public Firebase Web SDK config
- 文件 / SKILL / rule 收尾:README 加 §Push 通知 setup 段;install.md 補 push 段;TODO #1 搬「已落地」;refs/README 對應移動;`.claude/rules/remote-access.md` push 段更新;backend SKILL Push subsection 重寫
