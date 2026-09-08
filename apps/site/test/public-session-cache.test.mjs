import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicSessionCache, playgroundDestination } from '../data/public-session-cache.mjs';

const userResponse = () => Response.json({ ok: true, data: { authenticated: true, playgroundEnabled: true, user: { id: '7', username: 'Customer', secret: 'not-public' }, csrfToken: 'not-public' } });

test('header and account consumers share a bounded session read with a safe allowlist', async () => {
  let calls = 0, now = 0;
  const cache = createPublicSessionCache('http://localhost:5174', { now: () => now, fetchImpl: async (url, init) => {
    calls++; assert.equal(url, 'http://localhost:5174/portal/v1/public-session'); assert.equal(init.credentials, 'include'); assert.equal(init.cache, 'no-store'); return userResponse();
  } });
  let updates = 0; const off = cache.subscribe(() => updates++);
  await Promise.all([cache.refresh(), cache.refresh()]);
  assert.equal(calls, 1); assert.equal(updates, 1);
  assert.deepEqual(cache.getSnapshot(), { loaded: true, playgroundEnabled: true, session: { authenticated: true, playgroundEnabled: true, user: { id: '7', username: 'Customer' } } });
  await cache.refresh(); assert.equal(calls, 1);
  now = 30_001; await cache.refresh(); assert.equal(calls, 2); off();
});

test('late session reads cannot restore identity after logout', async () => {
  let resolveRead;
  const cache = createPublicSessionCache('https://console.kineticrouter.com', { fetchImpl: () => new Promise(resolve => { resolveRead = resolve; }) });
  const read = cache.refresh(); cache.signedOut(); resolveRead(userResponse()); await read;
  assert.deepEqual(cache.getSnapshot(), { loaded: true, playgroundEnabled: false, session: null });
});

test('failed reads use the login fallback and can refresh after a short delay', async () => {
  let now = 0, calls = 0;
  const cache = createPublicSessionCache('http://localhost:5174', { now: () => now, fetchImpl: async () => { calls++; if (calls === 1) throw new Error('offline'); return userResponse(); } });
  await cache.refresh(); assert.deepEqual(cache.getSnapshot(), { loaded: true, playgroundEnabled: false, session: null });
  await cache.refresh(); assert.equal(calls, 1);
  now = 5001; await cache.refresh(); assert.equal(cache.getSnapshot().session.authenticated, true);
});

test('Playground always has the right same-tab destination for anonymous and authenticated users', () => {
  for (const session of [undefined, null, { authenticated: false }]) assert.equal(playgroundDestination('http://localhost:5174', session), '/account/sign-in?next=%2Fplayground');
  assert.equal(playgroundDestination('http://localhost:5174', { authenticated: true }), 'http://localhost:5174/playground');
  assert.equal(playgroundDestination('https://console.kineticrouter.com', { authenticated: true }), 'https://console.kineticrouter.com/playground');
});

test('anonymous availability is explicit and missing, malformed or failed reads hide Playground', async () => {
  for (const flag of [true, false, undefined, 'true', 1, null]) {
    const cache = createPublicSessionCache('http://localhost:5174', { fetchImpl: async () => Response.json({ ok: true, data: { authenticated: false, playgroundEnabled: flag } }) });
    assert.equal(cache.getSnapshot().playgroundEnabled, false);
    await cache.refresh();
    assert.equal(cache.getSnapshot().session, null);
    assert.equal(cache.getSnapshot().playgroundEnabled, flag === true);
  }
  let now = 0, fail = false;
  const cache = createPublicSessionCache('http://localhost:5174', { now: () => now, fetchImpl: async () => { if (fail) throw new Error('offline'); return userResponse(); } });
  await cache.refresh(); assert.equal(cache.getSnapshot().playgroundEnabled, true);
  now = 30_001; fail = true; await cache.refresh();
  assert.equal(cache.getSnapshot().playgroundEnabled, false);
});

test('logout preserves known global availability and ignores an older read', async () => {
  let now = 0, finish;
  const cache = createPublicSessionCache('http://localhost:5174', { now: () => now, fetchImpl: () => now === 0 ? Promise.resolve(userResponse()) : new Promise(resolve => { finish = resolve; }) });
  await cache.refresh(); now = 30_001;
  const read = cache.refresh(); cache.signedOut();
  finish(Response.json({ ok: true, data: { authenticated: true, playgroundEnabled: false, user: { id: '7', username: 'Customer' } } })); await read;
  assert.deepEqual(cache.getSnapshot(), { loaded: true, playgroundEnabled: true, session: null });
});

test('consumers share one foreground refresh timer and release all watchers on unmount', async () => {
  let now = 0, calls = 0, interval, starts = 0, stops = 0;
  const window = new EventTarget(), document = new EventTarget();
  document.visibilityState = 'visible';
  window.setInterval = (callback, delay) => { assert.equal(delay, 60_000); interval = callback; starts++; return 1; };
  window.clearInterval = id => { assert.equal(id, 1); stops++; };
  const cache = createPublicSessionCache('http://localhost:5174', { now: () => now, fetchImpl: async () => { calls++; return userResponse(); } });
  const first = cache.watch({ window, document }), second = cache.watch({ window, document });
  await cache.refresh(); assert.equal(calls, 1); assert.equal(starts, 1);
  now = 60_000; document.visibilityState = 'hidden'; interval(); assert.equal(calls, 1);
  document.visibilityState = 'visible'; document.dispatchEvent(new Event('visibilitychange')); await cache.refresh(); assert.equal(calls, 2);
  now = 120_000; interval(); await cache.refresh(); assert.equal(calls, 3);
  first(); first(); assert.equal(stops, 0); second(); assert.equal(stops, 1);
  now = 180_000; window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('pageshow')); document.dispatchEvent(new Event('visibilitychange')); assert.equal(calls, 3);
  const third = cache.watch({ window, document }); await cache.refresh(); assert.equal(starts, 2); assert.equal(calls, 4); third();
});
