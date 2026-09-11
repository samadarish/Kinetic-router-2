'use client';
import { SiteLink } from './site-link';
import { trackDocsCopy } from '@kineticrouter/analytics-client';

import { Fragment, useEffect, useRef, useState } from 'react';
import type { ProviderId } from '@/data/provider-availability';
import type { SiteConfig, SiteProviderMap } from '@/data/site-config';
import { ArrowRightIcon, ClipboardIcon } from './icons';
import { ProviderLogo } from './provider-logo';

type SyntaxKind = 'keyword' | 'string' | 'property' | 'number';
const allProviders: ProviderId[] = ['openai', 'anthropic', 'grok'];
const pythonTokenPattern = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|\b(from|import|as|return|await|async|def|class|if|else|for|in|True|False|None)\b|([A-Za-z_]\w*)(?=\s*=)|(\b\d+(?:\.\d+)?\b)/g;

function syntaxKind(match: RegExpExecArray): SyntaxKind {
  if (match[1]) return 'string';
  if (match[2]) return 'keyword';
  if (match[3]) return 'property';
  return 'number';
}

function SyntaxColoredCode({ source }: { source: string }) {
  return source.split('\n').map((line, lineIndex, lines) => {
    const parts: Array<{ text: string; kind?: SyntaxKind }> = [];
    let cursor = 0;
    pythonTokenPattern.lastIndex = 0;
    for (let match = pythonTokenPattern.exec(line); match; match = pythonTokenPattern.exec(line)) {
      if (match.index > cursor) parts.push({ text: line.slice(cursor, match.index) });
      parts.push({ text: match[0], kind: syntaxKind(match) });
      cursor = match.index + match[0].length;
    }
    if (cursor < line.length) parts.push({ text: line.slice(cursor) });
    return (
      <Fragment key={`${lineIndex}-${line}`}>
        {parts.map((part, index) => part.kind
          ? <span key={`${index}-${part.text}`} className={`syntax-${part.kind}`}>{part.text}</span>
          : <Fragment key={`${index}-${part.text}`}>{part.text}</Fragment>)}
        {lineIndex < lines.length - 1 && '\n'}
      </Fragment>
    );
  });
}

function endpoint(providers: SiteProviderMap, id: ProviderId) {
  return providers[id].baseUrl ?? providers[id].previewBaseUrl ?? 'https://api.kineticrouter.com/v1';
}

function providerExample(providers: SiteProviderMap, id: ProviderId) {
  if (id === 'anthropic') return `from anthropic import Anthropic

client = Anthropic(
    base_url="${endpoint(providers, id)}",
    api_key="YOUR_KINETICROUTER_API_KEY"
)

message = client.messages.create(
    model="anthropic/claude-sonnet-4.6",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Hello!"}]
)`;
  const model = id === 'grok' ? 'grok/grok-4.6' : 'openai/gpt-5.4';
  return `from openai import OpenAI

client = OpenAI(
    base_url="${endpoint(providers, id)}",
    api_key="YOUR_KINETICROUTER_API_KEY"
)

response = client.chat.completions.create(
    model="${model}",
    messages=[{"role": "user", "content": "Hello!"}]
)`;
}

