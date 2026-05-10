import { defineConfig } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Mock 模式 e2e 配置:CI / 平常開發跑這套。
// real 套(燒 token 的)在 playwright.real.config.ts。
//
// VP_TEST_MODE=mock + VP_HOME_OVERRIDE=<tmp>:
//  - server/lib/qa/claudeCli.ts 的 runTurn 不 spawn 真 claude,讀 in-memory script
//  - server/lib/runner/orchestrator.ts 的 spawnRunner 不 spawn,模擬時間軸寫 pipeline.json
//  - /api/__test/* 控制端點 mount(fixture project 註冊 / 設劇本 / reset)
//  - ~/.vibe-pipeline/ 走 tmpdir,不污染 user 真 state.json / worktrees/

const TEST_HOME = join(tmpdir(), `vp-e2e-home-${Date.now()}`);
mkdirSync(TEST_HOME, { recursive: true });

const TEST_ENV: Record<string, string> = {
  VP_TEST_MODE: "mock",
  VP_HOME_OVERRIDE: TEST_HOME,
  // Windows 上 Bun 的 process.env 也讀 USERPROFILE,但 vibeHome() 走 VP_HOME_OVERRIDE 優先,所以只設它就夠
};

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
      // vite 不在意 testMode,reuse 沒副作用
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "bun run server",
      url: "http://127.0.0.1:3001/api/health",
      timeout: 30_000,
      // bun server 必須有 mock env 才能用,不能 reuse 不確定狀態的 server
      reuseExistingServer: false,
      env: TEST_ENV,
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
