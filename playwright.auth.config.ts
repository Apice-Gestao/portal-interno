import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/auth",
  globalTeardown: "./tests/auth/global-teardown.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://127.0.0.1:5175",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node scripts/dev-auth-test.mjs",
    url: "http://127.0.0.1:5175",
    reuseExistingServer: false,
    timeout: 90_000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 15_000 },
  },
});
