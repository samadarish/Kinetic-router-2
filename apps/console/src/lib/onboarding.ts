import { useQuery } from '@tanstack/react-query';
import type { AuthOptions } from '@kineticrouter/portal-contract';
import { portalApi } from './api';

export function useAuthOptions() {
  return useQuery({ queryKey: ['auth-options'], queryFn: ({ signal }) => portalApi<AuthOptions>('/auth/options', { signal }), staleTime: 60_000, retry: false });
}
