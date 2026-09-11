'use client';

import { SiteLink } from './site-link';
import { useEffect, useRef, useState } from 'react';
import { CodexIcon } from '@kineticrouter/brand-ui';
import { ClipboardIcon, ExternalIcon } from './icons';
import { codexProviderConfig as config, codexStartCommand } from '@/data/codex-example';

export function CodexCard() {
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
