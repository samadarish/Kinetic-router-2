import { CopyPageButton } from './copy-page-button';
import { DocsArticle } from './docs-article';
import { DocsHeader } from './docs-header';
import type { DocsPresentation } from '@/data/docs-presentation';
import type { DocumentationStatus } from '@/data/documentation';
import { docsNavigation } from '@/data/docs-navigation';
import { DocsNavigation } from './docs-navigation';
import { DocsStatusBanner } from './docs-status-banner';
import { siteConfig } from '@/data/site-config';
import { SiteTheme } from './site-theme';

export function DocsShell({ route, presentation, text, status }: { route: string; presentation: DocsPresentation; text: string; status: DocumentationStatus }) {
  const isDocsHome = route === '/docs';
  const { toc, html: renderedHtml } = presentation;
  const layout = isDocsHome
    ? 'grid-cols-1'
    : 'grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)_230px]';

  return (
    <div className="site-theme-root min-h-screen bg-background text-foreground">
      <SiteTheme />
      <DocsHeader route={route} navigation={docsNavigation} headerLinks={siteConfig.navigation.docsHeader} brand={siteConfig.brand} />
      <div className={`mx-auto grid max-w-[1440px] pt-16 ${layout}`}>
        {!isDocsHome && (
          <aside className="hidden h-[calc(100vh-4rem)] border-r border-border lg:sticky lg:top-16 lg:block">
            <DocsNavigation groups={docsNavigation} route={route} className="h-full overflow-y-auto px-4 py-7" />
          </aside>
        )}

        <main className={`min-w-0 px-5 py-8 sm:px-8 lg:px-10 xl:px-12 docs-route-${status.status} ${isDocsHome ? 'docs-home-route' : ''}`}>
          <div className={`mx-auto ${isDocsHome ? 'max-w-5xl' : 'max-w-3xl'}`}>
            {!isDocsHome && <DocsStatusBanner status={status} />}
            {status.status !== 'planned' && <CopyPageButton key={`copy:${route}`} text={text} />}
            <DocsArticle key={`article:${route}`} html={renderedHtml} />
          </div>
          <div className={`mx-auto mt-12 flex items-center border-t border-border py-8 text-xs text-muted-foreground ${isDocsHome ? 'max-w-5xl' : 'max-w-3xl'}`}>
            <a href="/docs">{siteConfig.brand.displayName} Documentation</a>
          </div>
        </main>

        {!isDocsHome && (
          <aside className="hidden h-[calc(100vh-4rem)] border-l border-border px-5 py-8 xl:sticky xl:top-16 xl:block">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">On this page</p>
            <nav className="mt-4 space-y-2">{toc.map(({ heading, id }) => <a key={id} href={`#${id}`} className="block text-[11px] leading-5 text-muted-foreground hover:text-foreground">{heading}</a>)}</nav>
            <div className="mt-8 border-t border-border pt-5 text-[11px] text-muted-foreground"><a href="/llms.txt" className="block py-1 hover:text-foreground">Documentation index</a></div>
          </aside>
        )}
      </div>
    </div>
  );
}
