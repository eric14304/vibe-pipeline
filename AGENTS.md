# AGENTS.md

本檔給 codex / 其他不認 claude `CLAUDE.md` + `.claude/skills/` 系統的 AI 看。

claude CLI 自動載 CLAUDE.md + 對應 SKILL,codex 不會,所以本檔導你過去。專案約定的 single source of truth 是 `CLAUDE.md`,本檔故意做成 pointer,沒任何 convention content 本身。

## 動 code 前**必讀**(FIRST action,不可略)

1. Read 同目錄 `CLAUDE.md`(專案結構、Phase 進度、決策、雷區 #1-16)
2. 依任務範圍 Read 對應 SKILL:
   - 改 `src/`(前端 / 畫面 / 元件 / styles / route / API 串接) → `.claude/skills/vibe-pipeline-frontend/SKILL.md`
   - 改 `server/`(Bun server / fs / spawn / runner / QA / budget) → `.claude/skills/vibe-pipeline-backend/SKILL.md`
   - 改 `cli/`(`vbpl` 命令列) → `.claude/skills/vibe-pipeline-cli/SKILL.md`
   - 寫 / 改 / 跑 E2E(Playwright mock + real) → `.claude/skills/vibe-pipeline-e2e/SKILL.md`
   - scope / 決策 / 完整功能清單 / 外部產品對照 → `.claude/skills/vibe-pipeline/SKILL.md`(主 SKILL)

CLAUDE.md 的「不踩的雷」段(目前 #1-16)是最容易踩的坑,**先讀完再動手**,避免重蹈覆轍。

## 維護

- 本檔故意不複製 CLAUDE.md / SKILL 內容,避免兩份 drift
- 專案約定變動 → 改 `CLAUDE.md`,本檔不需動
- 新增 / 重命名 / 刪除 SKILL 時 → 改本檔上方 pointer 列表(CLAUDE.md「五 SKILL 對應路由」段也要同步)
