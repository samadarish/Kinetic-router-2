import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'test/**/*.test.ts',
      'test/**/*.test.tsx',
      'apps/console/src/**/*.test.ts',
      'apps/console/src/**/*.test.tsx',
    ],
    exclude: ['**/node_modules/**', '**/dist/**', 'web/**', 'portal/**'],
  },
});
