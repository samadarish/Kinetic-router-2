import type { Model } from '@/data/model-utils';
import { discountRate, displayContextWindow, formatTokens, formatUsd, usdPrice } from '@/data/model-utils';
import { ArrowRightIcon } from './icons';
import { ProviderLogo } from './provider-logo';

export function ModelCard({ model }: { model: Model }) {
  const rate = discountRate(model);
  const rateLabel = rate == null ? 'Reference' : `${Number(rate.toFixed(2))}x ref`;
  return (
    <a href={`/models/${model.provider}/${model.slug}`} className="surface group flex min-h-[250px] flex-col p-5 transition duration-200 hover:-translate-y-0.5 hover:border-primary/50">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border bg-muted/50"><ProviderLogo provider={model.provider} className="h-6 w-6" /></span>
        <div className="min-w-0"><h2 className="line-clamp-2 text-[15px] font-semibold leading-5">{model.name}</h2><p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">{model.id}</p></div>
        <span className="ml-auto shrink-0 rounded-md border border-[var(--brand-soft-border)] bg-[var(--brand-soft-bg)] px-2 py-1 text-[9px] font-semibold text-[var(--brand-soft-text)]">{rateLabel}</span>
      </div>
      <p className="mt-5 line-clamp-3 text-xs leading-5 text-muted-foreground">{model.tagline}</p>
      <div className="mt-5 flex flex-wrap gap-1.5">{model.capabilityFlags.slice(0, 4).map((flag) => <span key={flag} className="rounded-md bg-muted px-2 py-1 text-[9px] capitalize text-muted-foreground">{flag}</span>)}</div>
      <div className="mt-auto grid grid-cols-3 gap-2 border-t border-border/70 pt-4 text-[10px]"><div><span className="block text-muted-foreground">Snapshot input</span><strong className="mt-1 block text-primary">{formatUsd(usdPrice(model, 'sell', 'input'))}</strong></div><div><span className="block text-muted-foreground">Snapshot output</span><strong className="mt-1 block text-primary">{formatUsd(usdPrice(model, 'sell', 'output'))}</strong></div><div><span className="block text-muted-foreground">Upstream context</span><strong className="mt-1 block">{formatTokens(displayContextWindow(model))}</strong></div></div>
      <div className="mt-4 inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground transition group-hover:text-primary">View model <ArrowRightIcon className="h-3.5 w-3.5" /></div>
    </a>
  );
}
