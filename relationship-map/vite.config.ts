import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

const API_PORT = process.env.API_PORT ?? "8787";

// Relative base so the built bundle works whether served from `/` or a sub-path.
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: `http://localhost:${API_PORT}`,
        changeOrigin: true,
      },
    },
  },
});
