'use client';

import { useState } from 'react';
import { ArrowRightIcon, ClipboardIcon } from './icons';
import { ProviderLogo } from './provider-logo';

const examples = {
  OpenAI: {
    provider: 'openai', status: 'PARTIAL',
    code: `from openai import OpenAI

client = OpenAI(
    base_url="https://api.kineticrouter.com/v1",
    api_key="YOUR_KINETICROUTER_API_KEY"
)

response = client.chat.completions.create(
    model="openai/gpt-5.4",
    messages=[{"role": "user", "content": "Hello!"}]
)`,
  },
  Anthropic: { provider: 'anthropic', status: 'PLANNED', code: '' },
  Grok: { provider: 'grok', status: 'PLANNED', code: '' },
} as const;

type Provider = keyof typeof examples;

export function HomeHero() {
  const [provider, setProvider] = useState<Provider>('OpenAI');
  const [copied, setCopied] = useState(false);
  const selected = examples[provider];
  const available = selected.status !== 'PLANNED';

  async function copy() {
    if (!available) return;
    await navigator.clipboard?.writeText(selected.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <section className="hero-grid hero-glow relative overflow-hidden pb-10 pt-16 md:pb-16 md:pt-20">
      <div className="relative z-10 mx-auto max-w-5xl px-4 text-center">
        <h1 className="text-[1.75rem] font-semibold leading-[1.14] tracking-[-.045em] min-[380px]:text-[2rem] sm:text-[2.7rem] md:text-[3.35rem] lg:text-[3.7rem]"><span className="block">OpenAI-compatible access.</span><span className="mt-1 block">A clear multi-model reference.</span></h1>
        <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-muted-foreground">Use the detected OpenAI-compatible route today. Browse the exact Hao.ai reference catalog while native Anthropic and Grok routes are prepared and verified.</p>
        <div aria-label="Model providers and route status" className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
          {(Object.entries(examples) as [Provider, (typeof examples)[Provider]][]).map(([name, item]) => <a key={name} href={`/models/${item.provider}`} className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-card/75 px-4 text-sm font-semibold text-muted-foreground shadow-lg"><ProviderLogo provider={item.provider} className="h-4 w-4" />{name}<span className="text-[8px] tracking-wider opacity-65">{item.status}</span></a>)}
        </div>
        <div className="mx-auto mt-8 grid w-full max-w-sm grid-cols-2 gap-3 sm:gap-4">
          <a href="https://console.kineticrouter.com/sign-in" className="inline-flex h-14 min-w-0 items-center justify-center rounded-lg bg-primary px-3 text-sm font-semibold text-white shadow-lg transition hover:bg-[var(--primary-hover)] sm:h-[60px] sm:px-8 sm:text-base">Get API Key <ArrowRightIcon className="ml-2 h-5 w-5" /></a>
          <a href="/models" className="inline-flex h-14 min-w-0 items-center justify-center rounded-lg border border-primary px-3 text-sm font-semibold text-primary transition hover:bg-primary hover:text-white sm:h-[60px] sm:px-8 sm:text-base">Explore Models</a>
        </div>
        <div className="mx-auto mt-8 max-w-xl overflow-hidden rounded-lg border border-border bg-[var(--code)] text-left shadow-2xl">
          <div className="flex h-10 items-end border-b border-border/70 px-3">
            {(Object.keys(examples) as Provider[]).map((item) => <button key={item} onClick={() => { setProvider(item); setCopied(false); }} className={`inline-flex h-10 items-center gap-1.5 border-b-2 px-3 text-[11px] font-medium ${provider === item ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground'}`}><ProviderLogo provider={examples[item].provider} className="h-3.5 w-3.5" />{item}{examples[item].status === 'PLANNED' && <span className="text-[7px] opacity-60">PLANNED</span>}</button>)}
            <button aria-label={available ? 'Copy code' : 'Copy disabled for planned route'} disabled={!available} onClick={copy} className="ml-auto flex h-10 items-center gap-1 px-2 text-[10px] text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"><ClipboardIcon className="h-3.5 w-3.5" />{copied && 'Copied'}</button>
          </div>
          {available ? <pre className="h-[278px] overflow-auto p-4 font-mono text-[12px] leading-[1.75] text-[#34332f] dark:text-[#e8e6e3] sm:h-[292px] sm:text-[13px]"><code>{selected.code}</code></pre> : <div className="grid h-[278px] place-items-center p-8 text-center sm:h-[292px]"><div><ProviderLogo provider={selected.provider} className="mx-auto h-9 w-9" /><strong className="mt-4 block text-sm">{provider} native route is planned</strong><p className="mx-auto mt-2 max-w-sm text-xs leading-6 text-muted-foreground">The future integration is visible for roadmap clarity, but request code stays disabled until the Kinetic Router route passes conformance testing.</p></div></div>}
        </div>
        <div className="mx-auto mt-7 grid max-w-3xl grid-cols-3 gap-2 sm:gap-3">
          <div><strong className="block text-[17px] font-semibold tracking-tight sm:text-2xl">0.15x–0.30x</strong><span className="text-[9px] text-muted-foreground sm:text-xs">Hao reference range</span></div>
          <div><strong className="block text-[17px] font-semibold tracking-tight sm:text-2xl">20 models</strong><span className="text-[9px] leading-tight text-muted-foreground sm:text-xs">Dated catalog<br className="sm:hidden" /> snapshot</span></div>
          <div><strong className="block text-[17px] font-semibold tracking-tight sm:text-2xl">57 docs</strong><span className="text-[9px] leading-tight text-muted-foreground sm:text-xs">Status-marked<br className="sm:hidden" /> references</span></div>
        </div>
      </div>
    </section>
  );
}
