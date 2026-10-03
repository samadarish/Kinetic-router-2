import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupportEvent, SupportMessage } from '@kineticrouter/portal-contract';
import { startSupportNotifications } from '@kineticrouter/portal-contract/support-client';

const cleanup: Array<() => void> = [];
afterEach(() => { cleanup.splice(0).forEach(stop => stop()); vi.useRealTimers(); });
const message: SupportMessage = { id: 'reply-1', ticketId: 'ticket-1', sender: 'admin', body: 'We can help.', sequence: 1, createdAt: '2026-10-02T12:00:00Z' };
async function fixture({ created = true, status = 200, welcomeStatus = 200 } = {}) {
  vi.useFakeTimers();
  const browser = new EventTarget(), page = Object.assign(new EventTarget(), { visibilityState: 'visible', hasFocus: () => true });
  const receive = vi.fn(), clear = vi.fn(), unauthorized = vi.fn();
  const streams: Array<ReadableStreamDefaultController<Uint8Array>> = [], signals: AbortSignal[] = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input).endsWith('/welcome')) {
      return Response.json({ ok: welcomeStatus === 200, data: { created, ticket: { id: 'welcome-ticket' }, message: { ...message, id: 'welcome-1', ticketId: 'welcome-ticket', kind: 'welcome' } } }, { status: welcomeStatus });
    }
    if (status !== 200) return new Response(null, { status });
    signals.push(init!.signal!);
    return new Response(new ReadableStream<Uint8Array>({ start(controller) { streams.push(controller); controller.enqueue(new TextEncoder().encode('data: {"type":"ready"}\n\n')); } }));
  });
  const listener = startSupportNotifications({ origin: 'https://console.kineticrouter.com', csrfToken: 'csrf', browser: browser as Window, page: page as unknown as Document, fetchImpl: fetchImpl as typeof fetch, receive, clear, unauthorized });
  cleanup.push(listener.stop);
  await vi.advanceTimersByTimeAsync(0);
  const send = async (event: SupportEvent) => { streams.at(-1)!.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`)); await vi.advanceTimersByTimeAsync(0); };
  return { browser, page, receive, clear, unauthorized, fetchImpl, listener, signals, streams, send };
}

describe('public support listener', () => {
  it('waits five foreground seconds, sends CSRF, and shows only a newly created welcome', async () => {
    const f = await fixture();
    await vi.advanceTimersByTimeAsync(4_999); expect(f.receive).not.toHaveBeenCalled();
    f.page.visibilityState = 'hidden'; f.page.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(10_000); expect(f.fetchImpl).toHaveBeenCalledTimes(1);
    f.page.visibilityState = 'visible'; f.page.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(4_999); expect(f.receive).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(f.receive).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: 'welcome-1', ticketId: 'welcome-ticket' }), true);
    expect(f.fetchImpl).toHaveBeenCalledWith('https://console.kineticrouter.com/portal/v1/support/welcome', expect.objectContaining({ method: 'POST', credentials: 'include', body: '{}', headers: expect.objectContaining({ 'X-CSRF-Token': 'csrf' }) }));
    f.browser.dispatchEvent(new Event('focus')); await vi.advanceTimersByTimeAsync(20_000); expect(f.receive).toHaveBeenCalledTimes(1);
    f.listener.stop();
    const existing = await fixture({ created: false }); await vi.advanceTimersByTimeAsync(5_000); expect(existing.receive).not.toHaveBeenCalled();
  });

  it('deduplicates replies across reconnects and ignores customer and welcome stream events', async () => {
    const f = await fixture({ created: false });
    await f.send({ type: 'message', message });
    await f.send({ type: 'message', message });
    await f.send({ type: 'message', message: { ...message, id: 'customer', sender: 'customer' } });
    await f.send({ type: 'message', message: { ...message, id: 'welcome', kind: 'welcome' } });
    expect(f.receive).toHaveBeenCalledExactlyOnceWith(message, false);
    f.listener.reconnect(); await vi.advanceTimersByTimeAsync(0);
    expect(f.signals[0]!.aborted).toBe(true);
    await f.send({ type: 'message', message }); expect(f.receive).toHaveBeenCalledTimes(1);
    await f.send({ type: 'message', message: { ...message, id: 'reply-2' } }); expect(f.receive).toHaveBeenCalledTimes(2);
    expect(f.fetchImpl.mock.calls.every(([url]) => /\/(events|welcome)$/.test(String(url)))).toBe(true);
  });

  it('cancels connections, timers, and notices during logout', async () => {
    const f = await fixture(); await f.send({ type: 'message', message });
    f.browser.dispatchEvent(new Event('portal:signing-out'));
    expect(f.signals[0]!.aborted).toBe(true); expect(f.clear).toHaveBeenCalledOnce();
    const calls = f.fetchImpl.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000); expect(f.fetchImpl).toHaveBeenCalledTimes(calls);
    f.browser.dispatchEvent(new Event('online')); f.browser.dispatchEvent(new Event('pageshow'));
    await vi.advanceTimersByTimeAsync(0); expect(f.fetchImpl).toHaveBeenCalledTimes(calls);
  });

  it('expires an unauthorized session and stays quiet during unavailable support', async () => {
    for (const status of [401, 403, 503]) {
      const f = await fixture({ status });
      if (status === 401) expect(f.unauthorized).toHaveBeenCalledOnce();
      else expect(f.unauthorized).not.toHaveBeenCalled();
      if (status === 503) { await vi.advanceTimersByTimeAsync(1000); expect(f.fetchImpl).toHaveBeenCalledTimes(2); }
      else { expect(f.clear).toHaveBeenCalledOnce(); await vi.advanceTimersByTimeAsync(60_000); expect(f.fetchImpl).toHaveBeenCalledTimes(1); }
      expect(f.receive).not.toHaveBeenCalled(); f.listener.stop();
    }
    const welcomeExpired = await fixture({ welcomeStatus: 401 }); await vi.advanceTimersByTimeAsync(5_000);
    expect(welcomeExpired.unauthorized).toHaveBeenCalledOnce(); expect(welcomeExpired.signals[0]!.aborted).toBe(true);
  });
});
