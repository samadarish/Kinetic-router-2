import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assets = resolve(root, 'packages/brand-ui/assets');
const mappings = [
  ['wordmark-light.png', 'apps/site/public/brand/kineticrouter/wordmark-light.png'],
  ['wordmark-dark.png', 'apps/site/public/brand/kineticrouter/wordmark-dark.png'],
  ['mark-light.png', 'apps/site/public/brand/kineticrouter/mark-light.png'],
  ['mark-dark.png', 'apps/site/public/brand/kineticrouter/mark-dark.png'],
  ['home-hero-640.webp', 'apps/site/public/brand/kineticrouter/home-hero-640.webp'],
  ['home-hero-1280.webp', 'apps/site/public/brand/kineticrouter/home-hero-1280.webp'],
  ['home-hero-2061.webp', 'apps/site/public/brand/kineticrouter/home-hero-2061.webp'],
  ['inter.woff2', 'apps/site/public/fonts/inter.woff2'],
  ['jetbrains-mono.woff2', 'apps/site/public/fonts/jetbrains-mono.woff2'],
  ['social-preview.jpg', 'apps/site/public/og.jpg'],
  ['favicon-16.png', 'apps/site/public/favicon-16.png'],
  ['favicon-32.png', 'apps/site/public/favicon-32.png'],
  ['favicon-48.png', 'apps/site/public/favicon-48.png'],
  ['favicon.ico', 'apps/site/public/favicon.ico'],
  ['apple-icon.png', 'apps/site/public/apple-icon.png'],
  ['app-icon-192.png', 'apps/site/public/favicon-192.png'],
  ['app-icon.png', 'apps/site/public/icon-512.png'],
  ['wordmark-light.png', 'apps/console/public/brand/kineticrouter/wordmark-light.png'],
  ['wordmark-dark.png', 'apps/console/public/brand/kineticrouter/wordmark-dark.png'],
  ['mark-light.png', 'apps/console/public/brand/kineticrouter/mark-light.png'],
  ['mark-dark.png', 'apps/console/public/brand/kineticrouter/mark-dark.png'],
  ['inter.woff2', 'apps/console/public/fonts/inter.woff2'],
  ['jetbrains-mono.woff2', 'apps/console/public/fonts/jetbrains-mono.woff2'],
  ['social-preview.jpg', 'apps/console/public/og.jpg'],
  ['favicon-16.png', 'apps/console/public/favicon-16.png'],
  ['favicon-32.png', 'apps/console/public/favicon-32.png'],
  ['favicon-48.png', 'apps/console/public/favicon-48.png'],
  ['favicon.ico', 'apps/console/public/favicon.ico'],
];

const retiredTargets = [
  'apps/site/public/icon.png',
  'apps/site/public/opengraph-image.png',
  'apps/site/public/og.png',
  'apps/console/public/og.png',
];

for (const retiredTarget of retiredTargets) {
  rmSync(resolve(root, retiredTarget), { force: true });
}

for (const [sourceName, targetName] of mappings) {
  const target = resolve(root, targetName);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(resolve(assets, sourceName), target);
}
