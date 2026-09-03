import { Brand } from './brand';
import { ProviderLogo } from './provider-logo';
import { displayStateLabel, type ProviderId } from '@/data/provider-availability';
import type { SiteConfig } from '@/data/site-config';

export function PublicFooter({ content }: { content: SiteConfig }) {
  const { brand, home, navigation, providers } = content;
  return (
    <footer className="overflow-hidden border-t border-border/70 bg-background pt-12">
      <div className="page-container grid gap-10 lg:grid-cols-[minmax(280px,.95fr)_minmax(0,1.55fr)]">
        <div className="min-w-0">
          <a href="/" aria-label={`${brand.displayName} home`} className="inline-flex max-w-full">
            <Brand className="w-[180px] max-w-full" label={brand.displayName} />
          </a>
          <p className="mt-4 text-xs text-muted-foreground">© 2026 {brand.legalName}. All rights reserved.</p>
          <p className="mt-3 max-w-sm text-xs leading-5 text-muted-foreground">{home.footerDescription || brand.tagline}</p>
        </div>
        <div className={`grid min-w-0 grid-cols-2 gap-8 ${navigation.footerColumns.length > 2 ? 'sm:grid-cols-3' : ''}`}>
          {navigation.footerColumns.map((column) => (
            <div key={column.id}>
              <h2 className="text-xs font-semibold">{column.title}</h2>
              <ul className="mt-5 space-y-3.5">
                {column.links.map((link) => {
                  const provider = (['openai', 'anthropic', 'grok'] as ProviderId[]).find((id) => link.id === id || link.href === `/models/${id}`);
                  const status = provider ? providers[provider] : undefined;
                  return (
                    <li key={link.id}>
                      <a href={link.href} target={link.external ? '_blank' : undefined} rel={link.external ? 'noreferrer' : undefined} className={`inline-flex items-center gap-2 text-xs text-muted-foreground transition hover:text-foreground ${provider === 'anthropic' ? 'text-[#D97757]' : ''}`}>
                        {provider && <ProviderLogo provider={provider} className="h-3.5 w-3.5" />}
                        {link.label}
                        {status && <span className="text-[7px] tracking-wider opacity-60">{displayStateLabel(status.modelAccessState).toUpperCase()}</span>}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div aria-hidden="true" className="footer-watermark page-container -mb-[.09em] mt-10 select-none text-center">{brand.displayName}</div>
    </footer>
  );
}
