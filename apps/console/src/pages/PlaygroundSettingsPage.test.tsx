// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PlaygroundModel, PlaygroundSettings, PlaygroundSettingsUpdate } from '@kineticrouter/portal-contract';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { portalApi } from '../lib/api';
import { playgroundAdminSettingsKey } from '../lib/playground-admin';
import { PlaygroundSettingsPage } from './PlaygroundSettingsPage';

const keyState = vi.hoisted(() => ({
  items: [{ id: '11', name: 'First key' }, { id: '12', name: 'Second key' }, { id: '13', name: 'Empty key' }, { id: '14', name: 'Unavailable catalog' }],
  hasNextPage: false,
  fetchNextPage: vi.fn(),
}));
vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: { id: '7', role: 'admin', status: 'active' }, playgroundEnabled: true }) }));
vi.mock('../lib/playground-queries', () => ({ usePlaygroundKeys: () => ({
  data: { pages: [{ items: keyState.items }] }, isSuccess: true, error: null,
  hasNextPage: keyState.hasNextPage, isFetchingNextPage: false, fetchNextPage: keyState.fetchNextPage, refetch: vi.fn(),
}) }));
vi.mock('../lib/api', async importOriginal => ({ ...await importOriginal<typeof import('../lib/api')>(), portalApi: vi.fn() }));

