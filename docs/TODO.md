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

### 4. SKILL 引用重點
- Ref:[`refs/skill-injection-2026-05-14.md`](refs/skill-injection-2026-05-14.md)
- 規格中,未定項清單未收(pointer vs inline / 三來源 / 不拆 per-AI / plugin cache 雷)

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
- 痛點:settings-pixel-polish + board-redesign 兩條 mockup-driven pipeline 都跑出低品質
- 觀察:critic 跟 mockup 對照只靠 ticket prompt ad-hoc,沒標準流程
- 候選方向:critic 強制 Read mockup PNG → 列偏差 N 條 / Vision provider routing(CC 對圖不行,該強制走 codex+playwright MCP 截圖) / iter 上限調高(目前 5)
- 規格待寫:`refs/mockup-driven-ticket.md`

### 10. Worktree staleness 警告 / auto-sync
- 痛點:worktree base 落後 main 太久 → script 不同步、package.json 衝突(剛踩過 settings-pixel-polish 落後 4 commits)
- 候選機制:`vbpl pipeline run` 前自動 sync / web UI ticket drawer 顯 staleness chip / 落後 N commits 阻擋 run
- 規格待寫:`refs/worktree-staleness.md`

### 11. Provider-task-fit 實測累積
- 痛點:CC 對 pixel UI 不行,codex 對 MCP 飄(mockup pipeline 兩 provider 都跑歪)
- 候選方向:`docs/refs/provider-task-fit.md` 累積實測:類型 × provider × model × 結果(成功/失敗 + 原因)
- 規格待寫,本質是經驗 log 不是 code change

---

## 工作流

1. 想動哪項 → `vbpl ticket add --pipeline 019e36fbea63-phase8 --title "phase8: <X>" --mode iter --goal "..." --prompt "..."`
2. 規格未寫的(7-11)先寫 ref → 落 ticket
3. 完成搬掉本檔,合進 CHANGELOG / 雷區 / SKILL
