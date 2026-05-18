# claude CLI spawn 加速 — 三處 flag 改動成果 (2026-05-11)

vibe-pipeline 有三處 `Bun.spawn(["claude", ...])`:QA / splitTicket / runner 主 agent。
每處 spawn 都有 CLI 啟動 overhead(掃 settings、init MCP、註冊 slash commands)+ system prompt 進 1h cache 的 token 成本。`pipeline/perf-claude-cli` 的 ticket 量測三組 flag 加上去的 gain。

## 量測環境

- Windows 11 + Bun
- claude CLI 2.1.138
- 每 case-variant 跑 3 次,取中位數
- **真實 spawn + 真實 LLM round-trip**,非 mock
- system prompt 用 production 完整版(QA 9.4KB / Runner 12KB / Split stub),user prompt 用最短

腳本:[`scripts/perf-bench.ts`](../../../../scripts/perf-bench.ts)(commit 36fe439 內)
原始 raw:[`pipeline/perf-claude-cli` branch 內 `.perf-bench/results.md`](https://github.com/sugarfungit/vibe-pipeline)(branch 上 commit 才有,merge 後在 main)

## 三處改動成果

| spawn 點 | cold start | cache miss tokens | cost(每 spawn) |
|---|---|---|---|
| QA | -14% (125ms) | **-100%** (19,512→0) | **-89%** ($0.134→$0.015) |
| splitTicket | -16% (140ms) | **-100%** (14,582→0) | **-81%** ($0.024→$0.005) |
| runner | **-22%** (242ms) | -6% (19,518→18,357) | -5% ($0.134→$0.127) |

每條 pipeline 跑 5-10 個 ticket + QA 10 輪 + 1 次 split,累積省 **$1.0-1.5** + ~2-4 秒互動延遲。

## 各處的 flag 組合 + 理由

### QA(`server/lib/qa/claudeCli.ts`)
```
--setting-sources ""            # 跳 user/project settings 掃描
--strict-mcp-config             # 鎖 MCP 來源
--mcp-config '{"mcpServers":{}}'  # 空 MCP,跳 init
--disable-slash-commands        # 跳 skills / slash 註冊
```
**沒加** `--no-session-persistence` — QA 多輪 `--resume <session-id>` 需要 session disk 持久化,加了會炸第二輪。

### splitTicket(`server/lib/qa/splitTicket.ts`)
QA 同上 + `--no-session-persistence`(one-shot,不需 resume,省 fs IO)。

### runner(`server/lib/runner/orchestrator.ts`)
```
--strict-mcp-config             # 同 QA
--mcp-config '{"mcpServers":{}}'
--no-session-persistence        # runner 一次性 session
--disable-slash-commands
```
**保留** `--setting-sources` — Task 派 sub-agent(executor/critic AI)改 source code 時仍需繼承 user/project CLAUDE.md / lint config / convention。換代價:cache 改善只 -6% 而非 QA 的 -100%。

## 風險評估

- **QA 不加 `--no-session-persistence`**:多輪 `--resume` 需 session 落 disk。已標註避開
- **runner 保留 `--setting-sources`**:Task sub-agent 改 source code 需 user/project CLAUDE.md。未來若能 push 設定下到 sub-agent prompt 本身,可進一步加 `--setting-sources ""` 換 ~13% cache 改善
- `--strict-mcp-config` 配空 MCP 對三處安全:都不依賴 MCP server。runner sub-agent 走 Task 工具也不需
- 量測 noise:total ms 抖動明顯(LLM API 延遲不可控),以 cold start 和 cache token 為主要指標

## 不要動的(已 measured 過 dead-end)

1. **Sub-agent 不能加 flag**:executor / critic AI 是 runner 主 agent 內部 Task tool 派出,vibe-pipeline 接觸不到那層 spawn。能控的只到 runner 主 agent 這層
2. **`--bare` flag**:跳 hooks / plugin sync / CLAUDE.md auto-discovery,但只認 `ANTHROPIC_API_KEY`,OAuth 用戶會 'Not logged in' 失敗
3. **直接打 Anthropic API**:省 CLI startup 全部,但需 API key,沒 user OAuth fallback

## 衍生(若未來想再砍)

- 把 runner 的 `--setting-sources` 也砍 → cache 多 -13%。需要先把 user/project CLAUDE.md / lint 規則寫進 mergeTicketPrompt / runnerPrompt 內,sub-agent 從 prompt 拿,不靠 CLI 自動載
- QA 改 stream-json 輸出 → 減少 buffering 等待,但 parsing 較複雜
