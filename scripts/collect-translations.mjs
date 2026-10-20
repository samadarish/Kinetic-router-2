import fs from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import ts from 'typescript';
import { parseFragment } from 'parse5';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const catalogRoot = path.join(root, 'packages/i18n/src/catalogs');
export const locales = ['en', 'es', 'pt', 'id', 'de', 'fr', 'ru', 'ko', 'ja', 'zh-CN', 'vi'];
const normalize = value => value.replace(/\s+/g, ' ').trim();
const protectedNames = new Set(['English', 'Español', 'Português', 'Bahasa Indonesia', 'Deutsch', 'Français', 'Russian', 'Korean', 'Japanese', 'Simplified Chinese', 'OpenAI', 'Anthropic', 'Grok', 'DeepSeek', 'Zhipu', 'Moonshot', 'Gemini', 'MiniMax', 'Meta', 'Claude', 'Google', 'GitHub', 'Discord', 'Telegram', 'Reddit', 'YouTube', 'X', 'LinkedIn', 'Instagram', 'Facebook', 'Bluesky', 'TikTok', 'Python', 'Node.js', 'JavaScript', 'TypeScript', 'JSON', 'cURL', 'HTTP', 'HTTPS', 'WebSocket', 'SSE', 'OAuth', 'TOTP', 'UTC', 'USD', 'kineticRouter', 'kineticrouter.com', 'API', 'ID', 'IP', 'POST', 'GET', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS', 'Escape', 'Enter', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Tab']);
// Home is also a navigation label; keyboard comparisons are excluded below.
protectedNames.delete('Home');
protectedNames.add('NFKC'); // Unicode normalization form, not user-facing copy.
protectedNames.add('Tiếng Việt');

function human(value) {
  const text = normalize(value);
  if (!text || text.length > 4000 || !/[a-zA-Z]{2}/.test(text) || protectedNames.has(text)) return false;
  if (/^(?:https?:|\/|\.|@|#|--|data-|aria-|\$|\^)/.test(text)) return false;
  if (/=>|\b(?:const|import|export|function|return)\s|\n\s*(?:from|if)\s|[{}](?!\d+\})/.test(text.replace(/\{\d+\}/g, ''))) return false;
  if (/[<>]|(?:[\w-]+:){2}/.test(text)) return false;
  if (!/\s/.test(text) && !/^[A-Z][a-zA-Z….'’!?-]*$/.test(text)) return false;
  return true;
}

export function htmlMessages(html) {
  const result = new Set();
  function visit(node, preserve = false, code = false) {
    const name = node.tagName;
    const attrs = node.attrs ?? [];
    const blocked = preserve || ['code', 'script', 'style', 'svg', 'math'].includes(name) || attrs.some(attr => attr.name === 'translate' && attr.value === 'no');
    const insideCode = code || name === 'pre';
    if (!blocked) {
      for (const attr of attrs) if (['title', 'aria-label', 'alt', 'placeholder'].includes(attr.name) && human(attr.value)) result.add(normalize(attr.value));
      if (node.nodeName === '#text' && (!insideCode || code === 'button') && human(node.value)) result.add(normalize(node.value));
    }
    for (const child of node.childNodes ?? []) visit(child, blocked, name === 'button' ? 'button' : insideCode);
  }
  visit(parseFragment(html));
  return result;
}

async function filesIn(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.filter(entry => !['node_modules', '.next', 'dist', '.vite'].includes(entry.name)).map(entry => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? filesIn(filename) : /\.[cm]?[jt]sx?$/.test(filename) && !/\.(?:test|d)\.[cm]?[jt]sx?$/.test(filename) ? [filename] : [];
  }))).flat();
}

