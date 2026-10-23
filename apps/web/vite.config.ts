import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // In development the API runs separately; in production DigitalOcean routes /api to it.
    proxy: { '/api': 'http://localhost:3000' },
  },
});
