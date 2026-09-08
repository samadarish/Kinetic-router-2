import { describe, expect, it, vi } from 'vitest';
import { appendPlaygroundTurn, playgroundHistory, refreshPlaygroundBilling } from './playground-state';
import { QueryClient, QueryObserver } from '@tanstack/react-query';

describe('playground conversation identity', () => {
  it('keeps each response attached to the model used for that send', () => {
    const first = appendPlaygroundTurn([], 'First prompt', 'model-a', 1);
    first[1]!.content = 'First answer';
    const second = appendPlaygroundTurn(first, 'Next prompt', 'model-b', 3);
    expect(second.filter(message => message.role === 'assistant').map(message => message.model)).toEqual(['model-a', 'model-b']);
    expect(first).toHaveLength(2);
  });
  it('sends visible text history without display metadata or empty pending responses', () => {
    const messages = appendPlaygroundTurn([], 'First prompt', 'model-a', 1);
    messages[1]!.content = 'First answer';
    messages[1]!.usage = { inputTokens: 1, outputTokens: 2, totalTokens: 3 };
    const pending = appendPlaygroundTurn(messages, 'Second prompt', 'model-b', 3);
    expect(playgroundHistory(pending, 'Follow-up')).toEqual([
      { role: 'user', content: 'First prompt' }, { role: 'assistant', content: 'First answer' },
      { role: 'user', content: 'Second prompt' }, { role: 'user', content: 'Follow-up' },
    ]);
  });
  it('refreshes account spend after any settled send, including an interrupted previous chat', async () => {
    const client = new QueryClient();
    client.setQueryData(['session'], { authenticated: true, user: { id: '42' } });
    const queries = [['usage-summary'], ['usage-events'], ['dashboard'], ['profile'], ['api-keys'], ['subscriptions']];
    for (const key of queries) client.setQueryData(key, {});
    await refreshPlaygroundBilling(client, '42');
    for (const key of queries) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    client.clear();
  });
  it('does not refetch an open rates disclosure after a send', async () => {
    const client = new QueryClient();
    client.setQueryData(['session'], { authenticated: true, user: { id: '42' } });
    const fetchRates = vi.fn(async () => ({ status: 'available' }));
    const observer = new QueryObserver(client, { queryKey: ['playground', 'prices', '7', 'model'], queryFn: fetchRates, staleTime: Infinity });
    const unsubscribe = observer.subscribe(() => {});
    await observer.refetch(); fetchRates.mockClear();
    await refreshPlaygroundBilling(client, '42');
    expect(fetchRates).not.toHaveBeenCalled();
    unsubscribe(); client.clear();
  });
  it.each([undefined, { authenticated: false }, { authenticated: true, user: { id: '43' } }])('does not refetch private queries after sign-out or account change', async session => {
    const client = new QueryClient();
    if (session) client.setQueryData(['session'], session);
    client.setQueryData(['dashboard'], {});
    await refreshPlaygroundBilling(client, '42');
    expect(client.getQueryState(['dashboard'])?.isInvalidated).toBe(false);
    client.clear();
  });
});
