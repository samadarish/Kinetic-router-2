import type { SupportMessage, SupportWelcomeResult } from './support.js';
import { consumeSupportStream } from './support-stream-client.js';
import { scheduleSupportWelcome } from './support-welcome-client.js';

export { consumeSupportStream, clearSupportDrafts } from './support-stream-client.js';
export { SUPPORT_WELCOME_DELAY_MS, scheduleSupportWelcome } from './support-welcome-client.js';
export const SUPPORT_REPLY_NOTICE_MS = 6_500;

/** A single account-scoped listener. Showing a notice never marks a chat read. */
export function startSupportNotifications({ origin, csrfToken, receive, clear, unauthorized, browser = window, page = document, fetchImpl = fetch }: {
  origin: string;
  csrfToken: string;
  receive(message: SupportMessage, welcome: boolean): void;
  clear(): void;
  unauthorized(): void;
  browser?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  page?: Pick<Document, 'visibilityState' | 'hasFocus' | 'addEventListener' | 'removeEventListener'>;
  fetchImpl?: typeof fetch;
}) {
  const received = new Set<string>();
  let stopped = false, connected = false, failures = 0, reconnectRequested = false;
  let connection: AbortController | undefined, wake: (() => void) | undefined;
  let pendingWelcome: SupportMessage | undefined;
  const endpoint = (path: string) => new URL(`/portal/v1/support/${path}`, origin).toString();
  const eligible = () => !stopped && connected && page.visibilityState === 'visible' && page.hasFocus();
  const alert = (message: SupportMessage, welcome: boolean) => {
    if (stopped || message.sender !== 'admin' || received.has(message.id)) return;
    received.add(message.id);
    if (received.size > 1000) received.delete(received.values().next().value!);
    receive(message, welcome);
  };
  const flushWelcome = () => {
    if (!pendingWelcome || !eligible()) return;
    alert(pendingWelcome, true); pendingWelcome = undefined;
  };
  const task = scheduleSupportWelcome({
    eligible,
    ensure: async signal => {
      const response = await fetchImpl(endpoint('welcome'), {
        method: 'POST', credentials: 'include', cache: 'no-store', signal,
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: '{}',
      });
      if (response.status === 401 || response.status === 403) {
        stop(); if (response.status === 401) unauthorized();
      }
      if (!response.ok) throw new Error('Support is unavailable.');
      const result = await response.json() as { ok: boolean; data: SupportWelcomeResult };
      if (!result.ok || typeof result.data?.created !== 'boolean' || !result.data.message?.id || !result.data.message.ticketId
        || typeof result.data.message.body !== 'string') throw new Error('Invalid welcome response.');
      return result.data;
    },
    receive: message => { pendingWelcome = message; flushWelcome(); },
  });
  const refresh = () => { flushWelcome(); task.refresh(); };
  const reconnect = () => {
    if (stopped) return;
    failures = 0; reconnectRequested = true; connection?.abort(); wake?.(); refresh();
  };
  const visible = () => { refresh(); if (page.visibilityState === 'visible') reconnect(); };
  function stop() {
    if (stopped) return;
    stopped = true; connected = false; pendingWelcome = undefined; received.clear();
    connection?.abort(); wake?.(); task.stop(); clear();
    browser.removeEventListener('focus', refresh); browser.removeEventListener('blur', refresh);
    browser.removeEventListener('online', reconnect); browser.removeEventListener('pageshow', reconnect);
    page.removeEventListener('visibilitychange', visible);
    browser.removeEventListener('portal:signing-out', stop); browser.removeEventListener('portal:signed-out', stop);
    browser.removeEventListener('portal:unauthorized', stop);
  }
  async function connect() {
    while (!stopped) {
      reconnectRequested = false;
      connection = new AbortController();
      try {
        const response = await fetchImpl(endpoint('events'), { credentials: 'include', cache: 'no-store', headers: { Accept: 'text/event-stream' }, signal: connection.signal });
        if (stopped) return;
        if (response.status === 401 || response.status === 403) { stop(); if (response.status === 401) unauthorized(); return; }
        if (!response.ok || !response.body) throw new Error('Support is unavailable.');
        await consumeSupportStream(response.body, event => {
          if (stopped) return;
          if (event.type === 'ready') { connected = true; failures = 0; refresh(); }
          if (event.type === 'message' && event.message && event.message.kind !== 'welcome') alert(event.message, false);
        }, connection.signal);
      } catch { /* Reconnect quietly without affecting public navigation. */ }
      connected = false; refresh();
      if (stopped) return;
      if (reconnectRequested) continue;
      await new Promise<void>(resolve => {
        const done = () => { clearTimeout(timer); wake = undefined; resolve(); };
        const timer = setTimeout(done, Math.min(30_000, 1000 * 2 ** Math.min(failures++, 5)));
        wake = done;
      });
    }
  }
  browser.addEventListener('focus', refresh); browser.addEventListener('blur', refresh);
  browser.addEventListener('online', reconnect); browser.addEventListener('pageshow', reconnect);
  page.addEventListener('visibilitychange', visible);
  browser.addEventListener('portal:signing-out', stop); browser.addEventListener('portal:signed-out', stop);
  browser.addEventListener('portal:unauthorized', stop);
  void connect();
  return { stop, reconnect };
}
