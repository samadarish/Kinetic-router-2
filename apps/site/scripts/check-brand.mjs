import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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
function scan(pattern) {
  const result = spawnSync('rg', ['--json', '--hidden', '--glob', '!node_modules/**', pattern, ...targets], {
    cwd: new URL('../', import.meta.url),
    encoding: 'utf8',
  });
  const reports = [];
  const expression = new RegExp(pattern.replace(/^\(\?i\)/, ''), pattern.startsWith('(?i)') ? 'gi' : 'g');
  const proxyPath = fileURLToPath(new URL('../proxy.ts', import.meta.url)).replaceAll('\\', '/');
  for (const line of (result.stdout ?? '').split('\n').filter(Boolean)) {
    const event = JSON.parse(line);
    if (event.type !== 'match') continue;
    const path = event.data.path.text;
    let content = event.data.lines.text;
    // Vinext embeds this exact local source path for proxy diagnostics. A checkout
    // directory name is not product copy; all other built/source text stays checked.
    if (/^(?:dist|\.next)[\\/]/.test(path)) {
      for (const quote of ['"', "'", '`']) content = content.replaceAll(`filePath:${quote}${proxyPath}${quote}`, `filePath:${quote}proxy.ts${quote}`);
    }
    for (const match of content.matchAll(expression)) reports.push(`${path}:${event.data.line_number}:${content.slice(Math.max(0, match.index - 80), match.index + match[0].length + 80).trim()}`);
  }
  return { result, reports };
}
const { result, reports } = scan(forbidden);

if (result.error) {
  console.error(`Brand check could not run ripgrep: ${result.error.message}`);
  process.exit(1);
}
if (reports.length) {
  console.error('Brand check found forbidden product copy:');
  console.error(reports.join('\n'));
  process.exit(1);
}
if (result.status !== 0 && result.status !== 1) {
  console.error(result.stderr || `ripgrep exited with status ${result.status}`);
  process.exit(result.status ?? 1);
}

const { result: casingCheck, reports: casingReports } = scan('\\bKineticRouter\\b');
if (casingReports.length) {
  console.error('Brand check found an invalid product-name casing:');
  console.error(casingReports.join('\n'));
  process.exit(1);
}
if (casingCheck.status !== 0 && casingCheck.status !== 1) process.exit(casingCheck.status ?? 1);

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
