import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { VitePWA } from 'vite-plugin-pwa';

// Relative base so one build works at both URLs the app is served from:
//   https://familienplaner.zillessen.dev/        (canonical, worker rewrite)
//   https://<experiments-host>/family-planner/   (fallback / preview deploys)
// The PWA manifest below is written for the canonical subdomain — that is the
// URL meant to be installed on a phone home screen.
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      // "prompt": a new build is offered as a banner instead of silently
      // swapping under the user's fingers (see components/UpdatePrompt.tsx).
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Familienplaner',
        short_name: 'Planer',
        description: 'Wochen- und Monatsplaner für die ganze Familie',
        lang: 'de',
        theme_color: '#2f6f5e',
        background_color: '#faf7f0',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        // Vite build assets are content-hashed → safe to precache.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // config.js carries the Supabase URL/key and is generated per deploy —
        // never precache it, always go to the network.
        globIgnores: ['**/config.js'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true
      }
    })
  ],
  server: { port: 8081 }
});
