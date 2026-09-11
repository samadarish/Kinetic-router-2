import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { THEME_BOOTSTRAP_SCRIPT } from '@kineticrouter/platform-config/theme';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'kineticrouter-theme-bootstrap',
      transformIndexHtml: {
        order: 'pre',
        handler: (html) => html.replace('</head>', `<script>${THEME_BOOTSTRAP_SCRIPT}</script></head>`),
      },
    },
  ],
  server: {
    // The public site's local worker connects over IPv4; keep browser URLs on localhost.
    host: '127.0.0.1',
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
