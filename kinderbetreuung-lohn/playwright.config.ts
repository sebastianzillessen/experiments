import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  globalSetup: './tests/global-setup.ts',
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html']] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:8080',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    // global-setup runs build.sh first, then this serves the static output.
    command: 'npx serve ../_site/kinderbetreuung-lohn -l 8080 --no-clipboard --no-port-switching',
    port: 8080,
    timeout: 30_000,
    reuseExistingServer: !process.env.CI
  }
});
