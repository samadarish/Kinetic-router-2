import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class FakeDocument extends EventTarget { visibilityState = 'visible'; referrer = 'https://github.com/example'; }
class FakeWindow extends EventTarget {
  setInterval = globalThis.setInterval;
  setTimeout = globalThis.setTimeout;
  requestIdleCallback = vi.fn();
}
let document: FakeDocument;
let window: FakeWindow;
let requests: Array<{ url: string; body: Record<string, any> }>;
let fetchMock: ReturnType<typeof vi.fn>;
let beacon: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-05T10:00:00Z'));
  document = new FakeDocument(); window = new FakeWindow(); requests = [];
  fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)); requests.push({ url, body });
    return url.endsWith('/bootstrap') ? new Response(JSON.stringify({ ok: true, data: { enabled: true, token: 'signed-token', visitorId: 'visitor', sessionId: 'session', expiresAt: Date.now() + 300_000, timezone: 'Asia/Kolkata' } }), { status: 200 }) : new Response(null, { status: 204 });
  });
  beacon = vi.fn(() => true);
  vi.stubGlobal('document', document); vi.stubGlobal('window', window);
  vi.stubGlobal('location', { pathname: '/docs', search: '?utm_source=launch', origin: 'https://kineticrouter.com', href: 'https://kineticrouter.com/docs' });
  vi.stubGlobal('navigator', { sendBeacon: beacon, doNotTrack: null }); vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const settle = () => vi.advanceTimersByTimeAsync(1);
const events = () => requests.filter(item => item.url.endsWith('/collect')).flatMap(item => item.body.events);

