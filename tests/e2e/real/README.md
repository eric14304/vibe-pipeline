# Real-mode e2e specs

手動觸發,跑 vp-autotest project(`d:/sugarfungit/vp-autotest`,hash `cf94d1b2`),會燒 token。

跑前先確認 vp-autotest 沒進行中 pipeline。

```bash
bun run test:e2e:real
```

phase 1 還沒寫 spec — 等 mock 套滿 + real fixture 設計確定後再開。覆蓋清單見 [`vibe-pipeline-e2e` SKILL](../../../.claude/skills/vibe-pipeline-e2e/SKILL.md) § Real 模式。
