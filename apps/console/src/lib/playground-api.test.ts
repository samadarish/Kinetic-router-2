import { afterEach, describe, expect, it, vi } from 'vitest';
import { setCsrfToken } from './api';
import { streamPlayground } from './playground-api';

afterEach(() => { setCsrfToken(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const input = { conversationId: '00000000-0000-4000-8000-000000000001', revision: 0, clientTurnId: '00000000-0000-4000-8000-000000000002', apiKeyId: '7', model: 'chat', message: 'Synthetic test' };

describe('separate Playground streaming transport', () => {
  it('keeps receiving beyond two minutes and resets inactivity on raw heartbeat bytes', async () => {
    vi.useFakeTimers();
    let source!: ReadableStreamDefaultController<Uint8Array>;
    const cancelled = vi.fn();
    const body = new ReadableStream<Uint8Array>({ start(controller) { source = controller; }, cancel: cancelled });
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(body, { headers: { 'content-type': 'text/event-stream' } }));
    vi.stubGlobal('fetch', fetch);
    const received = vi.fn(), pending = streamPlayground(input, received, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(0);
    for (let i = 0; i < 6; i++) {
      await vi.advanceTimersByTimeAsync(90_000);
      source.enqueue(new TextEncoder().encode(': keepalive\n\n'));
      await vi.advanceTimersByTimeAsync(0);
      expect(fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(false);
    }
    source.enqueue(new TextEncoder().encode('data: {"type":"text_delta","text":"Final reply"}\n\ndata: {"type":"done","finishReason":"stop"}\n\n'));
    await pending;
    expect(received.mock.calls.map(([event]) => event.type)).toEqual(['text_delta', 'done']);
    expect(cancelled).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });

  it('times out an inactive body and releases the reader and watchdog', async () => {
    vi.useFakeTimers();
    const cancelled = vi.fn();
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode('data: {"type":"text_delta","text":"Partial"}\n\n')); }, cancel: cancelled });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { headers: { 'content-type': 'text/event-stream' } })));
    const received = vi.fn(), pending = streamPlayground(input, received, new AbortController().signal);
    const rejected = expect(pending).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(179_999);
    expect(cancelled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); await rejected;
    expect(received).toHaveBeenCalledExactlyOnceWith({ type: 'text_delta', text: 'Partial' });
    expect(cancelled).toHaveBeenCalledOnce(); expect(body.locked).toBe(false); expect(vi.getTimerCount()).toBe(0);
  });

  it('bounds the wait for response headers', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal!.addEventListener('abort', () => reject(init.signal!.reason), { once: true });
    })));
    const rejected = expect(streamPlayground(input, vi.fn(), new AbortController().signal)).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(180_000); await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops immediately even if body cancellation never resolves', async () => {
    vi.useFakeTimers();
    const cancelled = vi.fn(() => new Promise<void>(() => {}));
    const body = new ReadableStream<Uint8Array>({ cancel: cancelled });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { headers: { 'content-type': 'text/event-stream' } })));
    const controller = new AbortController();
    const rejected = expect(streamPlayground(input, vi.fn(), controller.signal)).rejects.toHaveProperty('name', 'AbortError');
    await vi.advanceTimersByTimeAsync(0); controller.abort(); await rejected;
    expect(cancelled).toHaveBeenCalledOnce(); expect(body.locked).toBe(false); expect(vi.getTimerCount()).toBe(0);
  });

  it('reads the current shared CSRF token and retains the stream parser', async () => {
    const fetch = vi.fn(async () => new Response('data: {"type":"text_delta","text":"Reply"}\n\ndata: {"type":"done","finishReason":"stop"}\n\n', { headers: { 'content-type': 'text/event-stream' } }));
    vi.stubGlobal('fetch', fetch); setCsrfToken('old'); setCsrfToken('current');
    const event = vi.fn(); await streamPlayground(input, event, new AbortController().signal);
    expect(fetch).toHaveBeenCalledWith('/portal/v1/playground/chat', expect.objectContaining({ method: 'POST', credentials: 'include', body: JSON.stringify(input), headers: expect.objectContaining({ 'X-CSRF-Token': 'current' }) }));
    expect(event.mock.calls.map(([value]) => value)).toEqual([{ type: 'text_delta', text: 'Reply' }, { type: 'done', finishReason: 'stop' }]);
  });
  it('preserves authorization failures and caller cancellation', async () => {
    const window = new EventTarget(), unauthorized = vi.fn(); window.addEventListener('portal:unauthorized', unauthorized); vi.stubGlobal('window', window);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Sign in again' } }), { status: 401 })));
    await expect(streamPlayground(input, vi.fn(), new AbortController().signal)).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' }); expect(unauthorized).toHaveBeenCalledOnce();
    const controller = new AbortController(); controller.abort();
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => { init.signal?.throwIfAborted(); return new Response(); }));
    await expect(streamPlayground(input, vi.fn(), controller.signal)).rejects.toHaveProperty('name', 'AbortError');
  });
});
