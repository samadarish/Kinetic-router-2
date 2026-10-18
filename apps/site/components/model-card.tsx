import { PriceDiscount } from './price-discount';
import { SiteLink } from './site-link';
import type { CatalogModel } from '@/data/model-utils';
import { displayContextWindow, formatTokens, formatUsd, usdPrice } from '@/data/model-utils';
import { ArrowRightIcon } from './icons';
import { ProviderLogo } from './provider-logo';

export function ModelCard({ model }: { model: CatalogModel }) {
  return (
    <SiteLink href={`/models/${model.provider}/${model.slug}`} className="surface group flex min-h-[250px] flex-col p-5 transition duration-200 hover:border-primary/50">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border bg-muted/50"><ProviderLogo provider={model.provider} className="h-6 w-6" /></span>
        <div className="min-w-0"><h2 className="line-clamp-2 text-[15px] font-semibold leading-5">{model.name}</h2><p className="mt-1 truncate font-mono text-xs text-muted-foreground">{model.id}</p></div>
      </div>
      <div className="mt-4"><PriceDiscount model={model} /></div>
      <p className="mt-3 line-clamp-3 text-xs leading-5 text-muted-foreground">{model.tagline}</p>
      <div className="mt-5 flex flex-wrap gap-1.5">{model.capabilityFlags.slice(0, 4).map((flag) => <span key={flag} className="rounded-md bg-muted px-2 py-1 text-xs capitalize text-muted-foreground">{flag}</span>)}</div>
      <div className="mt-auto grid grid-cols-3 gap-2 border-t border-border/70 pt-4 text-xs"><div><span className="block text-muted-foreground">Input / 1M tokens</span><strong className="mt-1 block text-primary">{formatUsd(usdPrice(model, 'sell', 'input'))}</strong><span className="mt-1 block text-[10px] text-muted-foreground line-through">{formatUsd(usdPrice(model, 'official', 'input'))}</span></div><div><span className="block text-muted-foreground">Output / 1M tokens</span><strong className="mt-1 block text-primary">{formatUsd(usdPrice(model, 'sell', 'output'))}</strong><span className="mt-1 block text-[10px] text-muted-foreground line-through">{formatUsd(usdPrice(model, 'official', 'output'))}</span></div><div><span className="block text-muted-foreground">Upstream context</span><strong className="mt-1 block">{formatTokens(displayContextWindow(model))}</strong></div></div>
      <div className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground transition group-hover:text-primary">View model <ArrowRightIcon className="h-3.5 w-3.5" /></div>
    </SiteLink>
  );
}