function sourceMessages(source, filename) {
  const result = new Set();
  const add = (value, jsxText = false) => {
    if (/<[a-z][\s>]/i.test(value)) for (const message of htmlMessages(value)) result.add(message);
    else if (human(value) || (jsxText && /^[a-z]+$/.test(normalize(value)))) result.add(normalize(value));
  };
  const tree = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, filename.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const skipProperties = /^(?:className|class|id|name|key|type|value|href|src|target|rel|role|to|path|code|provider|model|modelId|color|stroke|fill|variant|icon|category|kind|status|state|phase|mode|format|method|display|position|align|width|height|fontFamily|fontWeight|fontSize|gridTemplateColumns|contentType|autoComplete|inputMode|download|route|baseUrl|baseURL|apiBase|apiKey|slug|order|language)$/;
  function visit(node) {
    const parent = node.parent;
    if (ts.isJsxText(node)) add(node.text, true);
    else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const jsxAttribute = ts.isJsxAttribute(parent) ? parent : ts.isJsxExpression(parent) && ts.isJsxAttribute(parent.parent) ? parent.parent : undefined;
      if (jsxAttribute && !['title', 'description', 'intro', 'updated', 'subtitle', 'helper', 'message', 'label', 'emptyTitle', 'emptyDescription', 'heading', 'hint', 'aria-label', 'aria-description', 'aria-valuetext', 'alt', 'placeholder'].includes(jsxAttribute.name.getText(tree))) return;
      if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent) || ts.isLiteralTypeNode(parent) || ts.isCaseClause(parent)) return;
      if (ts.isBinaryExpression(parent) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken].includes(parent.operatorToken.kind)) return;
      if (ts.isPropertyAssignment(parent) && (parent.name === node || skipProperties.test(parent.name.getText(tree).replace(/['"]/g, '')))) return;
      if (ts.isCallExpression(parent) && /(?:querySelector|closest|matches|setAttribute|removeAttribute|addEventListener|removeEventListener|dispatchEvent|setItem|getItem|removeItem|\.includes|\.startsWith|\.endsWith|\.split|\.join)$/.test(parent.expression.getText(tree))) return;
      add(node.text);
    } else if (ts.isTemplateExpression(node)) {
      if (ts.isJsxExpression(parent) && ts.isJsxAttribute(parent.parent) && !['title', 'description', 'intro', 'updated', 'subtitle', 'helper', 'message', 'label', 'emptyTitle', 'emptyDescription', 'heading', 'hint', 'aria-label', 'aria-description', 'aria-valuetext', 'alt', 'placeholder'].includes(parent.parent.name.getText(tree))) return;
      if (ts.isPropertyAssignment(parent) && skipProperties.test(parent.name.getText(tree).replace(/['"]/g, ''))) return;
      add(node.head.text + node.templateSpans.map((span, index) => `{${index}}${span.literal.text}`).join(''));
    }
    if (ts.isJsxElement(node)) {
      let index = 0;
      const phrase = node.children.map(child => ts.isJsxText(child) ? child.text : ts.isJsxExpression(child) ? `{${index++}}` : '\u0000').join('');
      for (const part of phrase.split('\u0000')) if (/\{\d+\}/.test(part) && part.replace(/\{\d+\}/g, '').trim().length >= 4) add(part);
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return result;
}

export const documentName = route => `docs-${route === '/docs' ? 'index' : route.slice('/docs/'.length).replaceAll('/', '--')}`;

export async function collectSources() {
  const sets = { site: new Set(), console: new Set() };
  const enumLabels = ['active', 'inactive', 'enabled', 'disabled', 'available', 'unavailable', 'pending', 'planned', 'verified', 'partial', 'reference', 'success', 'failed', 'stopped', 'cancelled', 'queued', 'running', 'complete', 'completed', 'unknown', 'unlimited', 'admin', 'user', 'assistant', 'system', 'error', 'warning', 'info', 'daily', 'weekly', 'monthly', 'yearly', 'request', 'requests', 'tokens', 'models', 'text', 'image', 'vision', 'chat', 'input', 'output', 'cache', 'cached', 'default'];
  for (const label of enumLabels) { sets.site.add(label); sets.console.add(label); }
  const shared = [...await filesIn(path.join(root, 'packages/platform-config/src')), ...await filesIn(path.join(root, 'packages/i18n/src'))].filter(file => !file.includes(`${path.sep}catalogs${path.sep}`) && !file.endsWith('catalogs.generated.ts'));
  for (const [namespace, directories] of Object.entries({ site: ['apps/site/components', 'apps/site/app', 'apps/site/data'], console: ['apps/console/src', 'apps/bff/src'] })) {
    // Only public-facing, static application text is collected. No environment,
    // credentials, user records, API payloads, or live account data are read.
    const sources = [...(await Promise.all(directories.map(dir => filesIn(path.join(root, dir))))).flat(), ...shared];
    for (const filename of sources) for (const message of sourceMessages(await fs.readFile(filename, 'utf8'), filename)) sets[namespace].add(message);
  }
  await fs.mkdir(path.join(root, '.cache'), { recursive: true });
  // Compile the small, pure data graph into the ignored cache. CommonJS also
  // works on the repository's minimum Node 22.13, without experimental loaders.
  const compiled = new Map();
  const pendingWrites = [];
  function compile(filename) {
    if (compiled.has(filename)) return compiled.get(filename);
    const target = path.join(root, '.cache/translation-modules', `${path.relative(root, filename)}.cjs`);
    compiled.set(filename, target);
    const source = readFileSync(filename, 'utf8');
    let output = filename.endsWith('.json') ? `module.exports = ${source};` : ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
    output = output.replace(/require\(["']([^"']+)["']\)/g, (original, specifier) => {
      if (!specifier.startsWith('.') && !specifier.startsWith('@kineticrouter/')) return original;
      const candidate = specifier.startsWith('@kineticrouter/')
        ? path.join(root, 'packages', specifier.split('/')[1], 'src', specifier.split('/').slice(2).join('/') || 'index')
        : path.resolve(path.dirname(filename), specifier);
      const dependency = [candidate, `${candidate}.ts`, candidate.replace(/\.js$/, '.ts')].find(file => existsSync(file));
      if (!dependency) throw new Error(`Unresolved data dependency: ${filename}: ${specifier}`);
      const relative = path.relative(path.dirname(target), compile(dependency)).replaceAll(path.sep, '/');
      return `require(${JSON.stringify(relative.startsWith('.') ? relative : `./${relative}`)})`;
    });
    pendingWrites.push(fs.mkdir(path.dirname(target), { recursive: true }).then(() => fs.writeFile(target, output)));
    return target;
  }
  const compiledContent = compile(path.join(root, 'apps/site/data/content.ts'));
  await Promise.all(pendingWrites);
  const { docsRoutes, getDocsPage, models } = createRequire(import.meta.url)(compiledContent);
  await fs.writeFile(path.join(root, '.cache/protected-translation-terms.json'), JSON.stringify([...new Set(models.flatMap(model => [model.name, model.name.replace(/^[^:]+:\s*/, ''), model.id]))]));
  const publicCopyKeys = new Set(['description', 'tagline', 'summary', 'evidenceNote', 'badgeLabel', 'protocolLabel', 'title', 'label', 'note', 'pricingNote', 'q', 'a']);
  function collectPublicCopy(value, key = '') {
    if (typeof value === 'string') { if (publicCopyKeys.has(key) && human(value)) sets.site.add(normalize(value)); }
    else if (Array.isArray(value)) value.forEach(item => collectPublicCopy(item, key));
    else if (value && typeof value === 'object') for (const [name, item] of Object.entries(value)) collectPublicCopy(item, name);
  }
  collectPublicCopy(models);
  for (const filename of ['provider-registry.json', 'model-registry.json']) {
    const location = path.join(root, 'packages/platform-config/src', filename);
    if (existsSync(location)) collectPublicCopy(JSON.parse(readFileSync(location, 'utf8')));
  }
  for (const route of docsRoutes) {
    const page = getDocsPage(route);
    const messages = htmlMessages(page.content?.html ?? '');
    for (const text of [page.meta?.title, page.meta?.description, ...(page.meta?.headings ?? []), page.status?.label, page.status?.summary]) if (text && human(text)) messages.add(normalize(text));
    sets[`docs:${route}`] = messages;
  }
  return Object.fromEntries(Object.entries(sets).map(([namespace, values]) => [namespace, Object.fromEntries([...values].sort().map(value => [value, value]))]));
}

export async function writeCatalog(locale, namespace, catalog) {
  const filename = namespace.startsWith('docs:') ? documentName(namespace.slice(5)) : namespace;
  const directory = path.join(catalogRoot, locale);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, `${filename}.json`), `${JSON.stringify(catalog, null, 2)}\n`);
}

export async function writeLoaders(namespaces) {
  const lines = ['// Generated by scripts/collect-translations.mjs. Catalogs are loaded by locale and surface.', "import type { Locale } from '@kineticrouter/platform-config/locale';", 'export const catalogLoaders: Partial<Record<Locale, Record<string, () => Promise<{ default: Record<string, string> }>>>> = {'];
  for (const locale of locales.filter(value => value !== 'en')) {
    lines.push(`  '${locale}': {`);
    for (const namespace of namespaces) {
      const filename = namespace.startsWith('docs:') ? documentName(namespace.slice(5)) : namespace;
      lines.push(`    ${JSON.stringify(namespace)}: () => import('./catalogs/${locale}/${filename}.json'),`);
    }
    lines.push('  },');
  }
  lines.push('};', '');
  await fs.writeFile(path.join(root, 'packages/i18n/src/catalogs.generated.ts'), lines.join('\n'));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sources = await collectSources();
  if (process.argv.includes('--check')) {
    const failures = [];
    for (const locale of locales) for (const [namespace, english] of Object.entries(sources)) {
      const filename = namespace.startsWith('docs:') ? documentName(namespace.slice(5)) : namespace;
      let catalog;
      try { catalog = JSON.parse(await fs.readFile(path.join(catalogRoot, locale, `${filename}.json`), 'utf8')); } catch { failures.push(`${locale}/${filename}: missing catalog`); continue; }
      for (const source of Object.keys(english)) {
        if (!catalog[source]?.trim()) failures.push(`${locale}/${filename}: missing ${source.slice(0, 70)}`);
        else if (JSON.stringify([...source.matchAll(/\{\d+\}/g)].map(match => match[0]).sort()) !== JSON.stringify([...catalog[source].matchAll(/\{\d+\}/g)].map(match => match[0]).sort())) failures.push(`${locale}/${filename}: changed interpolation ${source.slice(0, 70)}`);
      }
    }
    if (failures.length) { console.error(failures.slice(0, 25).join('\n')); console.error(`${failures.length} translation errors.`); process.exitCode = 1; }
    else console.log(`Checked ${locales.length} languages and ${Object.keys(sources).length} namespaces.`);
  } else {
    for (const [namespace, catalog] of Object.entries(sources)) await writeCatalog('en', namespace, catalog);
    await fs.writeFile(path.join(root, '.cache/translation-sources.json'), JSON.stringify(sources));
    console.log(Object.fromEntries(Object.entries(sources).map(([namespace, catalog]) => [namespace, Object.keys(catalog).length])));
  }
}
