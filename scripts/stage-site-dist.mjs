import { cpSync, existsSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'apps/site/dist');
const target = resolve(root, 'dist');
if (!existsSync(resolve(source, 'server/index.js'))) throw new Error('The public-site build is missing dist/server/index.js.');
rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });
const hostingTarget = resolve(target, '.openai/hosting.json');
mkdirSync(dirname(hostingTarget), { recursive: true });
copyFileSync(resolve(root, '.openai/hosting.json'), hostingTarget);
