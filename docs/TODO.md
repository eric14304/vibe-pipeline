# TODO

Phase 8 候選清單。動工時搬進 pipeline ticket(`vbpl ticket add --pipeline 019e36fbea63-phase8`),完成或落地搬掉。

新項加底下,寫進對應 ref doc 後加 link。

## 已有規格(ref doc 完整,可直接拆 ticket)

### 1. FCM push gateway
- Ref:[`refs/fcm-push-gateway-2026-05-17.md`](refs/fcm-push-gateway-2026-05-17.md)
- Maintainer host gateway,enduser 不開 Firebase。動工時機:enduser 抱怨 Firebase setup 麻煩 / 做 hosted VP service 時

### 2. iOS PWA push 實測
- iOS 16.4+ 已支援 Web Push 但需先「加入主畫面」,目前只在 Android 驗過
- 沒獨立 ref(<1 條 ticket),動工時直接拆

### 3. Merge 前 secret 洩漏偵測
- Ref:[`refs/worktree-env-2026-05-15.md`](refs/worktree-env-2026-05-15.md)
- `.worktreeinclude` 慣例已落,merge 前 secret 偵測還規劃中

### 4. pause-simplify 8 個 follow-up bug
- Ref:[`refs/pause-simplify-run-postmortem-2026-05-17.md`](refs/pause-simplify-run-postmortem-2026-05-17.md)
- 已列 5 新發現 + follow-up pipeline 拆分建議,未拆 ticket

---

## Session 新痛點(規格待寫)

### 5. Backend self-heal / runner exit detection
- 痛點(2 種):
  - **A. backend wedged 但 port 還占**(撞過 PID 90740,3001 listening 卻 health timeout)
  - **B. runner 主 agent 自宣告完成、process tree 自殺,但 backend 沒收到 exit signal**,pipeline state 卡 "running"(phase8 run 撞過,要 user 手動 `vbpl pipeline stop` 才能重 run)
- 候選機制:
  - watchdog tick 探 PID alive + `/api/health` timeout → 死 → 自動清 running state
  - orchestrator spawn 結束時必有 cleanup callback,不靠 child 自殺
- 規格未寫;A 規模較小可先做(本 session phase8 補了部分:`vbpl server start/stop/status/restart/logs` 落地 + auto-ensure,但 self-heal 沒做 — YAGNI 等到真踩)

### 6. Mockup-driven pixel polish 機制
- 痛點:settings-pixel-polish + board-redesign + settings-full-redesign 三條 mockup-driven pipeline 都跑出低品質
  - settings-full-redesign(2226):整 popover scale ~1.5x,input 62px / icon 24px / 字 1.0625-1.375rem,實用時「各種元素都好大」
  - settings-pixel-polish(f1b1c19):雖對 mockup 但同放大問題,reverted(8bb47fb / 09af96d)
  - board-redesign:跑歪未 merge,刪
- 共通病:**AI 對 mockup 對齊時容易過度 scale + 失去既有 design language**;critic「對得到 mockup」但 critic 不看「跟其他 tab 是否一致」+「user 實用體感」,只看畫面像不像 PNG
- 觀察:critic 跟 mockup 對照只靠 ticket prompt ad-hoc,沒標準流程
- 候選方向:
  - critic 強制 Read mockup PNG → 列偏差 N 條
  - **加 critic 約束「跟既有 design token / sibling 元件對齊」,不只看 mockup PNG**
  - Vision provider routing(CC 對圖不行,該強制走 codex+playwright MCP 截圖)
  - iter 上限調高(目前 5)
  - **每 mockup pipeline merge 前要 enduser 手動驗收(不靠 critic PASS 直接 merge)**
- 規格待寫:`refs/mockup-driven-ticket.md`

