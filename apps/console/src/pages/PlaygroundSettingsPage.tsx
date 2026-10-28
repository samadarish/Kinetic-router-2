import { useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { playgroundModelSchema, playgroundSettingsSchema, type PlaygroundModel, type PlaygroundSettings, type PlaygroundSettingsUpdate, type SessionView } from '@kineticrouter/portal-contract';
import { Button, ErrorState, LoadingState, PageHeader } from '../components/Ui';
import { Modal } from '../components/Modal';
import { jsonBody, portalApi, queryString } from '../lib/api';
import { usePlaygroundKeys } from '../lib/playground-queries';
import { applySavedPlaygroundSettings, isPlaygroundAdminOwner, playgroundAdminSettingsKey } from '../lib/playground-admin';
import { identityDrafts, modelIdentitiesChanged, preparePlaygroundSettings, type ModelIdentityDraft } from '../lib/playground-identity-editor';
import { useAuth } from '../lib/auth';
import './playground-settings.css';

export function PlaygroundSettingsPage() {
  const { user, playgroundEnabled: available } = useAuth();
  const settings = useQuery({ queryKey: playgroundAdminSettingsKey(user?.id), queryFn: async ({ signal }) => playgroundSettingsSchema.parse(await portalApi<unknown>('/admin/playground/settings', { signal })), staleTime: Infinity, refetchOnWindowFocus: false, retry: false });
  return <>
    <PageHeader title="Model settings" description="Choose the shared models for Playground and API key groups." action={available && <Link to="/playground" className="button button-secondary">Open Playground ↗</Link>} />
    {settings.isLoading ? <LoadingState label="Loading playground settings" /> : settings.data ? <SettingsEditor key={user?.id} settings={settings.data} reload={async () => { const result = await settings.refetch({ throwOnError: true }); return result.data!; }} /> : <ErrorState error={settings.error} retry={() => void settings.refetch()} />}
  </>;
}

function SettingsEditor({ settings, reload }: { settings: PlaygroundSettings; reload(): Promise<PlaygroundSettings> }) {
  const tabsId = useId();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const keys = usePlaygroundKeys(true);
  const keyOptions = keys.data?.pages.flatMap(page => page.items) ?? [];
  const [view, setView] = useState<'key' | 'saved'>('key');
  const [sourceKey, setSourceKey] = useState('');
  const [playgroundEnabled, setPlaygroundEnabled] = useState(settings.playgroundEnabled);
  const [enabled, setEnabled] = useState(() => new Set(settings.enabledModelIds));
  const [identities, setIdentities] = useState(() => identityDrafts(settings.modelIdentities));
  const [editedModels, setEditedModels] = useState(() => new Set<string>());
  const [configuring, setConfiguring] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [manual, setManual] = useState('');
  const [inputError, setInputError] = useState('');
  const [identityError, setIdentityError] = useState('');
  const [reloading, setReloading] = useState(false);
  const [reloadError, setReloadError] = useState('');
  const sourceReady = keyOptions.some(key => key.id === sourceKey);
  const models = useQuery({ queryKey: ['admin', 'playground', 'models', user?.id, sourceKey], queryFn: ({ signal }) => portalApi<PlaygroundModel[]>(`/admin/playground/models${queryString({ apiKeyId: sourceKey })}`, { signal }), enabled: sourceReady && view === 'key', staleTime: 30_000, refetchOnWindowFocus: false, retry: false });
  const savedEnabled = useMemo(() => new Set(settings.enabledModelIds), [settings.enabledModelIds]);
  const savedIdentities = useMemo(() => identityDrafts(settings.modelIdentities), [settings.modelIdentities]);
  const savedModels = useMemo(() => new Set([
    ...settings.enabledModelIds,
    ...settings.modelIdentities.map(identity => identity.modelId),
    ...enabled,
    ...[...identities].filter(([, identity]) => identity.name.trim() || identity.knowledgeCutoff).map(([id]) => id),
    ...editedModels,
  ]), [settings.enabledModelIds, settings.modelIdentities, enabled, identities, editedModels]);
  const catalog = sourceReady && models.isSuccess ? models.data : [];
  const visible = (view === 'saved' ? [...savedModels] : catalog.map(model => model.id))
    .filter(id => id.toLowerCase().includes(search.trim().toLowerCase())).sort((a, b) => a.localeCompare(b));
  const changed = playgroundEnabled !== settings.playgroundEnabled || enabled.size !== settings.enabledModelIds.length || settings.enabledModelIds.some(id => !enabled.has(id)) || modelIdentitiesChanged(settings.modelIdentities, identities);
  const save = useMutation({
    mutationFn: async (input: PlaygroundSettingsUpdate) => {
      const session = queryClient.getQueryData<SessionView>(['session']);
      const result = playgroundSettingsSchema.parse(await portalApi<unknown>('/admin/playground/settings', { method: 'PUT', ...jsonBody(input) }));
      return { result, owner: { userId: session?.user?.id, csrfToken: session?.csrfToken } };
    },
    retry: false,
    onSuccess: ({ result, owner }) => {
      if (!applySavedPlaygroundSettings(queryClient, result, owner)) return;
      setEnabled(new Set(result.enabledModelIds));
      setIdentities(identityDrafts(result.modelIdentities));
      setPlaygroundEnabled(result.playgroundEnabled);
      setEditedModels(new Set());
    },
  });
  const disabled = save.isPending || reloading;
  function selectView(next: 'key' | 'saved') { setView(next); setSearch(''); }
  function tabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === 'ArrowRight' || event.key === 'ArrowLeft' ? (index + 1) % 2 : event.key === 'Home' ? 0 : event.key === 'End' ? 1 : -1;
    if (next < 0 || disabled) return;
    event.preventDefault();
    selectView(next === 0 ? 'key' : 'saved');
    document.getElementById(`${tabsId}-tab-${next === 0 ? 'key' : 'saved'}`)?.focus();
  }
  function toggleModel(id: string, checked: boolean) {
    setEditedModels(current => new Set([...current, id]));
    setEnabled(current => {
      const next = new Set(current);
      if (checked && next.size < 500) next.add(id);
      else if (!checked) next.delete(id);
      return next;
    });
  }
  function addModel() {
    const result = playgroundModelSchema.safeParse(manual);
    if (!result.success) { setInputError('Enter an exact model ID, up to 200 characters, without control characters.'); return; }
    if (!enabled.has(result.data) && enabled.size >= 500) { setInputError('You can enable up to 500 models.'); return; }
    setEditedModels(current => new Set([...current, result.data]));
    setEnabled(current => new Set([...current, result.data]));
    setManual(''); setInputError(''); setSearch('');
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!changed || disabled || configuring !== null || save.isError) return;
    try { const input = preparePlaygroundSettings(settings, enabled, identities, playgroundEnabled); setIdentityError(''); save.mutate(input); }
    catch (error) { setIdentityError(error instanceof Error ? error.message : 'Check the identity fields before saving.'); }
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
      setEditedModels(new Set());
    }
    catch (error) { setReloadError(error instanceof Error ? error.message : 'Could not reload settings. Your selections are preserved.'); }
    finally { setReloading(false); }
  }

  return <><form className="playground-admin" onSubmit={submit}>
    <div className="playground-global-setting">
      <label className="playground-global-toggle"><input type="checkbox" role="switch" checked={playgroundEnabled} disabled={disabled} onChange={event => setPlaygroundEnabled(event.target.checked)} /><span>Enable Playground</span></label>
      <p>Show Playground and allow new chats for all users. Turning it off keeps saved chats and model settings.</p>
    </div>
    <div className="playground-admin-tabs" role="tablist" aria-label="Model views">
      <button type="button" role="tab" id={`${tabsId}-tab-key`} aria-controls={`${tabsId}-panel-key`} aria-selected={view === 'key'} tabIndex={view === 'key' ? 0 : -1} disabled={disabled} onKeyDown={event => tabKey(event, 0)} onClick={() => selectView('key')}>Key models</button>
      <button type="button" role="tab" id={`${tabsId}-tab-saved`} aria-controls={`${tabsId}-panel-saved`} aria-selected={view === 'saved'} tabIndex={view === 'saved' ? 0 : -1} disabled={disabled} onKeyDown={event => tabKey(event, 1)} onClick={() => selectView('saved')}>Saved models <span>{savedModels.size}</span></button>
    </div>
    <div role="tabpanel" id={`${tabsId}-panel-${view}`} aria-labelledby={`${tabsId}-tab-${view}`} tabIndex={0}>
      {view === 'key' ? <div className="playground-admin-source">
        <label><span>Discover models from your API key</span><select value={sourceKey} disabled={disabled || !keyOptions.length} onChange={event => { setSourceKey(event.target.value); setSearch(''); }}><option value="">Choose a source key</option>{sourceKey && !sourceReady && <option value={sourceKey} disabled>Key unavailable</option>}{keyOptions.map(key => <option value={key.id} key={key.id}>{key.name}</option>)}</select></label>
        {keys.hasNextPage && <Button variant="secondary" type="button" disabled={keys.isFetchingNextPage || disabled} onClick={() => void keys.fetchNextPage()}>Load more keys</Button>}
        {keys.error && <><ErrorState error={keys.error} /><Button variant="secondary" type="button" disabled={disabled} onClick={() => void keys.refetch()}>Try again</Button></>}
        {keys.isSuccess && !keyOptions.length && <p>No active keys found. Use Saved models to manage your configuration.</p>}
        {sourceReady && <p>Image and review models are included; Playground supports text conversations.</p>}
        {sourceReady && models.isFetching && <p role="status">Loading model catalog…</p>}
        {sourceReady && models.error && <><ErrorState error={models.error} /><Button variant="secondary" type="button" disabled={disabled || models.isFetching} onClick={() => void models.refetch()}>Try again</Button></>}
      </div> : <p className="playground-saved-help">Manage enabled models and identity settings across all keys.</p>}
      <div className="playground-admin-toolbar"><label className="playground-admin-search"><Search size={16} /><span className="sr-only">Search models</span><input aria-label="Search models" value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') event.preventDefault(); }} placeholder="Search model IDs" /></label>{view === 'key' && sourceReady && models.isSuccess && <strong>{`${catalog.length} available for this key`}</strong>}</div>
      <div className="playground-admin-models" aria-label="Available model choices">
      {visible.length ? visible.map(id => {
        const identity = identities.get(id);
        const savedIdentity = savedIdentities.get(id);
        const rowChanged = savedEnabled.has(id) !== enabled.has(id) || (identity?.name.trim() ?? '') !== (savedIdentity?.name ?? '') || (identity?.knowledgeCutoff ?? '') !== (savedIdentity?.knowledgeCutoff ?? '');
        return <div key={id} className="playground-admin-row">
          <label className="playground-admin-model"><input type="checkbox" checked={enabled.has(id)} disabled={disabled || (!enabled.has(id) && enabled.size >= 500)} onChange={event => toggleModel(id, event.target.checked)} /><span translate="no">{id}</span></label>
          <div className="playground-admin-row-actions">{rowChanged ? <small className="playground-model-unsaved">Unsaved changes</small> : Boolean(identity?.name.trim() || identity?.knowledgeCutoff) && <small>Configured</small>}<Button variant="ghost" type="button" aria-label={`Configure ${id}`} disabled={disabled} onClick={() => setConfiguring(id)}>Configure</Button></div>
        </div>;
      }) : <p>{view === 'saved' ? (search ? 'No matching models.' : 'No saved models yet.') : !sourceReady ? (sourceKey ? 'Key unavailable. Choose another key.' : 'Choose a source key to see its models.') : models.isError ? 'Model catalog unavailable. Try again above.' : !models.isSuccess ? 'Loading model catalog…' : search ? 'No matching models.' : 'No models are available through this key.'}</p>}
      </div>
      {view === 'saved' && <details className="playground-admin-advanced"><summary>Advanced</summary><div className="playground-admin-manual"><label><span>Add an exact model ID</span><input value={manual} maxLength={200} disabled={disabled} onChange={event => setManual(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); addModel(); } }} placeholder="provider/model-id" /></label><Button variant="secondary" type="button" disabled={disabled || !manual.trim()} onClick={addModel}><Plus size={15} /> Add</Button></div>{Boolean(inputError) && <p className="form-error" role="alert">{inputError}</p>}</details>}
    </div>
    {Boolean(identityError) && <p className="form-error" role="alert">{identityError}</p>}
    {Boolean(reloadError) && <p className="form-error" role="alert">{reloadError} Your selections are preserved.</p>}
    {save.error && <p className="form-error" role="alert">{save.error.message} Reload saved settings before trying again.</p>}
    {save.isSuccess && !changed && <p role="status">Settings saved.</p>}
    <div className="playground-admin-footer"><div><strong>{enabled.size ? `${enabled.size} enabled overall` : 'No models enabled'}</strong><p>{changed ? 'Unsaved changes' : enabled.size ? 'Customers will see models available to their selected key.' : 'Customers cannot send Playground requests until you enable models.'}</p></div><div><Button variant="secondary" type="button" disabled={disabled || configuring !== null} onClick={() => void reloadSaved()}>{reloading ? 'Reloading…' : 'Reload saved'}</Button><Button type="submit" disabled={!changed || disabled || configuring !== null || save.isError}>{save.isPending ? 'Saving…' : 'Save settings'}</Button></div></div>
  </form>
    {configuring !== null && <ModelConfiguration key={configuring} modelId={configuring} identity={identities.get(configuring)} onClose={() => setConfiguring(null)} onApply={identity => {
      setIdentities(current => new Map(current).set(configuring, identity));
      setEditedModels(current => new Set([...current, configuring]));
      setIdentityError(''); setConfiguring(null);
    }} />}
  </>;
}

