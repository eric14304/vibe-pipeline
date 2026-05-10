// 直接從 Bun 跑,沒 shell mojibake 風險。
// 用法:bun run scripts/test-qa-splitinto.ts <draftId>

const DRAFT_ID = process.argv[2];
if (!DRAFT_ID) {
  console.error("usage: bun run scripts/test-qa-splitinto.ts <draftId>");
  process.exit(1);
}
const HASH = "1876248b";
const BASE = "http://127.0.0.1:3001";

const userMessage = `## 目標
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
- 不引入新依賴,不換 framework,不動 build pipeline。
- 不改 backend route path 與 response shape。
- 不改 pipeline.json / config.json / state.json 的 schema。
- 重命名 / 移動檔案時同步更新所有 import 路徑,每個 round 結束跑 bunx tsc --noEmit 確認全綠。
- 刪除任何未使用 export / dead code 前,先用 Grep 確認真的沒人用。

## 推進順序
1. 盤點現況
2. 目錄 / 模組邊界對齊
3. 型別合併
4. Helper 抽出
5. 跑 e2e 驗證

## 回報格式
動了哪些檔案、合併哪些型別、抽出哪些 helper、tsc/e2e 結果、順手發現未動的問題清單。`;

const t0 = Date.now();
const res = await fetch(`${BASE}/api/projects/${HASH}/qa/${DRAFT_ID}/turn`, {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ userMessage }),
});
const dt = ((Date.now() - t0) / 1000).toFixed(1);
const json = (await res.json()) as { ok: boolean; data?: { draft: any; reply: any }; error?: any };
console.log(`turn took ${dt}s, http=${res.status}`);
if (!json.ok) {
  console.error("ERROR:", json.error);
  process.exit(1);
}
const { draft, reply } = json.data!;
console.log(`reply.complete: ${reply.complete}`);
console.log(`reply.spec keys: ${Object.keys(reply.spec ?? {}).join(", ") || "(none)"}`);
console.log(`reply.splitInto: ${reply.splitInto ? `${reply.splitInto.length} items` : "none"}`);
console.log(`draft.splitInto: ${draft.splitInto ? `${draft.splitInto.length} items` : "none"}`);
if (reply.splitInto && reply.splitInto.length > 0) {
  for (const [i, s] of reply.splitInto.entries()) {
    console.log(`  [${i + 1}] ${s.title} (mode=${s.mode})`);
  }
}
console.log(`\nAI message preview:\n${reply.message.slice(0, 500)}`);
