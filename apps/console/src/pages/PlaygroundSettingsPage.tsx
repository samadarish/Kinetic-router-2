import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { playgroundModelSchema, playgroundSettingsSchema, type PlaygroundModel, type PlaygroundSettings, type PlaygroundSettingsUpdate, type SessionView } from '@kineticrouter/portal-contract';
import { Button, ErrorState, LoadingState, PageHeader } from '../components/Ui';
import { jsonBody, portalApi, queryString } from '../lib/api';
import { usePlaygroundKeys } from '../lib/playground-queries';
import { applySavedPlaygroundSettings, isPlaygroundAdminOwner, playgroundAdminSettingsKey } from '../lib/playground-admin';
import { identityDrafts, modelIdentitiesChanged, preparePlaygroundSettings, type ModelIdentityDraft } from '../lib/playground-identity-editor';
import { useAuth } from '../lib/auth';
import './playground-settings.css';

export function PlaygroundSettingsPage() {
  const { user } = useAuth();
  const settings = useQuery({ queryKey: playgroundAdminSettingsKey(user?.id), queryFn: async ({ signal }) => playgroundSettingsSchema.parse(await portalApi<unknown>('/admin/playground/settings', { signal })), staleTime: Infinity, refetchOnWindowFocus: false, retry: false });
  return <>
    <PageHeader title="Playground settings" description="Choose which models customers can use in Playground." />
    {settings.isLoading ? <LoadingState label="Loading playground settings" /> : settings.data ? <SettingsEditor key={user?.id} settings={settings.data} reload={async () => { const result = await settings.refetch({ throwOnError: true }); return result.data!; }} /> : <ErrorState error={settings.error} retry={() => void settings.refetch()} />}
  </>;
}

