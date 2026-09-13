import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ApiKey, Group, Paginated } from '@kineticrouter/portal-contract';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiKeysPage, KeyEditor } from './ApiKeysPage';

const auth = vi.hoisted(() => ({ keyWrites: true }));
vi.mock('../lib/auth', () => ({ useAuth: () => ({ capabilities: { keyWrites: auth.keyWrites } }) }));

const groups: Group[] = [{ id: '7', name: 'OpenAI' }, { id: '12', name: 'Anthropic' }];
const existing: ApiKey = {
  id: '1', name: 'Production', key: 'synthetic-test-key', maskedKey: 'synthetic-***', status: 'active',
  groupId: '42', currentConcurrency: 0, ipWhitelist: [], ipBlacklist: [],
};

function renderWithQueries(content: ReactNode, client = new QueryClient()) {
  try { return renderToStaticMarkup(<QueryClientProvider client={client}>{content}</QueryClientProvider>); }
  finally { client.clear(); }
}
function renderEditor(key?: ApiKey, available = groups, canWrite = true) {
  return renderWithQueries(<KeyEditor open existing={key} groups={available} canWrite={canWrite} onClose={() => {}} onSaved={() => {}} />);
}
function renderPage(available?: Group[], items: ApiKey[] = []) {
  const client = new QueryClient();
  if (available !== undefined) client.setQueryData(['groups'], available);
  client.setQueryData<Paginated<ApiKey>>(['api-keys', 1, '', ''], { items, page: 1, pageSize: 20, pages: items.length ? 1 : 0, total: items.length });
  return renderWithQueries(<ApiKeysPage />, client);
}
function saveButton(html: string) { return html.match(/<button\b[^>]*>(?:Create key|Save changes)<\/button>/)?.[0] ?? ''; }
function createActions(html: string) {
  return (html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? []).filter(button => /Create API key|Create your first key/.test(button));
}

beforeEach(() => { auth.keyWrites = true; });

describe('API key group form', () => {
  it.each([undefined, { ...existing, groupId: null }])('requires a real selection for a new or unassigned key', key => {
    const html = renderEditor(key);
    expect(html).toMatch(/<select\b[^>]*required=""/);
    expect(html).toMatch(/<option(?=[^>]*value="")(?=[^>]*disabled="")(?=[^>]*selected="")[^>]*>Select a group<\/option>/);
    expect(html).toContain('value="7"');
    expect(html).not.toContain('Default (automatic)');
    expect(saveButton(html)).toContain('disabled=""');
  });

  it('keeps an existing group selected when it is absent from available groups', () => {
    const html = renderEditor(existing);
    expect(html).toMatch(/<option(?=[^>]*value="42")(?=[^>]*selected="")[^>]*>Group #42 \(current group\)<\/option>/);
    expect(html).toContain('You can keep the current group or select an available group.');
    expect(saveButton(html)).toBeTruthy();
    expect(saveButton(html)).not.toContain('disabled');
  });

  it('allows an assigned key to keep its group when no groups are available for new keys', () => {
    const html = renderEditor({ ...existing, group: { id: '42', name: 'Existing plan' } }, []);
    expect(html).toContain('Existing plan (current group)');
    expect(saveButton(html)).not.toContain('disabled');
  });

  it('does not duplicate an existing group that remains available', () => {
    const html = renderEditor({ ...existing, groupId: '7', group: groups[0] });
    expect(html.match(/<option\b[^>]*value="7"/g)).toHaveLength(1);
    expect(html).not.toContain('(current group)');
    expect(saveButton(html)).not.toContain('disabled');
  });

  it('explains why an unassigned key cannot be saved without any available groups', () => {
    const html = renderEditor({ ...existing, groupId: null }, []);
    expect(html).toContain('No groups are available. Contact support');
    expect(saveButton(html)).toContain('disabled=""');
  });

  it('blocks saving when writes or group loading guards are not satisfied', () => {
    expect(saveButton(renderEditor(existing, groups, false))).toContain('disabled=""');
  });
});

describe('API key group availability and table', () => {
  it('explains an empty available-group list and disables both creation actions', () => {
    const html = renderPage([]);
    expect(html).toContain('No groups available');
    expect(html).toContain('Contact support to get access to a group before creating an API key.');
    const actions = createActions(html);
    expect(actions).toHaveLength(2);
    for (const action of actions) expect(action).toMatch(/^<button\b[^>]*disabled=""/);
  });

  it('keeps creation guarded while groups load or key writes are unavailable', () => {
    expect(createActions(renderPage())).toHaveLength(0);
    auth.keyWrites = false;
    const html = renderPage(groups);
    expect(html).toContain('Read-only mode');
    expect(createActions(html)).toHaveLength(0);
  });

  it('distinguishes unassigned keys from missing group details and actual group names', () => {
    const html = renderPage(groups, [
      { ...existing, id: '1', groupId: null },
      { ...existing, id: '2' },
      { ...existing, id: '3', groupId: '7', group: groups[0] },
    ]);
    expect(html).toContain('<td>No group assigned</td>');
    expect(html).toContain('<td>Group #42</td>');
    expect(html).toContain('<td>OpenAI</td>');
    expect(html).not.toContain('<td>Default</td>');
  });
});
