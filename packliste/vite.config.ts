import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import react from "@vitejs/plugin-react-swc";
import { viteYak } from "next-yak/vite";
import { VitePWA } from "vite-plugin-pwa";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: "/packliste/",
  plugins: [
    viteYak({ basePath: resolve(__dirname, "..") }),
    react(),
    VitePWA({
      // "prompt": Updates werden nicht still im Hintergrund aktiviert, sondern
      // dem Nutzer als Banner angeboten ("Neue Version verfügbar"). Passt zur
      // Home-Screen-App, die sonst auf einem alten Build hängen bleibt.
      registerType: "prompt",
      includeAssets: ["favicon.ico", "apple-touch-icon-180x180.png", "icon.svg"],
      manifest: {
        name: "Packliste",
        short_name: "Packliste",
        description: "Familien-Packliste mit Bedingungen und Waschmaschinen-Logik",
        lang: "de",
        theme_color: "#2b5d8b",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait",
        scope: "/packliste/",
        start_url: "/packliste/",
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
      workbox: {
        // Vite-Build-Assets sind content-gehasht → unbedenklich im Precache.
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        // SPA mit HashRouter: jede Navigation landet auf der Einstiegs-HTML.
        navigateFallback: "/packliste/index.html",
        // Share-API liegt ausserhalb des /packliste/-Scopes, aber zur
        // Sicherheit explizit vom Navigation-Fallback ausnehmen.
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: {
    port: 5173,
  },
});
