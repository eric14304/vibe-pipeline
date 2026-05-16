// 一次性測 split 速度的腳本。直接呼 splitTicketSpec,跳過 HTTP / draft store。
// 跑:bun run scripts/test-split-time.ts

import { splitTicketSpec } from "../server/lib/qa/splitTicket";

const spec = {
  title: "vibe-pipeline repo 全面整理:目錄/型別/helper 收斂",
  goal: "讓 src/ + server/ + shared/ 對齊 CLAUDE.md 規範,後續 phase 開發更易維護",
  acceptance: [
    "src/ 與 server/ 對齊 CLAUDE.md Repo 結構段(routes/lib/features/ui/shell 各自邊界)",
    "跨層持久化型別集中 shared/types.ts;UI-only 型別留 src/types/;命名 / 欄位風格統一",
    "重複邏輯(fetch wrapper / stage normalize / 時間成本格式化 / icon map)抽 helper,呼叫點 ≥ 2 才保留",
    "bunx tsc --noEmit 全綠;bun run test:e2e:mock 全過",
  ],
  prompt: `## 目標
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
- 重命名 / 移動檔案時同步更新所有 import 路徑,每個 round 結束跑 \`bunx tsc --noEmit\` 確認全綠。
- 刪除任何未使用 export / dead code 前,先用 Grep 確認真的沒人用。
- 過程中發現 bug **不順手修**,只記在最終 executor summary 的「順手發現但未動」清單。
- 不要自作主張縮小 scope:三大方向都要動到。也不要自作主張擴大 scope(順手清掉的雷不算)。

## 推進順序(sub-agent 派發節奏)
1. 先盤點現況:列出 src/ 與 server/ 實際樹 vs CLAUDE.md「Repo 結構」段的差異點(只讀,不動)。
2. 目錄 / 模組邊界對齊(移動 / 重命名 → tsc 全綠 → commit)。
3. 型別合併:shared/types.ts 收斂跨層型別,src/types/ 清掉重複(grep 每個改名前後 → tsc → commit)。
4. Helper 抽出:fetch wrapper / normalize / 格式化 / icon map / class helper(每個 helper 確認 ≥ 2 處呼叫點才保留 → tsc → commit)。
5. 最後跑 \`bun run test:e2e:mock\`(或專案實際 mock 指令,需先確認)驗證 e2e 全過。

## 回報格式(executor summary 必含)
- **動了哪些目錄 / 檔案**:移動 / 重命名 / 刪除 / 新建,逐項列。
- **合併 / 統一了哪些型別**:列前後對照(改前位置 → 改後位置)。
- **抽出了哪些 helper**:名稱 + 呼叫點數(必須 ≥ 2)。
- **tsc / e2e 結果**:貼最後一次的 output 摘要。
- **順手發現但未動的問題清單**:含位置 + 描述。

## 參考
參考 \`docs/vibe-pipeline/SKILL.md\`(產品定位)、\`vibe-pipeline-frontend\` SKILL(src/ 約定)、\`vibe-pipeline-backend\` SKILL(server/ 職責邊界)、\`vibe-pipeline-e2e\` SKILL(e2e 不可破壞語意)。`,
  mode: "iter" as const,
};

const t0 = Date.now();
console.log("[test-split] start, model=sonnet-4-6 effort=low");
try {
  const result = await splitTicketSpec({
    cwd: "d:/sugarfungit/vibe-pipeline",
    spec,
  });
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[test-split] done in ${dt}s -> ${result.length} ticket(s)`);
  result.forEach((s, i) => {
    console.log(`  #${i + 1} ${s.title} (mode=${s.mode})`);
  });
} catch (e) {
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.error(`[test-split] FAILED after ${dt}s:`, e);
}
