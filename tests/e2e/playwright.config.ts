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

// e2e backend 跑 3003 不撞 dev backend 的 3001
// (避免 playwright 中斷時 child bun 留下 zombie 鎖死 dev port)
const E2E_PORT = "3003";

const TEST_ENV: Record<string, string> = {
  VP_TEST_MODE: "mock",
  VP_HOME_OVERRIDE: TEST_HOME,
  PORT: E2E_PORT,
  // Windows 上 Bun 的 process.env 也讀 USERPROFILE,但 vibeHome() 走 VP_HOME_OVERRIDE 優先,所以只設它就夠
};

const VITE_ENV: Record<string, string> = {
  VITE_API_BASE_URL: `http://127.0.0.1:${E2E_PORT}`,
};

export default defineConfig({
  testDir: "./mock",
  fullyParallel: false,
  workers: 1,
  // 個別 test 偶爾 flake(temp dir 清理時 fs.watch / mock runner 殘餘 timeline);retry 1 次擋掉。
  retries: process.env.CI ? 2 : 1,
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
      // vite 讀 VITE_API_BASE_URL → frontend fetch 直連 e2e backend(繞過 vite /api proxy)
      env: VITE_ENV,
    },
    {
      command: "bun run server",
      url: `http://127.0.0.1:${E2E_PORT}/api/health`,
      timeout: 30_000,
      // 本地開發 reuse 之前 playwright 起的 mock server(env 會延續);CI 永遠重啟。
      // e2e backend 跑 PORT=3003 不撞 dev 用的 3001
      reuseExistingServer: !process.env.CI,
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
