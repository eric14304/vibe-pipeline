# Board UI redesign(2026-05-17)— 按 ChatGPT mockup

## 為什麼

User 給 ChatGPT 對 vbpl board 改善後的 UI mockup,要 board 對齊。

## 參考 mockup(authoritative)

[`images/board-redesign/board-mockup.png`](images/board-redesign/board-mockup.png)

**sub-agent 必 Read 該 image 對照當前 board 實作,以圖為主、文字描述當輔助。**

## 從 mockup 看到的關鍵變化(初步觀察 — sub-agent 看圖確認)

- **Column header**:「項目 / 描述 / 狀態 / 執行資訊 / 耗時」5 欄,當前 board 沒
- **Ticket row table-like 對齊**:每 row 5 column align,當前是 card 自由 stacked
- **Ticket card 內展開 iter stage**:「執行 ✓ → 審核 II → 結果 ?」+ 右側 iter / elapsed / timer chip
- **右側 navigation dots**:6 點縱向 quick jump(當前無)
- **Pipeline header 上方 chips 排版**:「1 run · $0.00」「+37 -157 3f」「↓落後 1 · 同步」「+ ticket」「⏸ 繼續」「...」較整齊
- **Rail item subline**:「#1 5分鐘前」顯當前在跑 ticket + ago
- 整體 typography / spacing 更 dense + 對齊

## Ticket 拆分

### B1: Analyze + propose changes(read-only,不改 code)

**Goal**:sub-agent 看圖 + 對照 src code,寫一份 diff report(mockup 要 vs 當前狀態)。

**Acceptance**:產出 `docs/refs/board-redesign-diff-2026-05-17.md` 含:
- mockup 元素清單
- 當前對應元素 / 沒有的元素
- 建議改動清單(優先級)+ 估改動範圍(檔 + 行)

**Prompt**(executor):
**先 Read docs/refs/images/board-redesign/board-mockup.png** 仔細看 layout / spacing / column / typography。

對照當前 src/features/pipeline/BoardScreen.tsx + FocusColumn.tsx + board.css,寫 diff report 到 `docs/refs/board-redesign-diff-2026-05-17.md`:
1. mockup 內看到的所有 UI 元素列表(column header / row layout / iter stage 展開 / nav dots / etc.)
2. 每個元素對照當前 board 是否已有 / 部分有 / 完全沒
3. 建議改動清單,按優先級(高:結構性 / 中:layout 對齊 / 低:微調)
4. 每項估改動範圍(哪個檔、大概行數)
5. 整體判斷:是大改 vs 小改 polish?

不改 code,純分析。

### B2-B?: 按 B1 report 拆執行 ticket

**TBD** — 等 B1 完成後 user review report 拍板再拆。或 critic 自動推進(若 diff 小):
- Column header + row align(B2 candidate)
- Iter stage 展開 UI(B3 candidate)
- Nav dots(B4 candidate)
- Header chips 整理(B5 candidate)
- 自檢(BN)

## 風險 / 注意

- mockup 跟當前 board 差異可能小(微 polish)or 大(整 layout 重寫),B1 report 拍板
- e2e tests 對既有 ticket card selector 強相依,改 DOM 結構會破 e2e — 要同步調整 selectors / data-testid
- RWD < 600px 要保留 mobile layout(mockup 看似 desktop view)
