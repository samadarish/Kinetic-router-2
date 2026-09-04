import type { QueryClient } from '@tanstack/react-query';
import type { CapabilityMap, SessionView } from '@kineticrouter/portal-contract';

const isAccountQuery = (query: { queryKey: readonly unknown[] }) => query.queryKey[0] !== 'session';

export async function applyLoggedOutQueryState(client: QueryClient, capabilities: CapabilityMap) {
  client.setQueryData<SessionView>(['session'], {
    authenticated: false,
    capabilities,
  });
  await client.cancelQueries({ predicate: isAccountQuery });
  client.removeQueries({ predicate: isAccountQuery });
}
