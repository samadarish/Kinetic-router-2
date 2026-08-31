import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const sourceTargets = [
  'app', 'components', 'data', 'public', 'scripts', 'test', '.openai',
  '.gitignore', 'eslint.config.mjs', 'next.config.ts', 'vite.config.ts',
  'tsconfig.json', 'package.json', 'package-lock.json', 'README.md',
].filter(existsSync);
const builtTargets = ['dist', '.next'].filter(existsSync);
const targets = [...sourceTargets, ...builtTargets];
// Keep the retired product tokens out of this file too, so the repository-wide
// brand gate can include its own implementation without a self-exclusion.
const retiredRoot = ['h', 'ao'].join('');
const retiredCompact = `${retiredRoot}ai`;
const retiredSeparated = `${retiredRoot}[._ -]ai`;
const spacedBrand = ['Kinetic', 'Router'].join(' ');
const forbidden = `(?i)(?:\\b${retiredCompact}\\b|\\b${retiredSeparated}\\b|\\b${retiredRoot}\\b|support@kineticrouter\\.com|${spacedBrand})`;
const result = spawnSync('rg', ['-n', '--hidden', '--glob', '!node_modules/**', forbidden, ...targets], {
  cwd: new URL('../', import.meta.url),
  encoding: 'utf8',
});

if (result.error) {
  console.error(`Brand check could not run ripgrep: ${result.error.message}`);
  process.exit(1);
}
if (result.status === 0) {
  console.error('Brand check found forbidden product copy:');
  console.error(result.stdout.trim());
  process.exit(1);
}
if (result.status !== 1) {
  console.error(result.stderr || `ripgrep exited with status ${result.status}`);
  process.exit(result.status ?? 1);
}

const casingCheck = spawnSync('rg', ['-n', '--hidden', '--glob', '!node_modules/**', '\\bKineticRouter\\b', ...targets], {
  cwd: new URL('../', import.meta.url),
  encoding: 'utf8',
});
if (casingCheck.status === 0) {
  console.error('Brand check found an invalid product-name casing:');
  console.error(casingCheck.stdout.trim());
  process.exit(1);
}
if (casingCheck.status !== 1) process.exit(casingCheck.status ?? 1);

const removedControlPattern = "<GlobeIcon|/console/chat|[\"']Open Chat[\"']";
const controlCheck = spawnSync('rg', ['-n', removedControlPattern, 'app', 'components', 'data'], {
  cwd: new URL('../', import.meta.url),
  encoding: 'utf8',
});
if (controlCheck.status === 0) {
  console.error('Public UI still contains a removed product control:');
  console.error(controlCheck.stdout.trim());
  process.exit(1);
}
if (controlCheck.status !== 1) process.exit(controlCheck.status ?? 1);

console.log(`Brand checks passed across source${builtTargets.length ? ' and built output' : ''}.`);
