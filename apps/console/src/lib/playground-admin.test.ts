import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { applySavedPlaygroundSettings, playgroundAdminSettingsKey } from './playground-admin';

const owner = { userId: '7', csrfToken: 'session-one' };
const saved = { playgroundEnabled: true, revision: 2, enabledModelIds: ['chat'], modelIdentities: [{ modelId: 'chat', name: 'Example' }] };
describe('admin save completion identity', () => {
  it('publishes the saved switch immediately and cancels an older session read', async () => {
    const client = new QueryClient();
    const session = { authenticated: true, playgroundEnabled: true, csrfToken: owner.csrfToken, user: { id: '7', role: 'admin', status: 'active' } };
    client.setQueryData(['session'], session);
    let finish!: (value: typeof session) => void;
    const read = client.fetchQuery({ queryKey: ['session'], queryFn: () => new Promise<typeof session>(resolve => { finish = resolve; }) }).catch(() => undefined);
    expect(applySavedPlaygroundSettings(client, { ...saved, playgroundEnabled: false }, owner)).toBe(true);
    finish(session); await read;
    expect(client.getQueryData(['session'])).toEqual({ ...session, playgroundEnabled: false });
    client.clear();
  });

  it('applies a successful save only to its initiating active admin session', () => {
    const client = new QueryClient();
    client.setQueryData(['session'], { authenticated: true, csrfToken: owner.csrfToken, user: { id: '7', role: 'admin', status: 'active' } });
    client.setQueryData(['playground', 'models', '7'], []);
    expect(applySavedPlaygroundSettings(client, saved, owner)).toBe(true);
    expect(client.getQueryData(playgroundAdminSettingsKey(owner.userId))).toEqual(saved);
    expect(client.getQueryData(playgroundAdminSettingsKey('8'))).toBeUndefined();
    expect(client.getQueryState(['playground', 'models', '7'])?.isInvalidated).toBe(true); client.clear();
  });
  it.each([
    undefined, { authenticated: false },
    { authenticated: true, csrfToken: 'session-one', user: { id: '8', role: 'admin', status: 'active' } },
    { authenticated: true, csrfToken: 'new-login', user: { id: '7', role: 'admin', status: 'active' } },
    { authenticated: true, csrfToken: 'session-one', user: { id: '7', role: 'user', status: 'active' } },
  ])('cannot repopulate private settings after logout or identity change', session => {
    const client = new QueryClient(); if (session) client.setQueryData(['session'], session);
    expect(applySavedPlaygroundSettings(client, saved, owner)).toBe(false);
    expect(client.getQueryData(['session'])).toEqual(session);
    expect(client.getQueryData(playgroundAdminSettingsKey(owner.userId))).toBeUndefined(); client.clear();
  });
});
