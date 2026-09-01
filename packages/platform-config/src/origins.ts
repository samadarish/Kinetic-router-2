export const PRODUCTION_ORIGINS = {
  publicSite: 'https://kineticrouter.com',
  console: 'https://console.kineticrouter.com',
  api: 'https://api.kineticrouter.com',
} as const;

export const LOCAL_PORTS = { publicSite: 3000, console: 5174, bff: 3101 } as const;
export const OPENAI_API_BASE_URL = `${PRODUCTION_ORIGINS.api}/v1`;

export function isLoopbackHostname(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

export function normalizeAppOrigin(value?: string) {
  const parsed = parseUrl(value?.trim());
  if (!parsed) return undefined;
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLoopbackHostname(parsed.hostname))) return undefined;
  return parsed.origin;
}

export function resolveConsoleOrigin(options: { configuredOrigin?: string; runtimeOrigin?: string; development?: boolean } = {}) {
  const configured = normalizeAppOrigin(options.configuredOrigin);
  if (configured) return configured;
  const runtime = parseUrl(options.runtimeOrigin);
  if (runtime && isLoopbackHostname(runtime.hostname)) return localOrigin(runtime.hostname, LOCAL_PORTS.console);
  return options.development ? localOrigin('127.0.0.1', LOCAL_PORTS.console) : PRODUCTION_ORIGINS.console;
}

export function resolvePublicSiteOrigin(options: { configuredOrigin?: string; runtimeOrigin?: string } = {}) {
  const configured = normalizeAppOrigin(options.configuredOrigin);
  if (configured) return configured;
  const runtime = parseUrl(options.runtimeOrigin);
  if (runtime && isLoopbackHostname(runtime.hostname)) return localOrigin(runtime.hostname, LOCAL_PORTS.publicSite);
  return PRODUCTION_ORIGINS.publicSite;
}

export function consoleHref(path = '/', origin: string = PRODUCTION_ORIGINS.console) {
  return appHref(path, normalizeAppOrigin(origin) ?? PRODUCTION_ORIGINS.console);
}

export function publicSiteHref(path = '/', origin: string = PRODUCTION_ORIGINS.publicSite) {
  return appHref(path, normalizeAppOrigin(origin) ?? PRODUCTION_ORIGINS.publicSite);
}

export const normalizeConsoleOrigin = normalizeAppOrigin;
export function resolvePublicConsoleOrigin(configuredOrigin?: string, runtimeOrigin?: string, development = false) {
  return resolveConsoleOrigin({ configuredOrigin, runtimeOrigin, development });
}
export function consolePageUrl(origin: string, path = '/') {
  return consoleHref(path, origin);
}

function appHref(path: string, origin: string) {
  const safePath = rootRelativePath(path) ?? '/';
  return new URL(safePath, `${origin}/`).toString();
}

function rootRelativePath(value: string) {
  if (!value.startsWith('/') || value.startsWith('//')) return undefined;
  const parsed = new URL(value, 'https://kineticrouter.invalid');
  return parsed.origin === 'https://kineticrouter.invalid' ? `${parsed.pathname}${parsed.search}${parsed.hash}` : undefined;
}

function parseUrl(value?: string) {
  if (!value) return undefined;
  try { return new URL(value); } catch { return undefined; }
}

function localOrigin(hostname: string, port: number) {
  const host = hostname === '[::1]' || hostname === '::1' ? '[::1]' : hostname;
  return `http://${host}:${port}`;
}
