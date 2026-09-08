import type { QueryClient } from '@tanstack/react-query';
import type { PlaygroundSettings, SessionView } from '@kineticrouter/portal-contract';

export const playgroundAdminSettingsKey = (userId: string | undefined) => ['admin', 'playground', 'settings', userId];

export function isPlaygroundAdminOwner(client: QueryClient, owner: { userId?: string; csrfToken?: string }) {
  const session = client.getQueryData<SessionView>(['session']);
  return Boolean(owner.userId && owner.csrfToken && session?.authenticated && session.user?.id === owner.userId && session.csrfToken === owner.csrfToken && session.user.role === 'admin' && session.user.status === 'active');
}

export function applySavedPlaygroundSettings(client: QueryClient, result: PlaygroundSettings, owner: { userId?: string; csrfToken?: string }) {
  if (!isPlaygroundAdminOwner(client, owner)) return false;
  // Cancel pre-save reads so their old flag cannot overwrite the saved value.
  void client.cancelQueries({ queryKey: ['session'], exact: true });
  client.setQueryData<SessionView>(['session'], current => current ? { ...current, playgroundEnabled: result.playgroundEnabled } : current);
  client.setQueryData(playgroundAdminSettingsKey(owner.userId), result);
  void client.invalidateQueries({ queryKey: ['playground', 'models'] });
  return true;
}
