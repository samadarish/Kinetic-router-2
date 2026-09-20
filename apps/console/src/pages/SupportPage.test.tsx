import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { SupportDetail, SupportMessage, SupportTicket, SupportTicketPage } from '@kineticrouter/portal-contract';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mergeSupportMessages, supportMessageBody, supportNotificationActions, supportThreadEntries, supportVisibleTickets, SupportMessageBubble, SupportPage } from './SupportPage';

const support = vi.hoisted(() => ({
  presence: { status: 'away', mode: 'automatic' }, connection: 'connected', unreadCount: 2,
  soundEnabled: true, soundReady: false, soundBlocked: false, desktopEnabled: false, error: '',
  enableSound: vi.fn(), toggleSound: vi.fn(), testSound: vi.fn(), enableDesktop: vi.fn(), setPresence: vi.fn(), setStatusText: vi.fn(),
}));
vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: { id: 'customer-1', role: 'user' } }) }));
vi.mock('../lib/support-context', () => ({ useSupport: () => support }));

const ticket: SupportTicket = {
  id: 'ticket-1', subject: 'Help with an API request', preferredLanguage: 'en', status: 'open', createdAt: '2026-09-19T08:00:00Z', updatedAt: '2026-09-19T08:10:00Z',
  lastMessage: 'Please try again now.', lastSender: 'admin', messageCount: 2, unreadCount: 1,
};
const messages: SupportMessage[] = [
  { id: 'message-1', ticketId: ticket.id, sequence: 1, sender: 'customer', body: 'My request failed.', createdAt: ticket.createdAt },
  { id: 'message-2', ticketId: ticket.id, sequence: 2, sender: 'admin', body: 'Please try again now.', createdAt: ticket.updatedAt },
];
function renderPage({ admin = false, path, items = [ticket], selected = ticket, history = messages }: { admin?: boolean; path?: string; items?: SupportTicket[]; selected?: SupportTicket; history?: SupportMessage[] } = {}) {
  const client = new QueryClient();
  client.setQueryData<SupportTicketPage>(['support', 'tickets', admin, 'open', '', 1], { items, total: items.length, unreadCount: 1 });
  client.setQueryData<SupportDetail>(['support', 'detail', admin, ticket.id], { ticket: selected, messages: history, nextBefore: null });
  try {
    return renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path ?? `${admin ? '/admin' : ''}/support?ticket=${ticket.id}`]}><SupportPage admin={admin} /></MemoryRouter></QueryClientProvider>);
  } finally { client.clear(); }
}
beforeEach(() => { support.connection = 'connected'; support.presence.status = 'away'; support.soundEnabled = true; support.soundReady = false; support.soundBlocked = false; support.desktopEnabled = false; support.error = ''; });

