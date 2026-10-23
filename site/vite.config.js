import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
// sitemap.xml is written by scripts/build-seo-manifest.mjs from the same page list the server uses.
export default defineConfig({
  plugins: [
    react(),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    // Local development: run the API on :3000 (see backend/README) and Vite proxies to it.
    proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: false } },
  },
})
