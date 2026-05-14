# 引用重點 SKILL — Phase 7 設計討論

2026-05-14。狀態:**規劃中,未動工**。本檔記錄設計討論的已定 / 未定,實作前回來收尾未定項。

## 訴求

使用者自己整理了一些 SKILL,希望 VP 的 AI(QA / split / runner)收斂 spec、執行 ticket 時能「引用」這些 SKILL 的慣例。一開始想過開 `--setting-sources` 開關,後來否掉(全有/全無太粗,且把已砍的 ~19.5k token 全域 context 又灌回來)。改走「定向引用」。

## 機制取捨

兩種注入機制:

- **A. pointer(指標注入)** — spawn 前讀 SKILL 檔的 frontmatter(`name` + `description`,幾十 token),組成索引塞進 prompt;AI 按 description 判斷要不要 `Read` 全文。
- **B. inline(全文內聯)** — 直接把 SKILL body 整段塞進 prompt,保證載入但每次 spawn 付全額 token。

原理:**載入機率低 → A,接近 100% → B**。使用者整理的參考 SKILL 通常某類 ticket 才相關,非每張都要 → **採 A 為預設**。B 只保留給「短、且每張 ticket 都該遵守」的 SKILL(未來可加 per-skill `always inline` 旗標,目前不做)。

pointer 模型的關鍵性質:**自帶過濾**。索引全給,AI 看 description 自己挑 —— 過濾發生在 AI 判斷層,不在 config 層。

## 已定

- **三來源**:`~/.claude/skills/`(global)+ target repo `.claude/skills/`(project)+ VP 自帶精選。
- **plugin 不自動列舉**:`~/.claude/plugins/**` 下 47+ 個 skill(superpowers 14 / claude-mem 29 / …),自動掃會變噪音;且檔案系統掃描 ≠ Claude 實際載入(見下「plugin cache 雷」)。plugin skill 要引用 → 走「user 手動貼路徑」逃生口,user 自己負責路徑有效性。
- **pointer 模型**:spawn 時抽 frontmatter 成索引,AI 按需 `Read`。
- **一份共用清單,不拆 per-AI**:per-AI 注入設定沒意義 —— pointer 模型已自帶過濾,per-AI config 等於手動再做一次 AI 免費在做的事,換 N 倍 UI 複雜度。清單爆掉(上百條)才回頭考慮分層,現在加是 premature。
- **三種 spawn 都抽**:QA / split / runner —— 「QA AI 也是一種 runner」。
- **無 +ticket snapshot、無 per-ticket override、純 settings 全域生效**:spawn 時直接讀當下 settings。
- **fallback**:SKILL 檔無 frontmatter → 用檔名 + 第一行,並對 user 警告建議補。
- **列舉規則**:`~/.claude/skills/` 下只認「子目錄內有 `SKILL.md`」的,散檔(如 `README.md`)不算 skill。

## 未定(實作前要收)

1. **VP 精選 SKILL 怎麼散發** — enduser 只裝 `vbpl` binary,拿不到 VP repo 內的 skills。要 bundle 進 binary 還是讀已知路徑。
2. **sub-agent(executor/critic/merge)拿不拿索引** — 它們是 runner 主 agent 派的、非 VP 直接 spawn。傾向:索引只進 runner 主 prompt,主 agent 派 sub-agent 時自己帶相關 SKILL 路徑(runnerPrompt 加一條指示),符合現有「主 agent 編排」架構;另一選項是 VP 在派 sub-agent 那層也注入。
3. **設定存哪** — `~/.vibe-pipeline/config.json`(全域)還是 target repo 的 `.vibe-pipeline/config.json`。
4. **手動指定路徑的 UI** — 輸入框貼絕對路徑 vs file picker。
5. **注入索引的 prompt 格式** — 那段長怎樣。
6. **成本面** — 索引本身 token + AI `Read` 全文的 token,要不要算進 pipeline cost、要不要上限。
7. **runner executor sub-agent 工具白名單** — worktree 外的 `Read` 可能被擋,要放行索引內的路徑。

## plugin cache 雷(討論中查證的副產物)

- **plugin cache 永遠不會自動清**:`~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/` 只增不減。uninstall 不清、update 不清(同個 plugin 多版本目錄並存)。文件無自動 GC、無官方清理指令。
- **判斷 plugin 是否 active 的權威來源**是 `~/.claude/plugins/installed_plugins.json` + `settings.json` 的 `enabledPlugins`,**不是 cache 目錄**。uninstall 後 cache 變孤兒垃圾仍可被檔案系統掃到。
- **孤兒 cache**(plugin 已不在 `installed_plugins.json`)手動 `rm -rf` 安全、不會自己回來(除非重新 `/plugin install`)。
- **仍在安裝中的 plugin** 別直接 `rm` cache — 會造成 `installed_plugins.json` 指向不存在路徑的不一致狀態,且不會自動補回。要清先 `/plugin uninstall` 再 reinstall。

→ 對 VP 設計的硬結論:**不靠檔案系統掃 plugin;真要支援只走手動貼路徑**。
