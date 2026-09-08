import { useInfiniteQuery } from '@tanstack/react-query';
import type { Paginated, PlaygroundKeyOption } from '@kineticrouter/portal-contract';
import { portalApi, queryString } from './api';
import { useAuth } from './auth';

export function usePlaygroundKeys(admin = false) {
  const { user, playgroundEnabled } = useAuth();
  const scope = admin ? 'admin/playground' : 'playground';
  return useInfiniteQuery({
    queryKey: [scope, 'keys', user?.id], initialPageParam: 1,
    enabled: Boolean(user) && (admin ? user?.role === 'admin' && user.status === 'active' : playgroundEnabled),
    queryFn: ({ signal, pageParam }) => portalApi<Paginated<PlaygroundKeyOption>>(`/${scope}/keys${queryString({ page: pageParam, pageSize: 30 })}`, { signal }),
    getNextPageParam: last => last.page < last.pages ? last.page + 1 : undefined,
    staleTime: 30_000,
  });
}
