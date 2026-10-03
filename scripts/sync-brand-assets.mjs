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

for (const name of ['wordmark-light', 'wordmark-dark', 'mark-light', 'mark-dark']) {
  for (const app of ['site', 'console']) {
    mappings.push([`${name}.webp`, `apps/${app}/public/brand/kineticrouter/${name}.webp`]);
  }
}
for (const theme of ['dark', 'light']) {
  for (const app of ['site', 'console']) mappings.push([`header-mark-${theme}.png`, `apps/${app}/public/brand/kineticrouter/header-mark-${theme}.png`]);
}
for (const width of [640, 1280, 2062]) {
  for (const format of ['avif', 'webp']) mappings.push([`home-hero-river-delta-${width}.${format}`, `apps/site/public/brand/kineticrouter/home-hero-river-delta-${width}.${format}`]);
}

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
