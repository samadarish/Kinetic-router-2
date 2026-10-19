import { structuredData } from '@/data/seo';
import { serializeJsonLd } from '@/data/seo-policy.mjs';
import { getRequestLocale } from '@/data/locale';
import { createTranslator, loadCatalog } from '@kineticrouter/i18n';

export async function SeoJsonLd({ route }: { route: string }) {
  const data = structuredData(route);
  if (!data) return null;
  const locale = await getRequestLocale();
  const site = await loadCatalog(locale, 'site');
  const docs = route.startsWith('/docs') ? await loadCatalog(locale, `docs:${route === '/docs/en' ? '/docs' : route}`).catch(() => ({})) : {};
  const { text } = createTranslator({ ...site, ...docs }, locale);
  function translate(value: unknown, key = ''): unknown {
    if (typeof value === 'string') return key === 'inLanguage' ? locale : ['name', 'description', 'headline'].includes(key) ? text(value) : value;
    if (Array.isArray(value)) return value.map(item => translate(item, key));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, translate(item, name)]));
    return value;
  }
  const localized = translate(data);
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(localized) }} />;
}
