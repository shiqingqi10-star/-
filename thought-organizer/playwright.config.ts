import { defineConfig } from "@playwright/test";
import { join } from "node:path";
import { tmpdir } from "node:os";
// Test-only database location for provider contract fixtures; never exposed by the app.
process.env.PLAYWRIGHT_TEST_DB_META ||= join(
  tmpdir(),
  "thought-playwright-" + process.pid + ".json",
);
export default defineConfig({
  testDir: "tests/browser",
  workers: 1,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3100",
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
      args: ["--no-sandbox"],
    },
    headless: true,
  },
  reporter: "list",
  outputDir: "data/browser-results",
  webServer: {
    command: "node scripts/test-server.mjs",
    url: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3100",
    reuseExistingServer: false,
    gracefulShutdown: { signal: "SIGTERM", timeout: 10000 },
    timeout: 120000,
  },
});
