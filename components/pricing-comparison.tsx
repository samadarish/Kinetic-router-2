'use client';

import { useMemo, useState } from 'react';
import type { Model } from '@/data/model-utils';
import { discountRate, displayContextWindow, formatTokens, formatUsd, usdPrice } from '@/data/model-utils';
import { SearchIcon } from './icons';
import { CatalogNotice } from './catalog-notice';
import { ProviderLogo, providerLabel } from './provider-logo';

const providers = ['all', 'openai', 'anthropic', 'grok'] as const;

export function PricingComparison({ models }: { models: Model[] }) {
  const [query, setQuery] = useState('');
  const [provider, setProvider] = useState<(typeof providers)[number]>('all');
  const filtered = useMemo(
    () => models.filter((model) => (provider === 'all' || model.provider === provider) && (!query || `${model.name} ${model.id}`.toLowerCase().includes(query.toLowerCase()))),
    [models, query, provider],
  );

  return (
    <section className="page-container py-12 md:py-16">
      <div className="mb-7 flex flex-col gap-4 lg:flex-row lg:items-end">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Reference model pricing</h2>
          <p className="mt-2 text-xs text-muted-foreground">Exact Hao.ai snapshot prices per 1M tokens, retained for comparison and not presented as a live billing feed.</p>
        </div>
        <div className="flex flex-wrap gap-2 lg:ml-auto">
          {providers.map((item) => (
            <button key={item} onClick={() => setProvider(item)} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-[11px] ${provider === item ? 'border-primary bg-primary text-white' : 'border-border text-muted-foreground'}`}>
              {item !== 'all' && <ProviderLogo provider={item} className="h-3.5 w-3.5" />}
              {item === 'all' ? 'All models' : providerLabel(item)}
              {item !== 'all' && <span className="text-[9px] opacity-70">{item === 'openai' ? 'PARTIAL' : 'PLANNED'}</span>}
            </button>
          ))}
        </div>
      </div>
      <CatalogNotice compact />
      <label className="relative mb-4 block"><SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-card pl-10 pr-3 text-xs" placeholder="Search model pricing" /></label>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[940px] border-collapse text-left text-[11px]">
          <thead className="bg-muted/60"><tr><th className="px-4 py-3">Model</th><th className="px-4 py-3">Upstream context</th><th className="px-4 py-3 text-primary">Snapshot input</th><th className="px-4 py-3 text-primary">Snapshot output</th><th className="px-4 py-3">Official input</th><th className="px-4 py-3">Official output</th><th className="px-4 py-3">Snapshot rate</th></tr></thead>
          <tbody>{filtered.map((model) => {
            const rate = discountRate(model);
            return <tr key={model.id} className="border-t border-border transition hover:bg-muted/30"><td className="px-4 py-3"><a href={`/models/${model.provider}/${model.slug}`} className="flex items-center gap-3"><ProviderLogo provider={model.provider} className="h-5 w-5" /><span><strong className="block text-xs">{model.name}</strong><span className="font-mono text-[9px] text-muted-foreground">{model.id}</span></span></a></td><td className="px-4 py-3">{formatTokens(displayContextWindow(model))}</td><td className="px-4 py-3 font-semibold text-primary">{formatUsd(usdPrice(model, 'sell', 'input'))}</td><td className="px-4 py-3 font-semibold text-primary">{formatUsd(usdPrice(model, 'sell', 'output'))}</td><td className="px-4 py-3 text-muted-foreground">{formatUsd(usdPrice(model, 'official', 'input'))}</td><td className="px-4 py-3 text-muted-foreground">{formatUsd(usdPrice(model, 'official', 'output'))}</td><td className="px-4 py-3"><span className="rounded-md border border-[var(--brand-soft-border)] bg-[var(--brand-soft-bg)] px-2 py-1 text-[9px] text-[var(--brand-soft-text)]">{rate == null ? 'Reference' : `${Number(rate.toFixed(2))}x`}</span></td></tr>;
          })}</tbody>
        </table>
      </div>
    </section>
  );
}
