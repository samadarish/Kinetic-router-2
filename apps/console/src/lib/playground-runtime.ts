import type { QueryClient } from '@tanstack/react-query';
import type { SessionView } from '@kineticrouter/portal-contract';
import { jsonBody, portalApi, queryString } from './api';
import { streamPlayground } from './playground-api';
import { refreshPlaygroundBilling } from './playground-state';
import { browserPlaygroundStorage } from './playground-browser-storage';
import { createConversationController, type HistoryApi } from './playground-conversations';

const historyApi: HistoryApi = {
  list: cursor => portalApi(`/playground/conversations${queryString({ cursor })}`),
  detail: (id, before) => portalApi(`/playground/conversations/${id}${queryString({ before })}`),
  create: id => portalApi('/playground/conversations', { method: 'POST', ...jsonBody({ id }) }),
  remove: id => portalApi(`/playground/conversations/${id}`, { method: 'DELETE' }),
  import: (id, messages) => portalApi('/playground/conversations/import', { method: 'POST', ...jsonBody({ id, messages }) }),
};

export function createUserPlayground(client: QueryClient, userId: string) {
  return createConversationController({
    userId, storage: browserPlaygroundStorage(), api: historyApi,
    isEnabled: () => client.getQueryState(['session'])?.status === 'success' && client.getQueryData<SessionView>(['session'])?.playgroundEnabled === true,
    isOwner: () => { const session = client.getQueryData<SessionView>(['session']); return session?.authenticated === true && session.user?.id === userId; },
    stream: streamPlayground,
    settled: () => { void refreshPlaygroundBilling(client, userId); },
    unavailable: (kind, keyId) => { void client.invalidateQueries({ queryKey: kind === 'models' ? ['playground', 'models', userId, keyId] : ['playground', 'keys', userId] }); },
  });
}
