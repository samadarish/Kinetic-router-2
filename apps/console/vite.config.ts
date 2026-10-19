import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';
import react from '@vitejs/plugin-react';
import { THEME_BOOTSTRAP_SCRIPT } from '@kineticrouter/platform-config/theme';
import { LOCALE_BOOTSTRAP_SCRIPT } from '@kineticrouter/platform-config/locale';

const preferenceScript = `${THEME_BOOTSTRAP_SCRIPT}\n${LOCALE_BOOTSTRAP_SCRIPT}`;
const themeFile = `assets/preferences-${createHash('sha256').update(preferenceScript).digest('hex').slice(0, 12)}.js`;

export default defineConfig({
  plugins: [
    // The app's tsconfig selects the translation JSX runtime. Keeping the
    // plugin default avoids its forced prebundle of a workspace runtime.
    react(),
    {
      name: 'kineticrouter-theme-bootstrap',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: themeFile, source: preferenceScript });
      },
      transformIndexHtml: {
        order: 'post',
        handler: (_html, context) => [{
          tag: 'script', injectTo: 'head-prepend',
          ...(context.server ? { children: preferenceScript } : { attrs: { src: `/${themeFile}` } }),
        }],
      },
    },
  ],
  // Keep the JSX runtime and provider in the same module graph. Prebundling
  // only the runtime would create a second React translation context in dev.
  optimizeDeps: { exclude: ['@kineticrouter/i18n'] },
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