export function HomeApiExample({ home, providers, modelCount }: { home: SiteConfig['home']; providers: SiteProviderMap; modelCount: number }) {
  const enabledProviders = allProviders.filter((id) => providers[id].enabled);
  const providerOrder = enabledProviders.length ? enabledProviders : allProviders;
  const [provider, setProvider] = useState<ProviderId>(providerOrder[0]);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  const copyAttempt = useRef(0);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const selectedStatus = providers[provider];
  const code = providerExample(providers, provider);
  const available = selectedStatus.enabled && selectedStatus.interactionMode !== 'reference-only';
  const selectedTabId = `home-provider-tab-${provider}`;
  useEffect(() => () => { copyAttempt.current += 1; clearTimeout(copyTimer.current); }, []);

  function selectProvider(next: ProviderId) {
    copyAttempt.current += 1;
    clearTimeout(copyTimer.current);
    setProvider(next);
    setCopied(false);
    setCopyError('');
  }

  function handleTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, item: ProviderId) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = providerOrder.indexOf(item);
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? providerOrder.length - 1
        : event.key === 'ArrowRight'
          ? (currentIndex + 1) % providerOrder.length
          : (currentIndex - 1 + providerOrder.length) % providerOrder.length;
    const next = providerOrder[nextIndex];
    selectProvider(next);
    document.getElementById(`home-provider-tab-${next}`)?.focus();
  }

  async function copy() {
    if (!available) return;
    const attempt = ++copyAttempt.current;
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(code);
      if (attempt !== copyAttempt.current) return;
      trackDocsCopy();
      setCopied(true);
      setCopyError('');
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1_200);
    } catch {
      if (attempt !== copyAttempt.current) return;
      setCopied(false);
      setCopyError('Could not copy. Select the code to copy it manually.');
    }
  }

  return (
    <>
      <div className="relative overflow-hidden pb-10 pt-4 md:pb-16 md:pt-5">
        <div className="relative z-10 mx-auto max-w-5xl px-4 text-center">
          {home.eyebrow && <p className="mb-3 text-xs font-semibold uppercase tracking-[.18em] text-primary">{home.eyebrow}</p>}
          <p className="mx-auto max-w-2xl text-sm leading-7 text-muted-foreground">{home.description}</p>

        <div aria-label="Choose a model provider" className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
          {providerOrder.map((id) => {
            const status = providers[id];
            const active = provider === id;
            return (
              <button key={id} type="button" aria-pressed={active} onClick={() => selectProvider(id)} className="provider-pill inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-semibold shadow-lg">
                <ProviderLogo provider={id} className="h-4 w-4" />
                {status.label}
                <span className="text-[8px] tracking-wider opacity-65">{status.badgeLabel.toUpperCase()}</span>
              </button>
            );
          })}
        </div>

        <div className="mx-auto mt-8 grid w-full max-w-sm grid-cols-2 gap-3 sm:gap-4">
          <SiteLink href={home.primaryCta.href} className="inline-flex h-14 min-w-0 items-center justify-center rounded-lg bg-primary px-3 text-sm font-semibold text-white shadow-lg transition hover:bg-[var(--primary-hover)] sm:h-[60px] sm:px-8 sm:text-base">{home.primaryCta.label} <ArrowRightIcon className="ml-2 h-5 w-5" /></SiteLink>
          <SiteLink href={home.secondaryCta.href} className="inline-flex h-14 min-w-0 items-center justify-center rounded-lg border border-primary px-3 text-sm font-semibold text-primary transition hover:bg-primary hover:text-white sm:h-[60px] sm:px-8 sm:text-base">{home.secondaryCta.label}</SiteLink>
        </div>

        <div className="mx-auto mt-8 max-w-xl overflow-hidden rounded-lg border border-border bg-[var(--code)] text-left shadow-2xl">
          <div className="flex min-h-11 items-end overflow-x-auto border-b border-border/70 px-2" role="tablist" aria-label="API provider examples">
            {providerOrder.map((id) => {
              const status = providers[id];
              const active = provider === id;
              return (
                <button key={id} id={`home-provider-tab-${id}`} type="button" role="tab" aria-selected={active} aria-controls="home-provider-panel" tabIndex={active ? 0 : -1} onClick={() => selectProvider(id)} onKeyDown={(event) => handleTabKeyDown(event, id)} className="provider-code-tab inline-flex h-11 shrink-0 items-center gap-1.5 border-b-2 px-3 text-xs font-medium">
                  <ProviderLogo provider={id} className="h-3.5 w-3.5" />
                  {status.label}
                  <span className="text-[7px] opacity-60">{status.badgeLabel.toUpperCase()}</span>
                </button>
              );
            })}
            <button type="button" aria-label={available ? 'Copy code' : `${selectedStatus.label} example is ${selectedStatus.badgeLabel} and cannot be copied`} disabled={!available} onClick={copy} className="ml-auto flex h-11 shrink-0 items-center gap-1 px-2 text-xs text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"><ClipboardIcon className="h-3.5 w-3.5" />{copied && 'Copied'}</button>
          </div>

          <div id="home-provider-panel" role="tabpanel" aria-labelledby={selectedTabId} tabIndex={0}>
            {available
              ? <pre className="h-[278px] overflow-auto p-4 font-mono text-[12px] leading-[1.75] text-[#34332f] dark:text-[#e8e6e3] sm:h-[292px] sm:text-[13px]"><code><SyntaxColoredCode source={code} /></code></pre>
              : <div className="grid h-[278px] place-items-center p-8 text-center sm:h-[292px]"><div><ProviderLogo provider={provider} className="mx-auto h-9 w-9" /><strong className="mt-4 block text-sm">{selectedStatus.protocolLabel} route is {selectedStatus.badgeLabel.toLowerCase()}</strong><p className="mx-auto mt-2 max-w-sm text-xs leading-6 text-muted-foreground">{selectedStatus.summary} {selectedStatus.evidenceNote}</p></div></div>}
          </div>
        </div>

        <p className="mt-2 text-xs text-muted-foreground" role="status">{copyError || (copied ? 'Code copied' : '')}</p>

        <div className="mx-auto mt-7 grid max-w-3xl grid-cols-2 gap-2 sm:gap-3">
          <div><strong className="block text-[17px] font-semibold tracking-tight sm:text-2xl">{modelCount} models</strong><span className="text-xs leading-tight text-muted-foreground sm:text-xs">Dated catalog<br className="sm:hidden" /> snapshot</span></div>
          <div><strong className="block text-[17px] font-semibold tracking-tight sm:text-2xl">57 docs</strong><span className="text-xs leading-tight text-muted-foreground sm:text-xs">Status-marked<br className="sm:hidden" /> references</span></div>
        </div>
      </div>
      </div>
    </>
  );
}
