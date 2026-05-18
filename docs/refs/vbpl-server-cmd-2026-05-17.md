# vbpl server start/stop/status/restart/logs(2026-05-19 落地)

## 為什麼

enduser / AI 不應該記 `bun run server`,也不該被要求在 vibe-pipeline repo cwd 留一個 terminal 掛著。CLI 包住 backend lifecycle:

```bash
vbpl server start            # 起 backend(背景)
vbpl server status           # 看 health / PID / uptime
vbpl server stop             # kill managed backend
vbpl server restart
vbpl server logs [-f]
```

`vbpl pipeline run|stop|merge|sync` 也會 auto-detect + auto-start local backend,讓 enduser 流程不必先手動起 server。

## 已落地設計

### 子命令

| verb | 行為 |
|---|---|
| `start` | 背景 spawn backend,寫 `~/.vibe-pipeline/server.pid` + `server.log` + `server.json` |
| `stop` | 只 kill `vbpl server start` 管理、且 health pid/repo_path 對得上的 backend |
| `status` | health check `/api/health`,報 `up/down/unresponsive` + PID + uptime |
| `restart` | stop + start;PID 會換新,health 重新通 |
| `logs` | dump `server.log`;`-f` follow mode |

### Repo path auto-detect

`install.json` prompt 流程 **OBSOLETE**。最後採用零互動 auto-detect:

1. `VBPL_HOME` 明確指定 vibe-pipeline repo(給 binary 從任何 cwd 執行)
2. 從目前 cwd 往上找 `.git` + `package.json.name === "vibe-pipeline"`
3. 讀已記錄的 `~/.vibe-pipeline/server.json.repo_path`
4. 都找不到才回 `NO_SERVER_REPO`,請 user 設 `VBPL_HOME` 或 cd 進 VP repo

原本規劃的 `~/.vibe-pipeline/install.json`:

```json
{
  "repo_path": "/Users/eric/dev/vibe-pipeline",
  "vbpl_version": "0.5.0",
  "installed_at": 1779000000000
}
```

已不採用;不需要 install script / first-run prompt。

### 關鍵實作

| 點 | 解法 |
|---|---|
| 跨平台 background spawn | `Bun.spawn(["bun","run","server/index.ts"], { cwd, stdio:file, detached:true, windowsHide:true })` |
| Windows detach | spawn + detached + file stdio;不用 `fork` / IPC,避開 Node #36808 類 Windows terminal 關閉帶死 child 問題 |
| port 已占 | 起前 fetch `/api/health`;若 pid/repo_path 對不上,回 `PORT_IN_USE` 不接管 |
| PID file 殘留 | `status` / `stop` 清 stale pid;health pid/repo_path mismatch 不亂 kill |
| race auto-start | `server.start.lock` (`open wx`) 包住 auto-start;同時兩個 CLI 只會一個拿鎖 spawn,另一個等 health |
| access log | backend 印 `[access] METHOD /api/... STATUS Nms`,給 `server logs -f` live 驗 |
| log | append-only `server.log`;`logs -f` 用 fs watch + incremental read |

## 改動範圍

| 檔 | 改動 |
|---|---|
| `cli/commands/server.ts` | 5 verb + pid / log / health / restart / follow 管理 |
| `cli/vbpl.ts` | dispatch 加 `server` noun |
| `cli/lib/serverPath.ts` | repo path auto-detect + server pid/log/json path |
| `cli/lib/ensureBackend.ts` | mutating command auto-start + race lock |
| `cli/lib/serverBase.ts` | local API base / port helper |
| `README.md` / `docs/vibe-pipeline/SKILL.md` / `docs/vibe-pipeline/install.md` | enduser 文件改 `vbpl server start` 主軸 |

## Acceptance(2026-05-19 Windows host)

- `vbpl server start` 5s 內 health 通
- `vbpl server status` 回 up
- `vbpl server logs -f` 可即時看到 backend access log
- `vbpl server restart` PID 換新,health 重新通
- 關 terminal 後 backend 不死(detach 有效)
- `vbpl server stop` 後 health 不回
- 同時跑 `vbpl pipeline run XX` + `vbpl pipeline list` 只 spawn 一個 backend

## 不在 scope

- macOS / Linux 真機驗證(phase 6+ 或 user host 補)
- watchdog(YAGNI,不做)
