export const CONSOLE_ROUTES = {
  signIn: '/sign-in',
  dashboard: '/dashboard',
  apiKeys: '/api-keys',
  playground: '/playground',
  playgroundSettings: '/admin/playground',
  websiteSettings: '/admin/website',
  usage: '/usage',
  status: '/status',
  subscriptions: '/subscriptions',
  redeem: '/redeem',
  profile: '/profile',
  analytics: '/analytics',
} as const;

export type ConsoleRoute = typeof CONSOLE_ROUTES[keyof typeof CONSOLE_ROUTES];

const allowed = new Set<string>(Object.values(CONSOLE_ROUTES).filter((route) => route !== CONSOLE_ROUTES.signIn));
const legacy: Record<string, string> = {
  '/console': CONSOLE_ROUTES.dashboard,
  '/console/overview': CONSOLE_ROUTES.dashboard,
  '/console/dashboard': CONSOLE_ROUTES.dashboard,
  '/console/api-keys': CONSOLE_ROUTES.apiKeys,
  '/console/playground': CONSOLE_ROUTES.playground,
  '/console/usage': CONSOLE_ROUTES.usage,
  '/console/status': CONSOLE_ROUTES.status,
  '/console/channel-status': CONSOLE_ROUTES.status,
  '/console/subscriptions': CONSOLE_ROUTES.subscriptions,
  '/console/redeem': CONSOLE_ROUTES.redeem,
  '/console/profile': CONSOLE_ROUTES.profile,
};

export function resolveConsoleReturnPath(value: unknown) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return CONSOLE_ROUTES.dashboard;
  let parsed: URL;
  try { parsed = new URL(value, 'https://console.kineticrouter.invalid'); } catch { return CONSOLE_ROUTES.dashboard; }
  if (parsed.origin !== 'https://console.kineticrouter.invalid') return CONSOLE_ROUTES.dashboard;
  const normalizedPath = parsed.pathname.replace(/\/$/, '') || '/';
  const pathname = legacy[normalizedPath] ?? normalizedPath;
  return allowed.has(pathname) ? `${pathname}${parsed.search}` : CONSOLE_ROUTES.dashboard;
}