describe('support conversation history', () => {
  it('retains loaded history when new replies move the latest page forward', () => {
    const conversation = Array.from({ length: 60 }, (_, index) => ({ ...messages[0]!, id: `message-${index + 1}`, sequence: index + 1 }));
    const latestPage = conversation.slice(5, 55);
    const loadedHistory = mergeSupportMessages(latestPage, conversation.slice(0, 5));
    const refreshed = mergeSupportMessages(loadedHistory, conversation.slice(10));
    expect(refreshed.map(message => message.sequence)).toEqual(Array.from({ length: 60 }, (_, index) => index + 1));
    expect(new Set(refreshed.map(message => message.id)).size).toBe(60);
    expect(mergeSupportMessages(refreshed, conversation.slice(10))).toEqual(refreshed);
  });

  it('groups consecutive same-sender messages through exactly five minutes and separates longer gaps', () => {
    const start = new Date(2026, 8, 19, 12).getTime();
    const history = [0, 60_000, 360_000, 660_001].map((offset, index) => ({
      ...messages[0]!, id: `group-${index}`, sequence: index + 1, createdAt: new Date(start + offset).toISOString(),
    }));
    const entries = supportThreadEntries(history);
    expect(entries.map(({ startsDay, startsGroup }) => ({ startsDay, startsGroup }))).toEqual([
      { startsDay: true, startsGroup: true }, { startsDay: false, startsGroup: false },
      { startsDay: false, startsGroup: false }, { startsDay: false, startsGroup: true },
    ]);
  });

  it('starts new groups after sender changes or backward timestamps without reordering or replacing messages', () => {
    const start = new Date(2026, 8, 19, 12).getTime();
    const history: SupportMessage[] = [
      { ...messages[0]!, id: 'first', sequence: 30, createdAt: new Date(start).toISOString() },
      { ...messages[1]!, id: 'second', sequence: 20, createdAt: new Date(start + 60_000).toISOString() },
      { ...messages[1]!, id: 'third', sequence: 10, createdAt: new Date(start + 30_000).toISOString() },
      { ...messages[1]!, id: 'fourth', sequence: 40, createdAt: new Date(start + 30_000).toISOString() },
    ];
    const entries = supportThreadEntries(history);
    expect(entries.map(entry => entry.startsGroup)).toEqual([true, true, true, false]);
    expect(entries.map(entry => entry.startsDay)).toEqual([true, false, false, false]);
    expect(entries.map(entry => entry.message.id)).toEqual(['first', 'second', 'third', 'fourth']);
    entries.forEach((entry, index) => expect(entry.message).toBe(history[index]));
    expect(history.map(message => message.sequence)).toEqual([30, 20, 10, 40]);
    expect(supportThreadEntries([])).toEqual([]);
  });

  it('starts a new day and sender group at local midnight, including a gap shorter than five minutes', () => {
    vi.stubEnv('TZ', 'Asia/Kolkata');
    try {
      const history = ['2026-09-19T18:29:00Z', '2026-09-19T18:31:00Z', '2026-09-19T18:32:00Z']
        .map((createdAt, index) => ({ ...messages[0]!, id: `midnight-${index}`, sequence: index + 1, createdAt }));
      expect(new Date(history[0]!.createdAt).getDate()).toBe(19);
      expect(new Date(history[1]!.createdAt).getDate()).toBe(20);
      expect(supportThreadEntries(history).map(({ startsDay, startsGroup }) => ({ startsDay, startsGroup }))).toEqual([
        { startsDay: true, startsGroup: true }, { startsDay: true, startsGroup: true }, { startsDay: false, startsGroup: false },
      ]);
    } finally { vi.unstubAllEnvs(); }
  });
});

