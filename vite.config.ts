import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3051,
    host: true,
    proxy: {
      '/ws': {
        target: 'ws://localhost:4050',
        ws: true,
      },
      '/api': {
        target: 'http://localhost:4050',
        changeOrigin: true,
      }
    }
  },
  build: {
    target: 'esnext'
  }
});
