import { defineConfig } from 'vitest/config';

// Pure logic only — no DOM, no Supabase. The ICS parser lives with the Edge
// Function it belongs to and is imported from there by these tests.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      // Die Edge Function importiert `jose` als URL (so lädt Deno sie beim
      // Deploy); unter vitest zeigt derselbe Import auf das npm-Paket, damit
      // die Tests exakt den ausgelieferten Code prüfen.
      'https://esm.sh/jose@6.2.10': 'jose',
    },
  },
});
