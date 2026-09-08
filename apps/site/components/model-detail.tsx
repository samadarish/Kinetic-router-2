'use client';
import { SiteLink } from './site-link';
import { trackDocsCopy } from '@kineticrouter/analytics-client';

import { useEffect, useRef, useState } from 'react';
import type { Model } from '@/data/model-utils';
import { displayContextWindow, formatTokens, formatUsd, usdPrice } from '@/data/model-utils';
import { displayStateLabel, providerAllowsInteraction, providerDisplayStatus } from '@/data/provider-availability';
import { ArrowRightIcon, CheckIcon, ClipboardIcon } from './icons';
import { CatalogNotice } from './catalog-notice';
import { ProviderLogo, providerLabel, resolveProvider } from './provider-logo';

const componentLabels: Record<string, string> = { input: 'Input', output: 'Output', cache_read: 'Cache read', cache_creation: 'Cache write', cache_creation_5m: '5m cache write', cache_creation_1h: '1h cache write' };

function readableTagline(model: Model) {
  if (model.tagline.includes('Ã¦') || model.tagline.includes('ï¿½')) return `${model.name.replace(/^OpenAI: /, '')} is an advanced coding model for agentic software engineering, terminal workflows, and complex technical tasks.`;
  return model.tagline;
}

function CodeExamples({ model }: { model: Model }) {
  const status = providerDisplayStatus(model.provider);
  const canInteract = providerAllowsInteraction(model.provider);
  const examples = model.codeExamples.length ? model.codeExamples : [{ language: 'curl', label: 'cURL', source: 'provider', code: `curl https://api.kineticrouter.com/v1/chat/completions \\\n+  -H "Authorization: Bearer $KINETICROUTER_API_KEY" \\\n+  -H "Content-Type: application/json" \\\n+  -d '{"model":"${model.id}","messages":[{"role":"user","content":"Hello!"}]}'` }];
  const visibleExamples = examples.map((example) => ({ ...example, code: example.code.replaceAll('\n+', '\n') }));
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  const copyAttempt = useRef(0);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => { copyAttempt.current += 1; clearTimeout(copyTimer.current); }, []);

  if (!canInteract) {
    return <aside className="docs-pending-example mt-5"><div className="flex items-center gap-2"><ProviderLogo provider={model.provider} className="h-5 w-5" /><strong>{status.badgeLabel} provider example</strong></div><p>{status.summary} The imported example remains in the reference snapshot, but copying is disabled until the route is enabled and tested.</p></aside>;
  }

  function selectExample(index: number) {
    copyAttempt.current += 1;
    clearTimeout(copyTimer.current);
    setActive(index);
    setCopied(false);
    setCopyError('');
  }
  async function copy() {
    const attempt = ++copyAttempt.current;
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(visibleExamples[active].code);
      if (attempt !== copyAttempt.current) return;
      trackDocsCopy();
      setCopied(true);
      setCopyError('');
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1000);
    } catch {
      if (attempt !== copyAttempt.current) return;
      setCopied(false);
      setCopyError('Could not copy. Select the code to copy it manually.');
    }
  }
  return <div className="mt-5 overflow-hidden rounded-xl border border-border bg-[var(--code)]"><div className="flex items-end border-b border-border px-3">{visibleExamples.map((example, index) => <button key={`${example.label}-${index}`} onClick={() => selectExample(index)} className={`h-11 border-b-2 px-3 text-xs font-semibold ${active === index ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground'}`}>{example.label}</button>)}<button aria-label="Copy code" onClick={copy} className="ml-auto flex h-11 items-center gap-1 text-xs text-muted-foreground"><ClipboardIcon className="h-4 w-4" />{copied && 'Copied'}</button></div><pre className="max-h-[430px] overflow-auto bg-[var(--terminal)] p-5 font-mono text-[12px] leading-7 text-[#e4e2de]"><code>{visibleExamples[active].code}</code></pre><p className="px-5 py-2 text-xs text-muted-foreground" role="status">{copyError || (copied ? 'Code copied' : '')}</p></div>;
}

