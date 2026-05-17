# vbpl server start/stop/status/restart/logs(2026-05-17,規劃中,未動工)

## 為什麼

enduser 啟 backend 要記 `bun run server`,還要在 vibe-pipeline repo cwd 跑。SKILL.md 內提的也是 bun run 路線。CLI 該包這層,讓 enduser 不必懂 bun / repo path:

```bash
vbpl server start            # 起 backend(背景)
vbpl server status           # 看活著沒
vbpl server stop             # kill
vbpl server restart
vbpl server logs [-f]
```

## 設計

### 子命令

| verb | 行為 |
|---|---|
| `start` | spawn backend 背景,寫 `~/.vibe-pipeline/server.pid` + `~/.vibe-pipeline/server.log` |
| `stop` | 讀 pid file kill;清 pid |
| `status` | health check `/api/health` + 報 PID + uptime |
| `restart` | stop + start |
| `logs` | tail server.log;`-f` follow mode |

### 關鍵實作

| 點 | 解法 |
|---|---|
| 知道 vibe-pipeline repo 在哪 | install 時記 `~/.vibe-pipeline/install.json` 含 `repo_path`;或 env `VBPL_HOME`;或 auto-detect from `vbpl` binary symlink |
| 跨平台 background spawn | `Bun.spawn([..], { cwd, stdio: file, detached:true })`;Windows `windowsHide:true` |
| port 已占 | 起前 fetch `/api/health` 回 200 → already running,不重啟 |
| PID file 殘留(process 死了 pid 還在) | `process.kill(pid, 0)` 探活,死的清 pid 重 spawn |
| Windows / POSIX detach 差異 | Bun.spawn detached 內部處理,extra:Windows `start /B`,POSIX `setsid`(若 Bun 不夠) |
| log rotation | start 時 append-only 寫 server.log;不做 rotation(maintainer 自己清,或 phase 6+) |

### `~/.vibe-pipeline/install.json` 結構

```json
{
  "repo_path": "/Users/eric/dev/vibe-pipeline",
  "vbpl_version": "0.5.0",
  "installed_at": 1779000000000
}
```

由 install script 寫(或第一次 `vbpl server start` 時 prompt user 一次填)。

## 改動範圍

| 檔 | 改動 |
|---|---|
| `cli/commands/server.ts` 新 | ~120 行(5 verb + pid / log file 管理) |
| `cli/vbpl.ts` | dispatch 加 `server` noun,~5 行 |
| `cli/lib/installInfo.ts` 新 | read `~/.vibe-pipeline/install.json` + env / symlink fallback,~30 行 |
| `cli/commands/project.ts` 等 | 若有 hardcode backend URL 改走 helper 拿 |
| install.md | 加「`vbpl server start` 起 backend」說明 |
| README.md / SKILL.md | 「啟動 backend / Web UI」段改成 `vbpl server start`(對齊) |

## Acceptance(動工時)

- `vbpl server start` 起 backend 背景,terminal 不阻塞
- `vbpl server status` 對 alive / dead 兩種 case 都明確
- `vbpl server stop` 真 kill(`/api/health` 不再回)
- `vbpl server logs -f` 即時 tail
- Windows + macOS + Linux 各驗一次
- SKILL.md 對應段改成 `vbpl server start`

## 不在現 scope

- 短期沿用 `bun run server`(README + SKILL 已寫)
- 動工時機:enduser binary distribution 流程成熟後 / install.json 機制就緒一起做
- 動工前要先想:install.json 怎麼寫(install script 還是第一次 prompt)、Windows detach edge case
