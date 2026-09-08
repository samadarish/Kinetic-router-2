'use client';

import { SiteLink } from './site-link';
import { useEffect, useRef, useState } from 'react';
import { providerDisplayStatus } from '@/data/provider-availability';
import { CodexIcon } from '@kineticrouter/brand-ui';
import { ArrowRightIcon, ClipboardIcon, ExternalIcon } from './icons';
import { CatalogNotice } from './catalog-notice';
import { ProviderLogo } from './provider-logo';
import { codexProviderConfig as config, codexStartCommand } from '@/data/codex-example';

function CodexCard() {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  const copyAttempt = useRef(0);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => { copyAttempt.current += 1; clearTimeout(copyTimer.current); }, []);
  async function copy(value: string) {
    const attempt = ++copyAttempt.current;
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(value);
      if (attempt !== copyAttempt.current) return;
      setCopied(true);
      setCopyError('');
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1000);
    } catch {
      if (attempt !== copyAttempt.current) return;
      setCopied(false);
      setCopyError('Could not copy. Select the configuration to copy it manually.');
    }
  }
  return (
    <article className="surface flex min-h-[460px] flex-col p-5 md:p-7">
      <div className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-[#9d9bff] to-[#3d55e7] text-white shadow-[0_8px_22px_rgba(61,85,231,.28)]"><CodexIcon className="h-5 w-5" /></span><h2 className="text-sm font-semibold">Connect Codex</h2></div>
      <ol className="mt-6 space-y-4">
        {['Set KINETICROUTER_API_KEY in your terminal environment', 'Add the provider to ~/.codex/config.toml without replacing existing settings', 'Start Codex with a model your key can access through Responses'].map((step, i) => <li key={step} className="flex items-center gap-3 text-xs text-muted-foreground"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold text-foreground">{i + 1}</span>{step}</li>)}
      </ol>
      <pre className="mt-7 flex-1 overflow-auto rounded-lg bg-[var(--terminal)] p-4 font-mono text-xs leading-[1.7] text-[#b8c8ff]"><code>{config}</code></pre>
      <pre className="mt-3 overflow-auto rounded-lg border border-border p-3 font-mono text-xs"><code>{codexStartCommand}</code></pre>
      <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-xs text-muted-foreground"><span className="font-semibold">Config</span><code className="min-w-0 flex-1 truncate font-mono">~/.codex/config.toml</code><button type="button" aria-label="Copy Codex config" onClick={() => copy(config)}><ClipboardIcon className="h-4 w-4" /></button><SiteLink href="/docs/integrations/codex" className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-foreground">View setup guide <ExternalIcon className="h-3 w-3" /></SiteLink>{copied && <span className="text-primary">Copied</span>}</div>
      <p className="mt-2 text-xs text-muted-foreground" role="status">{copyError || (copied ? 'Configuration copied' : '')}</p>
    </article>
  );
}

const popular = [
  { provider: 'Anthropic', providerId: 'anthropic', name: 'Claude Opus 5', id: 'anthropic/claude-opus-5', input: '$1/M', output: '$5/M', cache: '$0.1/M', oi: '$5/M', oo: '$25/M', oc: '$0.5/M' },
  { provider: 'OpenAI', providerId: 'openai', name: 'GPT-5.6 Sol', id: 'openai/gpt-5.6-sol', input: '$0.6/M', output: '$3/M', cache: '$0.06/M', oi: '$4/M', oo: '$20/M', oc: '$0.4/M' },
  { provider: 'xAI', providerId: 'grok', name: 'Grok 4.6', id: 'grok/grok-4.6', input: '$0.3/M', output: '$0.9/M', cache: '$0.075/M', oi: '$2/M', oo: '$6/M', oc: '$0.5/M' },
];

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
      <section className="border-b border-border/60 py-10 md:py-14"><div className="page-container"><div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center"><div><h2 className="text-2xl font-semibold tracking-tight">Popular reference prices</h2><p className="mt-1 text-xs text-muted-foreground">Prices from the dated catalog, with provider availability.</p></div><SiteLink href="/models" className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-xs text-muted-foreground transition hover:text-foreground sm:ml-auto">View full model pricing <ArrowRightIcon className="h-4 w-4" /></SiteLink></div><CatalogNotice compact /><div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{popular.map((item) => <PriceCard key={item.id} item={item} />)}</div></div></section>
    </>
  );
}
