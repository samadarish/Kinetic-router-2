import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Clipboard, Eye, EyeOff, KeyRound, Plus, Search, ShieldCheck } from 'lucide-react';
import type { ApiKey, Group, Paginated } from '@kineticrouter/portal-contract';
import { ConfirmDialog, Modal } from '../components/Modal';
import { KeyQuota } from '../components/KeyQuota';
import { RowActionsMenu } from '../components/RowActionsMenu';
import { Badge, Button, Card, EmptyState, ErrorState, LoadingState, PageHeader } from '../components/Ui';
import { useAuth } from '../lib/auth';
import { jsonBody, portalApi, queryString } from '../lib/api';
import { formatDate } from '../lib/format';
import { pageAfterKeyDeletion } from '../lib/key-quota';

type KeyForm = {
  name: string; groupId: string; customKey: string; quota: string; expirationDate: string;
  rateLimit5h: string; rateLimit1d: string; rateLimit7d: string; ipWhitelist: string; ipBlacklist: string;
  useCustomKey: boolean; enableIpRestriction: boolean; enableRateLimit: boolean; enableExpiration: boolean;
};

const blankForm: KeyForm = {
  name: '', groupId: '', customKey: '', quota: '', expirationDate: '',
  rateLimit5h: '', rateLimit1d: '', rateLimit7d: '', ipWhitelist: '', ipBlacklist: '',
  useCustomKey: false, enableIpRestriction: false, enableRateLimit: false, enableExpiration: false,
};

