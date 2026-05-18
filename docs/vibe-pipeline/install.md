# Install `vbpl` CLI

完整安裝手冊。README 的 §CLI 是 landing 簡介,本檔是 single source of truth。

## Build binary

```bash
bun run cli:build           # Windows x64 → dist-cli/vbpl.exe
bun run cli:build:mac       # macOS arm64 → dist-cli/vbpl-mac
bun run cli:build:linux     # Linux x64   → dist-cli/vbpl-linux
```

binary ~121 MB(bundle 整個 Bun runtime)。

## Start backend(enduser / AI flow)

安裝到 PATH 後,日常跑 pipeline 不需要進 vibe-pipeline repo 起 `bun run server`。用 `vbpl server` 管 backend:

```bash
vbpl server start
vbpl server status
vbpl server logs -f          # 需要 debug 時
vbpl server restart
vbpl server stop
```

`vbpl server start` 會從當前目錄、`VBPL_HOME` 或既有 `~/.vibe-pipeline/server.json` 自動找到 vibe-pipeline repo,用背景 process 啟動 backend(3001)。`vbpl pipeline run|stop|merge|sync` 也會 auto-detect + auto-start local backend;失敗時看 `vbpl server logs`。

Maintainer 改 vibe-pipeline source code 才用 `bun run server` / `bun run dev` / `bun run start`。

## Install to PATH(per OS)

### macOS / Linux

走 `/usr/local/bin/`(預設已在 PATH):

```bash
sudo cp dist-cli/vbpl-mac /usr/local/bin/vbpl       # 或 vbpl-linux
sudo chmod +x /usr/local/bin/vbpl
vbpl --version                                       # 驗
```

不想 sudo 走 `~/bin`:

```bash
mkdir -p ~/bin && cp dist-cli/vbpl-mac ~/bin/vbpl
chmod +x ~/bin/vbpl
echo 'export PATH="$HOME/bin:$PATH"' >> ~/.zshrc    # bash 用 .bashrc
source ~/.zshrc
```

### Windows PowerShell

```powershell
New-Item -ItemType Directory -Force "$HOME\bin"
Copy-Item dist-cli\vbpl.exe "$HOME\bin\vbpl.exe"
$user = [Environment]::GetEnvironmentVariable("Path", "User")
[Environment]::SetEnvironmentVariable("Path", "$HOME\bin;$user", "User")
# 開新 terminal 驗:vbpl --version
```

### Windows Git Bash

PATH 繼承 Windows user PATH,設一次兩邊都吃:

```bash
mkdir -p ~/bin && cp dist-cli/vbpl.exe ~/bin/
echo 'export PATH="$HOME/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

## Trouble

| 症狀 | 解 |
|---|---|
| `command not found` 在新 terminal | PATH 沒生效 → 開新 terminal session 或 source rc |
| Windows `vbpl` 找不到但 `vbpl.exe` 找得到 | PowerShell PATHEXT 沒含 → 顯式打 `vbpl.exe` 或加 `.EXE` 到 PATHEXT |
| macOS Gatekeeper 警告(下載 binary 而非自己 build)| `xattr -d com.apple.quarantine ~/bin/vbpl` |
| 多版本衝突 | `which vbpl`(macOS/Linux)/ `where.exe vbpl`(Windows)看實際路徑,清舊版 |

## 散發 binary 給其他人

`dist-cli/` 已 gitignore。build 完把 binary 複製給對方,讓對方按上方 §Install to PATH 流程安裝即可。

跨 build target 看 [Bun build --compile docs](https://bun.sh/docs/bundler/executables) 的 `--target=bun-windows-x64-baseline` 等 baseline 變體(產出更小,但需 CPU 支援檢查)。