let root: Root;
let host: HTMLDivElement;
let client: QueryClient;
let persisted: PlaygroundSettings;
let catalogs: Map<string, PlaygroundModel[] | Error | Promise<PlaygroundModel[]>>;
const modelRows = (...ids: string[]) => ids.map(id => ({ id, name: id }));
const writes = () => vi.mocked(portalApi).mock.calls.filter(([, init]) => init?.method === 'PUT');
const rowIds = () => [...host.querySelectorAll('.playground-admin-model span')].map(span => span.textContent);
const row = (id: string) => [...host.querySelectorAll<HTMLElement>('.playground-admin-row')].find(item => item.querySelector('.playground-admin-model span')?.textContent === id)!;
const checkbox = (id: string) => row(id).querySelector<HTMLInputElement>('input[type="checkbox"]')!;
function button(label: string, scope: ParentNode = host) {
  const found = [...scope.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.trim() === label);
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}
const tab = (view: 'key' | 'saved') => host.querySelectorAll<HTMLButtonElement>('[role="tab"]')[view === 'key' ? 0 : 1]!;
const search = () => host.querySelector<HTMLInputElement>('input[aria-label="Search models"]')!;
const dialog = () => host.querySelector<HTMLElement>('[role="dialog"]');
const nameField = () => dialog()!.querySelector<HTMLInputElement>('input:not([type="month"])')!;
const cutoffField = () => dialog()!.querySelector<HTMLInputElement>('input[type="month"]')!;
async function flush() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); }); }
async function render() {
  await act(async () => root.render(<MemoryRouter><QueryClientProvider client={client}><PlaygroundSettingsPage /></QueryClientProvider></MemoryRouter>));
  await flush();
}
async function click(element: HTMLElement) { await act(async () => { element.focus(); element.click(); }); await flush(); }
async function input(element: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await flush();
}
async function chooseKey(id: string) {
  await act(async () => {
    const select = host.querySelector('select')!;
    select.value = id; select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await flush();
}
async function configure(id: string) {
  await click(row(id).querySelector<HTMLButtonElement>('button')!);
  await act(async () => { await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); });
}
async function key(element: HTMLElement, value: string, shiftKey = false) {
  await act(async () => { element.dispatchEvent(new KeyboardEvent('keydown', { key: value, shiftKey, bubbles: true, cancelable: true })); });
  await flush();
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  keyState.items = [{ id: '11', name: 'First key' }, { id: '12', name: 'Second key' }, { id: '13', name: 'Empty key' }, { id: '14', name: 'Unavailable catalog' }];
  keyState.hasNextPage = false; keyState.fetchNextPage.mockReset();
  persisted = { revision: 3, playgroundEnabled: true, enabledModelIds: ['legacy', 'shared'], modelIdentities: [
    { modelId: 'archived', name: 'Archived identity' }, { modelId: 'shared', name: 'Existing identity', knowledgeCutoff: '2025-06' },
  ] };
  catalogs = new Map([['11', modelRows('shared', 'alpha')], ['12', modelRows('shared', 'beta')], ['13', []]]);
  catalogs.set('14', new Error('Catalog failed'));
  vi.mocked(portalApi).mockReset().mockImplementation(async (path, init) => {
    if (path === '/admin/playground/settings') {
      if (init?.method === 'PUT') {
        const update = JSON.parse(String(init.body)) as PlaygroundSettingsUpdate;
        if (update.revision !== persisted.revision) throw new Error('Settings changed. Reload saved settings.');
        persisted = { ...persisted, ...update, modelIdentities: update.modelIdentities ?? persisted.modelIdentities, revision: persisted.revision + 1 };
      }
      return structuredClone(persisted);
    }
    if (path.startsWith('/admin/playground/models?')) {
      const id = new URLSearchParams(path.split('?')[1]).get('apiKeyId')!;
      const catalog = catalogs.get(id);
      if (catalog instanceof Error) throw catalog;
      return await catalog;
    }
    throw new Error(`Unexpected API request: ${path}`);
  });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  client.setQueryData(playgroundAdminSettingsKey('7'), structuredClone(persisted));
  client.setQueryData(['session'], { authenticated: true, csrfToken: 'session-one', user: { id: '7', role: 'admin', status: 'active' } });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); client.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('admin model settings', () => {
  it('starts with an explicit key choice and keeps saved models in their own tab', async () => {
    await render();
    expect(rowIds()).toEqual([]);
    expect(host.textContent).toContain('Choose a source key to see its models.');
    expect(portalApi).not.toHaveBeenCalled();
    await chooseKey('11');
    expect(rowIds()).toEqual(['alpha', 'shared']);
    expect(host.textContent).toContain('2 available for this key');
    expect(host.textContent).toContain('2 enabled overall');
    expect(host.querySelector('.playground-identity-fields')).toBeNull();
    await click(tab('saved'));
    expect(rowIds()).toEqual(['archived', 'legacy', 'shared']);
    expect(checkbox('archived').checked).toBe(false);
    expect(host.querySelector('select')).toBeNull();
    expect(host.querySelector<HTMLDetailsElement>('.playground-admin-advanced')?.open).toBe(false);
  });

  it('preserves selections and applied identities across keys and submits one combined save', async () => {
    await render(); await chooseKey('11'); await click(checkbox('alpha')); await configure('alpha');
    await input(nameField(), 'Alpha identity'); await click(button('Apply'));
    expect(dialog()).toBeNull(); expect(writes()).toHaveLength(0);
    expect(document.activeElement).toBe(row('alpha').querySelector('button'));
    await chooseKey('12');
    expect(rowIds()).toEqual(['beta', 'shared']); expect(checkbox('shared').checked).toBe(true);
    await click(tab('saved'));
    expect(rowIds()).toEqual(['alpha', 'archived', 'legacy', 'shared']);
    expect(row('alpha').textContent).toContain('Unsaved changes');
    await click(tab('key')); await chooseKey('11');
    expect(checkbox('alpha').checked).toBe(true);
    await configure('alpha'); expect(nameField().value).toBe('Alpha identity'); await click(button('Cancel'));
    await click(button('Save settings'));
    expect(writes()).toHaveLength(1);
    expect(JSON.parse(String(writes()[0]![1]!.body))).toEqual({ revision: 3, playgroundEnabled: true,
      enabledModelIds: ['alpha', 'legacy', 'shared'], modelIdentities: [
        { modelId: 'alpha', name: 'Alpha identity' }, { modelId: 'archived', name: 'Archived identity' },
        { modelId: 'shared', name: 'Existing identity', knowledgeCutoff: '2025-06' },
      ],
    });
    expect(button('Save settings').disabled).toBe(true);
    expect(row('alpha').textContent).not.toContain('Unsaved changes');
  });

  it('ignores late catalogs and keeps the current key isolated through empty and failed discovery', async () => {
    let finish!: (models: PlaygroundModel[]) => void;
    catalogs.set('11', new Promise(resolve => { finish = resolve; }));
    await render(); await chooseKey('11');
    expect(rowIds()).toEqual([]); expect(host.textContent).toContain('Loading model catalog');
    await chooseKey('12'); await click(checkbox('beta'));
    await act(async () => finish(modelRows('alpha', 'shared'))); await flush();
    expect(rowIds()).toEqual(['beta', 'shared']);
    await chooseKey('13'); expect(rowIds()).toEqual([]);
    expect(host.textContent).toContain('No models are available through this key.');
    await chooseKey('14'); expect(rowIds()).toEqual([]); expect(host.textContent).toContain('Catalog failed');
    catalogs.set('14', modelRows('recovered')); await click(button('Try again'));
    expect(rowIds()).toEqual(['recovered']); expect(writes()).toHaveLength(0);
    await click(tab('saved')); expect(checkbox('beta').checked).toBe(true);
  });

  it('resets search on key and tab changes and retains deselected rows until saved', async () => {
    await render(); await chooseKey('11'); await input(search(), ' ALPHA ');
    expect(rowIds()).toEqual(['alpha']);
    await chooseKey('12'); expect(search().value).toBe(''); expect(rowIds()).toEqual(['beta', 'shared']);
    await input(search(), 'missing'); expect(rowIds()).toEqual([]);
    await click(tab('saved')); expect(search().value).toBe('');
    await click(checkbox('legacy')); expect(rowIds()).toContain('legacy'); expect(checkbox('legacy').checked).toBe(false);
    await input(search(), 'archived'); expect(rowIds()).toEqual(['archived']);
    await click(tab('key')); expect(search().value).toBe(''); expect(rowIds()).toEqual(['beta', 'shared']);
    await click(tab('saved')); await click(button('Save settings'));
    expect(rowIds()).toEqual(['archived', 'shared']);
  });

  it('supports saved identities and manual model entry without an active key', async () => {
    keyState.items = []; await render();
    expect(host.textContent).toContain('No active keys found.');
    await click(tab('saved')); await configure('archived');
    expect(nameField().value).toBe('Archived identity');
    await input(nameField(), 'Updated archived identity'); await click(button('Apply'));
    const advanced = host.querySelector<HTMLDetailsElement>('.playground-admin-advanced')!;
    await click(advanced.querySelector('summary')!);
    await input(host.querySelector<HTMLInputElement>('input[placeholder="provider/model-id"]')!, 'manual/model');
    await click(button('Add'));
    expect(checkbox('manual/model').checked).toBe(true);
    await click(tab('key')); expect(rowIds()).toEqual([]);
    await click(tab('saved')); await click(button('Save settings'));
    expect(persisted.enabledModelIds).toContain('manual/model');
    expect(persisted.enabledModelIds).not.toContain('archived');
    expect(persisted.modelIdentities).toContainEqual({ modelId: 'archived', name: 'Updated archived identity' });
  });

  it('discards dialog edits on Cancel, Escape, and backdrop dismissal and restores focus', async () => {
    await render(); await click(tab('saved'));
    for (const dismissal of ['cancel', 'escape', 'backdrop']) {
      await configure('shared'); expect(document.activeElement).toBe(nameField());
      expect(dialog()!.closest('form')).toBeNull();
      await input(nameField(), 'Discard this');
      if (dismissal === 'cancel') await click(button('Cancel'));
      else if (dismissal === 'escape') await key(nameField(), 'Escape');
      else await click(host.querySelector<HTMLButtonElement>('.modal-backdrop')!);
      expect(dialog()).toBeNull(); expect(document.activeElement).toBe(row('shared').querySelector('button'));
      expect(button('Save settings').disabled).toBe(true);
    }
    await configure('shared'); expect(nameField().value).toBe('Existing identity'); expect(cutoffField().value).toBe('2025-06');
    expect(writes()).toHaveLength(0);
  });

  it('stages clearing identity independently from model enablement', async () => {
    await render(); await click(tab('saved')); await configure('archived');
    await click(button('Clear identity')); await click(button('Apply'));
    expect(rowIds()).toContain('archived'); expect(checkbox('archived').checked).toBe(false);
    expect(row('archived').textContent).toContain('Unsaved changes'); expect(writes()).toHaveLength(0);
    await click(button('Save settings'));
    expect(rowIds()).not.toContain('archived'); expect(persisted.enabledModelIds).toEqual(['legacy', 'shared']);
    expect(persisted.modelIdentities.map(identity => identity.modelId)).toEqual(['shared']);
  });

  it('blocks an incomplete native cutoff until corrected or explicitly cleared', async () => {
    await render(); await click(tab('saved')); await configure('shared');
    const field = cutoffField();
    Object.defineProperty(field, 'validity', { configurable: true, value: { badInput: true, valid: false } });
    await input(field, ''); await click(button('Apply'));
    expect(dialog()).not.toBeNull(); expect(dialog()!.textContent).toContain('enter a complete month and year');
    expect(document.activeElement).toBe(field); expect(writes()).toHaveLength(0);
    Reflect.deleteProperty(field, 'validity');
    await click(button('Clear identity')); expect(field.value).toBe(''); await click(button('Apply'));
    await configure('shared'); expect(nameField().value).toBe(''); expect(cutoffField().value).toBe('');
    await click(button('Cancel')); await click(button('Save settings'));
    expect(persisted.modelIdentities.map(identity => identity.modelId)).toEqual(['archived']);
  });

  it('keeps validation errors inside the dialog without staging invalid identity names', async () => {
    await render(); await chooseKey('11'); await configure('alpha');
    await input(nameField(), 'Invalid\u2028name'); await click(button('Apply'));
    expect(dialog()!.textContent).toContain('Use a single-line identity name.'); expect(document.activeElement).toBe(nameField());
    await click(button('Cancel')); expect(button('Save settings').disabled).toBe(true); expect(writes()).toHaveLength(0);
  });

  it('supports keyboard tabs and traps dialog focus', async () => {
    await render(); await key(tab('key'), 'ArrowRight');
    expect(tab('saved').getAttribute('aria-selected')).toBe('true'); expect(document.activeElement).toBe(tab('saved'));
    await key(tab('saved'), 'Home'); expect(tab('key').getAttribute('aria-selected')).toBe('true');
    await key(tab('key'), 'End'); await configure('shared');
    const close = dialog()!.querySelector<HTMLButtonElement>('.icon-button')!;
    const apply = button('Apply'); await act(async () => apply.focus()); await key(apply, 'Tab');
    expect(document.activeElement).toBe(close); await key(close, 'Tab', true); expect(document.activeElement).toBe(apply);
  });

  it('preserves pending changes on conflict and resets them after reloading saved settings', async () => {
    await render(); await chooseKey('11'); await click(checkbox('alpha'));
    persisted = { ...persisted, revision: 4, enabledModelIds: ['beta'] };
    await click(button('Save settings')); expect(button('Save settings').disabled).toBe(true);
    expect(checkbox('alpha').checked).toBe(true); expect(host.textContent).toContain('Reload saved settings');
    await click(tab('saved')); expect(rowIds()).toContain('alpha');
    await click(button('Reload saved'));
    expect(rowIds()).toEqual(['archived', 'beta', 'shared']); expect(checkbox('beta').checked).toBe(true);
    expect(checkbox('shared').checked).toBe(false); expect(host.querySelector('.playground-model-unsaved')).toBeNull();
  });

  it('keeps the enablement limit while leaving configuration available', async () => {
    persisted = { ...persisted, enabledModelIds: Array.from({ length: 500 }, (_, index) => `model-${index}`) };
    client.setQueryData(playgroundAdminSettingsKey('7'), structuredClone(persisted));
    await render(); await chooseKey('11');
    expect(checkbox('alpha').disabled).toBe(true);
    await configure('alpha'); await input(nameField(), 'Identity only'); await click(button('Apply'));
    await click(button('Save settings'));
    expect(persisted.enabledModelIds).toHaveLength(500);
    expect(persisted.modelIdentities).toContainEqual({ modelId: 'alpha', name: 'Identity only' });
  });

  it('hides a catalog when its key is unavailable and can recover through key pagination', async () => {
    await render(); await chooseKey('11'); await click(checkbox('alpha'));
    keyState.items = []; keyState.hasNextPage = true; await render();
    expect(rowIds()).toEqual([]); expect(host.textContent).toContain('Key unavailable. Choose another key.');
    keyState.fetchNextPage.mockImplementation(() => { keyState.items = [{ id: '11', name: 'First key' }]; keyState.hasNextPage = false; });
    await click(button('Load more keys')); await render();
    expect(rowIds()).toEqual(['alpha', 'shared']); expect(checkbox('alpha').checked).toBe(true);
    expect(keyState.fetchNextPage).toHaveBeenCalledTimes(1); expect(writes()).toHaveLength(0);
  });

  it('applies a cutoff-only edit without enabling its model', async () => {
    await render(); await click(tab('saved')); await configure('archived');
    await input(nameField(), ''); await input(cutoffField(), '2026-07'); await click(button('Apply'));
    expect(writes()).toHaveLength(0); expect(checkbox('archived').checked).toBe(false);
    await configure('archived'); expect(cutoffField().value).toBe('2026-07'); await click(button('Cancel'));
    await click(button('Save settings'));
    expect(persisted.enabledModelIds).toEqual(['legacy', 'shared']);
    expect(persisted.modelIdentities).toContainEqual({ modelId: 'archived', knowledgeCutoff: '2026-07' });
  });
});