function ModelConfiguration({ modelId, identity, onClose, onApply }: { modelId: string; identity?: ModelIdentityDraft; onClose(): void; onApply(identity: ModelIdentityDraft): void }) {
  const formId = useId();
  const nameInput = useRef<HTMLInputElement>(null);
  const cutoffInput = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<ModelIdentityDraft>(() => ({ name: identity?.name ?? '', knowledgeCutoff: identity?.knowledgeCutoff ?? '' }));
  const [error, setError] = useState('');
  function apply(event: FormEvent) {
    event.preventDefault();
    const next = { ...draft, invalidCutoff: cutoffInput.current?.validity.badInput || !cutoffInput.current?.validity.valid };
    try {
      preparePlaygroundSettings({ revision: 0, playgroundEnabled: true, enabledModelIds: [], modelIdentities: [] }, new Set(), new Map([[modelId, next]]));
      onApply({ name: draft.name.trim(), knowledgeCutoff: draft.knowledgeCutoff.trim() });
    } catch (failure) {
      setDraft(next);
      setError(failure instanceof Error ? failure.message : 'Check the identity fields before saving.');
      (next.invalidCutoff ? cutoffInput : nameInput).current?.focus();
    }
  }
  return <div className="playground-model-configuration"><Modal open title="Configure model" description={modelId} initialFocusRef={nameInput} onClose={onClose} footer={<><Button variant="secondary" type="button" onClick={onClose}>Cancel</Button><Button type="submit" form={formId}>Apply</Button></>}>
    <form id={formId} className="playground-identity-form" onSubmit={apply} noValidate>
      <p className="playground-identity-help">Optional identity details guide Playground replies when asked. They do not change the underlying model or its training. Instruction tokens count toward usage.</p>
      <div className="playground-identity-fields">
        <label><span>Identity name</span><input ref={nameInput} aria-label={`Identity name for ${modelId}`} value={draft.name} maxLength={80} autoComplete="off" placeholder="Optional name" onChange={event => { setDraft(current => ({ ...current, name: event.target.value })); setError(''); }} /></label>
        <label><span>Knowledge cutoff</span><input ref={cutoffInput} aria-label={`Knowledge cutoff for ${modelId}`} aria-invalid={draft.invalidCutoff || undefined} type="month" min="0001-01" max="9999-12" value={draft.knowledgeCutoff} placeholder="YYYY-MM" onInput={event => { const field = event.currentTarget; setDraft(current => ({ ...current, knowledgeCutoff: field.value, invalidCutoff: field.validity.badInput })); setError(''); }} onBlur={event => { const field = event.currentTarget; setDraft(current => ({ ...current, knowledgeCutoff: field.value, invalidCutoff: field.validity.badInput })); }} /></label>
      </div>
      <button type="button" className="playground-identity-clear" onClick={() => {
        // Clear the native segments too: a partially entered month has an empty value.
        if (cutoffInput.current) cutoffInput.current.value = '';
        setDraft({ name: '', knowledgeCutoff: '', invalidCutoff: false }); setError('');
      }}>Clear identity</button>
      {Boolean(error) && <p className="form-error" role="alert">{error}</p>}
      <p className="playground-identity-help">Changes are saved when you click Save settings.</p>
    </form>
  </Modal></div>;
}
