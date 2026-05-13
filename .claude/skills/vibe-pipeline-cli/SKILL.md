---
name: vibe-pipeline-cli
description: vbpl CLI — vibe-pipeline 本地命令列操作介面(改 / 加 / 看 project / pipeline / ticket / config),不開瀏覽器就能管 pipeline。改 cli/ 內任何檔前先讀本 SKILL。
---

# vibe-pipeline-cli

`vbpl` 是 vibe-pipeline 的本地 CLI,等同瀏覽器 UI 的 cmdline 版,給 user 不開 browser 也能管 project / pipeline / ticket / config。**核心設計**:reuse `server/lib/*` modules 直接讀寫 fs,**不走 HTTP**(沒 backend 起也能用)。

## 物理結構(摘要,完整在 root [CLAUDE.md](../../../CLAUDE.md) § Repo 內)

```
cli/
├── vbpl.ts             entry point — parseArgs + dispatch noun → commands/*
├── commands/
│   ├── project.ts      list / show / add / remove
│   ├── pipeline.ts     list / create / show / delete / run / stop / status / log
│   ├── ticket.ts       list / show / add / update / remove
│   └── config.ts       list / get / set(user-level config.json)
└── lib/
    ├── args.ts         極簡 flag / positional 解析,不依賴 commander 等套件
    ├── output.ts       ok / fail / print / table 統一輸出(human + --json 兩模式切)
    └── project.ts      resolveProject(--project hash / --project-path / state.json lastProject 三層 fallback)
```

`package.json` 對應 `bun run vbpl` → `bun run cli/vbpl.ts`。

## 設計信條

### 1. Read 直 fs,mutate spawn / kill 走 HTTP(2026-05-13 拆分)

**Read 操作**(list / show / status / log / config get):直接 `import * as pipelineDir from "../../server/lib/pipelineDir"` 然後 `pipelineDir.readPipeline(path, id)`。理由:
- backend server 沒起也能用 CLI(state.json / pipeline.json 都在 fs)
- 沒網路 round-trip,本地操作毫秒級
- 共享同套驗證 / 寫盤邏輯,行為一致

**Mutate 純 fs 操作**(project add / remove / pipeline create / delete / ticket add/update/remove / config set):也直存 fs(沒 spawn child process,純寫 json)。

**Spawn / kill 子程操作**(`vbpl pipeline run / stop / merge / sync --ai / sync --cancel`):**必須走 HTTP POST 給 backend**。透過 `cli/lib/api.ts:post()` 包好的 `requireBackend()` health check + fetch。

為什麼:CLI 自己 spawn child 會在 CLI process 退出時失去 child 控制權(orchestrator running map 蒸發,watchdog / pause / stop 全失效,實測 Windows 上 child 也常被當孤兒 GC)。改成 backend 養 child:CLI 死了 backend 還活著,child 仍可被監控、kill、cleanup。

- 環境變數 `VBPL_API_BASE` 覆寫 default `http://127.0.0.1:3001`
- backend 沒起 → `fail("NO_BACKEND", "先跑 bun run server")` 而非靜默 spawn 孤兒

代價:CLI 跟 backend lib 強耦合,改 `server/lib/*` 的 export 介面要記得 CLI 也用;新增 mutate verb 要決定走 fs 還是 HTTP(原則:有沒有 spawn 或 kill child process)。**改 server/lib 前 grep `from "../../server/lib"` 確認 CLI 是否吃到**。

### 2. --json mode 為機器可讀,human mode 為 user 友善

每個 command 都吃 `--json`(可放任意位置):
- human mode:print 表格 / 條列 / 自然語句
- json mode:**只**輸出 `{"ok": true, "data": ...}` 或 `{"ok": false, "error": {"code", "message"}}` 單一 JSON object(stdout 結尾 `\n`),其他 print 一律 no-op

所有輸出走 `lib/output.ts` 三入口:
- `ok(data)` — JSON mode 才印(human mode 由 caller 自己 print)
- `okJson(data)` — 強制 JSON 輸出(list 等場景兩 mode 都需要)
- `fail(code, message, exitCode=1)` — never return,直接 process.exit。JSON mode 印 stderr-friendly JSON 到 stdout,human mode 印紅字到 stderr

不要在 command 內手刻 `console.log` / `console.error`,**全走 output 模組**。

### 3. Error code 對齊 backend 慣例

