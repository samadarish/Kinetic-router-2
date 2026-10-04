import { afterEach, describe, expect, it, vi } from 'vitest';
import { measureApiLatency } from './api-latency';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('API connection latency', () => {
  it('discards warm-up time, uses the median, and sends only uncached credential-free probes', async () => {
    const fetchProbe = vi.fn(async () => ({ type: 'opaque', status: 0, ok: false }));
    vi.stubGlobal('fetch', fetchProbe);
    const times = [0, 100, 112, 200, 220, 300, 399];
    vi.spyOn(performance, 'now').mockImplementation(() => times.shift()!);
    expect(await measureApiLatency('cloudflare', new AbortController().signal)).toBe(20);
    expect(fetchProbe).toHaveBeenCalledTimes(4);
    const urls = new Set<string>();
    for (const [url, options] of fetchProbe.mock.calls as unknown as [string, RequestInit][]) {
      const parsed = new URL(url);
      expect(parsed.origin).toBe('https://cdn-api.kineticrouter.com');
      expect(parsed.pathname).toBe('/');
      expect(parsed.searchParams.get('_ping')).toBeTruthy();
      urls.add(url);
      expect(options).toMatchObject({ method: 'HEAD', mode: 'no-cors', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', redirect: 'follow' });
      expect(options.headers).toBeUndefined();
    }
    expect(urls.size).toBe(4);
  });

  it('keeps simultaneous measurements on their respective hosts', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => { urls.push(url); return { type: 'opaque' }; }));
    const results = await Promise.all([
      measureApiLatency('direct', new AbortController().signal),
      measureApiLatency('cloudflare', new AbortController().signal),
    ]);
    expect(results).toHaveLength(2);
    expect(urls.filter(url => new URL(url).hostname === 'api.kineticrouter.com')).toHaveLength(4);
    expect(urls.filter(url => new URL(url).hostname === 'cdn-api.kineticrouter.com')).toHaveLength(4);
  });

  it('reports a connection failure without sending the remaining probes', async () => {
    const error = new TypeError('Failed to fetch');
    const fetchProbe = vi.fn().mockRejectedValue(error);
    vi.stubGlobal('fetch', fetchProbe);
    await expect(measureApiLatency('direct', new AbortController().signal)).rejects.toBe(error);
    expect(fetchProbe).toHaveBeenCalledTimes(1);
  });

  it('aborts a stalled test after five seconds', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal!.addEventListener('abort', () => reject(options.signal!.reason), { once: true });
    })));
    const result = measureApiLatency('direct', new AbortController().signal);
    const failure = expect(result).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(5000);
    await failure;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels in-flight requests and clears the deadline', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    vi.stubGlobal('fetch', vi.fn((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal!.addEventListener('abort', () => reject(options.signal!.reason), { once: true });
    })));
    const result = measureApiLatency('cloudflare', controller.signal);
    const failure = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await failure;
    expect(vi.getTimerCount()).toBe(0);
  });
});
