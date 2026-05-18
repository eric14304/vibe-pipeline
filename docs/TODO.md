# TODO

Phase 8 候選清單。動工時搬進 pipeline ticket(`vbpl ticket add --pipeline 019e36fbea63-phase8`),完成或落地搬掉。

新項加底下,寫進對應 ref doc 後加 link。

## 已有規格(ref doc 完整,可直接拆 ticket)

### 1. FCM push gateway
- Ref:[`refs/fcm-push-gateway-2026-05-17.md`](refs/fcm-push-gateway-2026-05-17.md)
- Maintainer host gateway,enduser 不開 Firebase。動工時機:enduser 抱怨 Firebase setup 麻煩 / 做 hosted VP service 時

### 2. `vbpl server start/stop/status/restart/logs`
- Ref:[`refs/vbpl-server-cmd-2026-05-17.md`](refs/vbpl-server-cmd-2026-05-17.md)
- enduser 不必懂 `bun run server` + repo cwd。`bun run start` 是過渡,目標是 CLI 包這層
- 動工前先想:install.json 怎麼寫 + Windows detach edge case

### 3. iOS PWA push 實測
- iOS 16.4+ 已支援 Web Push 但需先「加入主畫面」,目前只在 Android 驗過
- 沒獨立 ref(<1 條 ticket),動工時直接拆

### 5. Merge 前 secret 洩漏偵測
- Ref:[`refs/worktree-env-2026-05-15.md`](refs/worktree-env-2026-05-15.md)
- `.worktreeinclude` 慣例已落,merge 前 secret 偵測還規劃中

### 6. pause-simplify 8 個 follow-up bug
- Ref:[`refs/pause-simplify-run-postmortem-2026-05-17.md`](refs/pause-simplify-run-postmortem-2026-05-17.md)
- 已列 5 新發現 + follow-up pipeline 拆分建議,未拆 ticket

---

## Session 新痛點(規格待寫)

### 7. Backend self-heal / health watchdog
- 痛點:backend wedged 但 port 還占(撞過 PID 90740,3001 listening 卻 health timeout)
- 規格未寫;跟 #2 `vbpl server` 一起做更省
- 候選機制:外部 watchdog(`vbpl server` 監)、internal health endpoint timeout、`bun run start` 偵測 stuck 自殺重起

### 8. `vbpl pipeline delete` 一併清 worktree+branch
- 痛點:pipeline 從 state 消失但 worktree dir + branch 殘留(撞過 board-redesign)
- 規模 ~30 行(cli + backend)
- 動工:`cli/commands/pipeline.ts` delete handler 加 `worktree.removeQuiet` + `git branch -D pipeline/<name>`

### 9. Mockup-driven pixel polish 機制
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

### 10. Worktree staleness 警告 / auto-sync
- 痛點:worktree base 落後 main 太久 → script 不同步、package.json 衝突(剛踩過 settings-pixel-polish 落後 4 commits)
- 候選機制:`vbpl pipeline run` 前自動 sync / web UI ticket drawer 顯 staleness chip / 落後 N commits 阻擋 run
- 規格待寫:`refs/worktree-staleness.md`

### 11. Provider-task-fit 實測累積
- 痛點:CC 對 pixel UI 不行,codex 對 MCP 飄(mockup pipeline 兩 provider 都跑歪)
- 候選方向:`docs/refs/provider-task-fit.md` 累積實測:類型 × provider × model × 結果(成功/失敗 + 原因)
- 規格待寫,本質是經驗 log 不是 code change

### 12. Web UI 不該自動 fire `pipeline.run`(audit 抓到)
- 痛點:settings-pixel-polish audit log 記到兩次 `user_action pipeline.run`(00:21:58 + 01:23:41)而 user 確認沒按。HTTP 是 spawnDirect 進來的,代表 web UI 某條 path 自動觸發
- 候選嫌疑:SWR retry / settings-popover 某個 polling / notification action / browser tab background fetch
- 規格待寫:`refs/auto-run-bug.md`(先 instrument fetch caller stack,抓到再寫 fix)
- 風險:user 預期 paused 不會自己跑 → 違反設計信條「pipeline state 由 user 控制」+ 燒 token 莫名其妙

### 13. `recoverStale` 標 `failed_transient` 太武斷
- 痛點:backend restart `recoverStale` 把 running ticket 直接標 `failed_transient`,但 orphaned codex children 可能仍活(雷 #7 / #8 變體 — codex 是 detached process tree,bun parent 死了它沒死)
- 實證:settings-pixel-polish 01:39:07 backend restart 標 failed_transient,01:48:28 ticketWatcher 偵測 disk reconcile 救回(see audit timeline)
- 候選機制:`recoverStale` 先 PID alive check + `tail` log 看時間戳;真死才標 failed_transient
- 規格待寫,跟 #7 backend self-heal 同線

### 14. `ticketWatcher` disk reconcile 是 happy accident,該設計化
- 痛點:settings-pixel-polish 走 `runner-self-detected` (`ticketWatcher detected disk state change without backend write`)從 paused 自動回到 running → ready 完成,**完全靠 disk fs.watch reconcile 救場**
- 兩條路選一:
  - **a.** 設計化:正式接受 ticketWatcher 是 source-of-truth reconciler(從 disk 反推 backend memory state),文件化 + 確保 race safe
  - **b.** 反向:backend restart 必須先殺 orphaned codex children(detached process tree 也要 kill),不留靠 disk reconcile 救場的 path
- 規格待寫,跟 #13 一起決定

---

## 工作流

1. 想動哪項 → `vbpl ticket add --pipeline 019e36fbea63-phase8 --title "phase8: <X>" --mode iter --goal "..." --prompt "..."`
2. 規格未寫的(7-14)先寫 ref → 落 ticket
3. 完成搬掉本檔,合進 CHANGELOG / 雷區 / SKILL