`fail()` 第一個參數是大寫 SCREAMING_SNAKE code:
- `INVALID_ARGS` — 參數不齊 / 格式錯
- `NO_PROJECT` — resolveProject 找不到
- `NO_BACKEND` — `requireBackend()` health check 失敗(spawn / kill verb 需 backend up)
- `NOT_INITIALIZED` — `.vibe-pipeline/` 不存在
- `NOT_FOUND` — pipeline / ticket id 不存在
- `STATE_GUARD` — operation 不允許在當前 state(e.g. pipeline 已 merged 不准 run)
- `IO_ERROR` — fs / spawn / fetch 失敗 fallback

新加 command 用既有 code,不夠才加新的(也在這 SKILL 補一行)。

### 4. Project resolution 三層 fallback

`resolveProject(flags)` 解析:
1. `--project-path <abs>` → 用該 path 算 hash
2. `--project <hash>` → projectStore.findByHash(hash)
3. 都沒 → `projectStore.getLastProject()`(state.json 內 lastProject)

三層都解不到才 `fail("NO_PROJECT", ...)`。新 command 一律呼這個,**不要自己再寫 project 解析**。

## Noun × verb 矩陣

| noun | verbs(粗體 = 走 HTTP,其餘 fs) |
|---|---|
| `project` | list / show / add `<path>` / remove `<hash>` |
| `pipeline` | list / create / show / delete / **run / stop / merge / sync --ai / sync --cancel** / sync (default) / sync --dismiss / status / log |
| `ticket` | list / show `<id>` / add / update / remove,**全部要 `--pipeline <id>`** |
| `config` | list / get `<key>` / set `<key> <value>`(user-level `~/.vibe-pipeline/config.json`) |

走 HTTP 的 5 個 verb 需要 backend up,沒起會回 `NO_BACKEND` error。其餘 fs 路徑沒 backend 也能用。

`pipeline log` 走 `runLog.listRuns` + `getRun`(同 RunHistory drawer 後端,fs)。
`pipeline run` 走 `POST /api/.../run` → backend 內 `orchestrator.start(...)` spawn child → backend 養 child 不會孤兒。
`pipeline merge` 走 `POST /api/.../merge` → backend 二段式(autoMergeNoAI → conflict 才 AI),response `mode: "mechanical" | "ai"` 分流訊息(mechanical 直印 commit hash;ai 印 ticketId + 提示 watch log)。
`pipeline create` 沒帶 `--auto-merge` flag 時 fallback 讀 project config `defaults.auto_merge`(對齊 web UI)。

## 不踩的雷

1. **不在 CLI 起 server / 監聽 port** — CLI 是 one-shot 工具,跑完 process exit。要長跑(watch)走 web UI / 別的工具
2. **不直接動 `~/.vibe-pipeline/state.json`** — 透過 `projectStore.open(path)` / `projectStore.remove(hash)`,讓 backend 維持 atomic write 慣例
3. **改完 `.vibe-pipeline/pipelines/*.json` 不通知 frontend** — CLI 是 sidechannel;若 user 同時開 web,frontend 5s polling 才會看到。建議 CLI 文案用 `Tip: refresh web UI to see changes` 之類提示
4. **`--json` mode 嚴禁 print 任何非 JSON 字串到 stdout** — 否則 caller `JSON.parse(stdout)` 會炸。Debug 要走 stderr 或丟 env `DEBUG=1`
5. **跨平台 path** — 用 `node:path` 的 `resolve` / `join`,不要拼 `\\` 或 `/`;Windows / POSIX 都吃
6. **`pipeline run` 不等 runner 完成** — orchestrator.start spawn 後立刻返回,CLI 跟著 exit;真實狀態看 `pipeline status` / `pipeline log`。**不要加 `await proc.exited`**,會卡住 user terminal 半小時

## 加新 command 的 checklist

1. 在對應 `commands/<noun>.ts` 的 switch 加 case
2. 該 case 函式:
   - 第一行 `const proj = await resolveProject(args.flags)`
   - 若操作 pipeline 內容 → `await requireInit(proj.path)`
   - 參數驗證 → `fail("INVALID_ARGS", ...)`
   - 業務邏輯 → 呼 `server/lib/*` 既有函式
   - 輸出 → `if (isJsonMode()) okJson(data); else printLines([table(rows)])`
