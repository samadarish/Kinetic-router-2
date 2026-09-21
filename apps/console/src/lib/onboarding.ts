import { useQuery } from '@tanstack/react-query';
import type { AuthOptions } from '@kineticrouter/portal-contract';
import { PortalApiError, portalApi } from './api';

export function useAuthOptions() {
  return useQuery({ queryKey: ['auth-options'], queryFn: ({ signal }) => portalApi<AuthOptions>('/auth/options', { signal }), staleTime: 60_000, retry: false, refetchOnWindowFocus: true });
}

export function shouldRefreshAuthOptions(error: unknown) {
  return error instanceof PortalApiError && /TURNSTILE|CAPTCHA|AUTH_UNAVAILABLE/.test(error.code);
}
