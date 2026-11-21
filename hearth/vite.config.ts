import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' keeps every asset path relative, which Home Assistant ingress requires
// (the app is served under /api/hassio_ingress/<token>/).
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8099',
      '/photos': 'http://localhost:8099',
    },
  },
});
