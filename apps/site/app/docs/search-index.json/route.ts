import { docsRoutes, getDocsPage } from '@/data/content';
import type { DocsSearchEntry } from '@/data/docs-search';
import { documentationPlainText } from '@/data/authored-guides';

const entries: DocsSearchEntry[] = docsRoutes.flatMap((route) => {
  const { meta, content, status } = getDocsPage(route);
  return meta && content && status.status !== 'planned'
    ? [{ route, title: meta.title, headings: meta.headings, text: documentationPlainText(content.html) }]
    : [];
});

export function GET() {
  return Response.json(entries, { headers: { 'Cache-Control': 'public, max-age=300', 'X-Robots-Tag': 'noindex, follow' } });
}
