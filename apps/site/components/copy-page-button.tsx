'use client';

import { useEffect, useRef, useState } from 'react';
import { trackDocsCopy } from '@kineticrouter/analytics-client';
import { ClipboardIcon } from './icons';

export function CopyPageButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  async function copy() {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text); trackDocsCopy(); setCopied(true); setError('');
      clearTimeout(timer.current); timer.current = setTimeout(() => setCopied(false), 1600);
    } catch { setError('Could not copy. Select the guide text to copy it manually.'); }
  }
  return <div className="docs-page-copy"><button type="button" onClick={copy} className="float-right mb-2 inline-flex h-8 items-center gap-2 rounded-md border border-border px-3 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"><ClipboardIcon className="h-3.5 w-3.5" />{copied ? 'Copied' : 'Copy page'}</button><span role="status">{error || (copied ? 'Copied' : '')}</span></div>;
}
