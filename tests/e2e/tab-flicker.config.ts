import { defineConfig } from "@playwright/test";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export default defineConfig({
  testDir: resolve(ROOT_DIR, "tests/e2e"),
  testMatch: /tab-flicker-probe\.spec\.ts/,
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  use: { headless: true, baseURL: "http://localhost:4173" },
  // 不啟 webServer,讓 probe 連 live backend (3001) + preview (4173)
});
