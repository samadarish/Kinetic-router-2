import { consolePageUrl, resolvePublicConsoleOrigin } from './public-console-origin.mjs';

export function consoleSignInDestination(next?: string, runtimeOrigin?: string) {
  const configured = process.env.KINETICROUTER_CONSOLE_URL ?? process.env.KINETICROUTER_CONSOLE_ORIGIN;
  const consoleOrigin = resolvePublicConsoleOrigin(configured, runtimeOrigin, process.env.NODE_ENV === 'development');
  const destination = new URL(consolePageUrl(consoleOrigin, '/sign-in'));
  if (next?.startsWith('/')) destination.searchParams.set('next', next);
  return destination.toString();
}

export function publicRequestOrigin(headers: Headers) {
  const host = headers.get('x-forwarded-host') ?? headers.get('host');
  if (!host) return undefined;
  const protocol = headers.get('x-forwarded-proto') ?? (process.env.NODE_ENV === 'development' ? 'http' : 'https');
  return `${protocol}://${host}`;
}

