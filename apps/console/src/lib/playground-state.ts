import type { PlaygroundMessage, PlaygroundUsage, SessionView } from '@kineticrouter/portal-contract';
import type { QueryClient } from '@tanstack/react-query';

export type ConversationMessage = PlaygroundMessage & {
  id: number; model?: string; usage?: PlaygroundUsage;
  state?: 'complete' | 'stopped' | 'failed'; limited?: boolean;
};

export function appendPlaygroundTurn(messages: ConversationMessage[], content: string, model: string, id: number): ConversationMessage[] {
  return [...messages, { id, role: 'user', content }, { id: id + 1, role: 'assistant', model, content: '' }];
}

export function playgroundHistory(messages: ConversationMessage[], draft: string): PlaygroundMessage[] {
  return [...messages.filter(message => message.content.length > 0).map(({ role, content }) => ({ role, content })), { role: 'user', content: draft }];
}

export async function refreshPlaygroundBilling(client: QueryClient, userId: string | undefined): Promise<void> {
  const session = client.getQueryData<SessionView>(['session']);
  if (!userId || !session?.authenticated || session.user?.id !== userId) return;
  await Promise.all([
    ['usage-summary'], ['usage-events'], ['dashboard'], ['profile'], ['api-keys'], ['subscriptions'],
  ].map(queryKey => client.invalidateQueries({ queryKey })));
}
