import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';
import react from '@vitejs/plugin-react';
import { THEME_BOOTSTRAP_SCRIPT } from '@kineticrouter/platform-config/theme';

const themeFile = `assets/theme-${createHash('sha256').update(THEME_BOOTSTRAP_SCRIPT).digest('hex').slice(0, 12)}.js`;

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'kineticrouter-theme-bootstrap',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: themeFile, source: THEME_BOOTSTRAP_SCRIPT });
      },
      transformIndexHtml: {
        order: 'post',
        handler: (_html, context) => [{
          tag: 'script', injectTo: 'head-prepend',
          ...(context.server ? { children: THEME_BOOTSTRAP_SCRIPT } : { attrs: { src: `/${themeFile}` } }),
        }],
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
