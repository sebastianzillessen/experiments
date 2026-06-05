import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

export default defineConfig({
  // Relative base so the build works both at "/" (e2e static serve) and at
  // "/kinderbetreuung-lohn/" (production on Cloudflare Pages).
  base: './',
  plugins: [react()],
  server: {
    port: 8080
  }
});
