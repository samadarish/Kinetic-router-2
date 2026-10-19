import { createTranslator, loadCatalog, localizeHtml } from '@kineticrouter/i18n';
import { DEFAULT_LOCALE, type Locale } from '@kineticrouter/platform-config/locale';
import { docsRoutes, getDocsPage, type ResolvedDocsPage } from './content';
import { documentationPlainText } from './authored-guides';

const knownRoutes = new Set(docsRoutes);
const localizedPages = new Map<string, Promise<ResolvedDocsPage>>();

export async function getLocalizedDocsPage(route: string, locale: Locale): Promise<ResolvedDocsPage> {
  if (locale === DEFAULT_LOCALE || !knownRoutes.has(route)) return getDocsPage(route);
  const key = `${locale}:${route}`;
  let pending = localizedPages.get(key);
  if (!pending) {
    pending = (async () => {
      const page = getDocsPage(route);
      if (!page.meta || !page.content) return page;
      const catalog = await loadCatalog(locale, `docs:${route}`);
      const { text } = createTranslator(catalog, locale);
      const html = localizeHtml(page.content.html, catalog);
      return {
        ...page,
        meta: { ...page.meta, title: text(page.meta.title), description: text(page.meta.description), headings: page.meta.headings.map(text) },
        content: { ...page.content, html, text: documentationPlainText(html) },
        status: { ...page.status, label: text(page.status.label), summary: text(page.status.summary) },
      };
    })().catch(error => { localizedPages.delete(key); throw error; });
    localizedPages.set(key, pending);
  }
  return pending;
}