describe('support read receipt privacy', () => {
  it('shows Seen only on an administrator reply the customer has read', () => {
    const seen = renderToStaticMarkup(<SupportMessageBubble message={messages[1]!} admin customerReadSequence={2} />);
    const sent = renderToStaticMarkup(<SupportMessageBubble message={messages[1]!} admin customerReadSequence={1} />);
    expect(seen).toContain('Seen');
    expect(sent).not.toContain('Seen');
    expect(sent).toContain('Sent');
  });
  it('never exposes a read state to customers, even if a receipt is accidentally supplied', () => {
    const html = renderPage({ selected: { ...ticket, customerReadSequence: 100 } });
    expect(html).not.toContain('Seen');
    expect(html).not.toContain('customerReadSequence');
    expect(html).not.toContain('Sent');
    expect(html).not.toContain('Your availability');
    expect(html).not.toContain('>Resolve<');
  });
  it('does not attach Sent or Seen to an incoming customer message', () => {
    const html = renderToStaticMarkup(<SupportMessageBubble message={messages[0]!} admin customerReadSequence={100} />);
    expect(html).not.toContain('Seen');
    expect(html).not.toContain('Sent');
    expect(html).toContain('data-incoming="true"');
  });
  it('keeps timestamps but removes receipt text and ticks from customer text and image messages', () => {
    for (const sender of ['customer', 'admin'] as const) for (const withImage of [false, true]) {
      const message: SupportMessage = { ...messages[0]!, sender, ...(withImage ? { image: { url: '/image', mimeType: 'image/webp', width: 100, height: 100, byteSize: 1000 } as const } : {}) };
      const html = renderToStaticMarkup(<SupportMessageBubble message={message} admin={false} customerReadSequence={100} />);
      const metadata = html.slice(html.indexOf('<div class="support-message-meta"'));
      expect(metadata).toContain(`<time dateTime="${message.createdAt}"`);
      expect(metadata).not.toContain('Sent');
      expect(metadata).not.toContain('Seen');
      expect(metadata).not.toContain('<svg');
    }
  });
  it('retains private receipts and message tracking when a repeated author is visually hidden', () => {
    const adminHtml = renderToStaticMarkup(<SupportMessageBubble message={messages[1]!} admin showAuthor={false} customerReadSequence={2} />);
    const customerHtml = renderToStaticMarkup(<SupportMessageBubble message={messages[1]!} admin={false} showAuthor={false} customerReadSequence={2} />);
    expect(adminHtml).toContain('Seen');
    expect(adminHtml).toContain('data-sequence="2"');
    expect(adminHtml).not.toContain('data-incoming');
    expect(customerHtml).not.toContain('Seen');
    expect(customerHtml).not.toContain('Sent');
    expect(customerHtml).toContain('data-sequence="2"');
    expect(customerHtml).toContain('data-incoming="true"');
    expect(customerHtml).toMatch(/<[^>]+class="[^"]*support-visually-hidden[^"]*"[^>]*>kineticRouter Support<\//);
  });
  it('uses the customer name in the admin thread while keeping grouped authors accessible and escaped', () => {
    const html = renderToStaticMarkup(<SupportMessageBubble message={messages[0]!} admin showAuthor={false} customerLabel={'<Customer One>'} />);
    expect(html).toMatch(/<[^>]+class="[^"]*support-visually-hidden[^"]*"[^>]*>&lt;Customer One&gt;<\//);
    expect(html).not.toContain('<Customer One>');
    expect(html).not.toContain('aria-hidden="true">&lt;Customer One&gt;');
    expect(html).toContain('My request failed.');
  });
});

describe('support inbox and conversation', () => {
  it('renders administrator customer identity, private receipt, and management controls', () => {
    const selected = { ...ticket, ownerEmail: 'customer@example.test', ownerLabel: 'Customer One', customerReadSequence: 2 };
    const html = renderPage({ admin: true, items: [selected], selected });
    expect(html).toContain('Support inbox');
    expect(html).toContain('customer@example.test');
    expect(html).toContain('Seen');
    expect(html).toContain('aria-label="Support settings"');
    expect(html).toContain('>Resolve<');
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*>Open<\/button>/);
    expect(html).not.toContain('New ticket');
    expect(html).not.toContain('Create ticket');
    expect(html).toContain('href="/admin/support/welcome"');
    expect(html).not.toContain('support-availability-button');
  });
  it('renders customer messages safely as text with accessible navigation and composer', () => {
    const malicious = { ...messages[0]!, body: '<img src=x onerror=alert(1)>\nsecond line' };
    const bubble = renderToStaticMarkup(<SupportMessageBubble message={malicious} admin={false} />);
    expect(bubble).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(bubble).not.toContain('<img');
    const html = renderPage();
    expect(html).toContain('aria-label="Back to tickets"');
    expect(html).toContain('Your message');
    expect(html).toContain('aria-label="1 unread messages"');
    expect(html).toContain('maxLength="10000"');
    expect(html).toContain('aria-label="Support settings"');
    expect(html).not.toContain('Allow sound');
  });
  it('renders one date divider per local day and keeps repeated senders accessible within the thread', () => {
    const start = new Date(2026, 8, 19, 23, 58).getTime();
    const history = [0, 60_000, 180_000, 240_000].map((offset, index) => ({
      ...(index === 3 ? messages[1]! : messages[0]!), id: `thread-${index}`, sequence: index + 1, createdAt: new Date(start + offset).toISOString(),
    }));
    const selected = { ...ticket, ownerLabel: 'Customer One', ownerEmail: 'one@example.test', customerReadSequence: 4 };
    const html = renderPage({ admin: true, items: [selected], selected, history });
    const thread = html.slice(html.indexOf('<ol class="support-messages"'), html.indexOf('</ol>'));
    expect(thread.match(/class="support-date-divider"/g)).toHaveLength(2);
    const rows = [...thread.matchAll(/<li class="support-message[^"]*"[\s\S]*?<\/li>/g)].map(match => match[0]);
    expect(rows).toHaveLength(4);
    rows.forEach((row, index) => expect(row).toContain(`data-sequence="${index + 1}"`));
    expect(rows[0]).toContain('class="support-message-author">Customer One</span>');
    expect(rows[1]).toContain('class="support-visually-hidden">Customer One</span>');
    expect(rows[1]).toContain('support-message-continuation');
    expect(rows[2]).toContain('class="support-message-author">Customer One</span>');
    expect(rows[3]).toContain('class="support-message-author">You</span>');
    expect(rows[3]).toContain('Seen');
    expect(rows[1]).toMatch(/<time[^>]*aria-label="[^"]+"/);
  });
  it('keeps resolved customer conversations read-only and excludes their actions from Open', () => {
    const selected = { ...ticket, status: 'resolved' as const };
    const html = renderPage({ items: [selected], selected });
    expect(html).toContain('This ticket is resolved. Create a new ticket for more help.');
    expect(html).toContain('My request failed.');
    expect(html).not.toContain('>Reopen<');
    expect(html).not.toContain('>Resolve<');
    expect(html).not.toContain('aria-label="Your message"');
    expect(html).not.toContain('Attach image');
    expect(html).not.toContain('>Send<');
    expect(renderPage()).not.toContain('>Reopen<');
    const admin = renderPage({ admin: true, items: [selected], selected });
    expect(admin).not.toContain('>Reopen<');
    expect(admin).toContain('aria-label="Your message"');
  });
  it('supports one optional image in customer ticket creation and replies', () => {
    const html = renderPage({ path: '/support?new=1', items: [] });
    expect(html).toContain('Subject');
    expect(html).toContain('Message');
    expect(html).toContain('Create ticket');
    expect(html).toContain('maxLength="160"');
    expect(html).toContain('type="file"');
    expect(html).toContain('Attach image');
    expect(html).not.toContain('multiple=""');
    expect(renderPage()).toContain('Attach image');
    expect(renderPage({ admin: true })).not.toContain('type="file"');
    expect(html).not.toContain('Priority');
    expect(html).not.toContain('Category');
  });
  it('opens creation in a dialog without replacing the selected conversation', () => {
    const html = renderPage({ path: `/support?ticket=${ticket.id}&new=1` });
    const background = html.slice(html.indexOf('class="support-workspace'), html.indexOf('class="modal-layer"'));
    expect(background).toContain('inert=""');
    expect(background).toContain('aria-current="page"');
    expect(background).toContain('My request failed.');
    expect(background).toContain('Please try again now.');
    expect(background).toContain('aria-label="Your message"');
    expect(html).toContain('role="dialog" aria-modal="true"');
    expect(html).toContain('>New ticket</h2>');
    expect(html).toContain('aria-label="Subject"');
    expect(renderPage({ admin: true, path: '/admin/support?new=1' })).not.toContain('role="dialog"');
  });
  it('offers exactly the requested languages and defaults new or legacy drafts to English', () => {
    const html = renderPage({ path: '/support?new=1' });
    const options = [...html.matchAll(/<option value="([^"]+)"[^>]*>([^<]+)<\/option>/g)].map(match => [match[1], match[2]]);
    expect(options).toEqual([['en', 'English'], ['de', 'German'], ['ja', 'Japanese'], ['zh', 'Chinese'], ['ko', 'Korean'], ['fr', 'French'], ['es', 'Spanish'], ['vi', 'Vietnamese']]);
    expect(html).toContain('<option value="en" selected="">English</option>');
    vi.stubGlobal('sessionStorage', { getItem: () => JSON.stringify({ subject: 'Legacy subject', message: 'Legacy message', clientTicketId: 'ticket', clientMessageId: 'message' }) });
    try {
      const legacy = renderPage({ path: '/support?new=1' });
      expect(legacy).toContain('<option value="en" selected="">English</option>');
      expect(legacy).toContain('Legacy message');
    } finally { vi.unstubAllGlobals(); }
  });
  it('restores the language draft and shows the saved ticket preference only on the selected admin row', () => {
    vi.stubGlobal('sessionStorage', { getItem: () => JSON.stringify({ subject: 'A saved ticket', preferredLanguage: 'ja', message: 'Saved message', clientTicketId: 'ticket', clientMessageId: 'message' }) });
    try { expect(renderPage({ path: '/support?new=1' })).toContain('<option value="ja" selected="">Japanese</option>'); }
    finally { vi.unstubAllGlobals(); }
    const selected: SupportTicket = { ...ticket, preferredLanguage: 'fr' };
    const other: SupportTicket = { ...ticket, id: 'ticket-2', preferredLanguage: 'ja' };
    for (const admin of [false, true]) {
      const html = renderPage({ admin, selected, items: [selected, other] });
      const sidebar = html.slice(html.indexOf('<aside'), html.indexOf('</aside>'));
      expect(sidebar.includes('Preferred language: French')).toBe(admin);
      expect(sidebar).not.toContain('Preferred language: Japanese');
      if (!admin) expect(sidebar).not.toContain('support-ticket-language');
    }
  });
  it('marks own and incoming messages relative to each viewer without exposing customer read receipts', () => {
    for (const admin of [false, true]) for (const message of messages) {
      const own = message.sender === (admin ? 'admin' : 'customer');
      const html = renderToStaticMarkup(<SupportMessageBubble message={message} admin={admin} customerReadSequence={100} />);
      expect(html.includes('support-message-own')).toBe(own);
      expect(html.includes('data-incoming="true"')).toBe(!own);
      expect(html.includes('Seen')).toBe(admin && own);
    }
  });
  it('preserves exact accessible field names when stored drafts populate the controls', () => {
    vi.stubGlobal('sessionStorage', { getItem: () => JSON.stringify({ subject: 'Saved subject', message: 'Saved draft text', clientTicketId: 'draft-ticket', clientMessageId: 'draft-message' }) });
    try {
      const reply = renderPage();
      expect(reply).toMatch(/<textarea[^>]*aria-label="Your message"[^>]*>Saved draft text<\/textarea>/);
      const create = renderPage({ path: '/support?new=1' });
      expect(create).toMatch(/<input[^>]*aria-label="Subject"[^>]*value="Saved subject"/);
      expect(create).toMatch(/<textarea[^>]*aria-label="Message"[^>]*>Saved draft text<\/textarea>/);
    } finally { vi.unstubAllGlobals(); }
  });
  it('provides a refresh action when live updates are unavailable without hiding messages', () => {
    support.connection = 'unavailable';
    const html = renderPage();
    expect(html).toContain('Live updates are unavailable.');
    expect(html).toContain('Refresh');
    expect(html).toContain('My request failed.');
  });
  it('groups preferences in settings and shows sound activation only after a blocked attempt', () => {
    support.soundEnabled = true; support.soundReady = true; support.desktopEnabled = true;
    const html = renderPage();
    expect(html).toContain('aria-label="Support settings"');
    expect(html).not.toContain('support-sound-toggle');
    expect(html).not.toContain('Test sound');
    support.soundReady = false;
    expect(renderPage()).not.toContain('Allow sound');
    support.soundBlocked = true;
    expect(renderPage()).toContain('Allow sound');
    support.soundEnabled = false;
    expect(renderPage()).not.toContain('Allow sound');
  });
  it('never offers customers a test action in the notification menu', () => {
    const desktop = vi.fn(), testSound = vi.fn(), toggleSound = vi.fn(), setPresence = vi.fn(), editStatus = vi.fn();
    const controls = { soundEnabled: true, desktopEnabled: false, enableDesktop: desktop, testSound, toggleSound, setPresence, editStatus };
    const customerActions = supportNotificationActions({ ...controls, admin: false });
    expect(customerActions.map(action => action.label)).toEqual(['Mute sound', 'Enable desktop alerts']);
    customerActions[0]!.onSelect();
    customerActions[1]!.onSelect();
    expect(toggleSound).toHaveBeenCalledOnce();
    expect(desktop).toHaveBeenCalledOnce();
    const adminActions = supportNotificationActions({ ...controls, admin: true, desktopEnabled: true, mode: 'away' });
    expect(adminActions.map(action => action.label)).toEqual(['Mute sound', 'Turn off desktop alerts', 'Test sound', 'Availability: Automatic', 'Availability: Online', 'Availability: Away (current)', 'Availability: Offline', 'Edit status']);
    expect(adminActions[5]!.disabled).toBe(true);
    adminActions[2]!.onSelect();
    adminActions[4]!.onSelect();
    adminActions[6]!.onSelect();
    adminActions[7]!.onSelect();
    expect(testSound).toHaveBeenCalledOnce();
    expect(setPresence).toHaveBeenCalledWith('online');
    expect(setPresence).toHaveBeenCalledWith('offline');
    expect(editStatus).toHaveBeenCalledOnce();
    expect(supportNotificationActions({ ...controls, admin: false, soundEnabled: false })[0]!.label).toBe('Enable sound');
  });
  it('moves new-ticket creation above filters and leaves no visible page or conversation header', () => {
    const html = renderPage();
    expect(html).toContain('<h1 class="support-visually-hidden">Support</h1>');
    expect(html).not.toContain('support-header');
    expect(html).not.toContain('support-conversation-header');
    expect(html).not.toContain('A direct line to help');
    expect(html.indexOf('aria-label="Search tickets"')).toBeLessThan(html.indexOf('>New ticket<'));
    expect(html.indexOf('aria-label="Search tickets"')).toBeLessThan(html.indexOf('class="support-availability"'));
    expect(html.indexOf('class="support-availability"')).toBeLessThan(html.indexOf('>New ticket<'));
    expect(html.indexOf('>New ticket<')).toBeLessThan(html.indexOf('aria-label="Ticket status"'));
    expect(html).not.toContain('href="/admin/support/welcome"');
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*>Open<\/button>/);
    expect(html).toMatch(/support-compose-row[\s\S]*<textarea[^>]*rows="1"[\s\S]*<\/label><button/);
  });
  it('keeps the conversation without reinserting a selected resolved ticket into Open', () => {
    const selected = { ...ticket, ownerLabel: 'customer@example.test', ownerEmail: 'customer@example.test', status: 'resolved' as const };
    const html = renderPage({ admin: true, items: [], selected });
    const sidebar = html.slice(html.indexOf('<aside'), html.indexOf('</aside>'));
    const conversation = html.slice(html.indexOf('<section class="support-conversation"'));
    expect(sidebar).not.toContain('Selected conversation');
    expect(sidebar).not.toContain(ticket.subject);
    expect(sidebar).not.toContain('customer@example.test');
    expect(sidebar).not.toContain('>Reopen<');
    expect(sidebar).toContain('No open tickets');
    expect(sidebar).not.toContain('support-ticket-row');
    expect(conversation).not.toContain('>Reopen<');
    expect(conversation).not.toContain(ticket.subject);
    expect(conversation).toContain('My request failed.');
  });
  it('uses subject-first rows without message previews and keeps total and unread counts with management outside the selection button', () => {
    const selected = { ...ticket, ownerLabel: 'Customer One', ownerEmail: 'one@example.test' };
    const other = { ...ticket, id: 'ticket-2', subject: 'Another request', ownerLabel: 'Customer Two', ownerEmail: 'two@example.test', messageCount: 127, unreadCount: 3 };
    const html = renderPage({ admin: true, items: [selected, other], selected });
    const rows = [...html.matchAll(/<li class="support-ticket-row[^"]*"[\s\S]*?<\/li>/g)].map(match => match[0]);
    expect(rows).toHaveLength(2);
    for (const [index, row] of rows.entries()) {
      const item = [selected, other][index]!;
      expect(row).toContain(`<strong>${item.subject}</strong>`);
      expect(row.indexOf(`<strong>${item.subject}</strong>`)).toBeLessThan(row.indexOf(item.ownerLabel));
      expect(row).toContain(item.ownerEmail);
      expect(row).not.toContain(item.lastMessage);
      expect(row).not.toContain('support-ticket-preview');
      const footer = row.slice(row.indexOf('class="support-ticket-footer"'));
      expect(footer).toContain('support-ticket-status-open');
      const count = footer.match(/<span[^>]*class="support-ticket-count"[^>]*>([\s\S]*?)<\/span>/);
      expect(count?.[1]?.replace(/<[^>]*>/g, '')).toBe(String(item.messageCount));
      expect(count?.[0]).toContain(`aria-label="${item.messageCount} messages"`);
      expect(row).toContain(`support-ticket-count-${item.id}`);
      expect(footer).toContain(`aria-label="${item.unreadCount} unread messages"`);
      expect(row).toMatch(/<\/button><div class="support-ticket-footer">/);
      let depth = 0;
      for (const token of row.matchAll(/<button\b|<\/button>/g)) {
        depth += token[0] === '</button>' ? -1 : 1;
        expect(depth).toBeLessThanOrEqual(1);
        expect(depth).toBeGreaterThanOrEqual(0);
      }
      expect(depth).toBe(0);
    }
    expect(rows[0]).toContain('>Resolve<');
    expect(rows[1]).not.toContain('>Resolve<');
    const conversation = html.slice(html.indexOf('<section class="support-conversation"'));
    expect(conversation).toContain(ticket.lastMessage);
  });
  it('renders an image-only message with a lazy preview, dimensions, and enlarge action', () => {
    const message: SupportMessage = { ...messages[0]!, body: '', image: { url: '/portal/v1/support/tickets/ticket-1/messages/message-1/image', mimeType: 'image/webp', width: 1200, height: 800, byteSize: 94000 } };
    const html = renderToStaticMarkup(<SupportMessageBubble message={message} admin />);
    expect(html).toContain('aria-label="Enlarge image attachment"');
    expect(html).toContain(`src="${message.image!.url}"`);
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('width="1200" height="800"');
    expect(html).not.toContain('support-message-text');
    expect(html).not.toContain('Seen');
  });
  it.each([false, true])('opens bare domains and HTTPS links in new tabs for both senders and image captions (admin=%s)', admin => {
    const image: NonNullable<SupportMessage['image']> = { url: '/portal/v1/support/tickets/ticket-1/messages/message-1/image', mimeType: 'image/webp', width: 1200, height: 800, byteSize: 94000 };
    for (const source of messages) for (const attachment of [undefined, image]) {
      const message: SupportMessage = { ...source, body: 'Docs: google.com and https://google.com.\n**Keep this plain** <b>text</b>', image: attachment };
      const html = renderToStaticMarkup(<SupportMessageBubble message={message} admin={admin} />);
      const anchors = [...html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)].map(match => match[0]);
      expect(anchors).toHaveLength(2);
      expect(anchors[0]).toContain('>google.com</a>');
      expect(anchors[1]).toContain('>https://google.com</a>');
      for (const anchor of anchors) {
        expect(anchor).toMatch(/href="https:\/\/google\.com\/?"/);
        expect(anchor).toContain('target="_blank"');
        expect(anchor).toContain('rel="noopener noreferrer"');
      }
      expect(html).toContain('\n**Keep this plain** &lt;b&gt;text&lt;/b&gt;');
      if (attachment) {
        expect(html).toContain('aria-label="Enlarge image attachment"');
        expect(html.indexOf('</button>')).toBeLessThan(html.indexOf(anchors[0]!));
      }
    }
  });
});

describe('selected ticket visibility', () => {
  it('never inserts the selected ticket when search, status, or pagination excludes it', () => {
    const other = { ...ticket, id: 'ticket-2', subject: 'Another issue' };
    const resolved = { ...ticket, status: 'resolved' as const };
    expect(supportVisibleTickets([other], resolved)).toEqual([other]);
    expect(supportVisibleTickets([], resolved)).toEqual([]);
    expect(supportVisibleTickets([], ticket, 'open')).toEqual([]);
    expect(supportVisibleTickets([other])).toEqual([other]);
  });
  it('keeps matching rows in position with current status details and refreshed unread counts', () => {
    const other = { ...ticket, id: 'ticket-2' };
    const resolved = { ...ticket, status: 'resolved' as const, ownerLabel: 'Customer One', updatedAt: '2026-09-19T08:11:00Z' };
    const rows = supportVisibleTickets([other, { ...ticket, unreadCount: 0 }], resolved);
    expect(rows.map(value => value.id)).toEqual(['ticket-2', ticket.id]);
    expect(rows[1]).toEqual({ ...resolved, unreadCount: 0 });
  });
  it('removes resolved rows from Open immediately and open rows from Resolved', () => {
    const resolved = { ...ticket, status: 'resolved' as const, updatedAt: '2026-09-19T08:11:00Z' };
    const other = { ...resolved, id: 'ticket-2' };
    expect(supportVisibleTickets([ticket, other], resolved, 'open')).toEqual([]);
    expect(supportVisibleTickets([ticket, other], resolved, 'resolved')).toEqual([resolved, other]);
    const reopened = { ...resolved, status: 'open' as const, updatedAt: '2026-09-19T08:12:00Z' };
    expect(supportVisibleTickets([resolved], reopened, 'resolved')).toEqual([]);
    expect(supportVisibleTickets([reopened], resolved, 'open')).toEqual([reopened]);
  });
  it('does not let an older or equal-time detail overwrite fresh list status and counts', () => {
    const fresh = { ...ticket, status: 'resolved' as const, updatedAt: '2026-09-19T08:11:00Z', messageCount: 4, unreadCount: 0 };
    expect(supportVisibleTickets([fresh], ticket, 'open')).toEqual([]);
    expect(supportVisibleTickets([fresh], ticket, 'resolved')).toEqual([fresh]);
    expect(supportVisibleTickets([fresh], { ...ticket, updatedAt: fresh.updatedAt }, 'resolved')).toEqual([fresh]);
  });
});

describe('support message submissions', () => {
  it('keeps existing text-only requests as JSON', () => {
    const fields = { clientMessageId: 'same-message-id', message: 'Text only' };
    expect(supportMessageBody(fields, null)).toEqual({ body: JSON.stringify(fields) });
  });
  it('sends one image with an optional caption and stable retry identifiers', async () => {
    const image = { blob: new Blob(['compressed-image'], { type: 'image/webp' }), name: 'image.webp' };
    const fields = { clientTicketId: 'ticket-id', clientMessageId: 'message-id', subject: 'Screenshot', preferredLanguage: 'vi', message: '' };
    const first = supportMessageBody(fields, image).body as FormData;
    const retry = supportMessageBody(fields, image).body as FormData;
    expect(first.get('message')).toBe('');
    expect(first.get('preferredLanguage')).toBe('vi');
    expect(first.getAll('image')).toHaveLength(1);
    expect(first.get('clientMessageId')).toBe(retry.get('clientMessageId'));
    expect(first.get('clientTicketId')).toBe(retry.get('clientTicketId'));
    expect((first.get('image') as File).type).toBe('image/webp');
    expect(await (first.get('image') as File).text()).toBe(await (retry.get('image') as File).text());
  });
});
