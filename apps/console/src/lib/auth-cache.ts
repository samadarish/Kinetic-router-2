import type { QueryClient } from '@tanstack/react-query';
import type { CapabilityMap, SessionView } from '@kineticrouter/portal-contract';

const isAccountQuery = (query: { queryKey: readonly unknown[] }) => query.queryKey[0] !== 'session';
export async function applyMetricsAuthorizationState(client: QueryClient, session: SessionView) {
  if (session.authenticated && session.user?.role === 'admin' && session.user.status === 'active') return;
  await client.cancelQueries({ queryKey: ['metrics'] });
  client.removeQueries({ queryKey: ['metrics'] });
}

export async function applyLoggedOutQueryState(client: QueryClient, capabilities: CapabilityMap) {
  const playgroundEnabled = client.getQueryData<SessionView>(['session'])?.playgroundEnabled === true;
  await client.cancelQueries({ queryKey: ['session'], exact: true });
  client.setQueryData<SessionView>(['session'], {
    authenticated: false,
    playgroundEnabled,
    capabilities,
  });
  await client.cancelQueries({ predicate: isAccountQuery });
  client.removeQueries({ predicate: isAccountQuery });
}