export function ApiKeysPage() {
  const client = useQueryClient();
  const { capabilities } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [editor, setEditor] = useState<ApiKey | 'create' | null>(null);
  const [deleteKey, setDeleteKey] = useState<ApiKey | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState('');
  const [notice, setNotice] = useState('');
  const copyTimer = useRef<number | undefined>(undefined);
  const debouncedSearch = useDebouncedValue(search, 300);

  const query = useQuery({
    queryKey: ['api-keys', page, debouncedSearch, status],
    queryFn: ({ signal }) => portalApi<Paginated<ApiKey>>(`/api-keys${queryString({ page, pageSize: 20, search: debouncedSearch, status, sortBy: 'created_at', sortOrder: 'desc' })}`, { signal }),
    placeholderData: keepPreviousData,
  });
  const resultsPending = query.isPlaceholderData || search !== debouncedSearch;

  useEffect(() => () => window.clearTimeout(copyTimer.current), []);
  useEffect(() => { setRevealed(new Set()); }, [page, debouncedSearch, status]);
  useEffect(() => {
    if (!query.isPlaceholderData && query.data && page > Math.max(1, query.data.pages)) setPage(Math.max(1, query.data.pages));
  }, [page, query.data, query.isPlaceholderData]);

  async function refreshKeys() {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['api-keys'] }),
      client.invalidateQueries({ queryKey: ['dashboard'] }),
      client.invalidateQueries({ queryKey: ['playground'] }),
    ]);
  }
  const groups = useQuery({
    queryKey: ['groups'],
    queryFn: ({ signal }) => portalApi<Group[]>('/groups', { signal }),
    enabled: Boolean(capabilities?.keyWrites),
  });

  const remove = useMutation({
    mutationFn: (id: string) => portalApi(`/api-keys/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    onMutate: () => setNotice(''),
    onSuccess: async () => {
      setDeleteKey(null);
      setNotice('API key deleted.');
      setPage((current) => pageAfterKeyDeletion(current, query.data?.items.length ?? 0));
      await refreshKeys();
    },
  });
  const toggle = useMutation({
    mutationFn: (key: ApiKey) => portalApi(`/api-keys/${encodeURIComponent(key.id)}`, { method: 'PATCH', ...jsonBody({ status: key.status === 'active' ? 'inactive' : 'active' }) }),
    onMutate: () => setNotice(''),
    onSuccess: async () => { setNotice('API key status updated.'); await refreshKeys(); },
  });

  async function copy(key: ApiKey) {
    try {
      await navigator.clipboard.writeText(key.key);
      setCopied(key.id);
      window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(''), 1600);
    } catch {
      setNotice('Clipboard access was blocked. Reveal the key and copy it manually.');
    }
  }

  function toggleReveal(id: string) {
    setRevealed((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  return <>
    <PageHeader title="API Keys" description="Create and manage keys that authenticate requests to kineticRouter." action={capabilities?.keyWrites && groups.isSuccess ? <Button onClick={() => { setNotice(''); setEditor('create'); }}><Plus size={16} /> Create API key</Button> : undefined} />
    {!capabilities?.keyWrites && <div className="info-banner"><ShieldCheck size={17} /><div><strong>Read-only mode</strong><span>API key changes are temporarily unavailable.</span></div></div>}
    {capabilities?.keyWrites && groups.error && <div className="info-banner"><ShieldCheck size={17} /><div><strong>Groups unavailable</strong><span>Key creation and editing are paused to prevent an unintended group assignment.</span></div></div>}
    <Card className="toolbar-card"><div className="search-field"><Search size={15} /><input aria-label="Search API keys" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search key names…" /></div><select className="compact-select" aria-label="Filter by status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="quota_exhausted">Quota exhausted</option><option value="expired">Expired</option></select></Card>
    {(query.isFetching || resultsPending) && query.data && <p className="query-updating" role="status">Updating keys…{resultsPending ? ' Showing the previous results.' : ''}</p>}
    <Card className="table-card" aria-busy={query.isFetching || resultsPending}>
      {query.isLoading ? <LoadingState label="Loading API keys" /> : query.error ? <ErrorState error={query.error} retry={() => void query.refetch()} /> : !query.data?.items.length ? <EmptyState title="No API keys yet" description="Create a key to start making requests through api.kineticrouter.com/v1." action={capabilities?.keyWrites && groups.isSuccess ? <Button onClick={() => { setNotice(''); setEditor('create'); }}><Plus size={16} /> Create your first key</Button> : undefined} /> : <>
        <div className="data-table-wrap">
          <table className="data-table keys-table">
            <thead><tr><th>Name</th><th>API key</th><th>Group</th><th>Status</th><th>Quota</th><th>Last used</th><th aria-label="Actions" /></tr></thead>
            <tbody>{query.data.items.map((key) => <tr key={key.id}>
              <td><div className="key-name-cell"><span><KeyRound size={15} /></span><div><strong>{key.name}</strong><small>Created {formatDate(key.createdAt)}</small></div></div></td>
              <td><div className="secret-cell"><code>{revealed.has(key.id) ? key.key : key.maskedKey}</code><button aria-label={revealed.has(key.id) ? 'Hide API key' : 'Show API key'} onClick={() => toggleReveal(key.id)}>{revealed.has(key.id) ? <EyeOff size={14} /> : <Eye size={14} />}</button><button aria-label="Copy API key" onClick={() => void copy(key)}>{copied === key.id ? <Check size={14} /> : <Clipboard size={14} />}</button></div></td>
              <td>{key.group?.name || 'Default'}</td><td><StatusBadge status={key.status} /></td>
              <td><KeyQuota name={key.name} quota={key.quota} used={key.quotaUsed} /></td>
              <td>{formatDate(key.lastUsedAt, true)}</td>
              <td><div className="row-actions">{capabilities?.keyWrites && <RowActionsMenu label={`Actions for ${key.name}`} disabled={toggle.isPending || remove.isPending || resultsPending} items={[
                { label: 'Edit key', disabled: !groups.isSuccess, onSelect: () => { setNotice(''); setEditor(key); } },
                { label: key.status === 'active' ? 'Disable key' : 'Enable key', disabled: key.status === 'expired' || key.status === 'quota_exhausted', onSelect: () => toggle.mutate(key) },
                { label: 'Delete key', danger: true, onSelect: () => { setNotice(''); setDeleteKey(key); } },
              ]} />}</div></td>
            </tr>)}</tbody>
          </table>
        </div>
        <Pagination page={query.data.page} pages={query.data.pages} total={query.data.total} onPage={setPage} busy={resultsPending} />
      </>}
    </Card>
    <KeyEditor key={editor === 'create' ? 'create' : editor?.id ?? 'closed'} open={Boolean(editor)} existing={editor === 'create' ? undefined : editor ?? undefined} groups={groups.data ?? []} onClose={() => setEditor(null)} onSaved={async () => { setEditor(null); setNotice(editor === 'create' ? 'API key created.' : 'API key updated.'); await refreshKeys(); }} />
    <ConfirmDialog open={Boolean(deleteKey)} title="Delete API key?" description={`“${deleteKey?.name ?? ''}” will stop working immediately. This cannot be undone.`} confirmLabel="Delete key" danger busy={remove.isPending} onCancel={() => setDeleteKey(null)} onConfirm={() => deleteKey && remove.mutate(deleteKey.id)} />
    {(notice || toggle.error || remove.error) && <div className="toast" role="status">{notice || (toggle.error instanceof Error ? toggle.error.message : '') || (remove.error instanceof Error ? remove.error.message : '')}</div>}
  </>;
}

function KeyEditor({ open, existing, groups, onClose, onSaved }: { open: boolean; existing?: ApiKey; groups: Group[]; onClose(): void; onSaved(): void }) {
  const [form, setForm] = useState<KeyForm>(() => existing ? {
    ...blankForm, name: existing.name, groupId: existing.groupId ?? '', quota: existing.quota ?? '',
    rateLimit5h: existing.rateLimit5h ?? '', rateLimit1d: existing.rateLimit1d ?? '', rateLimit7d: existing.rateLimit7d ?? '',
    ipWhitelist: existing.ipWhitelist.join('\n'), ipBlacklist: existing.ipBlacklist.join('\n'),
    expirationDate: existing.expiresAt ? toLocalDateTimeInput(new Date(existing.expiresAt)) : '',
    enableIpRestriction: existing.ipWhitelist.length > 0 || existing.ipBlacklist.length > 0,
    enableRateLimit: hasPositiveValue(existing.rateLimit5h) || hasPositiveValue(existing.rateLimit1d) || hasPositiveValue(existing.rateLimit7d),
    enableExpiration: Boolean(existing.expiresAt),
  } : blankForm);
  const mutation = useMutation({
    mutationFn: () => portalApi(existing ? `/api-keys/${encodeURIComponent(existing.id)}` : '/api-keys', {
      method: existing ? 'PATCH' : 'POST',
      ...jsonBody(existing ? updatePayload(form) : createPayload(form)),
    }),
    onSuccess: onSaved,
  });
  const update = <Field extends keyof KeyForm>(field: Field, value: KeyForm[Field]) => setForm((current) => ({ ...current, [field]: value }));
  const setExpirationDays = (days: number) => {
    const value = new Date();
    value.setDate(value.getDate() + days);
    update('expirationDate', toLocalDateTimeInput(value));
  };
  function submit(event: FormEvent) { event.preventDefault(); mutation.mutate(); }
  return <Modal open={open} title={existing ? 'Edit API key' : 'Create API key'} onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={mutation.isPending} onClick={() => document.getElementById('key-editor-submit')?.click()}>{mutation.isPending ? 'Saving…' : existing ? 'Save changes' : 'Create key'}</Button></>}>
    <form className="key-form" onSubmit={submit}>
      <label className="field"><span>Key name</span><input className="field-input" value={form.name} onChange={(event) => update('name', event.target.value)} placeholder="Production app" required /></label>
      <label className="field"><span>Group</span><select className="field-select" value={form.groupId} onChange={(event) => update('groupId', event.target.value)}><option value="">{existing?.groupId ? 'Keep current group' : 'Default (automatic)'}</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>

      {!existing && <KeyOption title="Custom key" enabled={form.useCustomKey} onToggle={() => update('useCustomKey', !form.useCustomKey)}>
        <label className="field"><span>Custom key</span><input className="field-input mono" value={form.customKey} onChange={(event) => update('customKey', event.target.value)} placeholder="Enter a custom key" minLength={16} maxLength={128} pattern="[A-Za-z0-9_-]+" autoComplete="off" required /></label>
        <p className="field-hint">At least 16 letters, numbers, underscores, or hyphens. Leave this off to generate one.</p>
      </KeyOption>}

      <KeyOption title="IP restriction" enabled={form.enableIpRestriction} onToggle={() => update('enableIpRestriction', !form.enableIpRestriction)}>
        <label className="field"><span>Allowed IP addresses <small>One per line</small></span><textarea className="field-textarea mono" value={form.ipWhitelist} onChange={(event) => update('ipWhitelist', event.target.value)} placeholder="203.0.113.10" /></label>
        <label className="field"><span>Blocked IP addresses <small>One per line</small></span><textarea className="field-textarea mono" value={form.ipBlacklist} onChange={(event) => update('ipBlacklist', event.target.value)} placeholder="198.51.100.25" /></label>
      </KeyOption>

      <label className="field key-option-static"><span>Quota limit (USD)</span><input className="field-input" type="number" min="0" step="0.01" value={form.quota} onChange={(event) => update('quota', event.target.value)} placeholder="0" /><small className="field-hint">Enter 0 or leave blank for unlimited usage.</small></label>

      <KeyOption title="Rate limits" enabled={form.enableRateLimit} onToggle={() => update('enableRateLimit', !form.enableRateLimit)}>
        <p className="field-hint">Maximum spend allowed in each rolling period. Enter 0 for no limit.</p>
        <label className="field"><span>5-hour limit (USD)</span><input className="field-input" type="number" min="0" step="0.01" value={form.rateLimit5h} onChange={(event) => update('rateLimit5h', event.target.value)} placeholder="0" /></label>
        <label className="field"><span>1-day limit (USD)</span><input className="field-input" type="number" min="0" step="0.01" value={form.rateLimit1d} onChange={(event) => update('rateLimit1d', event.target.value)} placeholder="0" /></label>
        <label className="field"><span>7-day limit (USD)</span><input className="field-input" type="number" min="0" step="0.01" value={form.rateLimit7d} onChange={(event) => update('rateLimit7d', event.target.value)} placeholder="0" /></label>
      </KeyOption>

      <KeyOption title="Expiration" enabled={form.enableExpiration} onToggle={() => update('enableExpiration', !form.enableExpiration)}>
        <div className="expiration-presets" aria-label="Expiration presets">{[7, 30, 90].map((days) => <button key={days} type="button" onClick={() => setExpirationDays(days)}>{days} days</button>)}</div>
        <label className="field"><span>Expiration date</span><input className="field-input" type="datetime-local" min={toLocalDateTimeInput(new Date())} value={form.expirationDate} onChange={(event) => update('expirationDate', event.target.value)} required /></label>
      </KeyOption>

      {mutation.error && <div className="form-error">{mutation.error instanceof Error ? mutation.error.message : 'The key could not be saved.'}</div>}
      <button id="key-editor-submit" type="submit" hidden />
    </form>
  </Modal>;
}

function KeyOption({ title, enabled, onToggle, children }: { title: string; enabled: boolean; onToggle(): void; children: ReactNode }) {
  return <section className="key-option">
    <div className="key-option-header"><strong>{title}</strong><button type="button" className={`key-switch${enabled ? ' active' : ''}`} role="switch" aria-checked={enabled} aria-label={`${enabled ? 'Disable' : 'Enable'} ${title.toLowerCase()}`} onClick={onToggle}><span /></button></div>
    {enabled && <div className="key-option-fields">{children}</div>}
  </section>;
}

function createPayload(form: KeyForm) { return { name: form.name, ...(form.groupId ? { groupId: form.groupId } : {}), ...(form.useCustomKey && form.customKey ? { customKey: form.customKey } : {}), ipWhitelist: form.enableIpRestriction ? lines(form.ipWhitelist) : [], ipBlacklist: form.enableIpRestriction ? lines(form.ipBlacklist) : [], quota: nullableNumber(form.quota), expiresInDays: form.enableExpiration ? expirationDays(form.expirationDate) : null, rateLimit5h: form.enableRateLimit ? nullableNumber(form.rateLimit5h) : null, rateLimit1d: form.enableRateLimit ? nullableNumber(form.rateLimit1d) : null, rateLimit7d: form.enableRateLimit ? nullableNumber(form.rateLimit7d) : null }; }
function updatePayload(form: KeyForm) { return { name: form.name, ...(form.groupId ? { groupId: form.groupId } : {}), ipWhitelist: form.enableIpRestriction ? lines(form.ipWhitelist) : [], ipBlacklist: form.enableIpRestriction ? lines(form.ipBlacklist) : [], quota: numberOrZero(form.quota), expiresAt: form.enableExpiration && form.expirationDate ? new Date(form.expirationDate).toISOString() : null, rateLimit5h: form.enableRateLimit ? numberOrZero(form.rateLimit5h) : 0, rateLimit1d: form.enableRateLimit ? numberOrZero(form.rateLimit1d) : 0, rateLimit7d: form.enableRateLimit ? numberOrZero(form.rateLimit7d) : 0 }; }
function nullableNumber(value: string) { return value === '' ? null : Number(value); }
function numberOrZero(value: string) { return value === '' ? 0 : Number(value); }
function lines(value: string) { return value.split(/[\n,]/).map((line) => line.trim()).filter(Boolean); }
function hasPositiveValue(value?: string | null) { return Number(value) > 0; }
function expirationDays(value: string) { const timestamp = Date.parse(value); return Number.isFinite(timestamp) ? Math.max(1, Math.ceil((timestamp - Date.now()) / 86_400_000)) : null; }
function toLocalDateTimeInput(value: Date) { if (!Number.isFinite(value.getTime())) return ''; const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000); return local.toISOString().slice(0, 16); }
function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timeout);
  }, [delayMs, value]);
  return debounced;
}
function StatusBadge({ status }: { status: ApiKey['status'] }) { const map = { active: ['Active', 'success'], inactive: ['Inactive', 'neutral'], quota_exhausted: ['Quota used', 'warning'], expired: ['Expired', 'danger'] } as const; const value = map[status]; return <Badge tone={value[1]}>{value[0]}</Badge>; }
function Pagination({ page, pages, total, onPage, busy }: { page: number; pages: number; total: number; onPage(value: number): void; busy: boolean }) { return <div className="pagination"><span>{total} {total === 1 ? 'key' : 'keys'}</span><div><Button variant="secondary" disabled={busy || page <= 1} onClick={() => onPage(page - 1)}>Previous</Button><span>{page} / {Math.max(1, pages)}</span><Button variant="secondary" disabled={busy || page >= pages} onClick={() => onPage(page + 1)}>Next</Button></div></div>; }