### 7. Worktree staleness 警告 / auto-sync
- 痛點:worktree base 落後 main 太久 → script 不同步、package.json 衝突(踩過 settings-pixel-polish 落後 4 commits)
- 候選機制:`vbpl pipeline run` 前自動 sync / web UI ticket drawer 顯 staleness chip / 落後 N commits 阻擋 run
- 規格待寫:`refs/worktree-staleness.md`

### 8. Provider-task-fit 實測累積
- 痛點:CC 對 pixel UI 不行,codex 對 MCP 飄(mockup pipeline 兩 provider 都跑歪)
- 候選方向:`docs/refs/provider-task-fit.md` 累積實測:類型 × provider × model × 結果(成功/失敗 + 原因)
- 規格待寫,本質是經驗 log 不是 code change

### 9. Web UI 不該自動 fire `pipeline.run`(monitor only)
- 痛點:settings-pixel-polish audit log 記到兩次 `user_action pipeline.run`(00:21:58 + 01:23:41)而 user 確認沒按
- **2026-05-19 調查結論**:src/ 全 grep + backend internal caller / SW POST cache / fetch retry middleware 全排查,**找不到 auto-fire code path**(唯一 caller 是 RunButton onClick)。最一致解釋:user 自己按了忘記,或 vbpl CLI 從別處呼(以前 audit 無法區分 cli vs browser)
- **2026-05-19 已加 instrumentation**(`1526488`):audit user_action 加 `via` 欄(cli / browser / other),vbpl CLI 自帶 `User-Agent: vbpl-cli`,backend `detectVia(req)` 讀 UA 寫 audit
- 現狀:monitor only。下次再撞「user 沒按但 audit 抓到」直接看 audit `via` 欄秒判 source
- **真撞到**(via=browser 而 user 確定沒按)再開正式 ticket 深挖

### 10. `recoverStale` 標 `failed_transient` 太武斷
- 痛點:backend restart `recoverStale` 把 running ticket 直接標 `failed_transient`,但 orphaned codex children 可能仍活(server 重啟殺 spawn 雷 變體 — codex 是 detached process tree,bun parent 死了它沒死)
- 實證:settings-pixel-polish 01:39:07 backend restart 標 failed_transient,01:48:28 ticketWatcher 偵測 disk reconcile 救回(see audit timeline)
- 候選機制:`recoverStale` 先 PID alive check + `tail` log 看時間戳;真死才標 failed_transient
- 規格待寫,跟 #5 backend self-heal 同線

### 11. `ticketWatcher` disk reconcile 是 happy accident,該設計化
- 痛點:settings-pixel-polish 走 `runner-self-detected` (`ticketWatcher detected disk state change without backend write`)從 paused 自動回到 running → ready 完成,**完全靠 disk fs.watch reconcile 救場**
- 兩條路選一:
  - **a.** 設計化:正式接受 ticketWatcher 是 source-of-truth reconciler(從 disk 反推 backend memory state),文件化 + 確保 race safe
  - **b.** 反向:backend restart 必須先殺 orphaned codex children(detached process tree 也要 kill),不留靠 disk reconcile 救場的 path
- 規格待寫,跟 #10 一起決定

---

## 工作流

1. 想動哪項 → `vbpl ticket add --pipeline 019e36fbea63-phase8 --title "phase8: <X>" --mode iter --goal "..." --prompt "..."`
2. 規格未寫的(5-11)先寫 ref → 落 ticket
3. 完成搬掉本檔,合進 CHANGELOG / 雷區 / SKILL

---

## 已落地(搬離 active 清單)

- ~~vbpl server start/stop/status/restart/logs~~ — phase8 t1-t4 落地(d1ec87c,2026-05-19)
- ~~vbpl pipeline delete cascade~~ — phase8 t6 落地(d1ec87c)
- ~~RunHistory 加失敗原因 + ticket 進度 + codex 隱藏空欄~~ — phase8 t5 落地(d1ec87c)
- ~~runner 主 agent 每輪重讀 pipeline.json~~ — b096cc8 落地
