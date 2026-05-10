# claude CLI spawn perf bench

量測時間: 2026-05-10T23:14:25.883Z

迭代: 3 次/case-variant,取中位數。

指標:
- **cold start**:spawn → 首個 stdout chunk(ms)
- **first msg**:spawn → 首個完整 JSON line(ms)
- **total**:spawn → process exit(ms)
- **cache create**:usage.cache_creation_input_tokens(1h prompt cache 寫入量)
- **cache read**:usage.cache_read_input_tokens
- **cost**:total_cost_usd(API 收費)

## 主表(中位數)

| case | variant | cold start ms | first msg ms | total ms | cache create | cache read | cost USD | ok/n |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| qa | before | 911 | 911 | 9784 | 19512 | 18380 | $0.13392 | 3/3 |
| qa | after | 787 | 787 | 6197 | 0 | 20636 | $0.01452 | 3/3 |
| split | before | 889 | 891 | 7960 | 14582 | 33802 | $0.02411 | 3/3 |
| split | after | 749 | 750 | 4915 | 0 | 23524 | $0.00457 | 3/3 |
| runner | before | 1109 | 1109 | 4798 | 19518 | 24082 | $0.13421 | 3/3 |
| runner | after | 867 | 869 | 4917 | 18357 | 24082 | $0.12695 | 3/3 |

## Delta(after vs before,負值 = 更快/更省)

| case | cold start Δ | first msg Δ | total Δ | cache create Δ | cost Δ |
|---|---:|---:|---:|---:|---:|
| qa | -13.6% | -13.7% | -36.7% | -100.0% | -89.2% |
| split | -15.8% | -15.8% | -38.3% | -100.0% | -81.0% |
| runner | -21.9% | -21.7% | +2.5% | -5.9% | -5.4% |

## Raw runs

| case | variant | iter | cold | first | total | cache_c | cache_r | in | out | cost | exit | err |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| qa | before | 1 | 911 | 911 | 9784 | 37892 | 0 | 6 | 281 | $0.24388 | 0 |  |
| qa | before | 2 | 958 | 959 | 6359 | 19512 | 18380 | 6 | 62 | $0.13272 | 0 |  |
| qa | before | 3 | 903 | 903 | 10107 | 19512 | 18380 | 6 | 110 | $0.13392 | 0 |  |
| qa | after | 1 | 787 | 787 | 6496 | 20636 | 0 | 6 | 183 | $0.13358 | 0 |  |
| qa | after | 2 | 760 | 760 | 6197 | 0 | 20636 | 6 | 155 | $0.01422 | 0 |  |
| qa | after | 3 | 799 | 801 | 6003 | 0 | 20636 | 6 | 167 | $0.01452 | 0 |  |
| split | before | 1 | 889 | 891 | 7104 | 48379 | 0 | 10 | 319 | $0.06208 | 0 |  |
| split | before | 2 | 918 | 920 | 8709 | 14582 | 33802 | 10 | 408 | $0.02366 | 0 |  |
| split | before | 3 | 879 | 881 | 7960 | 14575 | 33802 | 10 | 501 | $0.02411 | 0 |  |
| split | after | 1 | 732 | 734 | 5558 | 23524 | 0 | 10 | 407 | $0.03195 | 0 |  |
| split | after | 2 | 837 | 838 | 4915 | 0 | 23524 | 10 | 342 | $0.00457 | 0 |  |
| split | after | 3 | 749 | 750 | 4525 | 0 | 23524 | 10 | 303 | $0.00437 | 0 |  |
| runner | before | 1 | 1109 | 1109 | 5247 | 19518 | 24082 | 6 | 6 | $0.13421 | 0 |  |
| runner | before | 2 | 1311 | 1311 | 4798 | 19518 | 24082 | 6 | 6 | $0.13421 | 0 |  |
| runner | before | 3 | 919 | 919 | 4688 | 19518 | 24082 | 6 | 6 | $0.13421 | 0 |  |
| runner | after | 1 | 867 | 869 | 4974 | 18357 | 24082 | 6 | 6 | $0.12695 | 0 |  |
| runner | after | 2 | 1383 | 1385 | 4917 | 18357 | 24082 | 6 | 6 | $0.12695 | 0 |  |
| runner | after | 3 | 860 | 862 | 4067 | 18357 | 24082 | 6 | 6 | $0.12695 | 0 |  |

## Audit / 結論

### 量測環境

- 機器:Windows 11,Bun runtime
- claude CLI:2.1.138
- 量測時間:2026-05-10
- 每 case-variant 跑 3 次取中位數
- 量測對象:**真實 spawn claude CLI + 真實 LLM round-trip**,非 mock
- system prompt 一律用 production 完整版(QA 9.4KB、Runner 12KB、Split 簡短 stub),user prompt 用最短(hello / stub spec / "noop, exit immediately")

### 三處 spawn 各別 before/after 改動效果

**1. QA(`server/lib/qa/claudeCli.ts`)— 改動最大贏家**

