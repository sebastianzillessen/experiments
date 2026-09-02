import { defineConfig } from 'vitest/config';

// Pure logic only — no DOM, no Supabase. The ICS parser lives with the Edge
// Function it belongs to and is imported from there by these tests.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