3. 更新 `vbpl.ts` 的 USAGE 字串
4. 若新 noun → 在 vbpl.ts switch 加分支 + 開新 `commands/<noun>.ts`
5. 不寫單元測試(CLI 本身是 thin wrapper,coverage 在 backend lib);**改 lib 才寫 backend test**

## 開工前

- 改 `server/lib/projectStore` / `pipelineDir` / `runner/orchestrator` 等 → CLI 同樣會吃到,grep `from "../../server/lib"` 看影響面
- 預期 `--json` 行為 → 跑 `bun run vbpl <noun> <verb> --json | jq .` 驗
- 跨平台:Windows / macOS / Linux 都該過,path / spawn 都要小心(`node:path` + Bun.spawn array form)

## 打包成 binary(2026-05-13 落地)

`bun build --compile --minify` 把 CLI + Bun runtime + 全 deps 打成單檔 executable。三個 script 在 package.json:

```
bun run cli:build         # Windows x64    → dist-cli/vbpl.exe(~121 MB)
bun run cli:build:mac     # macOS arm64    → dist-cli/vbpl-mac
bun run cli:build:linux   # Linux x64      → dist-cli/vbpl-linux
```

`dist-cli/` 已 gitignore。要散發給其他人:跑 build → 把 binary 複製到對方 PATH 上,然後**確認 PATH 有那個資料夾**(關鍵且常被忽略)。

### Install to PATH(per OS)

**macOS / Linux**:
```bash
mkdir -p ~/bin
cp dist-cli/vbpl-mac ~/bin/vbpl   # 或 vbpl-linux,複製時改名 vbpl
chmod +x ~/bin/vbpl
# 加進 PATH(.zshrc / .bashrc 看 shell;通常 macOS 用 zshrc)
echo 'export PATH="$HOME/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
which vbpl   # 驗:/Users/<u>/bin/vbpl
```

`/usr/local/bin/`(預設已在 PATH)是另一選:`sudo cp dist-cli/vbpl-mac /usr/local/bin/vbpl` 一行搞定,免改 shell rc。

**Windows(PowerShell,推薦)**:
```powershell
New-Item -ItemType Directory -Force "$HOME\bin"
Copy-Item dist-cli\vbpl.exe "$HOME\bin\vbpl.exe"
# 加進 user PATH(永久,不影響 system)
$user = [Environment]::GetEnvironmentVariable("Path", "User")
[Environment]::SetEnvironmentVariable("Path", "$HOME\bin;$user", "User")
# 開新 terminal 驗:where.exe vbpl
```

**Windows(Git Bash)**:
```bash
mkdir -p ~/bin
cp dist-cli/vbpl.exe ~/bin/
echo 'export PATH="$HOME/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
which vbpl   # 驗:/c/Users/<u>/bin/vbpl
```

Git Bash 的 `~/bin` 對應 Windows `C:\Users\<u>\bin\`;若 user 想 PowerShell 跟 Git Bash 都用同個 binary,只要設一次 Windows user PATH 兩邊都吃(Git Bash 繼承 Windows PATH)。

**驗證 install**:`vbpl --version` 或 `vbpl project list`。若回 command not found → PATH 沒生效,要開新 terminal session 或 source rc。

### Trouble

- **`vbpl: command not found` 在新 terminal**:user 設了 PATH 但沒重開 shell。叫他 source rc 或開新 terminal
- **Windows `vbpl` 找不到但 `vbpl.exe` 找得到**:PowerShell 預設要 `.exe`,加 `[Environment]` PATHEXT 或叫 user 顯式打 `vbpl.exe`
- **macOS quarantine**(下載 binary 而非自己 build)`xattr -d com.apple.quarantine ~/bin/vbpl`
- **多版本衝突**:`which vbpl` 看實際路徑,可能舊 binary 在 `/usr/local/bin/` 蓋過 `~/bin/`

注意:binary 大(~121 MB)因為 bundle 整個 Bun runtime。若要更小看 `--target=bun-windows-x64-baseline` 等 baseline target。

## 還沒做

- TUI / interactive mode(`vbpl repl` 之類)— 看 user 反應再加
- shell completion(bash / zsh / pwsh)— 同上,有需求再做
- log streaming(`vbpl pipeline log <id> --follow`)— 現在 log 是 one-shot dump,要 tail -f 等效得加 fs.watch / inotify
- CI release(`gh release` 自動 build + upload artifact),目前 user 自己 build 自己用
