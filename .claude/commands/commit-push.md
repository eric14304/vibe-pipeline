---
description: git add + commit + push,VP repo 慣例(中文 subject,Co-Authored-By 結尾)
allowed-tools: Bash(git*)
---

執行 commit + push 流程:

1. `git status --short` 看現況
2. `git diff --stat` + `git diff --cached --stat` 看改動規模
3. 草擬 commit message:
   - subject 中文,動詞開頭(`docs: ...` / `fix(scope): ...` / `feat: ...`)
   - body 1-3 句講「為什麼改」不是「改了什麼」(改了什麼 diff 自己會講)
   - 結尾必加 `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`
4. `git add <具體 file 名,逐個列>`(**禁用 `git add -A` / `git add .`** 避免帶入 .env / 大檔)
5. `git commit -m "$(cat <<'EOF' ... EOF)"` 用 HEREDOC 保留多行
6. `git push` push 到 origin

不做:
- ❌ 自作主張改 commit 範圍(只 commit user 隱含期待的改動,有疑問先問)
- ❌ 跳 pre-commit hook(`--no-verify` 禁)
- ❌ `git push --force`(除非 user 明說)
- ❌ amend 既有 commit(預設都開新 commit)

完成回報格式:`commit <hash7> pushed`(一行)。
