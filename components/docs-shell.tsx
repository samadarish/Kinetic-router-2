import { CopyPageButton } from './copy-page-button';
import { DocsHeader } from './docs-header';
import { rebrandHtml } from '@/data/brand';
import type { DocumentationStatus } from '@/data/documentation';
import { docsNavigation } from '@/data/docs-navigation';
import { DocsNavigation } from './docs-navigation';
import { DocsStatusBanner } from './docs-status-banner';

function pageToc(html: string, fallback: string[]) {
  const matches = [...html.matchAll(/<h[23][^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/h[23]>/gi)].map((match) => ({ id: match[1], heading: match[2].replace(/<[^>]+>/g, '').replaceAll('&amp;', '&').replaceAll('&#x27;', "'") }));
  return matches.length ? matches.slice(0, 10) : fallback.filter(Boolean).slice(1, 10).map((heading) => ({ heading, id: heading.toLowerCase().replace(/[^a-z0-9]+/g, '-') }));
}

export function DocsShell({ route, html, headings, status }: { route: string; html: string; headings: string[]; status: DocumentationStatus }) {
  const toc = pageToc(html, headings);
  const renderedHtml = rebrandHtml(html);
  return (
    <div className="min-h-screen bg-background text-foreground"><DocsHeader route={route} navigation={docsNavigation} />
      <div className="mx-auto grid max-w-[1440px] grid-cols-1 pt-16 lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)_230px]">
        <aside className="hidden h-[calc(100vh-4rem)] border-r border-border lg:sticky lg:top-16 lg:block"><DocsNavigation groups={docsNavigation} route={route} className="h-full overflow-y-auto px-4 py-7" /></aside>
        <main className={`min-w-0 px-5 py-8 sm:px-8 lg:px-10 xl:px-12 docs-route-${status.status}`}><div className="mx-auto max-w-3xl"><DocsStatusBanner status={status} />{status.status !== 'planned' && <CopyPageButton />}<div className="clear-both docs-article" dangerouslySetInnerHTML={{ __html: renderedHtml }} /></div><div className="mx-auto mt-12 flex max-w-3xl items-center justify-between border-t border-border py-8 text-xs text-muted-foreground"><a href="/docs">Kinetic Router Documentation</a><a href="mailto:support@kineticrouter.com">support@kineticrouter.com</a></div></main>
        <aside className="hidden h-[calc(100vh-4rem)] border-l border-border px-5 py-8 xl:sticky xl:top-16 xl:block"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">On this page</p><nav className="mt-4 space-y-2">{toc.map(({ heading, id }) => <a key={id} href={`#${id}`} className="block text-[11px] leading-5 text-muted-foreground hover:text-foreground">{heading}</a>)}</nav><div className="mt-8 border-t border-border pt-5 text-[11px] text-muted-foreground"><a href="/llms.txt" className="block py-1 hover:text-foreground">Copy page for LLMs</a><a href="mailto:support@kineticrouter.com" className="block py-1 hover:text-foreground">Need help? Email support ↗</a></div></aside>
      </div>
    </div>
  );
}
