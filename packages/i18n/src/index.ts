import { decodeHTML } from 'entities/decode';
import { escapeText, escapeAttribute } from 'entities/escape';
import { DEFAULT_LOCALE, type Locale } from '@kineticrouter/platform-config/locale';
import { messages, type MessageKey } from './messages.js';
import { catalogLoaders } from './catalogs.generated.js';

export type Catalog = Readonly<Record<string, string>>;
export type CatalogNamespace = 'site' | 'console' | `docs:${string}`;
export const normalizeMessage = (value: string) => value.replace(/\s+/g, ' ').trim();
const loads = new Map<string, Promise<Catalog>>();

export async function loadCatalog(locale: Locale, namespace: CatalogNamespace): Promise<Catalog> {
  if (locale === DEFAULT_LOCALE) return {};
  const key = `${locale}:${namespace}`;
  let pending = loads.get(key);
  if (!pending) {
    const loader = catalogLoaders[locale]?.[namespace];
    if (!loader) throw new Error(`Unknown translation catalog: ${key}`);
    pending = loader().then(module => module.default).catch(error => { loads.delete(key); throw error; });
    loads.set(key, pending);
  }
  return pending;
}

type Pattern = { expression: RegExp; parameters: string[]; translated: string };
const patterns = new WeakMap<Catalog, Pattern[]>();
const translatedValues = new WeakMap<Catalog, Map<string, string>>();
const caseInsensitiveValues = new WeakMap<Catalog, Map<string, string>>();
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function catalogPatterns(catalog: Catalog) {
  let cached = patterns.get(catalog);
  if (!cached) {
    cached = Object.entries(catalog).filter(([source]) => /\{\d+\}/.test(source))
      .sort(([a], [b]) => b.replace(/\{\d+\}/g, '').length - a.replace(/\{\d+\}/g, '').length)
      .map(([source, translated]) => {
        const parameters = [...source.matchAll(/\{(\d+)\}/g)].map(match => match[1]!);
        const expression = new RegExp(`^${source.split(/\{\d+\}/).map(escapeRegex).join('(.+?)')}$`, 's');
        return { expression, parameters, translated };
      });
    patterns.set(catalog, cached);
  }
  return cached;
}

export function translateText(value: string, catalog: Catalog): string {
  if (!value || !/[a-zA-Z]/.test(value)) return value;
  const source = normalizeMessage(value);
  let cache = translatedValues.get(catalog);
  if (!cache) { cache = new Map(); translatedValues.set(catalog, cache); }
  const cached = cache.get(source);
  if (cached !== undefined) return `${value.match(/^\s*/)?.[0] ?? ''}${cached}${value.match(/\s*$/)?.[0] ?? ''}`;
  let translated = catalog[source];
  if (translated === undefined && source === source.toUpperCase()) {
    let insensitive = caseInsensitiveValues.get(catalog);
    if (!insensitive) { insensitive = new Map(Object.entries(catalog).map(([key, value]) => [key.toLowerCase(), value])); caseInsensitiveValues.set(catalog, insensitive); }
    translated = insensitive.get(source.toLowerCase())?.toUpperCase();
  }
  if (translated === undefined) {
    for (const pattern of catalogPatterns(catalog)) {
      const match = pattern.expression.exec(source);
      if (!match) continue;
      const parameters = Object.fromEntries(pattern.parameters.map((name, index) => [name, match[index + 1]!]));
      translated = pattern.translated.replace(/\{(\d+)\}/g, (token, name: string) => parameters[name] ?? token);
      break;
    }
  }
  if (cache.size >= 2048) cache.clear();
  cache.set(source, translated ?? source);
  if (translated === undefined) return value;
  return `${value.match(/^\s*/)?.[0] ?? ''}${translated}${value.match(/\s*$/)?.[0] ?? ''}`;
}

export function createTranslator(catalog: Catalog = {}, locale: Locale = DEFAULT_LOCALE) {
  const text = (source: string) => translateText(source, catalog);
  return {
    text,
    t: (key: MessageKey) => text(messages[key]),
    interpolate: (source: string, parameters: Record<string, string | number>) => text(source).replace(/\{([\w]+)\}/g, (token, key: string) => String(parameters[key] ?? token)),
    plural: (count: number, forms: Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }) => text(forms[new Intl.PluralRules(locale).select(count)] ?? forms.other).replaceAll('{count}', String(count)),
  };
}

/** Translate text and accessible labels without parsing/re-serializing executable markup. */
export function localizeHtml(html: string, catalog: Catalog): string {
  const stack: Array<{ name: string; preserve: boolean }> = [];
  return html.replace(/<!--[\s\S]*?-->|<[^>"']*(?:"[^"]*"|'[^']*'|[^>"']*)*>|[^<]+/g, token => {
    if (token.startsWith('<!--')) return token;
    if (token.startsWith('</')) { stack.pop(); return token; }
    if (token.startsWith('<')) {
      const name = /^<([\w-]+)/.exec(token)?.[1]?.toLowerCase();
      if (!name) return token;
      const inherited = stack.at(-1)?.preserve ?? false;
      const preserve = inherited || ['code', 'script', 'style', 'svg', 'math'].includes(name) || /\btranslate=["']no["']/.test(token);
      let result = token;
      if (!inherited) {
        // Event handling and CSS use these stable actions, never a translated title.
        if (name === 'button' && /\btitle=["']Copy code["']/.test(token) && !token.includes('data-docs-action=')) result = result.replace('<button', '<button data-docs-action="copy"');
        if (name === 'button' && /\btitle=["']Toggle word wrap["']/.test(token) && !token.includes('data-docs-action=')) result = result.replace('<button', '<button data-docs-action="wrap"');
        result = result.replace(/\b(title|aria-label|alt|placeholder)=("([^"]*)"|'([^']*)')/g, (_attribute, key: string, _quoted: string, double: string | undefined, single: string | undefined) => `${key}="${escapeAttribute(translateText(decodeHTML(double ?? single ?? ''), catalog)).replaceAll('<', '&lt;').replaceAll('>', '&gt;')}"`);
      }
      if (!/\/>$/.test(token) && !['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'].includes(name)) stack.push({ name, preserve });
      return result;
    }
    if (stack.at(-1)?.preserve) return token;
    const decoded = decodeHTML(token);
    const translated = translateText(decoded, catalog);
    return translated === decoded ? token : escapeText(translated);
  });
}

export { messages };
export type { MessageKey, Locale };
