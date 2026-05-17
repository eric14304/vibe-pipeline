# refs

設計文件 / 競品對照 / 歷史 spec。maintainer 用,enduser 不裝。新加 ref 寫進本資料夾 + Active 表加列;落地 / 不再參考時搬 `archive/`。

## Active(當前還參考)

| 檔 | 用途 |
|---|---|
| [`spec-2026-05-09.md`](spec-2026-05-09.md) | 完整 [M]/[P2]/[P3] 功能清單 |
| [`integration-plan-v3-runner-2026-05-10.md`](integration-plan-v3-runner-2026-05-10.md) | Phase 3 整段落地紀錄 + 待第五刀 |
| [`git-design-2026-05-09.md`](git-design-2026-05-09.md) | 多 pipeline 平行的 git worktree 設計 |
| [`state-matrix-2026-05-10.md`](state-matrix-2026-05-10.md) | Pipeline state × condition → UI behavior 決策表 |
| [`merge-isolation-2026-05-11.md`](merge-isolation-2026-05-11.md) | self-dogfood AI merge 撞 vite/bun watch 研究;結論不做 |
| [`claude-cli-spawn-perf-2026-05-11.md`](claude-cli-spawn-perf-2026-05-11.md) | claude CLI spawn 加速 — QA/split/runner 三處 flag 量測 |
| [`sync-redesign-2026-05-13.md`](sync-redesign-2026-05-13.md) | Sync 重構(Plan C)+「靠 git 判定不靠 AI stdout」雷 |
| [`skill-injection-2026-05-14.md`](skill-injection-2026-05-14.md) | 「引用重點 SKILL」設計 — pointer vs inline / 三來源 / plugin cache 雷 |
| [`worktree-env-2026-05-15.md`](worktree-env-2026-05-15.md) | `.worktreeinclude` 慣例 + merge 前 secret 洩漏偵測 |
| [`pause-simplify-2026-05-17.md`](pause-simplify-2026-05-17.md) | 拔 graceful pause,7 張 ticket 拆分 spec |
| [`pause-simplify-run-postmortem-2026-05-17.md`](pause-simplify-run-postmortem-2026-05-17.md) | 跑前 + 第一次 run 踩雷紀錄(8 個 bug,5 新發現) |
| [`fcm-push-gateway-2026-05-17.md`](fcm-push-gateway-2026-05-17.md) | FCM push 共用方案(maintainer host gateway) |
| [`vbpl-server-cmd-2026-05-17.md`](vbpl-server-cmd-2026-05-17.md) | `vbpl server start/stop/status/restart/logs` CLI 包裝 |
| [`repo-structure.md`](repo-structure.md) | Repo 物理檔案 / 目錄結構 single source of truth |

## Archive

`archive/` 下 — phase 1/2 計畫已落地。

`competitor-refs.md` 是 vibe-kanban / symphony / composio-ao 競品對照合集(設計初期一次性參考)。
