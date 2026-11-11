import { defineConfig } from 'vitest/config';

// Unit tests for the pure payroll logic. The Playwright e2e suite under
// tests/e2e lives on its own runner, so it is excluded here.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node'
  }
});
