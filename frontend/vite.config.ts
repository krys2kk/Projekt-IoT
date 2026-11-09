import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// npm run build -> statyczny build do dist/, serwowany przez backend
// npm run dev   -> praca nad panelem; /api przekazywane na backend (VITE_BACKEND_URL)
export default defineConfig({
  plugins: [react()],
  // Względne ścieżki: build działa niezależnie od adresu Raspberry Pi.
  base: './',
  server: {
    proxy: { '/api': { target: process.env.VITE_BACKEND_URL || 'http://localhost:8000', changeOrigin: true } },
  },
  build: { outDir: 'dist', chunkSizeWarningLimit: 900 },
});
