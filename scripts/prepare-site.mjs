import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import './sync-brand-assets.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(root, 'apps/site/.openai/hosting.json');
mkdirSync(dirname(target), { recursive: true });
copyFileSync(resolve(root, '.openai/hosting.json'), target);

await import('../apps/site/scripts/generate-docs-sitemap.mjs');
