---
paths:
  - server/lib/cli/codexAdapter.ts
description: codex CLI spawn flag 限制(改 codexAdapter 前讀)
---

# codex CLI spawn 雷區

## 不要加 `--ignore-user-config`

該 flag 把 `~/.codex/config.toml` 內 `provider = codex_local_access`(ChatGPT auth)設定 ignore 掉,fallback 走 default OpenAI API 模式 → 用 `auth.json` 內 internal/beta key(`agt_codex_...`)撞 401 Unauthorized,主 runner 起不來。

`codexAdapter.commonExecArgs` 已移除該 flag,保留 `--ignore-rules`。

## 不要加 `-c mcp_servers={}`

2026-05-17 拔掉。允許 user MCP pass-through(例 playwright MCP 截圖驗 UI)。

風險:user 自定 MCP 可能干擾 runner,接受。
