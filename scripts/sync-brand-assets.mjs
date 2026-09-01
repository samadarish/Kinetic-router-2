import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assets = resolve(root, 'packages/brand-ui/assets');
const mappings = [
  ['wordmark-light.png', 'apps/site/public/brand/kineticrouter/wordmark-light.png'],
  ['wordmark-dark.png', 'apps/site/public/brand/kineticrouter/wordmark-dark.png'],
  ['mark-light.png', 'apps/site/public/brand/kineticrouter/mark-light.png'],
  ['mark-dark.png', 'apps/site/public/brand/kineticrouter/mark-dark.png'],
  ['inter.woff2', 'apps/site/public/fonts/inter.woff2'],
  ['jetbrains-mono.woff2', 'apps/site/public/fonts/jetbrains-mono.woff2'],
  ['social-preview.png', 'apps/site/public/og.png'],
  ['wordmark-light.png', 'apps/console/public/brand/kineticrouter/wordmark-light.png'],
  ['wordmark-dark.png', 'apps/console/public/brand/kineticrouter/wordmark-dark.png'],
  ['mark-light.png', 'apps/console/public/brand/kineticrouter/mark-light.png'],
  ['mark-dark.png', 'apps/console/public/brand/kineticrouter/mark-dark.png'],
  ['inter.woff2', 'apps/console/public/fonts/inter.woff2'],
  ['jetbrains-mono.woff2', 'apps/console/public/fonts/jetbrains-mono.woff2'],
  ['social-preview.png', 'apps/console/public/og.png'],
];

for (const [sourceName, targetName] of mappings) {
  const target = resolve(root, targetName);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(resolve(assets, sourceName), target);
}
