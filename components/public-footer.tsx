import { Brand } from './brand';
import { ProviderLogo } from './provider-logo';

const columns = [
  { title: 'Product', links: [['Model pricing', '/models'], ['Price comparison', '/pricing'], ['Quick Start', '/quickstart'], ['Vibe Coding', '/vibe-coding']] },
  { title: 'Providers', links: [['OpenAI', '/models/openai'], ['Anthropic', '/models/anthropic'], ['Grok', '/models/grok']] },
  { title: 'Resources', links: [['Docs', '/docs'], ['llms.txt', '/llms.txt'], ['Terms of Service', '/terms-of-service'], ['Privacy Policy', '/privacy']] },
];

export function PublicFooter() {
  return (
    <footer className="overflow-hidden border-t border-border/70 bg-background pt-12">
      <div className="page-container grid gap-10 lg:grid-cols-[minmax(280px,.95fr)_minmax(0,1.55fr)]">
        <div className="min-w-0">
          <a href="/" aria-label="kineticRouter home" className="inline-flex max-w-full">
            <Brand className="w-[180px] max-w-full" />
          </a>
          <p className="mt-4 text-xs text-muted-foreground">© 2026 kineticRouter. All rights reserved.</p>
          <p className="mt-3 max-w-sm text-xs leading-5 text-muted-foreground">OpenAI-compatible API access plus a dated Hao.ai catalog. Native Anthropic and Grok routes are planned.</p>
          <a href="mailto:support@kineticrouter.com" className="mt-4 inline-flex text-xs font-medium text-primary hover:underline">support@kineticrouter.com</a>
        </div>
        <div className="grid min-w-0 grid-cols-2 gap-8 sm:grid-cols-3">
          {columns.map((column) => (
            <div key={column.title}>
              <h2 className="text-xs font-semibold">{column.title}</h2>
              <ul className="mt-5 space-y-3.5">
                {column.links.map(([label, href]) => { const provider = column.title === 'Providers' ? label.toLowerCase() : undefined; return <li key={href}><a href={href} className={`inline-flex items-center gap-2 text-xs text-muted-foreground transition hover:text-foreground ${label === 'Anthropic' ? 'text-[#D97757]' : ''}`}>{provider && <ProviderLogo provider={provider} className="h-3.5 w-3.5" />}{label}{provider && <span className="text-[7px] tracking-wider opacity-60">{label === 'OpenAI' ? 'PARTIAL' : 'PLANNED'}</span>}</a></li>; })}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div aria-hidden="true" className="footer-watermark page-container -mb-[.09em] mt-10 select-none text-center">kineticRouter</div>
    </footer>
  );
}
