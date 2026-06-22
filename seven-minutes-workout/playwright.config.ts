import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the 7-Minute-Workout PWA.
 *
 * - Each test starts from a clean localStorage (tests/helpers.ts `freshPage`).
 * - The app is served by the Vite dev server under the base `/seven-minutes-workout/`.
 * - Chromium only by default (CI installs just Chromium); set PW_WITH_WEBKIT=1
 *   to also run WebKit locally.
 */
export default defineConfig({
  testDir: "./tests",
  retries: process.env.CI ? 1 : 0,
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  reporter: [["list"], ["html", { open: "never" }]],
  expect: { timeout: 6_000 },
  use: {
    baseURL: "http://localhost:5174",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 6_000,
    navigationTimeout: 15_000,
  },
  projects: process.env.PW_WITH_WEBKIT
    ? [
        { name: "chromium", use: { ...devices["Desktop Chrome"] } },
        { name: "webkit", use: { ...devices["Desktop Safari"] } },
      ]
    : [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    port: 5174,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
