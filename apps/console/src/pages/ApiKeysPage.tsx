import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Clipboard, Eye, EyeOff, KeyRound, MoreHorizontal, Plus, Search, ShieldCheck, Trash2 } from 'lucide-react';
import type { ApiKey, Group, Paginated } from '@kineticrouter/portal-contract';
import { ConfirmDialog, Modal } from '../components/Modal';
import { Badge, Button, Card, EmptyState, ErrorState, LoadingState, PageHeader } from '../components/Ui';
import { useAuth } from '../lib/auth';
import { jsonBody, portalApi, queryString } from '../lib/api';
import { formatDate, formatMoney } from '../lib/format';

type KeyForm = {
  name: string; groupId: string; customKey: string; quota: string; expiresInDays: string;
  rateLimit5h: string; rateLimit1d: string; rateLimit7d: string; ipWhitelist: string; ipBlacklist: string;
};

const blankForm: KeyForm = { name: '', groupId: '', customKey: '', quota: '', expiresInDays: '', rateLimit5h: '', rateLimit1d: '', rateLimit7d: '', ipWhitelist: '', ipBlacklist: '' };

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

  const query = useQuery({
    queryKey: ['api-keys', page, search, status],
    queryFn: () => portalApi<Paginated<ApiKey>>(`/api-keys${queryString({ page, pageSize: 20, search, status, sortBy: 'created_at', sortOrder: 'desc' })}`),
  });
  const groups = useQuery({ queryKey: ['groups'], queryFn: () => portalApi<Group[]>('/groups') });

  const remove = useMutation({
    mutationFn: (id: string) => portalApi(`/api-keys/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    onSuccess: async () => { setDeleteKey(null); setNotice('API key deleted.'); await client.invalidateQueries({ queryKey: ['api-keys'] }); },
  });
  const toggle = useMutation({
    mutationFn: (key: ApiKey) => portalApi(`/api-keys/${encodeURIComponent(key.id)}`, { method: 'PATCH', ...jsonBody({ status: key.status === 'active' ? 'inactive' : 'active' }) }),
    onSuccess: async () => { setNotice('API key status updated.'); await client.invalidateQueries({ queryKey: ['api-keys'] }); },
  });

  async function copy(key: ApiKey) {
    try {
      await navigator.clipboard.writeText(key.key);
      setCopied(key.id);
      window.setTimeout(() => setCopied(''), 1600);
    } catch {
      setNotice('Clipboard access was blocked. Reveal the key and copy it manually.');
    }
  }

  function toggleReveal(id: string) {
    setRevealed((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  return <>
    <PageHeader title="API Keys" description="Create and manage keys that authenticate requests to kineticRouter." action={capabilities?.keyWrites && groups.isSuccess ? <Button onClick={() => setEditor('create')}><Plus size={16} /> Create API key</Button> : undefined} />
    {!capabilities?.keyWrites && <div className="info-banner"><ShieldCheck size={17} /><div><strong>Read-only mode</strong><span>Key creation and changes will be enabled after controlled-write validation.</span></div></div>}
    {capabilities?.keyWrites && groups.error && <div className="info-banner"><ShieldCheck size={17} /><div><strong>Groups unavailable</strong><span>Key creation and editing are paused to prevent an unintended group assignment.</span></div></div>}
    <Card className="toolbar-card"><div className="search-field"><Search size={15} /><input aria-label="Search API keys" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search key names…" /></div><select className="compact-select" aria-label="Filter by status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="quota_exhausted">Quota exhausted</option><option value="expired">Expired</option></select></Card>
    <Card className="table-card">
      {query.isLoading ? <LoadingState label="Loading API keys" /> : query.error ? <ErrorState error={query.error} retry={() => void query.refetch()} /> : !query.data?.items.length ? <EmptyState title="No API keys yet" description="Create a key to start making requests through api.kineticrouter.com/v1." action={capabilities?.keyWrites && groups.isSuccess ? <Button onClick={() => setEditor('create')}><Plus size={16} /> Create your first key</Button> : undefined} /> : <>
        <div className="data-table-wrap">
          <table className="data-table keys-table">
            <thead><tr><th>Name</th><th>API key</th><th>Group</th><th>Status</th><th>Quota</th><th>Last used</th><th aria-label="Actions" /></tr></thead>
            <tbody>{query.data.items.map((key) => <tr key={key.id}>
              <td><div className="key-name-cell"><span><KeyRound size={15} /></span><div><strong>{key.name}</strong><small>Created {formatDate(key.createdAt)}</small></div></div></td>
              <td><div className="secret-cell"><code>{revealed.has(key.id) ? key.key : key.maskedKey}</code><button aria-label={revealed.has(key.id) ? 'Hide API key' : 'Show API key'} onClick={() => toggleReveal(key.id)}>{revealed.has(key.id) ? <EyeOff size={14} /> : <Eye size={14} />}</button><button aria-label="Copy API key" onClick={() => void copy(key)}>{copied === key.id ? <Check size={14} /> : <Clipboard size={14} />}</button></div></td>
              <td>{key.group?.name || 'Default'}</td><td><StatusBadge status={key.status} /></td>
              <td><div className="quota-cell"><span>{hasQuotaLimit(key.quota) ? formatMoney(key.quota, 4) : 'Unlimited'}</span>{hasQuotaLimit(key.quota) && <small>{formatMoney(key.quotaUsed, 4)} used</small>}</div></td>
              <td>{formatDate(key.lastUsedAt, true)}</td>
              <td><div className="row-actions">{capabilities?.keyWrites && <><button disabled={toggle.isPending} title={key.status === 'active' ? 'Disable key' : 'Enable key'} onClick={() => toggle.mutate(key)}><MoreHorizontal size={16} /></button>{groups.isSuccess && <button title="Edit key" onClick={() => setEditor(key)}>Edit</button>}<button className="danger-icon" title="Delete key" onClick={() => setDeleteKey(key)}><Trash2 size={15} /></button></>}</div></td>
            </tr>)}</tbody>
          </table>
        </div>
        <Pagination page={query.data.page} pages={query.data.pages} total={query.data.total} onPage={setPage} />
      </>}
    </Card>
    <KeyEditor key={editor === 'create' ? 'create' : editor?.id ?? 'closed'} open={Boolean(editor)} existing={editor === 'create' ? undefined : editor ?? undefined} groups={groups.data ?? []} onClose={() => setEditor(null)} onSaved={async () => { setEditor(null); setNotice(editor === 'create' ? 'API key created.' : 'API key updated.'); await client.invalidateQueries({ queryKey: ['api-keys'] }); }} />
    <ConfirmDialog open={Boolean(deleteKey)} title="Delete API key?" description={`“${deleteKey?.name ?? ''}” will stop working immediately. This cannot be undone.`} confirmLabel="Delete key" danger busy={remove.isPending} onCancel={() => setDeleteKey(null)} onConfirm={() => deleteKey && remove.mutate(deleteKey.id)} />
    {(notice || toggle.error || remove.error) && <div className="toast" role="status">{notice || (toggle.error instanceof Error ? toggle.error.message : '') || (remove.error instanceof Error ? remove.error.message : '')}</div>}
  </>;
}

function KeyEditor({ open, existing, groups, onClose, onSaved }: { open: boolean; existing?: ApiKey; groups: Group[]; onClose(): void; onSaved(): void }) {
  const [form, setForm] = useState<KeyForm>(() => existing ? {
    ...blankForm, name: existing.name, groupId: existing.groupId ?? '', quota: existing.quota ?? '',
    rateLimit5h: existing.rateLimit5h ?? '', rateLimit1d: existing.rateLimit1d ?? '', rateLimit7d: existing.rateLimit7d ?? '',
    ipWhitelist: existing.ipWhitelist.join('\n'), ipBlacklist: existing.ipBlacklist.join('\n'),
  } : blankForm);
  const mutation = useMutation({
    mutationFn: () => portalApi(existing ? `/api-keys/${encodeURIComponent(existing.id)}` : '/api-keys', {
      method: existing ? 'PATCH' : 'POST',
      ...jsonBody(existing ? updatePayload(form) : createPayload(form)),
    }),
    onSuccess: onSaved,
  });
  const update = (field: keyof KeyForm, value: string) => setForm((current) => ({ ...current, [field]: value }));
  function submit(event: FormEvent) { event.preventDefault(); mutation.mutate(); }
  return <Modal open={open} wide title={existing ? 'Edit API key' : 'Create API key'} description="Use the same options supported by your Sub2API account." onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={mutation.isPending} onClick={() => document.getElementById('key-editor-submit')?.click()}>{mutation.isPending ? 'Saving…' : existing ? 'Save changes' : 'Create key'}</Button></>}>
    <form className="form-grid" onSubmit={submit}>
      <label className="field span-2"><span>Key name</span><input className="field-input" value={form.name} onChange={(event) => update('name', event.target.value)} placeholder="Production app" required /></label>
      <label className="field"><span>Group</span><select className="field-select" value={form.groupId} onChange={(event) => update('groupId', event.target.value)}><option value="">Default group</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
      {!existing && <label className="field"><span>Custom key <small>Optional</small></span><input className="field-input mono" value={form.customKey} onChange={(event) => update('customKey', event.target.value)} placeholder="Leave blank to generate" minLength={8} /></label>}
      <label className="field"><span>Quota (USD) <small>Optional</small></span><input className="field-input" type="number" min="0" step="0.0001" value={form.quota} onChange={(event) => update('quota', event.target.value)} placeholder="Unlimited" /></label>
      {!existing && <label className="field"><span>Expires after <small>Days</small></span><input className="field-input" type="number" min="1" max="3650" value={form.expiresInDays} onChange={(event) => update('expiresInDays', event.target.value)} placeholder="Never" /></label>}
      <div className="form-section span-2"><strong>Rate limits</strong><span>Maximum requests per rolling period. Leave blank for no custom limit.</span></div>
      <label className="field"><span>5-hour limit</span><input className="field-input" type="number" min="0" value={form.rateLimit5h} onChange={(event) => update('rateLimit5h', event.target.value)} placeholder="Unlimited" /></label>
      <label className="field"><span>1-day limit</span><input className="field-input" type="number" min="0" value={form.rateLimit1d} onChange={(event) => update('rateLimit1d', event.target.value)} placeholder="Unlimited" /></label>
      <label className="field"><span>7-day limit</span><input className="field-input" type="number" min="0" value={form.rateLimit7d} onChange={(event) => update('rateLimit7d', event.target.value)} placeholder="Unlimited" /></label>
      <div />
      <label className="field"><span>Allowed IP addresses <small>One per line</small></span><textarea className="field-textarea" value={form.ipWhitelist} onChange={(event) => update('ipWhitelist', event.target.value)} placeholder="203.0.113.10" /></label>
      <label className="field"><span>Blocked IP addresses <small>One per line</small></span><textarea className="field-textarea" value={form.ipBlacklist} onChange={(event) => update('ipBlacklist', event.target.value)} placeholder="198.51.100.25" /></label>
      {mutation.error && <div className="form-error span-2">{mutation.error instanceof Error ? mutation.error.message : 'The key could not be saved.'}</div>}
      <button id="key-editor-submit" type="submit" hidden />
    </form>
  </Modal>;
}

function createPayload(form: KeyForm) { return { name: form.name, groupId: form.groupId || null, ...(form.customKey ? { customKey: form.customKey } : {}), ipWhitelist: lines(form.ipWhitelist), ipBlacklist: lines(form.ipBlacklist), quota: nullableNumber(form.quota), expiresInDays: nullableNumber(form.expiresInDays), rateLimit5h: nullableNumber(form.rateLimit5h), rateLimit1d: nullableNumber(form.rateLimit1d), rateLimit7d: nullableNumber(form.rateLimit7d) }; }
function updatePayload(form: KeyForm) { return { name: form.name, groupId: form.groupId || null, ipWhitelist: lines(form.ipWhitelist), ipBlacklist: lines(form.ipBlacklist), quota: nullableNumber(form.quota), rateLimit5h: nullableNumber(form.rateLimit5h), rateLimit1d: nullableNumber(form.rateLimit1d), rateLimit7d: nullableNumber(form.rateLimit7d) }; }
function nullableNumber(value: string) { return value === '' ? null : Number(value); }
function lines(value: string) { return value.split(/[\n,]/).map((line) => line.trim()).filter(Boolean); }
function hasQuotaLimit(value?: string | null) { const numeric = Number(value); return value !== null && value !== undefined && Number.isFinite(numeric) && numeric > 0; }
function StatusBadge({ status }: { status: ApiKey['status'] }) { const map = { active: ['Active', 'success'], inactive: ['Inactive', 'neutral'], quota_exhausted: ['Quota used', 'warning'], expired: ['Expired', 'danger'] } as const; const value = map[status]; return <Badge tone={value[1]}>{value[0]}</Badge>; }
function Pagination({ page, pages, total, onPage }: { page: number; pages: number; total: number; onPage(value: number): void }) { return <div className="pagination"><span>{total} {total === 1 ? 'key' : 'keys'}</span><div><Button variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button><span>{page} / {pages}</span><Button variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</Button></div></div>; }
