# worktree gitignored 檔複製 + 洩漏偵測 — 設計討論

2026-05-15。狀態:**規劃中,未動工**。

## 問題

VP 每條 pipeline 開獨立 git worktree(`server/lib/git/worktree.ts:ensure`,做 `git worktree add`)。`git worktree add` **只帶 tracked files** —— `.env` / 憑證類檔是 gitignored,在 `~/.vibe-pipeline/worktrees/<h>/<id>/` 不存在。

AI 在 worktree 內跑 e2e 需要憑證、找不到 `.env` → 「解法」是把帳號密碼 **hardcode 進測試腳本**。腳本是 tracked → commit 後憑證外洩。這是當前 self-dogfood e2e 實際在踩的雷。

## 解法:採用 `.worktreeinclude` 慣例

不自己發明 config 欄位,直接吃業界事實標準 `.worktreeinclude`(Claude Code CLI / desktop 已原生支援;vibe-kanban issue #1947 規劃中;另有 copy-env / wtp / git-worktreeinclude 等工具同 pattern)。

**`.worktreeinclude` 官方 spec**(來源:https://code.claude.com/docs/en/worktrees):
- 放 target repo **根目錄**,**git tracked**(本身要被 commit,不可 gitignore)
- 用 **`.gitignore` 語法**(glob、`#` 註解),一行一條
- **只複製「match pattern 且本身被 gitignore」的檔** → tracked 檔永不被重複複製(內建安全性質)
- 行為是 **copy**(非 symlink)
- 範例:
  ```
  .env
  .env.local
  config/secrets.json
  ```

**關鍵釐清**:`.worktreeinclude` 不是 git 機制,是各工具自行實作的一層。對 VP 而言「claude / codex 認不認得」無關 —— VP 自己用 `git worktree add` 開 worktree,CLI 只是被 spawn 進去跑。**VP 要自己在 `worktree.ensure()` 實作讀 `.worktreeinclude` + 複製**,跟 provider 無關。借用這個檔名/格式只是為了跟既有慣例通用(user repo 若已給 Claude Code 用就有這檔)。

實作要點:對每條 pattern glob → `git check-ignore` 確認是 gitignored 才 copy。不自己重寫 gitignore matcher。只在 `ensure()` 建新 worktree 那次做(`existsSync(wt)` false 分支),resume 不重複。

## 提醒 / 偵測機制(使用者零維護)

`.worktreeinclude` 要手動維護(性質同 `.gitignore`,寫一次、幾乎不動)。為防「漏設」或「AI 仍 hardcode」,加兩層 VP 側機制:

### A. 漏設提醒(precondition nudge)
`worktree.ensure()` 開 worktree 時掃 target repo 根目錄,找「被 gitignore、檔名像 secret(`.env*` / `credentials*` / `secrets*` / `*.pem` 等)、但沒被 `.worktreeinclude` 涵蓋」的檔 → emit notif。非阻擋。便宜主動,但靠檔名 pattern 猜,會漏命名特殊的。

### B. 洩漏偵測(catch the actual leak)— 核心價值
VP 知道 `.env` 實際內容(在 `projectPath`)。pipeline 跑完、merge 前,拿 `.env` 每個 value 去 grep worktree diff —— secret 值**原封不動出現在 tracked 檔 diff** 即鐵證洩漏,**幾乎零誤判**(優於 entropy 啟發式)。抓到 → block merge / 警告。

直接對應最初痛點;A 只是順手的事前 nudge,B 才是真正安全網。

## 防禦補充

runner / executor prompt 補一條:絕不 hardcode 憑證進 source;需要的 env 檔不存在 → 停下回報,不 inline secret。擋「需要的檔不在 `.worktreeinclude` 清單裡」的漏網。

## 落地狀態

1. ✅ **`worktree.ensure()` 加 `.worktreeinclude` 解析 + copy** — 已落地。`copyWorktreeIncludes()` best-effort,讀 `.worktreeinclude`(`.gitignore` 語法 + `#` 註解)→ 每 pattern `Bun.Glob` scan → `git check-ignore -q` 確認 gitignored 才 copy(tracked 檔自動排除)。目錄 pattern 尾 `/` 展成 `**` 遞迴。只在新建 worktree 那次跑。
2. ⏸️ **A:漏設掃描 + notif** — deferred。決策:提醒怎麼做都不可能根治,重點在檢核端(B)。先記著不實作。
3. ⏸️ **B:merge 前 secret 值比對 + block** — 規劃中,核心價值。來源不是「`.env`」而是「`.worktreeinclude` 列的那些檔」,B 讀那些檔抽 secret-like 值 → grep worktree diff,verbatim 命中即洩漏。格式無關(env / JSON / YAML 都只當「檔案裡有這串字」)。極限:只能抓「已知」secret,VP 沒看過的檔內 secret 偵測不到。
4. ⏸️ runner/executor prompt 防禦條 — 未動工。
5. (scenario-decomposer 已加 `.worktreeinclude` 寫 `.env*` + `.supabase/`,commit 96c981b;VP 自己 self-dogfood 的 `.worktreeinclude` 視需要再加)

## 參考

- https://code.claude.com/docs/en/worktrees — `.worktreeinclude` 官方 spec
- https://github.com/therohitdas/copy-env
- https://github.com/satococoa/wtp
- https://github.com/BloopAI/vibe-kanban/issues/1947
