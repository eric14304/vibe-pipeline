import { defineConfig } from "@playwright/test";

// tab-flicker probe — 手動跑 / 不進 CI / 外部依賴 test
// 依賴:user 真 backend (3001) + 真 vite (5173) + 真 active project (hash 1876248b)
// 動機:驗 commit 974811f (useApi 300ms dedupe) + e73d772 (windowsHide) 真實生效
// 跑法:bunx playwright test --config=tests/e2e/tab-flicker.config.ts
// 預期:paused pipeline 場景下,tab 切回觸發 visibilitychange + focus 雙事件,
//   diff-stat / sync-status 各 fire 1 次(不是 2 次);60s 內 gate=false 不再 fire

export default defineConfig({
  testDir: "./",
  testMatch: /tab-freeze-probe\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  timeout: 2 * 60 * 1000,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "off",
  },
  // 不 webServer — 故意用 user 已起的 backend + vite,驗真實環境
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
