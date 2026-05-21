import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import react from "@vitejs/plugin-react-swc";
import { viteYak } from "next-yak/vite";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: "/packliste/",
  plugins: [
    viteYak({ basePath: resolve(__dirname, "..") }),
    react(),
  ],
  server: {
    port: 5173,
  },
});
