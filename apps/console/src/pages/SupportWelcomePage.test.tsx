import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { SupportWelcomePage as WelcomePage } from '@kineticrouter/portal-contract';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SupportWelcomePage } from './SupportWelcomePage';

const account = vi.hoisted(() => ({ id: 'admin-1', role: 'admin', status: 'active' }));
vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: account }) }));
beforeEach(() => { account.role = 'admin'; account.status = 'active'; });
function renderReport(data: WelcomePage) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  client.setQueryData(['support', 'welcome-report', account.id, '', 1], data);
  try { return renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter><SupportWelcomePage /></MemoryRouter></QueryClientProvider>); }
  finally { client.clear(); }
}
const recipient = { ticketId: 'welcome-1', ownerId: 'customer-1', ownerLabel: '<Customer One>', ownerEmail: 'customer@example.test', sentAt: '2026-09-20T10:00:00Z', firstViewedAt: '2026-09-20T10:10:00Z', firstReplyAt: null };

describe('administrator welcome report', () => {
  it('shows customer identity and separate sent, viewed, and reply states with a conversation link', () => {
    const html = renderReport({ items: [recipient], total: 31 });
    expect(html).toContain('&lt;Customer One&gt;');
    expect(html).not.toContain('<Customer One>');
    expect(html).toContain('customer@example.test');
    expect(html).toContain(`dateTime="${recipient.sentAt}"`);
    expect(html).toContain(`dateTime="${recipient.firstViewedAt}"`);
    expect(html).toContain('No reply');
    expect(html).toContain('href="/admin/support?ticket=welcome-1"');
    expect(html).toContain('aria-label="Search welcome messages"');
    expect(html).toContain('31 customers');
    expect(html).toContain('Page 1 of 2');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Previous<\/button>/);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Next<\/button>/);
  });
  it('does not invent a viewed timestamp and handles empty reports', () => {
    const html = renderReport({ items: [{ ...recipient, ownerLabel: recipient.ownerEmail, firstViewedAt: null, firstReplyAt: '2026-09-20T10:15:00Z' }], total: 1 });
    expect(html).toContain('Not viewed');
    expect(html).toContain('dateTime="2026-09-20T10:15:00Z"');
    expect(html.match(/>customer@example.test</g)).toHaveLength(1);
    expect(renderReport({ items: [], total: 0 })).toContain('No welcome messages yet');
  });
  it.each([{ role: 'user', status: 'active' }, { role: 'admin', status: 'inactive' }])('hides cached report data from a $status $role account', access => {
    Object.assign(account, access);
    const html = renderReport({ items: [recipient], total: 1 });
    expect(html).toContain('Administrator access is required.');
    expect(html).not.toContain('customer@example.test');
    expect(html).not.toContain('Open conversation');
  });
});
