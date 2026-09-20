import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, RefreshCw, Search } from 'lucide-react';
import type { SupportWelcomePage as WelcomePage } from '@kineticrouter/portal-contract';
import { Button, ErrorState, LoadingState, PageHeader } from '../components/Ui';
import { portalApi, queryString } from '../lib/api';
import { useAuth } from '../lib/auth';
import './support.css';

function ReportTime({ value, empty }: { value: string | null; empty: string }) {
  return value ? <time dateTime={value}>{new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))}</time> : <span className="support-report-pending">{empty}</span>;
}

export function SupportWelcomePage() {
  const { user } = useAuth();
  const allowed = user?.role === 'admin' && user.status === 'active';
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState({ search: '', page: 1 });
  useEffect(() => {
    const timer = window.setTimeout(() => setFilter(current => current.search === search.trim() ? current : { search: search.trim(), page: 1 }), 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  const report = useQuery({
    queryKey: ['support', 'welcome-report', user?.id, filter.search, filter.page],
    queryFn: ({ signal }) => portalApi<WelcomePage>(`/admin/support/welcome${queryString(filter)}`, { signal }),
    enabled: allowed, placeholderData: keepPreviousData, retry: false,
  });
  if (!allowed) return <ErrorState error={new Error('Administrator access is required.')} />;
  const rows = report.data?.items ?? [];
  const pages = Math.max(1, Math.ceil((report.data?.total ?? 0) / 30));
  return <div className="support-welcome-report">
    <PageHeader title="Welcome messages" description="See when customers received, viewed, and replied to their welcome conversation."
      action={<Link className="button button-secondary" to="/admin/support"><ArrowLeft size={15} aria-hidden="true" />Support inbox</Link>} />
    <div className="support-report-tools">
      <label className="support-search"><Search size={16} aria-hidden="true" /><input type="search" aria-label="Search welcome messages" placeholder="Search customer name or email" maxLength={160} value={search} onChange={event => setSearch(event.target.value)} /></label>
      <Button variant="secondary" disabled={report.isFetching} onClick={() => void report.refetch()}><RefreshCw size={14} aria-hidden="true" />Refresh</Button>
    </div>
    {report.error && <ErrorState error={report.error} retry={() => void report.refetch()} />}
    {report.isPending ? <LoadingState label="Loading welcome messages" /> : report.data && <>
      <div className="support-report-table-wrap" aria-busy={report.isFetching}>
        <table className="data-table support-report-table">
          <thead><tr><th scope="col">Customer</th><th scope="col">Sent</th><th scope="col">First viewed</th><th scope="col">First reply</th><th scope="col"><span className="support-visually-hidden">Conversation</span></th></tr></thead>
          <tbody>{rows.map(row => <tr key={row.ticketId}>
            <td><div className="support-report-customer"><strong>{row.ownerLabel || row.ownerEmail || 'Customer'}</strong>{row.ownerEmail && row.ownerEmail.toLowerCase() !== row.ownerLabel?.toLowerCase() && <span>{row.ownerEmail}</span>}</div></td>
            <td><ReportTime value={row.sentAt} empty="Not sent" /></td>
            <td><ReportTime value={row.firstViewedAt} empty="Not viewed" /></td>
            <td><ReportTime value={row.firstReplyAt} empty="No reply" /></td>
            <td><Link className="support-report-open" to={`/admin/support?ticket=${encodeURIComponent(row.ticketId)}`} aria-label={`Open conversation with ${row.ownerLabel || row.ownerEmail || 'customer'}`}>Open conversation<ArrowUpRight size={14} aria-hidden="true" /></Link></td>
          </tr>)}</tbody>
        </table>
        {!rows.length && <div className="support-report-empty"><strong>{filter.search ? 'No matching customers' : 'No welcome messages yet'}</strong><p>{filter.search ? 'Try another name or email address.' : 'Welcome messages will appear here after customers sign in.'}</p></div>}
      </div>
      <nav className="support-report-pagination" aria-label="Welcome message pages"><span>{report.data.total} {report.data.total === 1 ? 'customer' : 'customers'}</span><div><Button variant="secondary" disabled={filter.page <= 1 || report.isFetching} onClick={() => setFilter(current => ({ ...current, page: current.page - 1 }))}>Previous</Button><span>Page {filter.page} of {Math.max(filter.page, pages)}</span><Button variant="secondary" disabled={filter.page >= pages || report.isFetching || report.isPlaceholderData} onClick={() => setFilter(current => ({ ...current, page: current.page + 1 }))}>Next</Button></div></nav>
    </>}
  </div>;
}
