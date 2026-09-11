import { consolePageUrl, resolvePublicConsoleOrigin } from './public-console-origin.mjs';
import { resolveConsoleReturnPath } from '@kineticrouter/platform-config/routes';

export function consoleSignInDestination(next?: string, runtimeOrigin?: string) {
  return consoleAuthDestination('/sign-in', next, runtimeOrigin);
}

export function consoleSignUpDestination(next?: string, runtimeOrigin?: string) {
  return consoleAuthDestination('/sign-up', next, runtimeOrigin);
}

function consoleAuthDestination(path: string, next?: string, runtimeOrigin?: string) {
  const configured = process.env.KINETICROUTER_CONSOLE_URL ?? process.env.KINETICROUTER_CONSOLE_ORIGIN;
  const consoleOrigin = resolvePublicConsoleOrigin(configured, runtimeOrigin, process.env.NODE_ENV === 'development');
  const destination = new URL(consolePageUrl(consoleOrigin, path));
  if (next) destination.searchParams.set('next', resolveConsoleReturnPath(next));
  return destination.toString();
}

export function publicRequestOrigin(headers: Headers) {
  const host = headers.get('x-forwarded-host') ?? headers.get('host');
  if (!host) return undefined;
  const protocol = headers.get('x-forwarded-proto') ?? (process.env.NODE_ENV === 'development' ? 'http' : 'https');
  return `${protocol}://${host}`;
}

