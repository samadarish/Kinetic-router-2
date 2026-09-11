import { SiteLink } from './site-link';
import { providerDisplayStatus } from '@/data/provider-availability';
import { ArrowRightIcon } from './icons';
import { CatalogNotice } from './catalog-notice';
import { ProviderLogo } from './provider-logo';
import { CodexCard } from './home-codex-card';
import { models } from '@/data/content';
import { formatUsd, usdPrice } from '@/data/model-utils';
import { catalogUpdateNotice } from '@/data/catalog-summary';

const popular = ['anthropic', 'openai', 'grok'].flatMap((provider) => {
  const model = models.filter((item) => item.provider === provider && item.enabled && item.category === 'chat').sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!model) return [];
  return [{
    provider: model.name.split(':')[0], providerId: model.provider,
    name: model.name.replace(/^[^:]+:\s*/, ''), id: model.id,
    input: formatUsd(usdPrice(model, 'sell', 'input')), output: formatUsd(usdPrice(model, 'sell', 'output')), cache: formatUsd(usdPrice(model, 'sell', 'cache_read')),
    oi: formatUsd(usdPrice(model, 'official', 'input')), oo: formatUsd(usdPrice(model, 'official', 'output')), oc: formatUsd(usdPrice(model, 'official', 'cache_read')),
  }];
});

function PriceCard({ item }: { item: (typeof popular)[number] }) {
  const status = providerDisplayStatus(item.providerId);
  return (
    <SiteLink href={`/models/${item.id}`} className="surface group block p-4 transition">
      <div className="flex items-start gap-3"><ProviderLogo provider={item.providerId} className="mt-0.5 h-6 w-6 shrink-0" /><div className="min-w-0"><h3 className="truncate text-xs font-semibold">{item.provider}: {item.name}</h3><p className="mt-1 truncate font-mono text-xs text-muted-foreground">{item.id} · {status.modelAccessState === 'reference' ? 'Reference' : status.badgeLabel}</p></div></div>
      <div className="mt-5 overflow-hidden rounded-lg border border-border bg-muted/30 text-xs"><div className="grid grid-cols-3 border-b border-border px-3 py-2 font-semibold"><span>Snapshot</span><span className="text-primary">kineticRouter</span><span className="text-right">Official ref.</span></div>{[['Input', item.input, item.oi], ['Output', item.output, item.oo], ['Cache read', item.cache, item.oc]].map((row) => <div key={row[0]} className="grid grid-cols-3 border-b border-border/50 px-3 py-2 last:border-0"><span className="text-muted-foreground">{row[0]}</span><span className="text-right text-primary">{row[1]}</span><span className="text-right text-muted-foreground">{row[2]}</span></div>)}</div>
    </SiteLink>
  );
}

export function HomeSections() {
  return (
    <>
      <section className="border-y border-border/60 bg-muted/25 py-10 md:py-14"><div className="page-container mx-auto max-w-4xl"><CodexCard /></div></section>
      <section className="border-b border-border/60 py-10 md:py-14"><div className="page-container"><div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center"><div><h2 className="text-2xl font-semibold tracking-tight">Popular reference prices</h2><p className="mt-1 text-xs text-muted-foreground">Prices from the dated catalog, with provider availability.</p></div><SiteLink href="/models" className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-xs text-muted-foreground transition hover:text-foreground sm:ml-auto">View full model pricing <ArrowRightIcon className="h-4 w-4" /></SiteLink></div><CatalogNotice compact supplement={catalogUpdateNotice} /><div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{popular.map((item) => <PriceCard key={item.id} item={item} />)}</div></div></section>
    </>
  );
}
