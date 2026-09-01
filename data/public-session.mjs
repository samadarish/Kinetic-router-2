import { consolePageUrl } from './public-console-origin.mjs';

export async function requestPublicLogout(consoleOrigin, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new TypeError('A fetch implementation is required.');

  const response = await fetchImpl(consolePageUrl(consoleOrigin, '/portal/v1/auth/logout'), {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json' },
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error(`Sign out failed with status ${response.status}.`);
  }
}
