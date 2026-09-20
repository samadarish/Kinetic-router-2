import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SupportNavLink } from './SupportNavLink';
import { PortalShell } from './PortalShell';

const account = vi.hoisted(() => ({ role: 'user', status: 'active' }));
vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: { id: 'customer-1', username: 'Taylor', email: 'taylor@example.test', ...account }, capabilities: {}, logout: vi.fn(), playgroundEnabled: true }) }));
vi.mock('../lib/theme', () => ({ useTheme: () => ({ theme: 'dark', toggle: vi.fn() }) }));
vi.mock('../lib/support-context', () => ({ useSupport: () => ({ presence: { status: 'online' }, connection: 'connected', unreadCount: 2 }) }));
beforeEach(() => { account.role = 'user'; account.status = 'active'; });

function renderLink(props: Partial<Parameters<typeof SupportNavLink>[0]> = {}) {
  return renderToStaticMarkup(<MemoryRouter initialEntries={['/support']}><SupportNavLink to="/support" presence={{ status: 'online' }} connection="connected" unreadCount={0} {...props} /></MemoryRouter>);
}

describe('support navigation presence', () => {
  it('marks online support and keeps unread counts in the accessible name', () => {
    const html = renderLink({ unreadCount: 112 });
    expect(html).toContain('support-nav-online active');
    expect(html).toContain('aria-label="Support is Online, 112 unread messages"');
    expect(html).toContain('title="Support is Online"');
    expect(html).toContain('>99+</span>');
    expect(html).toContain('class="support-nav-dot" aria-hidden="true"');
  });

  it.each(['away', 'offline'] as const)('announces %s without showing an online state', status => {
    const html = renderLink({ presence: { status } });
    expect(html).toContain(`support-nav-${status} active`);
    expect(html).not.toContain('support-nav-online');
    expect(html).toContain(`aria-label="Support is ${status === 'away' ? 'Away' : 'Offline'}"`);
  });

  it.each(['connecting', 'reconnecting', 'unavailable'] as const)('does not advertise stale online presence while %s', connection => {
    const html = renderLink({ connection });
    expect(html).toContain('support-nav-unavailable active');
    expect(html).toContain('Support status unavailable');
    expect(html).not.toContain('Support is Online');
    if (connection !== 'unavailable') expect(html).toContain(`unavailable, ${connection}`);
  });

  it('uses one responsive icon and label with the same status and unread count', () => {
    const html = renderLink({ unreadCount: 1 });
    expect(html).toContain('support-header-link support-nav-online active');
    expect(html).toContain('aria-label="Support is Online, 1 unread message"');
    expect(html).toContain('class="support-nav-dot"');
    expect(html).toContain('class="support-header-badge" aria-hidden="true">1</span>');
    expect(html.match(/<svg/g)).toHaveLength(1);
    expect(html).toContain('class="support-header-label" aria-hidden="true">Support</span>');
    expect(html).not.toContain('support-mobile-link');
  });
});

describe('support header placement', () => {
  function renderHeader() {
    const html = renderToStaticMarkup(<MemoryRouter initialEntries={['/support']}><PortalShell /></MemoryRouter>);
    return html.slice(html.indexOf('<header class="topbar"'), html.indexOf('</header>') + 9);
  }
  it('renders exactly one Support link between the theme and account controls', () => {
    const html = renderHeader();
    expect(html.match(/class="support-header-link /g)).toHaveLength(1);
    const links = html.match(/<nav class="console-topnav"[\s\S]*?<\/nav>/)?.[0];
    expect(links).toContain('Home');
    expect(links).toContain('Playground');
    expect(links).toContain('Docs');
    expect(links).not.toContain('Support');
    expect(html.indexOf('aria-label="Toggle color theme"')).toBeLessThan(html.indexOf('class="support-header-link '));
    expect(html.indexOf('class="support-header-link ')).toBeLessThan(html.indexOf('class="account-menu-wrap"'));
    expect(html).toContain('href="/support"');
  });
  it('links active administrators to their inbox and keeps other accounts on customer support', () => {
    account.role = 'admin';
    expect(renderHeader()).toContain('href="/admin/support"');
    account.status = 'inactive';
    expect(renderHeader()).toContain('href="/support"');
    expect(renderHeader()).not.toContain('href="/admin/support"');
  });
});
