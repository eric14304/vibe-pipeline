import { defineConfig } from "@playwright/test";

// Real 模式 e2e 配置:手動觸發,釋出前驗證。會燒 token、會操作 vp-autotest project。
// 跑前確認 vp-autotest(`d:/sugarfungit/vp-autotest`,hash cf94d1b2)沒進行中 pipeline。
//
// 不設 VP_TEST_MODE → server 走真路徑,claudeCli 真 spawn,orchestrator 真 spawn。
// 不開 HOME 隔離 — 這套刻意動 user 真 state(register vp-autotest 進 recents 等)。

export default defineConfig({
  testDir: "./real",
  fullyParallel: false,
  workers: 1,
  timeout: 5 * 60 * 1000, // real flow 慢,iter 一輪可能幾分鐘
  reporter: [["list"], ["html", { outputFolder: "../../playwright-report-real", open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "on",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: [
    {
      command: "bun run dev",
      url: "http://127.0.0.1:5173/",
      timeout: 30_000,
      reuseExistingServer: true,
    },
    {
      command: "bun run server",
      url: "http://127.0.0.1:3001/api/health",
      timeout: 30_000,
      reuseExistingServer: true,
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
