'use client';

import { useMemo, useState } from 'react';
import type { Model } from '@/data/model-utils';
import { displayContextWindow } from '@/data/model-utils';
import { CatalogNotice } from './catalog-notice';
import { FilterIcon, SearchIcon } from './icons';
import { ModelCard } from './model-card';
import { ProviderLogo, providerLabel } from './provider-logo';

const capabilities = ['vision', 'function', 'reasoning', 'search', 'cache', 'pdf'];

export function ModelCatalog({ models, initialProvider }: { models: Model[]; initialProvider?: string }) {
  const [query, setQuery] = useState('');
  const [provider, setProvider] = useState(initialProvider ?? 'all');
  const [capability, setCapability] = useState('all');
  const [sort, setSort] = useState('recommended');
  const [mobileFilters, setMobileFilters] = useState(false);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const result = models.filter((model) => (provider === 'all' || model.provider === provider) && (capability === 'all' || model.capabilityFlags.includes(capability)) && (!normalized || `${model.name} ${model.id} ${model.tagline}`.toLowerCase().includes(normalized)));
    if (sort === 'name') return [...result].sort((a, b) => a.name.localeCompare(b.name));
    if (sort === 'context') return [...result].sort((a, b) => displayContextWindow(b) - displayContextWindow(a));
    if (sort === 'newest') return [...result].sort((a, b) => b.date.localeCompare(a.date));
    return result;
  }, [models, query, provider, capability, sort]);

  const filters = (
    <div className="space-y-7">
      <div><h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Provider</h2><div className="mt-3 space-y-1">{['all', 'openai', 'anthropic', 'grok'].map((item) => <button key={item} onClick={() => setProvider(item)} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs ${provider === item ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'}`}>{item === 'all' ? <span className="grid h-5 w-5 place-items-center">✦</span> : <ProviderLogo provider={item} className="h-4 w-4" />}<span>{item === 'all' ? 'All providers' : providerLabel(item)}</span><span className="ml-auto text-[10px]">{item === 'all' ? models.length : models.filter((m) => m.provider === item).length}</span></button>)}</div></div>
      <div><h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Capabilities</h2><div className="mt-3 space-y-1">{['all', ...capabilities].map((item) => <button key={item} onClick={() => setCapability(item)} className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-xs capitalize ${capability === item ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'}`}>{item === 'all' ? 'All capabilities' : item}</button>)}</div></div>
    </div>
  );

  return (
    <div className="page-container py-10 md:py-14">
      <div className="mb-7"><p className="text-xs font-semibold text-primary">MODEL CATALOG</p><h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">Models & reference pricing</h1><p className="mt-3 max-w-2xl text-sm text-muted-foreground">Browse the exact Hao.ai model and price snapshot. OpenAI is partially verified on Kinetic Router; Anthropic and Grok native routes are marked planned.</p></div>
      <CatalogNotice />
      <div className="flex gap-7">
        <aside className="hidden w-[250px] shrink-0 border-r border-border pr-6 lg:block">{filters}</aside>
        <div className="min-w-0 flex-1">
          <div className="mb-5 flex flex-wrap gap-3"><label className="relative min-w-[220px] flex-1"><SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search models" className="h-10 w-full rounded-lg border border-border bg-card pl-10 pr-3 text-xs placeholder:text-muted-foreground" /></label><select value={sort} onChange={(event) => setSort(event.target.value)} className="h-10 rounded-lg border border-border bg-card px-3 text-xs"><option value="recommended">Recommended</option><option value="newest">Newest</option><option value="context">Largest context</option><option value="name">Name</option></select><button onClick={() => setMobileFilters((value) => !value)} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-xs lg:hidden"><FilterIcon className="h-4 w-4" /> Filters</button></div>
          {mobileFilters && <div className="surface mb-5 p-4 lg:hidden">{filters}</div>}
          <div className="mb-4 text-xs text-muted-foreground">{filtered.length} models</div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{filtered.map((model) => <ModelCard key={model.id} model={model} />)}</div>
          {!filtered.length && <div className="surface py-16 text-center"><p className="text-sm font-semibold">No models found</p><button onClick={() => { setQuery(''); setProvider('all'); setCapability('all'); }} className="mt-3 text-xs text-primary">Clear filters</button></div>}
        </div>
      </div>
    </div>
  );
}
