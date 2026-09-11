'use client';

import { SiteLink } from './site-link';
import { useMemo, useState } from 'react';
import type { CatalogModel } from '@/data/model-utils';
import { displayContextWindow, formatTokens, formatUsd, usdPrice } from '@/data/model-utils';
import { displayStateLabel, providerDisplayStatus } from '@/data/provider-availability';
import { SearchIcon } from './icons';
import { CatalogNotice } from './catalog-notice';
import { catalogUpdateNotice } from '@/data/catalog-summary';
import { ProviderLogo, providerLabel } from './provider-logo';

const providers = ['all', 'openai', 'anthropic', 'grok'] as const;

export function PricingComparison({ models }: { models: CatalogModel[] }) {
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
          <p className="mt-2 text-xs text-muted-foreground">Imported snapshot prices per 1M tokens, retained for comparison and not presented as a live billing feed.</p>
        </div>
        <div className="flex flex-wrap gap-2 lg:ml-auto">
          {providers.map((item) => (
            <button key={item} onClick={() => setProvider(item)} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${provider === item ? 'border-primary bg-primary text-white' : 'border-border text-muted-foreground'}`}>
              {item !== 'all' && <ProviderLogo provider={item} className="h-3.5 w-3.5" />}
              {item === 'all' ? 'All models' : providerLabel(item)}
              {item !== 'all' && <span className="text-xs opacity-70">{displayStateLabel(providerDisplayStatus(item).modelAccessState).toUpperCase()}</span>}
            </button>
          ))}
        </div>
      </div>
      <CatalogNotice compact supplement={catalogUpdateNotice} />
      <label className="relative mb-4 block"><SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-card pl-10 pr-3 text-xs" placeholder="Search model pricing" /></label>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[940px] border-collapse text-left text-xs">
          <thead className="bg-muted/60"><tr><th className="px-4 py-3">Model</th><th className="px-4 py-3">Upstream context</th><th className="px-4 py-3 text-primary">Snapshot input</th><th className="px-4 py-3 text-primary">Snapshot output</th><th className="px-4 py-3">Official input</th><th className="px-4 py-3">Official output</th></tr></thead>
          <tbody>{filtered.map((model) => {
                      return <tr key={model.id} className="border-t border-border transition hover:bg-muted/30"><td className="px-4 py-3"><SiteLink href={`/models/${model.provider}/${model.slug}`} className="flex items-center gap-3"><ProviderLogo provider={model.provider} className="h-5 w-5" /><span><strong className="block text-xs">{model.name}</strong><span className="font-mono text-xs text-muted-foreground">{model.id}</span></span></SiteLink></td><td className="px-4 py-3">{formatTokens(displayContextWindow(model))}</td><td className="px-4 py-3 font-semibold text-primary">{formatUsd(usdPrice(model, 'sell', 'input'))}</td><td className="px-4 py-3 font-semibold text-primary">{formatUsd(usdPrice(model, 'sell', 'output'))}</td><td className="px-4 py-3 text-muted-foreground">{formatUsd(usdPrice(model, 'official', 'input'))}</td><td className="px-4 py-3 text-muted-foreground">{formatUsd(usdPrice(model, 'official', 'output'))}</td></tr>;
          })}</tbody>
        </table>
      </div>
    </section>
  );
}
