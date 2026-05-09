# 串接計畫 v2:QA-driven ticket creation(2026-05-09)

> Phase 1(Project + Pipeline CRUD)收尾,進 phase 2。
> 第一條 vertical slice:**+ ticket 按鈕 → QA drawer 對話 → AI 收斂出 ticket spec → 寫入 pipeline.tickets[]**。
> 物理路徑 → root [`CLAUDE.md`](../../../../CLAUDE.md)。

## 1. 6 個決策(已對焦)

| # | 議題 | 決定 |
|---|---|---|
| 1 | Draft 存哪 | `<target>/.vibe-pipeline/.runtime/qa-drafts/<draftId>.json`(`.runtime/` 復活、gitignored、之後可當 memory 來源) |
| 2 | UI 變體 | **drawer**(右側 slide-in,不擋 board) |
| 3 | AI 回覆格式 | **Fenced JSON**:```\`\`\`json {message, options[], complete, spec}\`\`\```` |
| 4 | Claude CLI 不可用 | 報錯 + 教 user 裝 / 登入,不 fallback |
| 5 | 中途離開 drawer | Draft 保留,pipeline 顯示「進行中 QA」可 resume |
| 6 | 並行 QA | 同 pipeline 限一個 active draft;已有就阻止 / 提示接續 |

## 2. 流程

```
1. user 在 pipeline focus 點「+ ticket」
   ├─ 該 pipeline 有 active draft → 提示「接續 / 棄」
   └─ 沒 → 開新 QA drawer
2. POST /qa/start
   → backend 建 draft + spawn `claude -p "<system+first prompt>"` --output-format stream-json
   → 從 stream-json 取 session_id
   → 解析 fenced JSON 取 message/options
   → 存 draft.json:{ pipelineId, sessionId, turns: [...], spec: null }
   → 回 { draftId, message, options, complete: false }
3. drawer 顯示 message + options buttons + 自由輸入框
4. user 點 option / 自打字
   POST /qa/turn { draftId, userMessage }
   → backend `claude -p --resume <sessionId> "<userMessage>"`
   → parse fenced JSON
   → 更新 draft.json.turns + 若 complete=true 寫 spec
   → 回 { message, options, complete, spec? }
5. complete=true:drawer 顯示 spec 摘要 + 編輯 + 確認
   POST /qa/finalize { draftId, edits? }
   → 把 spec 寫進 pipeline.tickets[]、PUT 整條 pipeline.json
   → 刪 draft.json
6. 取消:POST /qa/cancel { draftId } → 刪 draft.json
```

## 3. API endpoints

```
POST /api/projects/:hash/pipelines/:pid/qa/start
     body: {} (空) 或 { initialPrompt?: string }
     回:  { draftId, message, options, complete: false }
     錯:  already_active_draft (該 pipeline 已有 draft) / claude_cli_not_available

POST /api/projects/:hash/qa/:draftId/turn
     body: { userMessage: string }
     回:  { message, options, complete, spec? }

POST /api/projects/:hash/qa/:draftId/finalize
     body: { edits?: Partial<TicketSpec> }
     回:  { ticketId, pipeline: <updated pipeline> }

POST /api/projects/:hash/qa/:draftId/cancel
     body: {}
     回:  { ok: true }

GET  /api/projects/:hash/qa/drafts
     回:  Draft[] (列當前所有 active draft,UI 顯示 resume 提示用)

GET  /api/projects/:hash/qa/:draftId
     回:  { draft, turns: [...] } (resume 時 frontend 重建 UI)
```

## 4. Draft schema(`<target>/.vibe-pipeline/.runtime/qa-drafts/<draftId>.json`)

```ts
type Draft = {
  draftId: string;            // ulid-ish 或 ts-rand
  pipelineId: string;         // 屬哪條 pipeline
  sessionId: string;          // claude CLI 給的 session id
  createdAt: number;
  updatedAt: number;
  turns: Turn[];
  spec: TicketSpec | null;    // null = QA 進行中,有值 = 收斂完成等 finalize
};

type Turn = {
  role: "user" | "ai";
  message: string;            // 顯示文字 (ai 已抽出 fenced JSON 的 message)
  options?: string[];         // ai turn 才有
  ts: number;
};

type TicketSpec = {
  title: string;
  goal: string;
  acceptance: string[];
  prompt: string;
  mode: "step" | "iter";
};
```

## 5. System prompt(AI 約定)

