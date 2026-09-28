import type { QueryClient } from '@tanstack/react-query';
import type { CapabilityMap, SessionView } from '@kineticrouter/portal-contract';

const isAccountQuery = (query: { queryKey: readonly unknown[] }) => query.queryKey[0] !== 'session';
export async function reconcileSessionQueries(client: QueryClient, next: SessionView, signal?: AbortSignal) {
  const previous = client.getQueryData<SessionView>(['session']);
  if (!previous) return false;
  const identity = (session: SessionView | undefined) => session?.authenticated
    ? `${session.user?.id}:${session.user?.role}:${session.user?.status}` : null;
  if (identity(previous) === identity(next)) return false;
  // Called by the session query itself: cancel only account requests, then clear
  // their data before the new identity is published to its consumers.
  await client.cancelQueries({ predicate: isAccountQuery });
  signal?.throwIfAborted();
  client.removeQueries({ predicate: isAccountQuery });
  return true;
}

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
