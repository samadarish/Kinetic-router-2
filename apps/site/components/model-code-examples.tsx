'use client';
import { useEffect, useRef, useState } from 'react';
import { trackDocsCopy } from '@kineticrouter/analytics-client';
import type { Model } from '@/data/model-utils';
import { providerAllowsInteraction, providerDisplayStatus } from '@/data/provider-availability';
import { ClipboardIcon } from './icons';
import { ProviderLogo } from './provider-logo';

export function CodeExamples({ model }: { model: Pick<Model, 'id' | 'provider' | 'codeExamples'> }) {
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