加上 `--setting-sources ""` / `--strict-mcp-config --mcp-config '{"mcpServers":{}}'` / `--disable-slash-commands` 後:

- cold start:911 → 787ms(**-14%,省 ~125ms**)— CLI 啟動時不掃 user/project settings、不 init MCP servers、不註冊 slash commands
- cache create input tokens:19512 → 0(**-100%**)— 第二次起穩 hit cache(after #2/#3 連續 cache_read=20636 / cache_create=0)。before 在 #2/#3 也 hit,但 cache 量比 after 多 ~1100 tokens(因為 settings / MCP / slash 也被 cache),cache miss 時(冷 1h)的 create 量差更明顯:before #1 high-water 37892 vs after #1 high-water 20636
- cost:$0.134 → $0.015(**-89%**)— 穩 cache hit 時主要差距在 input 量(20636 vs 19512+18380=37892 tokens hit/miss 混合);after 因為穩定 100% cache 命中,每輪只付 cache_read 折扣價

**2. splitTicket(`server/lib/qa/splitTicket.ts`)— 同樣大贏**

額外加上 `--no-session-persistence`(單輪 spawn,不需 session disk):

- cold start:889 → 749ms(**-16%**)
- cache create:14582 → 0(**-100%**)
- cost:$0.024 → $0.005(**-81%**)
- total wall:8.0s → 4.9s(**-38%**)— Haiku 加上不寫 session 落地、更小的 system prompt(無 settings/MCP)整體 round-trip 砍掉一截

**3. runner(`server/lib/runner/orchestrator.ts`)— 中度改善**

只加 `--strict-mcp-config --mcp-config '{"mcpServers":{}}'` / `--no-session-persistence` / `--disable-slash-commands`,**保留 `--setting-sources` 給 Task sub-agent**(改 source code 仍需 user/project CLAUDE.md / lint config):

- cold start:1109 → 867ms(**-22%**)— 三個改動的最大 cold start gain(因為 runner 載最多東西,砍 MCP 效應大)
- cache create:19518 → 18357(**-6%**)— gain 小,符合預期:settings 沒砍,user CLAUDE.md 仍進 cache;只少了 MCP / slash commands ~1160 tokens 的 cache 寫入量
- cost:$0.134 → $0.127(**-5%**)
- total:4.8 → 4.9s(**+2.5%,屬 noise**)— output tokens 都是 6,total 主要是網路 round-trip 抖動;cold start 真實改善存在(看 cold 欄)

### 最重的瓶頸

**QA / splitTicket 的 cache_creation 是過去最痛的成本來源**(穩 hit 後從 ~19500 / 14500 直接歸零,每次 spawn 省 80-90% input cost)。第二痛是 cold start ~150-250ms 的固定 overhead。

runner 因為要留 setting-sources 給 sub-agent 編碼用,**cache 改善被綁住**;若願意接受 sub-agent 不繼承 user/project 設定(可能影響 lint / TODO / project-specific convention 遵循),可以額外加 `--setting-sources ""` 拿到跟 QA 一樣的 cache 歸零效果。當前選擇保守 trade-off。

### 改動 gain 證據(摘要)

| spawn 點 | cold start | cache miss tokens | cost(每 spawn) |
|---|---|---|---|
| QA | -14% (125ms) | -100% (19512→0) | -89% ($0.134→$0.015) |
| splitTicket | -16% (140ms) | -100% (14582→0) | -81% ($0.024→$0.005) |
| runner | -22% (242ms) | -6% (19518→18357) | -5% ($0.134→$0.127) |

Spawn 是高頻操作(QA 每輪對話、每張 ticket runner 一次、每次拆 split 一次),累積一個 pipeline 跑 5-10 個 ticket + QA 10 輪 + 1 次 split 的話,每條 pipeline 大概省 **$1.0-1.5**,以及 ~2-4 秒互動延遲。

### 風險評估

- **QA 不能加 `--no-session-persistence`** — 多輪 `--resume` 需要 session 落 disk,加了會炸第二輪。已在註解標記。
- **runner 保留 `--setting-sources`** — Task sub-agent 改 source code 需繼承 user/project CLAUDE.md。若未來能 push 設定下到 sub-agent prompt 本身,可進一步加 `--setting-sources ""` 換 ~13% cache 改善。
- `--strict-mcp-config` 配空 MCP 對 vibe-pipeline 三個 spawn 都安全(都不依賴 MCP server);runner sub-agent 走 Task 工具也不需 MCP。
- 量測 noise:total ms 抖動明顯(LLM API 延遲不可控),所以以 cold start 和 cache token 為主要指標,total 僅供參考。

### 結論

改動有效。QA / split 是大贏(80-90% cost / 100% cache miss elimination),runner 中度贏(22% cold start)。所有 18 次 spawn 都成功 exit 0,沒有 regression。改動現有 args 組合是最佳 trade-off,不建議再砍(QA session 必要、runner setting-sources 給 sub-agent 必要)。
