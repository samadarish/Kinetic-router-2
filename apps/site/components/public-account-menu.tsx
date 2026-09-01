'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDownIcon } from './icons';
import { consolePageUrl, resolvePublicConsoleOrigin } from '@/data/public-console-origin.mjs';
import { requestPublicLogout } from '@/data/public-session.mjs';

type PublicSession = {
  authenticated: boolean;
  user?: { id: string; username: string; avatarUrl?: string | null };
};

type SessionEnvelope = { ok: true; data: PublicSession };

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
  const [session, setSession] = useState<PublicSession | null>(null);
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const consoleOrigin = useMemo(() => resolvePublicConsoleOrigin(
    process.env.NEXT_PUBLIC_KINETICROUTER_CONSOLE_ORIGIN,
    typeof window === 'undefined' ? undefined : window.location.origin,
    process.env.NODE_ENV === 'development',
  ), []);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 3_000);
    fetch(consolePageUrl(consoleOrigin, '/portal/v1/public-session'), {
      credentials: 'include',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
      .then(async (response) => response.ok ? await response.json() as SessionEnvelope : undefined)
      .then((payload) => {
        if (payload?.ok && payload.data.authenticated && payload.data.user?.username) setSession(payload.data);
      })
      .catch(() => undefined)
      .finally(() => window.clearTimeout(timeout));
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [consoleOrigin]);

  useEffect(() => {
    function close(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', escape);
    };
  }, []);

  async function signOut() {
    setSigningOut(true);
    setSignOutError(null);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5_000);
    try {
      await requestPublicLogout(consoleOrigin, { signal: controller.signal });
      setSession(null);
      setOpen(false);
    } catch {
      setSignOutError('Couldn\u2019t sign out. Please try again.');
    } finally {
      window.clearTimeout(timeout);
      setSigningOut(false);
    }
  }

  if (!session?.authenticated || !session.user) {
    return <a href="/account/sign-in" className={`brand-cta public-account-cta shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-[11px] font-semibold shadow-sm sm:px-4 sm:text-xs ${className}`}>Get started</a>;
  }

  const username = session.user.username;
  const avatarUrl = safeAvatarUrl(session.user.avatarUrl);
  return (
    <div ref={rootRef} className={`public-account relative shrink-0 ${className}`}>
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="public-account-trigger flex h-9 max-w-[12rem] items-center gap-2 rounded-lg border border-border bg-card px-1.5 pr-2 text-xs font-semibold shadow-sm">
        <span className="public-account-avatar grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full bg-primary text-[10px] font-bold text-[var(--brand-on-gradient)]">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
          ) : initials(username)}
        </span>
        <span className="hidden min-w-0 truncate sm:block">{username}</span>
        <ChevronDownIcon className="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground sm:block" />
      </button>
      {open && (
        <div role="menu" className="public-account-dropdown absolute right-0 top-[calc(100%+7px)] z-[80] w-56 overflow-hidden rounded-xl border border-border bg-elevated p-2 shadow-2xl">
          <div className="border-b border-border px-3 pb-2 pt-1">
            <span className="block truncate text-xs font-semibold">{username}</span>
            <span className="mt-0.5 block text-[10px] text-muted-foreground">Customer account</span>
          </div>
          <a role="menuitem" href={consolePageUrl(consoleOrigin, '/dashboard')} className="mt-1 flex rounded-lg px-3 py-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">Dashboard</a>
          <a role="menuitem" href={consolePageUrl(consoleOrigin, '/profile')} className="flex rounded-lg px-3 py-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">Profile</a>
          <button role="menuitem" type="button" disabled={signingOut} aria-busy={signingOut} onClick={() => void signOut()} className="flex w-full rounded-lg px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50">{signingOut ? 'Signing out…' : 'Sign out'}</button>
          {signOutError && <p role="alert" className="px-3 pb-1 pt-0.5 text-[10px] leading-4 text-red-500">{signOutError}</p>}
        </div>
      )}
    </div>
  );
}
