import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: 'localhost',
    port: 5174,
    strictPort: true,
    cors: false,
    proxy: {
      '/portal': 'http://127.0.0.1:3101',
      '/healthz': 'http://127.0.0.1:3101',
      '/readyz': 'http://127.0.0.1:3101',
    },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 700,
  },
});
