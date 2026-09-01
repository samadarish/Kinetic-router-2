const productionConsoleOrigin = 'https://console.kineticrouter.com';
const localConsoleOrigin = 'http://127.0.0.1:5174';

function isLocalHostname(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

export function normalizeConsoleOrigin(value) {
  if (!value || typeof value !== 'string') return undefined;
  try {
    const url = new URL(value.trim());
    if (url.protocol === 'https:' || (url.protocol === 'http:' && isLocalHostname(url.hostname))) {
      return url.origin;
    }
  } catch {
    // Invalid configuration falls back to a known-safe origin.
  }
  return undefined;
}

export function resolvePublicConsoleOrigin(configuredOrigin, runtimeOrigin, development = false) {
  const configured = normalizeConsoleOrigin(configuredOrigin);
  if (configured) return configured;

  const runtime = normalizeConsoleOrigin(runtimeOrigin);
  if (runtime) {
    const hostname = new URL(runtime).hostname;
    if (isLocalHostname(hostname)) return `http://${hostname === '[::1]' ? '[::1]' : hostname}:5174`;
  }

  return development ? localConsoleOrigin : productionConsoleOrigin;
}

export function consolePageUrl(origin, path) {
  const safeOrigin = normalizeConsoleOrigin(origin) ?? productionConsoleOrigin;
  const safePath = typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') ? path : '/';
  return new URL(safePath, `${safeOrigin}/`).toString();
}