```
你是 vibe-pipeline 的 ticket QA 引導員。透過幾輪對話幫使用者收斂一張 ticket 的需求,
產出可給 執行AI 直接執行的 ticket spec。

每輪輸出**必須**包在 fenced JSON code block 裡:

```json
{
  "message": "下一個問題或解釋,自由文字,markdown 可",
  "options": ["建議選項 1", "建議選項 2", "讓我自己描述"],
  "complete": false,
  "spec": null
}
```

當你判斷已收斂(收齊 title / goal / acceptance / prompt / mode),設 complete=true 並填 spec:

```json
{
  "message": "我整理出 ticket 如下,確認後送出。",
  "options": [],
  "complete": true,
  "spec": {
    "title": "...",
    "goal": "...",
    "acceptance": ["...", "..."],
    "prompt": "執行AI 接到這段就能開工的完整 prompt",
    "mode": "iter"
  }
}
```

收斂規則:
- 至少問清楚:這張 ticket 要做什麼、怎麼算完成
- 用 options 給常見選項加速,但永遠保留「自己描述」
- 多輪以 3-6 輪為目標,不囉嗦
- mode 預設 iter (有 審核AI 迴圈),簡單一次性事務才用 step
```

(實際 prompt 之後可調整,寫進 `server/lib/qa/systemPrompt.ts` 常數。)

## 6. Backend 模組規劃

```
server/
├── lib/
│   ├── qa/
│   │   ├── claudeCli.ts          spawn `claude -p [--resume]`、parse stream-json 取 session_id 跟內容
│   │   ├── parseReply.ts         從 AI raw output 抓 fenced JSON 區塊
│   │   ├── systemPrompt.ts       const SYSTEM_PROMPT = "..."
│   │   └── draftStore.ts         draft fs CRUD (read / write / delete / list / has-active)
│   └── ...
├── routes/
│   └── qa.ts                     /api/projects/:hash/.../qa/* dispatch
└── index.ts                      加路由
```

`pipelineDir.ts` 加一個 `runtimePath()` 跟 `ensureRuntime()` 處理 `.runtime/qa-drafts/`(init 時建,加進 .gitignore — `.runtime/` 復活)。

## 7. Frontend 模組規劃

```
src/features/qa/
├── QADrawer.tsx                  drawer wrapper (slide-in)
├── QATranscript.tsx              訊息 list
├── QAComposer.tsx                options buttons + 自由輸入
├── QASpecReview.tsx              complete=true 後的 spec 編輯確認
└── useQA.ts                      hook 管 state + API 呼叫

src/api/qa.ts                     fetcher (start/turn/finalize/cancel/list/get)
```

BoardScreen 改:
- pipeline 點「+ ticket」 → 檢查 pipeline 有沒 active draft → 開 QADrawer / 提示接續
- pipeline focus header 顯示「進行中 QA」標記(若有 active draft)

## 7.5. Git 設計關係

QA 階段**不動 git**(只收集 spec、寫 metadata)。pipeline.branch 欄位寫進去當預期名,實際 branch / worktree 等 [P2] runner 跑時才建。完整 git worktree 平行執行設計見 [git-design-2026-05-09.md](git-design-2026-05-09.md)。

## 8. 範圍外(這次不做)

- 真的 執行AI / 審核AI runner 跑 ticket(QA 只負責「建立」,不負責「執行」)
- LLM 直接走 API(這版只用 claude CLI)
- QA session 跨 pipeline / 跨 project 共用(每張 ticket 一個 session)
- Spec 版本 history(目前只記最終版)
- multi-turn undo(不能回上一輪改答)
- token / cost 記錄(沒 budget tracker)

## 9. 待解 / 開工會浮現的問題

- **claude CLI session 衝突**:同時跑兩個 `claude -p` 會不會搶 stdin?(stub-first 限同一 pipeline 只能一個 draft,降低風險)
- **CLI 輸出延遲**:`claude -p` 一輪要幾秒?drawer 要顯示 loading 狀態
- **Stream vs await**:第一版 await 整個 stdout 結束再回應(慢但簡單),之後可改 SSE 流式
- **Fenced JSON 抽取失敗**:AI 不照規則回覆時 fallback?(retry / 顯示 raw / 報錯)
- **session_id 取出方式**:`claude --output-format stream-json` 第一個 message 帶 session_id;要實測格式
- **.runtime/ 復活**:CLAUDE.md / SKILL / spec 文件要更新回來

## 10. 對焦過的設計信條(挑這次相關)

- **#1 單一定義源**:Ticket spec 最終寫進 pipeline.json,draft 是中間態
- **#3 SKILL 蒸餾走 candidates**:這版不做,但 QA 對話本身可作為「ticket 起源」紀錄,留接口
- **#5 Critic fail 不等於 ticket fail**:QA 收斂出的 mode 影響之後 runner 行為,不影響 QA 本身
