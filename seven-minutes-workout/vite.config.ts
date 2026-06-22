import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { VitePWA } from "vite-plugin-pwa";

// Path-based base (like the sibling experiments). This keeps the app working on
// Cloudflare *preview* deploys, which are served by path
// (<preview>.workers.dev/seven-minutes-workout/) rather than on the custom
// domain. In production the Worker also serves it at the clean subdomain root
// (workout.zillessen.dev) via a host rewrite; push reminders work there because
// push delivery doesn't require the page to be SW-controlled, and an installed
// PWA opens at start_url=/seven-minutes-workout/ (inside the SW scope).
const BASE = "/seven-minutes-workout/";

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    VitePWA({
      // injectManifest: we ship a custom service worker (src/sw.ts) because we
      // need `push` + `notificationclick` handlers for the reminder
      // notifications — generateSW cannot add those.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      // "prompt": a new build is offered to the user via a banner instead of
      // silently reloading (matches the packliste home-screen-app behaviour).
      registerType: "prompt",
      injectRegister: "auto",
      includeAssets: ["favicon.svg", "apple-touch-icon-180x180.png"],
      manifest: {
        name: "7-Minuten Workout",
        short_name: "7min Workout",
        description:
          "Das wissenschaftliche 7-Minuten-Workout: 12 Übungen, 30 s Belastung / 10 s Pause — mit Timer, Streak und Erinnerungen.",
        lang: "de",
        theme_color: "#ff5a3c",
        background_color: "#0f1115",
        display: "standalone",
        orientation: "portrait",
        scope: BASE,
        start_url: BASE,
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
      },
      devOptions: {
        // Enables the SW (and push handlers) during `vite dev` for testing.
        enabled: true,
        type: "module",
      },
    }),
  ],
  server: {
    port: 5174,
  },
});
