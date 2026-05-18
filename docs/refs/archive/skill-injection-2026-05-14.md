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

---

## 2026-05-16 更新 — 範圍收斂

實做前回頭審視,有三大調整:

### (a) QA 對你個人 vs 對產品的意義

你的工作流:**CC 配 VP**,QA 少用。但 QA 是「**遠端入口**」(手機 / Tailscale)和「**非 CC 用戶的桌機主入口**」—— 對你少用、對產品核心,不能砍。

關鍵推論:QA **少用 + 要準**,優先級從「省 token」翻成「給 context」。

**落地動作**:`spawnQA` 拿掉 `--setting-sources ""`(commit `f780b3f`),改成載 user CLAUDE.md + skill 索引。代價 ~19k token/spawn,因少用可接受。`spawnRunner` 本來就載(註解已寫),`spawnSplit` 保留 `""`(split 是純結構分析,不需專案脈絡)。

這個改動把 Phase 7 最大動機「QA 對非 CC 用戶要強」**部分提前用 brute force 解掉了** —— QA 第一輪起就拿全套 user / project 設定。下面 pointer 模型的設計仍有價值,但動機從「QA 補強」轉移到「runner / 細粒度控制」。

### (b) Skill 安裝 / 散發:不重做,依賴既有工具

原本設想 VP 自帶 catalog + fetch/install。**這個空間 2026 年已被既有工具佔滿**:

**CLI 安裝器**(成熟):
- `gh skill install`(GitHub CLI 官方擴展,跨多 agent — Claude Code / Cursor / Codex / Copilot / Gemini)
- `caude-skill-manager`(`sk install/search/list`,Go binary,Claude Code 專用)
- `ccpi`(配 tonsofskills.com,425 plugins / 2810 skills)
- `antigravity-awesome-skills` installer

**Marketplace / catalog**(10+ 個):
- alirezarezvani/claude-skills(263+)
- aiskillstore/marketplace(security-audited)
- tonsofskills.com(2810)
- awesome-claude-skills(travisvn / ComposioHQ curated lists)
- netresearch/claude-code-marketplace(走 `agentskills.io` open standard,跨 30+ agents)

**結論**:VP **不做** install / catalog / update / uninstall。VP 只做別人沒做的事 —— 「**把 user 已裝的 skill 注入 VP 的 spawn 場景**」。

### (c) 修正後的 VP 範圍

VP 三件事:
1. **Detect**:掃 `~/.claude/skills/`(任何 installer 都裝這)+ target repo `.claude/skills/` → 列出已裝 skill + 抽 frontmatter
2. **Inject**:QA(已 brute force 載入)/ runner(本來就載)/ split(不需)以外,如果未來要更細粒度控制(per-pipeline override 等),走 pointer 模型 — 仍按本檔上半段設計
3. **Recommend(optional)**:UI 顯示「VP-driven coding 高度相關」精選 5-10 個 skill + 對應 `gh skill install <X>` 命令字串,**user 自己複製貼到他的 terminal 執行**,VP 不執行

VP 推薦 list 候選(視 VP 使用模式):
- `tdd` / `test-driven-development`
- `systematic-debugging`
- `brainstorming`
- `requesting-code-review` / `receiving-code-review`
- `writing-plans` / `executing-plans`

**選 `gh skill` 當主推 installer**:github 官方背書,跨 agent,VP 用戶大多裝過 `gh`。沒裝給 fallback `curl` 命令。

### (d) 原「未定」項的影響

之前列的未定 1-7 項,現在的狀態:

1. ~~VP 精選 SKILL 怎麼散發~~ → **取消**,改 Recommend 清單(只給 install 命令,不散發實體)
2. sub-agent 拿不拿索引 → **仍未定**,但 runner 已自動載 settings,該問題某程度上自動解決
3. ~~設定存哪~~ → **取消**(沒有 VP 自己的 skill 設定,純讀 `~/.claude/skills/`)
4. ~~手動指定路徑 UI~~ → **取消**(不開放手動加 skill,user 用 installer 裝)
5. 注入索引的 prompt 格式 → 仍未定(若做 pointer mode 才需要)
6. 成本面 → QA 已決定走「全載入」,runner 本來就載 → 主動投錢買 context
7. runner executor sub-agent 工具白名單 → 仍未定(若 sub-agent 也要載自定 skill 才需要)

範圍大幅收斂。實作門檻降低,核心動機(QA 強化)已部分用 brute force 達成。

