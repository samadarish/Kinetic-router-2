import { afterEach, describe, expect, it, vi } from 'vitest';
import { setCsrfToken } from './api';
import { streamPlayground } from './playground-api';

afterEach(() => { setCsrfToken(); vi.unstubAllGlobals(); });
const input = { conversationId: '00000000-0000-4000-8000-000000000001', revision: 0, clientTurnId: '00000000-0000-4000-8000-000000000002', apiKeyId: '7', model: 'chat', message: 'Synthetic test' };

describe('separate Playground streaming transport', () => {
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
