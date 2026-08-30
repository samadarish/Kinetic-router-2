'use client';

import { useState } from 'react';
import { ClipboardIcon } from './icons';

export function CopyPageButton() {
  const [copied, setCopied] = useState(false);
  async function copy() { const text = document.querySelector('.docs-article article')?.textContent ?? ''; await navigator.clipboard?.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1200); }
  return <button onClick={copy} className="float-right mb-2 inline-flex h-8 items-center gap-2 rounded-md border border-border px-3 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"><ClipboardIcon className="h-3.5 w-3.5" />{copied ? 'Copied' : 'Copy page'}</button>;
}
