#!/bin/bash
# 把那段大 prompt 整段送一次 user message,看 AI 是否在 complete=true 那輪輸出 splitInto。
# 用 heredoc 避免 escape 地獄。
DRAFT_ID="$1"
HASH="1876248b"

MSG=$(cat <<'PROMPT'
## 目標
全面整理 vibe-pipeline repo 架構,讓後續 phase 開發更易維護。三大方向同步推進:

1. **目錄 / 模組邊界**:src/ 與 server/ 對齊 CLAUDE.md「Repo 結構」段(routes 純 dispatch、lib 純 IO+邏輯、features 各自封閉、ui 為跨 feature 通用、shell 為版型容器)。
2. **型別 / API 一致性**:跨 backend/frontend 共用持久化型別集中在 shared/types.ts;UI-only 型別留 src/types/;命名 / 欄位風格統一;刪除重複或漂移定義。
3. **重複邏輯收斂**:相似 fetch wrapper、狀態 normalize(stage / verdict)、時間 / 成本格式化、icon mapping、CSS class helper 等抽成共用 helper,放對應 lib/ 或 data/。

## 範圍
**動**:src/(全部)、server/(全部)、shared/(全部)。
**不動**:design/、.claude/、CLAUDE.md、既有 e2e 驗證語意(可改 selector)。

## 操作守則(嚴格)
- 所有 source code 改動透過 Task 工具派 sub-agent 執行,主 agent 只改 pipeline.json + 下指令(這是 runner 預設行為,不要破壞)。
- 每個邏輯子步驟(目錄重組 / 型別合併 / helper 抽出)各自獨立 sub-agent 派發,不要一個 sub-agent 包山包海。
- **不引入新依賴**,不換 framework,不動 build pipeline(vite / bun 設定 / package.json scripts)。
- **不改 backend route path 與 response shape**(避免破壞 frontend / e2e)。
- **不改 pipeline.json / config.json / state.json 的 schema**(persistence 相容)。
- 重命名 / 移動檔案時同步更新所有 import 路徑,每個 round 結束跑 bunx tsc --noEmit 確認全綠。
- 刪除任何未使用 export / dead code 前,先用 Grep 確認真的沒人用。
- 過程中發現 bug **不順手修**,只記在最終 executor summary 的「順手發現但未動」清單。
- 不要自作主張縮小 scope:三大方向都要動到。也不要自作主張擴大 scope(順手清掉的雷不算)。

## 推進順序(sub-agent 派發節奏)
1. 先盤點現況:列出 src/ 與 server/ 實際樹 vs CLAUDE.md「Repo 結構」段的差異點(只讀,不動)。
2. 目錄 / 模組邊界對齊(移動 / 重命名 → tsc 全綠 → commit)。
3. 型別合併:shared/types.ts 收斂跨層型別,src/types/ 清掉重複(grep 每個改名前後 → tsc → commit)。
4. Helper 抽出:fetch wrapper / normalize / 格式化 / icon map / class helper(每個 helper 確認 ≥ 2 處呼叫點才保留 → tsc → commit)。
5. 最後跑 bun run test:e2e:mock 驗證 e2e 全過。

## 回報格式(executor summary 必含)
- **動了哪些目錄 / 檔案**:移動 / 重命名 / 刪除 / 新建,逐項列。
- **合併 / 統一了哪些型別**:列前後對照(改前位置 → 改後位置)。
- **抽出了哪些 helper**:名稱 + 呼叫點數(必須 ≥ 2)。
- **tsc / e2e 結果**:貼最後一次的 output 摘要。
- **順手發現但未動的問題清單**:含位置 + 描述。
PROMPT
)

# 用 python 包 JSON(jq 不一定在);出 stdout 一個合法 JSON 字串
BODY=$(printf '%s' "$MSG" | python -c 'import sys,json;print(json.dumps({"userMessage": sys.stdin.read()}))')

t0=$(date +%s)
RESP=$(curl -s --max-time 250 -X POST "http://127.0.0.1:3001/api/projects/${HASH}/qa/${DRAFT_ID}/turn" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d "$BODY")
t1=$(date +%s)
echo "turn took $((t1-t0))s"
echo "$RESP" | python -c "
import sys,json
r=json.load(sys.stdin)
if not r.get('ok'):
  print('ERROR:', r.get('error'))
  sys.exit(1)
draft=r['data']['draft']
reply=r['data']['reply']
print('complete:', reply.get('complete'))
print('spec keys:', list((reply.get('spec') or {}).keys()))
print('splitInto in reply:', 'yes' if reply.get('splitInto') else 'no', 'len=', len(reply.get('splitInto') or []))
print('splitInto in draft:', 'yes' if draft.get('splitInto') else 'no', 'len=', len(draft.get('splitInto') or []))
if reply.get('splitInto'):
  for i,s in enumerate(reply['splitInto']):
    print(f'  reply.splitInto[{i}] title={s.get(\"title\")} mode={s.get(\"mode\")}')
"
