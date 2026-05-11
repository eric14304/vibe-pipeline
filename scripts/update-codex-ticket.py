"""Update codex-cli pipeline ticket #1: add perf-parity section + acceptance."""
import json, sys, io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

path = ".vibe-pipeline/pipelines/019e145a5811-codex-cli.json"
with open(path, "r", encoding="utf-8") as f:
    p = json.load(f)

t = p["tickets"][0]

new_acc = (
    "codex spawn args 對稱 claude 的 perf flags(skip user/project settings、skip MCP、"
    "skip skills/plugins、session 控制),CodexAdapter 內用 codex 對應的 flag 達到同樣 "
    "isolation 等級;若 codex 無等價 flag → 標 capability false + 在 prompt 註明 trade-off"
    "(refs/claude-cli-spawn-perf-2026-05-11.md 同等對待)"
)
if new_acc not in t["acceptance"]:
    t["acceptance"].append(new_acc)

extra = """

## 對稱 claude 的 perf flag(必做)

參考 [refs/claude-cli-spawn-perf-2026-05-11.md](.claude/skills/vibe-pipeline/refs/claude-cli-spawn-perf-2026-05-11.md):claude 三處 spawn 加四組 flag 拿到 QA / split 80-90% cost 省 + 14-22% cold start 省。codex adapter 要對稱對應 flag(若 codex CLI 有等價的)。

### claude 那邊有的 flag(對稱目標)

| claude flag | 用意 | 哪幾處用 | codex 對應 |
|---|---|---|---|
| --setting-sources "" | 跳 user/project settings discovery | QA / split(runner 不加,留給 Task sub-agent) | 找 codex 等價(profile / config / sandbox 級 isolation),沒有則 capability=false 註明 |
| --strict-mcp-config + 空 MCP | 跳 MCP init | QA / split / runner | codex 若有 MCP 概念則同等砍,沒有則 noop |
| --disable-slash-commands | 跳 skills / slash 註冊 | QA / split / runner | codex 等價(skill / extension / plugin disable) |
| --no-session-persistence | 不寫 session disk | split / runner(QA 多輪 resume 不加) | codex one-shot 模式 / no-session 等價 |
| --model + --effort | 動態 model / effort | 全部 | codex 對應 model + reasoning level flag |

### 設計約束

1. **不要在 caller 處理 flag** — adapter interface 暴露 high-level opts(如 { isolated, mcp: false, sessionPersist: false, model, effort }),adapter 內自己轉 CLI flag。caller 不該知道 claude / codex 各別語法
2. **capability flag** 表達差異:若 codex 缺某 flag → capability.supportsIsolation = false,adapter spawn() 仍能跑(只是 perf 退化),caller 不必擔心
3. **量測對齊**:smoke test 順便量 codex 三處 spawn 的 cold start / cache / cost(如果 codex 有對應 metric),寫進 ticket round summary,跟 claude 同表格格式對比(若 codex 沒揭露 token / cost,標 N/A)

### 不踩

- **不要把現有 claude perf flags 砍掉去湊統一介面** — adapter 抽象失敗就降級(adapter 看 provider 加自己的 flag),不要犧牲 claude 的 80-90% cost gain
- **session resume 是 QA 死線** — claude --no-session-persistence 在 QA 加了會炸,codex 對應也要同樣避開(看 codex CLI session 模型)
- **runner --setting-sources 保留** — 給 Task sub-agent 編碼用,codex 對應策略同(若 codex 有 sub-agent 機制)
"""

if "對稱 claude 的 perf flag(必做)" not in t["prompt"]:
    t["prompt"] = t["prompt"].rstrip() + extra

with open(path, "w", encoding="utf-8") as f:
    json.dump(p, f, ensure_ascii=False, indent=2)

print("OK. prompt len:", len(t["prompt"]))
print("acceptance count:", len(t["acceptance"]))
