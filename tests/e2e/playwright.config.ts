import { defineConfig } from "@playwright/test";

// Mock 模式 e2e 配置:CI / 平常開發跑這套。
// real 套(燒 token 的)在 playwright.real.config.ts。
//
// VP_TEST_MODE=mock:
//  - server/lib/qa/claudeCli.ts 的 runTurn 不 spawn 真 claude,讀 in-memory script
//  - server/lib/runner/orchestrator.ts 的 spawnRunner 不 spawn,模擬時間軸寫 pipeline.json
//  - /api/__test/* 控制端點 mount(fixture project 註冊 / 設劇本 / reset)
//
// HOME 隔離靠 backend 的 VP_HOME_OVERRIDE env(phase 2 補,phase 1 smoke 還沒寫狀態)。

export default defineConfig({
  testDir: "./mock",
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI
    ? [["github"], ["html", { outputFolder: "../../playwright-report", open: "never" }]]
    : [["list"], ["html", { outputFolder: "../../playwright-report", open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: [
    {
      command: "bun run dev",
      url: "http://127.0.0.1:5173/",
      timeout: 30_000,
      reuseExistingServer: !process.env.CI,
      env: { VP_TEST_MODE: "mock" },
    },
    {
      command: "bun run server",
      url: "http://127.0.0.1:3001/api/health",
      timeout: 30_000,
      reuseExistingServer: !process.env.CI,
      env: { VP_TEST_MODE: "mock" },
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