function modelLimit(value: number | undefined, fallback: number) {
  if (value === 0) return 'Provider-defined';
  return formatTokens(value ?? fallback);
}

export function ModelDetail({ model }: { model: Model }) {
  const providerStatus = providerDisplayStatus(model.provider);
  const canInteract = providerAllowsInteraction(model.provider);
  const modelState = model.availability ?? providerStatus.modelAccessState;
  const modelStateLabel = displayStateLabel(modelState);
  const components = ['input', 'output', 'cache_read', 'cache_creation', 'cache_creation_5m', 'cache_creation_1h'].filter((component) => usdPrice(model, 'sell', component) != null || usdPrice(model, 'official', component) != null);
  return (
    <>
      <section className="border-b border-border/60 py-10 md:py-14">
        <div className="page-container">
          <nav className="mb-8 flex items-center gap-2 text-xs text-muted-foreground"><SiteLink href="/models">Models</SiteLink><span>/</span><SiteLink href={`/models/${model.provider}`}>{providerLabel(model.provider)}</SiteLink><span>/</span><span className="truncate text-foreground">{model.slug}</span></nav>
          <CatalogNotice />
          <div className="grid items-start gap-8 lg:grid-cols-[1fr_360px]">
            <div><div className="flex items-center gap-4"><span className="grid h-14 w-14 place-items-center rounded-xl border border-border bg-muted/50"><ProviderLogo provider={model.provider} className="h-8 w-8" /></span><div><div className="flex flex-wrap items-center gap-2"><p className="text-xs text-muted-foreground">{providerLabel(model.provider)}</p><span className="rounded-full border border-border px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{modelStateLabel}</span></div><h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">{model.name.replace(/^[^:]+:\s*/, '')}</h1></div></div><p className="mt-6 max-w-3xl text-sm leading-7 text-muted-foreground">{readableTagline(model)}</p><div className="mt-6 flex flex-wrap gap-2">{model.capabilityFlags.map((flag) => <span key={flag} className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/30 px-3 py-1.5 text-xs capitalize text-muted-foreground"><CheckIcon className="h-3 w-3 text-primary" />{flag}</span>)}</div></div>
            <aside className="surface p-5"><div className="flex items-center"><span className="text-xs font-semibold">Model ID</span></div><code className="mt-3 block break-all rounded-lg bg-muted p-3 font-mono text-xs">{model.id}</code><div className="mt-5 grid grid-cols-2 gap-4 border-t border-border pt-5 text-xs"><div><span className="block text-muted-foreground">Upstream context</span><strong className="mt-1 block text-lg">{formatTokens(displayContextWindow(model))}</strong></div><div><span className="block text-muted-foreground">Upstream output</span><strong className="mt-1 block text-lg">{modelLimit(model.upstreamMaxOutput, model.maxOutput)}</strong></div><div><span className="block text-muted-foreground">Snapshot gateway input</span><strong className="mt-1 block">{formatTokens(model.gatewayMaxInput ?? model.contextWindow)}</strong></div><div><span className="block text-muted-foreground">Snapshot gateway output</span><strong className="mt-1 block">{formatTokens(model.gatewayMaxOutput ?? model.maxOutput)}</strong></div></div>{canInteract ? <SiteLink href="/account/sign-in" className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-xs font-semibold text-white">Get API key <ArrowRightIcon className="h-4 w-4" /></SiteLink> : <span className="mt-5 inline-flex w-full items-center justify-center rounded-lg border border-border px-4 py-3 text-xs font-semibold text-muted-foreground">{modelStateLabel} catalog</span>}</aside>
          </div>
        </div>
      </section>
      <section className="page-container grid gap-10 py-10 lg:grid-cols-[minmax(0,1fr)_280px] lg:py-14">
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold tracking-tight">Reference pricing</h2><p className="mt-2 text-xs text-muted-foreground">Imported snapshot values per 1M tokens. Your customer portal is authoritative for actual kineticRouter billing.</p>
          <div className="mt-5 overflow-x-auto rounded-xl border border-border"><table className="w-full min-w-[560px] border-collapse text-left text-xs"><thead className="bg-muted/50"><tr><th className="px-4 py-3">Component</th><th className="px-4 py-3 text-primary">Mirrored snapshot</th><th className="px-4 py-3">Official reference</th></tr></thead><tbody>{components.map((component) => { const sell = usdPrice(model, 'sell', component); const official = usdPrice(model, 'official', component); return <tr key={component} className="border-t border-border"><td className="px-4 py-3 text-muted-foreground">{componentLabels[component] ?? component}</td><td className="px-4 py-3 font-semibold text-primary">{formatUsd(sell)}</td><td className="px-4 py-3 text-muted-foreground">{formatUsd(official)}</td></tr>; })}</tbody></table></div>
          <h2 className="mt-12 text-2xl font-semibold tracking-tight">API example</h2><p className="mt-2 text-xs text-muted-foreground">{canInteract ? `Use the ${providerStatus.protocolLabel} kineticRouter route with ${model.name.replace(/^[^:]+:\s*/, '')}.` : providerStatus.summary}</p><CodeExamples key={model.id} model={model} />
          <h2 className="mt-12 text-2xl font-semibold tracking-tight">About this model</h2><p className="mt-3 text-sm leading-7 text-muted-foreground">{readableTagline(model)}</p>
          {!!model.faq.length && <div className="mt-12"><h2 className="text-2xl font-semibold tracking-tight">Snapshot FAQ</h2><p className="mt-2 text-xs text-muted-foreground">Imported reference copy; verify runtime behavior before production use.</p><div className="mt-5 divide-y divide-border rounded-xl border border-border">{model.faq.map((item) => <details key={item.q} className="group p-5"><summary className="cursor-pointer list-none text-sm font-semibold">{item.q}<span className="float-right text-muted-foreground group-open:rotate-45">＋</span></summary><p className="mt-3 text-xs leading-6 text-muted-foreground">{item.a}</p></details>)}</div></div>}
        </div>
        <aside className="hidden lg:block"><div className="sticky top-24 space-y-5"><div className="surface p-5"><h2 className="text-xs font-semibold">Compatibility reference</h2><div className="mt-3 flex flex-wrap gap-2">{model.compatIcons.map((item) => { const provider = resolveProvider(item, model.id); return <span key={item} className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1.5 text-xs"><ProviderLogo provider={provider} className="h-3.5 w-3.5" />{item} API</span>; })}</div></div><div className="surface p-5"><h2 className="text-xs font-semibold">Details</h2><dl className="mt-4 space-y-3 text-xs"><div className="flex justify-between gap-4"><dt className="text-muted-foreground">Category</dt><dd className="capitalize">{model.category}</dd></div><div className="flex justify-between gap-4"><dt className="text-muted-foreground">Hosted on</dt><dd>{model.hostedOn}</dd></div><div className="flex justify-between gap-4"><dt className="text-muted-foreground">Released</dt><dd>{model.date}</dd></div><div className="flex justify-between gap-4"><dt className="text-muted-foreground">Input</dt><dd>{model.inputModalities.join(', ')}</dd></div><div className="flex justify-between gap-4"><dt className="text-muted-foreground">Output</dt><dd>{model.outputModalities.join(', ')}</dd></div><div className="flex justify-between gap-4"><dt className="text-muted-foreground">Fact check</dt><dd>{model.sourceVerifiedAt}</dd></div></dl>{model.sourceUrl && <SiteLink href={model.sourceUrl} className="mt-4 block text-xs font-semibold text-primary">Official model reference ↗</SiteLink>}</div></div></aside>
      </section>
    </>
  );
}
