import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SOCIAL_PLATFORMS, websiteSettingsSchema, type SessionView, type SocialLinks, type WebsiteSettings } from '@kineticrouter/portal-contract';
import { Button, Card, ErrorState, LoadingState, PageHeader } from '../components/Ui';
import { jsonBody, portalApi } from '../lib/api';
import { useAuth } from '../lib/auth';
import './website-settings.css';

const settingsKey = (userId?: string) => ['admin', 'website', 'settings', userId];

export function WebsiteSettingsPage() {
  const { user } = useAuth();
  const settings = useQuery({
    queryKey: settingsKey(user?.id),
    queryFn: async ({ signal }) => websiteSettingsSchema.parse(await portalApi<unknown>('/admin/website/settings', { signal })),
    staleTime: Infinity, refetchOnWindowFocus: false, retry: false,
  });
  return <>
    <PageHeader title="Website settings" description="Manage the social links in your website footer." />
    {settings.isLoading ? <LoadingState label="Loading website settings" /> : settings.data
      ? <SocialLinksEditor key={user?.id} initial={settings.data} reload={async () => (await settings.refetch({ throwOnError: true })).data!} />
      : <ErrorState error={settings.error} retry={() => void settings.refetch()} />}
  </>;
}

function SocialLinksEditor({ initial, reload }: { initial: WebsiteSettings; reload(): Promise<WebsiteSettings> }) {
  const client = useQueryClient();
  const [saved, setSaved] = useState(initial);
  const [links, setLinks] = useState<SocialLinks>({ ...initial.socialLinks });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');
  const [reloadError, setReloadError] = useState('');
  const [reloading, setReloading] = useState(false);
  const changed = SOCIAL_PLATFORMS.some(({ id }) => links[id] !== saved.socialLinks[id]);
  const save = useMutation({
    mutationFn: async (input: WebsiteSettings) => {
      const owner = client.getQueryData<SessionView>(['session']);
      const result = websiteSettingsSchema.parse(await portalApi<unknown>('/admin/website/settings', { method: 'PUT', ...jsonBody(input) }));
      return { result, userId: owner?.user?.id, csrf: owner?.csrfToken };
    },
    retry: false,
    onSuccess: ({ result, userId, csrf }) => {
      const current = client.getQueryData<SessionView>(['session']);
      if (!userId || !csrf || !current?.authenticated || current.user?.id !== userId || current.csrfToken !== csrf || current.user.role !== 'admin' || current.user.status !== 'active') return;
      client.setQueryData(settingsKey(userId), result);
      setSaved(result); setLinks({ ...result.socialLinks }); setNotice('Social links saved. Refresh your website to see the changes.');
    },
  });
  function submit(event: FormEvent) {
    event.preventDefault(); setNotice('');
    const parsed = websiteSettingsSchema.safeParse({ revision: saved.revision, socialLinks: links });
    if (!parsed.success) {
      setFieldErrors(Object.fromEntries(parsed.error.issues.map(issue => [String(issue.path[1]), issue.message])));
      return;
    }
    setFieldErrors({}); save.mutate(parsed.data);
  }
  async function reloadSaved() {
    setReloading(true); setReloadError(''); setNotice('');
    try {
      const result = await reload();
      setSaved(result); setLinks({ ...result.socialLinks }); setFieldErrors({}); save.reset();
    } catch (error) { setReloadError(error instanceof Error ? error.message : 'Could not reload settings.'); }
    finally { setReloading(false); }
  }
  return <Card className="website-settings-card">
    <h2>Social media</h2>
    <p>These links are public. Leave a field blank to hide its icon.</p>
    <form onSubmit={submit} noValidate>
      <div className="website-social-fields">
        {SOCIAL_PLATFORMS.map(({ id, label, hosts }) => <label key={id} htmlFor={`social-${id}`}>
          <span>{label}</span>
          <input className="field-input" id={`social-${id}`} type="url" inputMode="url" autoComplete="off" spellCheck={false} maxLength={500}
            placeholder={`https://${hosts[0]}/…`} value={links[id]} disabled={save.isPending || reloading}
            aria-invalid={Boolean(fieldErrors[id])} aria-describedby={fieldErrors[id] ? `social-${id}-error` : undefined}
            onChange={event => { setLinks(current => ({ ...current, [id]: event.target.value })); setFieldErrors(current => ({ ...current, [id]: '' })); setNotice(''); }} />
          {fieldErrors[id] && <span className="website-settings-error" id={`social-${id}-error`}>{fieldErrors[id]}</span>}
        </label>)}
      </div>
      {save.error && <p role="alert" className="website-settings-error">{save.error.message}</p>}
      {reloadError && <p role="alert" className="website-settings-error">{reloadError}</p>}
      {notice && <p role="status" className="website-settings-success">{notice}</p>}
      <div className="website-settings-actions">
        <Button type="button" variant="secondary" disabled={save.isPending || reloading} onClick={() => void reloadSaved()}>{reloading ? 'Reloading…' : 'Reload saved'}</Button>
        <Button type="submit" disabled={!changed || save.isPending || reloading || save.isError}>{save.isPending ? 'Saving…' : 'Save social links'}</Button>
      </div>
    </form>
  </Card>;
}