describe('browser analytics lifecycle', () => {
  it('reuses date formatters without changing dates across timezones, eviction and invalid inputs', async () => {
    const { dateInTimezone } = await import('../packages/analytics-client/src/index');
    const at = Date.parse('2026-09-12T20:00:00Z');
    for (const zone of ['UTC', 'Asia/Kolkata', 'America/New_York', 'Europe/London', 'Asia/Tokyo', 'Pacific/Auckland', 'Australia/Sydney', 'Europe/Paris', 'America/Los_Angeles', 'Asia/Kolkata', 'UTC']) {
      const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at);
      const expected = ['year', 'month', 'day'].map(key => parts.find(part => part.type === key)!.value).join('-');
      expect(dateInTimezone(at, zone)).toBe(expected); expect(dateInTimezone(at, zone)).toBe(expected);
    }
    expect(() => dateInTimezone(at, 'Invalid/Timezone')).toThrow(RangeError);
    expect(dateInTimezone(at, 'Asia/Kolkata')).toBe('2026-09-13');
  });
  it.each([
    ['Asia/Kolkata', '2026-09-12T18:29:59Z', '2026-09-12T18:30:01Z', [{ day: '2026-09-12', ms: 1000 }, { day: '2026-09-13', ms: 1000 }]],
    ['UTC', '2026-09-12T23:59:59Z', '2026-09-13T00:00:01Z', [{ day: '2026-09-12', ms: 1000 }, { day: '2026-09-13', ms: 1000 }]],
    ['America/New_York', '2026-03-08T05:00:00Z', '2026-03-09T04:00:01Z', [{ day: '2026-03-08', ms: 23 * 3_600_000 }, { day: '2026-03-09', ms: 1000 }]],
    ['America/New_York', '2026-11-01T04:00:00Z', '2026-11-02T05:00:01Z', [{ day: '2026-11-01', ms: 25 * 3_600_000 }, { day: '2026-11-02', ms: 1000 }]],
  ] as const)('keeps reporting midnight exact in %s from %s', async (zone, start, end, expected) => {
    const { splitEngagement } = await import('../packages/analytics-client/src/index');
    expect(splitEngagement(Date.parse(start), Date.parse(end), zone)).toEqual(expected);
  });
  it('initializes only once across StrictMode remounts and counts SPA navigations once', async () => {
    const { startAnalytics } = await import('../packages/analytics-client/src/index');
    const options = { consoleOrigin: 'https://console.kineticrouter.com', surface: 'site' as const };
    const first = startAnalytics(options); const second = startAnalytics(options);
    first?.navigate('/docs'); second?.navigate('/docs'); await settle();
    expect(requests.filter(item => item.url.endsWith('/bootstrap'))).toHaveLength(1);
    expect(events().filter(event => event.name === 'page_view')).toHaveLength(1);
    first?.navigate('/pricing'); await settle(); first?.navigate('/docs'); await settle();
    expect(events().filter(event => event.name === 'page_view').map(event => event.path)).toEqual(['/docs', '/pricing', '/docs']);
  });
  it('limits foreground heartbeats and stops periodic sends while hidden', async () => {
    const { startAnalytics } = await import('../packages/analytics-client/src/index');
    startAnalytics({ consoleOrigin: 'https://console.kineticrouter.com', surface: 'site' }); await settle();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(requests.filter(item => item.url.endsWith('/collect')).length).toBeLessThanOrEqual(3);
    document.visibilityState = 'hidden'; document.dispatchEvent(new Event('visibilitychange'));
    const previous = requests.length; await vi.advanceTimersByTimeAsync(120_000);
    expect(requests).toHaveLength(previous); expect(beacon).toHaveBeenCalled();
  });
  it.each([{ globalPrivacyControl: true }, { doNotTrack: '1' }])('collects visits and interactions with browser signals %j', async signals => {
    vi.stubGlobal('navigator', { ...signals, sendBeacon: beacon });
    const { startAnalytics, trackDocsCopy } = await import('../packages/analytics-client/src/index');
    startAnalytics({ consoleOrigin: 'https://console.kineticrouter.com', surface: 'site' }); trackDocsCopy(); await settle();
    expect(requests[0]?.body).not.toHaveProperty('disabled');
    expect(events().map(event => event.name)).toEqual(['page_view', 'docs_copy']);
    expect(window.requestIdleCallback).toHaveBeenCalledOnce();
    expect(requests[0]?.body.referrer).toBe('https://github.com'); expect(requests[0]?.body.source).toBe('launch');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(events().some(event => event.name === 'engagement')).toBe(true);
    document.visibilityState = 'hidden'; document.dispatchEvent(new Event('visibilitychange'));
    expect(beacon).toHaveBeenCalled();
  });
  it('retries stable event IDs without exposing action contents or throwing into the page', async () => {
    let fail = true;
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => { if (url.endsWith('/collect') && fail) { requests.push({ url, body: JSON.parse(String(init.body)) }); fail = false; throw new Error('offline'); } return original(url, init); });
    const { startAnalytics, trackDocsCopy } = await import('../packages/analytics-client/src/index');
    startAnalytics({ consoleOrigin: 'https://console.kineticrouter.com', surface: 'site' }); await settle();
    trackDocsCopy(); await vi.advanceTimersByTimeAsync(10_000);
    const views = events().filter(event => event.name === 'page_view');
    expect(views.length).toBe(2); expect(views[0].id).toBe(views[1].id);
    expect(events().find(event => event.name === 'docs_copy')).not.toHaveProperty('text');
  });
  it('uses a new document identity on reload and increasing sequence numbers for observation ordering', async () => {
    const { startAnalytics } = await import('../packages/analytics-client/src/index');
    const tracker = startAnalytics({ consoleOrigin: 'https://console.kineticrouter.com', surface: 'site' }); await settle();
    tracker?.navigate('/pricing'); await settle();
    const packets = requests.filter(item => item.url.endsWith('/collect'));
    expect(packets[1]!.body.sequence).toBeGreaterThan(packets[0]!.body.sequence);
    expect(packets[0]!.body.tabId).toMatch(/^[a-f0-9-]{36}$/);
  });
  it('counts a back-forward cache restoration as a fresh view', async () => {
    const { startAnalytics } = await import('../packages/analytics-client/src/index');
    startAnalytics({ consoleOrigin: 'https://console.kineticrouter.com', surface: 'site' }); await settle();
    const restored = new Event('pageshow'); Object.assign(restored, { persisted: true }); window.dispatchEvent(restored); await settle();
    const views = events().filter(event => event.name === 'page_view'); expect(views).toHaveLength(2); expect(views[0].pageId).not.toBe(views[1].pageId);
  });
  it('remembers the previous session after a failed refresh and resets page IDs for a new session', async () => {
    const { startAnalytics } = await import('../packages/analytics-client/src/index');
    const tracker = startAnalytics({ consoleOrigin: 'https://console.kineticrouter.com', surface: 'site' }); await settle();
    const first = events().find(event => event.name === 'page_view');
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => { if (url.endsWith('/bootstrap')) throw new Error('offline'); return original(url, init); });
    vi.setSystemTime(new Date('2026-09-05T10:31:00Z'));
    tracker?.navigate('/pricing'); await settle();
    expect(requests.filter(item => item.url.endsWith('/collect'))).toHaveLength(1);
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => url.endsWith('/bootstrap') ? new Response(JSON.stringify({ok:true,data:{enabled:true,token:'fresh',sessionId:'new-session',expiresAt:Date.now()+300000,timezone:'Asia/Kolkata'}})) : original(url,init));
    vi.setSystemTime(new Date('2026-09-05T10:32:00Z')); tracker?.identityChanged(); await settle();
    const last = events().filter(event => event.name === 'page_view').at(-1);
    expect(last.pageId).not.toBe(first.pageId);
  });
});
