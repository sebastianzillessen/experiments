import { defineConfig, devices } from "@playwright/test";

const PORT = 8787;
const BASE_URL = `http://localhost:${PORT}`;

/**
 * Tests run against the production server (built SPA + API) with an isolated,
 * throwaway SQLite DB. State is shared server-side, so we run serially with a
 * single worker; global-setup wipes the test DB before the server starts.
 */
export default defineConfig({
  testDir: "./tests",
  globalSetup: "./tests/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  expect: { timeout: 5_000 },
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 5_000,
    navigationTimeout: 15_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run build && npm start",
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      DB_PATH: "data/test.db",
      API_PORT: String(PORT),
    },
  },
});
