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

### 1. Reuse backend lib,不發 HTTP

每個 command 直接 `import * as pipelineDir from "../../server/lib/pipelineDir"` 然後 `pipelineDir.readPipeline(path, id)`。理由:
- backend server 沒起也能用 CLI(state.json / pipeline.json 都在 fs,server 只是 HTTP wrapper)
- 沒網路 round-trip,本地操作毫秒級
- 共享同套驗證 / 寫盤邏輯,行為一致

代價:CLI 跟 backend lib 強耦合,改 `server/lib/*` 的 export 介面要記得 CLI 也用。**改 server/lib 前 grep `from "../../server/lib"` 確認 CLI 是否吃到**。

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
- `NOT_INITIALIZED` — `.vibe-pipeline/` 不存在
- `NOT_FOUND` — pipeline / ticket id 不存在
- `STATE_GUARD` — operation 不允許在當前 state(e.g. pipeline 已 merged 不准 run)
- `IO_ERROR` — fs / spawn 失敗 fallback

新加 command 用既有 code,不夠才加新的(也在這 SKILL 補一行)。

### 4. Project resolution 三層 fallback

`resolveProject(flags)` 解析:
1. `--project-path <abs>` → 用該 path 算 hash
2. `--project <hash>` → projectStore.findByHash(hash)
3. 都沒 → `projectStore.getLastProject()`(state.json 內 lastProject)

三層都解不到才 `fail("NO_PROJECT", ...)`。新 command 一律呼這個,**不要自己再寫 project 解析**。

## Noun × verb 矩陣

| noun | verbs |
|---|---|
| `project` | list / show / add `<path>` / remove `<hash>` |
| `pipeline` | list / create `<name>` / show `<id>` / delete `<id>` / run `<id>` / stop `<id>` / status `<id>` / log `<id>` |
| `ticket` | list / show `<id>` / add(`--title --mode ...`) / update / remove,**全部要 `--pipeline <id>`** |
| `config` | list / get `<key>` / set `<key> <value>`(user-level `~/.vibe-pipeline/config.json`) |

`pipeline log` 走 `runLog.listRuns` + `getRun`(同 RunHistory drawer 後端);`pipeline run` 走 `orchestrator.start(...)`(同 web UI 的 /run endpoint)— 但**沒 daemon 模式**:CLI 跑完 spawn 後就 exit,runner child 繼續在背景跑。要看狀態用 `vbpl pipeline status <id>`(讀 pipeline.json)。

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

## 還沒做

- 跨平台打包(`bun build --compile` → 單一 binary,user 不裝 Bun 就能跑;當前需 `bun run vbpl ...`)
- TUI / interactive mode(`vbpl repl` 之類)— 看 user 反應再加
- shell completion(bash / zsh / pwsh)— 同上,有需求再做
- log streaming(`vbpl pipeline log <id> --follow`)— 現在 log 是 one-shot dump,要 tail -f 等效得加 fs.watch / inotify
