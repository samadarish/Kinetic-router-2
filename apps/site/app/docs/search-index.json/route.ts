import { docsRoutes } from '@/data/content';
import { getLocalizedDocsPage } from '@/data/localized-documentation';
import type { DocsSearchEntry } from '@/data/docs-search';
import { documentationPlainText } from '@/data/authored-guides';
import { DEFAULT_LOCALE, parseLocale, type Locale } from '@kineticrouter/platform-config/locale';

const indexes = new Map<Locale, Promise<DocsSearchEntry[]>>();

export async function GET(request: Request) {
  const locale = parseLocale(new URL(request.url).searchParams.get('locale')) ?? DEFAULT_LOCALE;
  let index = indexes.get(locale);
  if (!index) {
    index = Promise.all(docsRoutes.map(async route => {
      const { meta, content, status } = await getLocalizedDocsPage(route, locale);
      return meta && content && status.status !== 'planned'
        ? [{ route, title: meta.title, headings: meta.headings, text: documentationPlainText(content.html) }]
        : [];
    })).then(entries => entries.flat()).catch(error => { indexes.delete(locale); throw error; });
    indexes.set(locale, index);
  }
  return Response.json(await index, { headers: { 'Cache-Control': 'public, max-age=300', 'X-Robots-Tag': 'noindex, follow', 'Content-Language': locale } });
}