function SettingsEditor({ settings, reload }: { settings: PlaygroundSettings; reload(): Promise<PlaygroundSettings> }) {
  const queryClient = useQueryClient();
  const { user, playgroundEnabled: available } = useAuth();
  const keys = usePlaygroundKeys(true);
  const keyOptions = keys.data?.pages.flatMap(page => page.items) ?? [];
  const [sourceKey, setSourceKey] = useState('');
  const [playgroundEnabled, setPlaygroundEnabled] = useState(settings.playgroundEnabled);
  const [enabled, setEnabled] = useState(() => new Set(settings.enabledModelIds));
  const [identities, setIdentities] = useState(() => identityDrafts(settings.modelIdentities));
  const [candidates, setCandidates] = useState(() => new Set([...settings.enabledModelIds, ...settings.modelIdentities.map(identity => identity.modelId)]));
  const [search, setSearch] = useState('');
  const [manual, setManual] = useState('');
  const [inputError, setInputError] = useState('');
  const [identityError, setIdentityError] = useState('');
  const [identityReload, setIdentityReload] = useState(0);
  const [reloading, setReloading] = useState(false);
  const [reloadError, setReloadError] = useState('');
  const sourceReady = keyOptions.some(key => key.id === sourceKey);
  const models = useQuery({ queryKey: ['admin', 'playground', 'models', user?.id, sourceKey], queryFn: ({ signal }) => portalApi<PlaygroundModel[]>(`/admin/playground/models${queryString({ apiKeyId: sourceKey })}`, { signal }), enabled: sourceReady, staleTime: 30_000, refetchOnWindowFocus: false, retry: false });
  useEffect(() => {
    if (models.data) setCandidates(current => new Set([...current, ...models.data.map(model => model.id)]));
  }, [models.data]);
  const visible = useMemo(() => [...candidates].filter(id => id.toLowerCase().includes(search.trim().toLowerCase())).sort((a, b) => a.localeCompare(b)), [candidates, search]);
  const changed = playgroundEnabled !== settings.playgroundEnabled || enabled.size !== settings.enabledModelIds.length || settings.enabledModelIds.some(id => !enabled.has(id)) || modelIdentitiesChanged(settings.modelIdentities, identities);
  const save = useMutation({
    mutationFn: async (input: PlaygroundSettingsUpdate) => {
      const session = queryClient.getQueryData<SessionView>(['session']);
      const result = playgroundSettingsSchema.parse(await portalApi<unknown>('/admin/playground/settings', { method: 'PUT', ...jsonBody(input) }));
      return { result, owner: { userId: session?.user?.id, csrfToken: session?.csrfToken } };
    },
    retry: false,
    onSuccess: ({ result, owner }) => { if (applySavedPlaygroundSettings(queryClient, result, owner)) setIdentities(identityDrafts(result.modelIdentities)); },
  });
  const disabled = save.isPending || reloading;
  function addModel() {
    const result = playgroundModelSchema.safeParse(manual);
    if (!result.success) { setInputError('Enter an exact model ID, up to 200 characters, without control characters.'); return; }
    if (!enabled.has(result.data) && enabled.size >= 500) { setInputError('You can enable up to 500 models.'); return; }
    setCandidates(current => new Set([...current, result.data]));
    setEnabled(current => new Set([...current, result.data]));
    setManual(''); setInputError(''); setSearch('');
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!changed || disabled || save.isError) return;
    try { const input = preparePlaygroundSettings(settings, enabled, identities, playgroundEnabled); setIdentityError(''); save.mutate(input); }
    catch (error) { setIdentityError(error instanceof Error ? error.message : 'Check the identity fields before saving.'); }
  }
  function editIdentity(id: string, patch: Partial<ModelIdentityDraft>) {
    setIdentities(current => new Map(current).set(id, { name: '', knowledgeCutoff: '', ...current.get(id), ...patch }));
    setIdentityError('');
  }
  async function reloadSaved() {
    setReloading(true); setReloadError('');
    const session = queryClient.getQueryData<SessionView>(['session']);
    const owner = { userId: session?.user?.id, csrfToken: session?.csrfToken };
    try {
      const saved = await reload();
      if (!isPlaygroundAdminOwner(queryClient, owner)) throw new Error('Your session changed. Reopen Playground settings to load the current account.');
      save.reset();
      setEnabled(new Set(saved.enabledModelIds));
      setPlaygroundEnabled(saved.playgroundEnabled);
      setIdentities(identityDrafts(saved.modelIdentities)); setIdentityError('');
      setIdentityReload(current => current + 1);
      setCandidates(current => new Set([...current, ...saved.enabledModelIds, ...saved.modelIdentities.map(identity => identity.modelId)]));
    }
    catch (error) { setReloadError(error instanceof Error ? error.message : 'Could not reload settings. Your selections are preserved.'); }
    finally { setReloading(false); }
  }

  return <form className="playground-admin" onSubmit={submit} onInvalid={event => {
    event.preventDefault();
    const field = event.target as HTMLInputElement;
    const details = field.closest('details');
    if (details) details.open = true;
    setIdentityError(`${field.getAttribute('aria-label') ?? 'Identity'}: enter a complete, valid month and year or clear the field.`);
    field.focus();
  }}>
    <div className="playground-admin-intro"><p>Enabled models are available only to customers whose API keys can already access them. This setting applies to Playground.</p>{available && <Link to="/playground">Open Playground ↗</Link>}</div>
    <div className="playground-global-setting">
      <label className="playground-global-toggle"><input type="checkbox" role="switch" checked={playgroundEnabled} disabled={disabled} onChange={event => setPlaygroundEnabled(event.target.checked)} /><span>Enable Playground</span></label>
      <p>Show Playground and allow new chats for all users. Turning it off keeps saved chats and model settings.</p>
    </div>
    <div className="playground-admin-source">
      <label><span>Discover models from your API key</span><select value={sourceKey} disabled={disabled || !keyOptions.length} onChange={event => setSourceKey(event.target.value)}><option value="">Choose a source key</option>{sourceKey && !sourceReady && <option value={sourceKey} disabled>Key unavailable</option>}{keyOptions.map(key => <option value={key.id} key={key.id}>{key.name}</option>)}</select></label>
      {keys.hasNextPage && <Button variant="secondary" type="button" disabled={keys.isFetchingNextPage || disabled} onClick={() => void keys.fetchNextPage()}>Load more keys</Button>}
      {keys.error && <ErrorState error={keys.error} retry={() => void keys.refetch()} />}
      {keys.isSuccess && !keyOptions.length && <p>No active keys found. You can still enter model IDs below.</p>}
      {sourceReady && <p>Full catalog for {keyOptions.find(key => key.id === sourceKey)?.name}. Image and review models are included; this playground supports text conversations.</p>}
      {models.isFetching && <p role="status">Loading model catalog…</p>}
      {models.error && <ErrorState error={models.error} retry={() => void models.refetch()} />}
    </div>
    <div className="playground-admin-toolbar"><label className="playground-admin-search"><Search size={16} /><span className="sr-only">Search models</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search model IDs" /></label><strong>{enabled.size} enabled</strong></div>
    <p className="playground-identity-help">Optional identity details guide Playground replies when asked. They do not change the underlying model or its training. Instruction tokens count toward usage.</p>
    <div className="playground-admin-models" aria-label="Available model choices">
      {visible.length ? visible.map(id => {
        const identity = identities.get(id);
        return <div key={id} className="playground-admin-row">
          <label className="playground-admin-model"><input type="checkbox" checked={enabled.has(id)} disabled={disabled || (!enabled.has(id) && enabled.size >= 500)} onChange={event => setEnabled(current => { const next = new Set(current); if (event.target.checked) next.add(id); else next.delete(id); return next; })} /><span>{id}</span>{settings.enabledModelIds.includes(id) && <small>Saved</small>}</label>
          <details className="playground-identity-editor" key={`${id}-${identityReload}`}>
            <summary aria-label={`Identity for ${id}`}>Identity <span>{identity?.invalidCutoff ? 'Check cutoff' : identity?.name.trim() || identity?.knowledgeCutoff ? 'Configured' : 'Not set'}</span></summary>
            <div className="playground-identity-fields">
              <label><span>Identity name</span><input aria-label={`Identity name for ${id}`} value={identity?.name ?? ''} maxLength={80} disabled={disabled} autoComplete="off" placeholder="Optional name" onChange={event => editIdentity(id, { name: event.target.value })} /></label>
              <label><span>Knowledge cutoff</span><input aria-label={`Knowledge cutoff for ${id}`} aria-invalid={identity?.invalidCutoff || undefined} type="month" min="0001-01" max="9999-12" value={identity?.knowledgeCutoff ?? ''} disabled={disabled} placeholder="YYYY-MM" onInput={event => editIdentity(id, { knowledgeCutoff: event.currentTarget.value, invalidCutoff: event.currentTarget.validity.badInput })} onBlur={event => editIdentity(id, { knowledgeCutoff: event.currentTarget.value, invalidCutoff: event.currentTarget.validity.badInput })} /></label>
              <button type="button" className="playground-identity-clear" disabled={disabled} onClick={event => {
                // Partial native month input has value="" but can remain invalid.
                // Reset its segments as well as the controlled draft on clear.
                const month = event.currentTarget.parentElement?.querySelector('input[type="month"]');
                if (month instanceof HTMLInputElement) month.value = '';
                editIdentity(id, { name: '', knowledgeCutoff: '', invalidCutoff: false });
              }}>Clear identity</button>
            </div>
          </details>
        </div>;
      }) : <p>{search ? 'No matching models.' : 'Choose a source key or add a model ID below.'}</p>}
    </div>
    <div className="playground-admin-manual"><label><span>Add an exact model ID</span><input value={manual} maxLength={200} disabled={disabled} onChange={event => setManual(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); addModel(); } }} placeholder="provider/model-id" /></label><Button variant="secondary" type="button" disabled={disabled || !manual.trim()} onClick={addModel}><Plus size={15} /> Add</Button></div>
    {inputError && <p className="form-error" role="alert">{inputError}</p>}
    {identityError && <p className="form-error" role="alert">{identityError}</p>}
    {reloadError && <p className="form-error" role="alert">{reloadError} Your selections are preserved.</p>}
    {save.error && <p className="form-error" role="alert">{save.error.message} Reload saved settings before trying again.</p>}
    {save.isSuccess && !changed && <p role="status">Settings saved.</p>}
    <div className="playground-admin-footer"><div><strong>{enabled.size ? `${enabled.size} models selected` : 'No models enabled'}</strong><p>{enabled.size ? 'Customers will see models available to their selected key.' : 'Customers cannot send Playground requests until you enable models.'}</p></div><div><Button variant="secondary" type="button" disabled={disabled} onClick={() => void reloadSaved()}>{reloading ? 'Reloading…' : 'Reload saved'}</Button><Button type="submit" disabled={!changed || disabled || save.isError}>{save.isPending ? 'Saving…' : 'Save settings'}</Button></div></div>
  </form>;
}
