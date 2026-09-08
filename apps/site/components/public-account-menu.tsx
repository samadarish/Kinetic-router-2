'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDownIcon } from './icons';
import { consolePageUrl } from '@/data/public-console-origin.mjs';
import { requestPublicLogout } from '@/data/public-session.mjs';
import { usePublicSession } from './use-public-session';

function initials(username: string) {
  const words = username.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? `${words[0][0]}${words.at(-1)?.[0] ?? ''}` : words[0]?.slice(0, 2) || 'KR').toUpperCase();
}

function safeAvatarUrl(value?: string | null) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) return url.toString();
  } catch {
    // Invalid avatar URLs fall back to initials.
  }
  return undefined;
}

export function PublicAccountMenu({ className = '' }: { className?: string }) {
  const { loaded, session, consoleOrigin, signedOut } = usePublicSession();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function close(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); rootRef.current?.querySelector('button')?.focus(); }
    }
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  useEffect(() => {
    if (open) rootRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open]);

  async function signOut() {
    setSigningOut(true);
    setSignOutError(null);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5_000);
    try {
      await requestPublicLogout(consoleOrigin, { signal: controller.signal });
      window.dispatchEvent(new Event('portal:analytics-identity'));
      signedOut();
      setOpen(false);
    } catch {
      setSignOutError('Couldn\u2019t sign out. Please try again.');
    } finally {
      window.clearTimeout(timeout);
      setSigningOut(false);
    }
  }

  if (!loaded) return <span aria-hidden="true" className={`public-account-loading ${className}`} />;

  if (!session?.authenticated || !session.user) {
    return <a href="/account/sign-in" className={`brand-cta public-account-cta shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold shadow-sm sm:px-4 sm:text-xs ${className}`}>Get started</a>;
  }

  const username = session.user.username;
  const avatarUrl = safeAvatarUrl(session.user.avatarUrl);
  return (
    <div ref={rootRef} className={`public-account relative shrink-0 ${className}`} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
      <button type="button" aria-label={`Account for ${username}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)} onKeyDown={(event) => { if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); } }} className="public-account-trigger flex h-9 max-w-[12rem] items-center gap-2 rounded-lg border border-border bg-card px-1.5 pr-2 text-xs font-semibold shadow-sm">
        <span className="public-account-avatar grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full bg-primary text-xs font-bold text-[var(--brand-on-gradient)]">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
          ) : initials(username)}
        </span>
        <span className="hidden min-w-0 truncate sm:block">{username}</span>
        <ChevronDownIcon className="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground sm:block" />
      </button>
      {open && (
        <div role="menu" aria-label="Account" onKeyDown={(event) => {
          if (event.key === 'Tab') { setOpen(false); rootRef.current?.querySelector('button')?.focus(); return; }
          const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')].filter(item => !item.hasAttribute('disabled'));
          const current = items.indexOf(document.activeElement as HTMLElement);
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); items[(current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus(); }
          if (event.key === 'Home') { event.preventDefault(); items[0]?.focus(); }
          if (event.key === 'End') { event.preventDefault(); items.at(-1)?.focus(); }
        }} className="public-account-dropdown absolute right-0 top-[calc(100%+7px)] z-[80] w-56 overflow-hidden rounded-xl border border-border bg-elevated p-2 shadow-2xl">
          <div className="border-b border-border px-3 pb-2 pt-1">
            <span className="block truncate text-xs font-semibold">{username}</span>
          </div>
          <a role="menuitem" tabIndex={-1} href={consolePageUrl(consoleOrigin, '/dashboard')} className="mt-1 flex rounded-lg px-3 py-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">Dashboard</a>
          <a role="menuitem" tabIndex={-1} href={consolePageUrl(consoleOrigin, '/profile')} className="flex rounded-lg px-3 py-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">Profile</a>
          <button role="menuitem" tabIndex={-1} type="button" disabled={signingOut} aria-busy={signingOut} onClick={() => void signOut()} className="flex w-full rounded-lg px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50">{signingOut ? 'Signing out…' : 'Sign out'}</button>
          {signOutError && <p role="alert" className="px-3 pb-1 pt-0.5 text-xs leading-4 text-red-500">{signOutError}</p>}
        </div>
      )}
    </div>
  );
}
