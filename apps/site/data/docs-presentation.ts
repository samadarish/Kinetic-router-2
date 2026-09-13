import { rebrandHtml } from './brand';
import type { ResolvedDocsPage } from './content';

export type DocsPresentation = { html: string; toc: Array<{ id: string; heading: string }> };
const presentations = new WeakMap<ResolvedDocsPage, DocsPresentation>();

function pageToc(html: string, fallback: string[]) {
  const matches = [...html.matchAll(/<h[23][^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/h[23]>/gi)].map((match) => ({ id: match[1], heading: match[2].replace(/<[^>]+>/g, '').replaceAll('&amp;', '&').replaceAll('&#x27;', "'") }));
  return matches.length ? matches : fallback.filter(Boolean).slice(1).map((heading) => ({ heading, id: heading.toLowerCase().replace(/[^a-z0-9]+/g, '-') }));
}

export function getDocsPresentation(page: ResolvedDocsPage): DocsPresentation | undefined {
  if (!page.meta || !page.content) return undefined;
  const cached = presentations.get(page);
  if (cached) return cached;
  const presentation = { html: rebrandHtml(page.content.html), toc: pageToc(page.content.html, page.meta.headings) };
  presentations.set(page, presentation);
  return presentation;
}
