import test from 'node:test';
import assert from 'node:assert/strict';
import { requestPublicLogout } from '../data/public-session.mjs';

test('sends logout as a credentialed simple POST', async () => {
  const controller = new AbortController();
  let request;
  await requestPublicLogout('https://console.kineticrouter.com', {
    signal: controller.signal,
    fetchImpl: async (url, init) => {
      request = { url, init };
      return { ok: true, status: 200 };
    },
  });

  assert.equal(request.url, 'https://console.kineticrouter.com/portal/v1/auth/logout');
  assert.equal(request.init.method, 'POST');
  assert.equal(request.init.credentials, 'include');
  assert.deepEqual(request.init.headers, { Accept: 'application/json' });
  assert.equal('body' in request.init, false);
  assert.equal(request.init.signal, controller.signal);
});

test('rejects non-successful logout responses', async () => {
  await assert.rejects(
    requestPublicLogout('https://console.kineticrouter.com', {
      fetchImpl: async () => ({ ok: false, status: 503 }),
    }),
    /status 503/,
  );
});

test('preserves network failures for the account menu to handle', async () => {
  await assert.rejects(
    requestPublicLogout('https://console.kineticrouter.com', {
      fetchImpl: async () => { throw new TypeError('Failed to fetch'); },
    }),
    /Failed to fetch/,
  );
});
