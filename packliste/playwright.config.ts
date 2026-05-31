import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the Packliste-App.
 *
 * - Tests start with a clean LocalStorage (siehe tests/helpers.ts `freshPage`
 *   bzw. der `beforeEach` Hook in jeder Spec, der `addInitScript` setzt).
 * - Baseline-URL führt direkt auf den Vite-Base-Path `/packliste/`.
 * - WebKit ist als zweites Browser-Projekt konfiguriert; das CI-Skript
 *   sollte die Browser via `playwright install` bereitstellen. Falls
 *   WebKit-Systemlibs fehlen (Sandbox), kann das Projekt per
 *   `PLAYWRIGHT_PROJECT=chromium` eingeschränkt werden — oder ueber den
 *   Script-Eintrag `test:chromium`.
 */
export default defineConfig({
  testDir: "./tests",
  // Fast feedback: keine Retries lokal, einer in CI.
  retries: process.env.CI ? 1 : 0,
  fullyParallel: true,
  // Workers — moderate parallelism. Webserver wird einmal global gestartet.
  workers: process.env.CI ? 2 : undefined,
  reporter: [["list"], ["html", { open: "never" }]],
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL: "http://localhost:5173/packliste/",
    // Jeder Test startet mit komplett leerem Speicher. Wir überschreiben
    // das zusätzlich in tests/helpers.ts `freshPage` mit addInitScript,
    // damit auch HMR-Caches greifbar geleert werden.
    storageState: undefined,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 5_000,
    navigationTimeout: 15_000,
  },
  // Browser-Projekte. WebKit ist optional — wer keine WebKit-Systemlibs
  // hat (sandboxed CI), kann via env `PW_SKIP_WEBKIT=1` ausschließen.
  projects: process.env.PW_SKIP_WEBKIT
    ? [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }]
    : [
        {
          name: "chromium",
          use: { ...devices["Desktop Chrome"] },
        },
        {
          name: "webkit",
          use: { ...devices["Desktop Safari"] },
        },
      ],
  webServer: {
    command: "npm run dev",
    port: 5173,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    // Vite logs to stderr by default — diese kurz mit-streamen, dann ruhig.
    stdout: "ignore",
    stderr: "pipe",
  },
});
