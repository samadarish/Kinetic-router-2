// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { SupportDetail, SupportMessage, SupportTicket, SupportTicketPage } from '@kineticrouter/portal-contract';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { portalApi } from '../lib/api';
import { clearSupportImageDrafts } from '../lib/support-image-drafts';
import { SupportPage } from './SupportPage';

vi.mock('../lib/api', async importOriginal => ({ ...await importOriginal<typeof import('../lib/api')>(), portalApi: vi.fn() }));
vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: { id: 'image-test-admin', role: 'admin', status: 'active' } }) }));
vi.mock('../lib/support-context', () => ({ useSupport: () => ({
  presence: { status: 'online', mode: 'automatic' }, connection: 'connected', unreadCount: 0,
  soundEnabled: false, desktopEnabled: false, toggleSound: vi.fn(), enableDesktop: vi.fn(), testSound: vi.fn(), setPresence: vi.fn(),
}) }));

const ticket: SupportTicket = {
  id: 'test-ticket', subject: 'API question', preferredLanguage: 'en', status: 'open',
  createdAt: '2026-10-03T12:00:00Z', updatedAt: '2026-10-03T12:00:00Z', lastMessage: 'Please help.',
  lastSender: 'customer', messageCount: 1, unreadCount: 1, ownerId: 'test-customer', ownerLabel: 'Customer',
};
const original: SupportMessage = { id: 'question', ticketId: ticket.id, sender: 'customer', body: 'Please help.', sequence: 1, createdAt: ticket.createdAt };
const sent: SupportMessage = {
  id: 'image-reply', ticketId: ticket.id, sender: 'admin', body: '', sequence: 2, createdAt: ticket.createdAt,
  image: { url: '/portal/v1/support/tickets/test-ticket/messages/image-reply/image', mimeType: 'image/webp', width: 40, height: 20, byteSize: 100 },
};
let host: HTMLDivElement, root: Root, client: QueryClient, saved: SupportDetail;

beforeEach(async () => {
  vi.clearAllMocks(); sessionStorage.clear();
  await clearSupportImageDrafts('image-test-admin');
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 40, height: 20, close: vi.fn() })));
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:image-test') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
  saved = { ticket, messages: [original], nextBefore: null };
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity }, mutations: { retry: false } } });
  client.setQueryData<SupportTicketPage>(['support', 'tickets', true, 'open', '', 1], { items: [ticket], total: 1, unreadCount: 1 });
  client.setQueryData<SupportDetail>(['support', 'detail', true, ticket.id], saved);
  vi.mocked(portalApi).mockImplementation(async (path, init) => {
    if (init?.method === 'POST') {
      saved = { ticket: { ...ticket, messageCount: 2, lastSender: 'admin', lastMessage: 'Image' }, messages: [original, sent], nextBefore: null };
      return { ticket: saved.ticket, message: sent } as never;
    }
    return (path.includes('?') ? { items: [saved.ticket], total: 1, unreadCount: 1 } : saved) as never;
  });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount()); client.clear(); host.remove();
  await clearSupportImageDrafts('image-test-admin'); vi.unstubAllGlobals();
});

async function render() {
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/admin/support?ticket=${ticket.id}`]}><SupportPage admin /></MemoryRouter></QueryClientProvider>));
  await until(() => expect(host.querySelector('.support-image-preparing')).toBeNull());
}
async function until(check: () => void) {
  await vi.waitFor(async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); }); check(); });
}
function textarea() { return host.querySelector<HTMLTextAreaElement>('[aria-label="Your message"]')!; }
function sendButton() { return host.querySelector<HTMLButtonElement>('.support-compose-row button')!; }
async function caption(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(textarea(), value);
    textarea().dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function attach(file: File, method: 'select' | 'paste' = 'select') {
  await act(async () => {
    if (method === 'select') {
      const input = host.querySelector<HTMLInputElement>('input[type=file]')!;
      Object.defineProperty(input, 'files', { configurable: true, value: [file] });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      const event = new Event('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'clipboardData', { value: { items: [{ kind: 'file', type: file.type, getAsFile: () => file }] } });
      textarea().dispatchEvent(event); expect(event.defaultPrevented).toBe(true);
    }
  });
}
function bytes(file: Blob) {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result as ArrayBuffer); reader.onerror = reject; reader.readAsArrayBuffer(file);
  });
}
function uploads() { return vi.mocked(portalApi).mock.calls.filter(([, init]) => init?.method === 'POST'); }

describe('administrator image composer', () => {
  it.each(['select', 'paste'] as const)('supports %s, optional text, and unchanged image retries after failure', async method => {
    await render();
    const source = new File(['original image bytes'], 'screenshot.png', { type: 'image/png' });
    if (method === 'paste') await caption('Try these settings.');
    await attach(source, method);
    await until(() => expect(sendButton().disabled).toBe(false));
    expect(host.querySelector('[alt="Image attachment preview"]')).not.toBeNull();
    expect(textarea().required).toBe(false);
    vi.mocked(portalApi).mockRejectedValueOnce(new Error('Temporary upload failure'));
    await act(async () => sendButton().click());
    await until(() => expect(sendButton().textContent).toContain('Try again'));
    expect(host.textContent).toContain('Temporary upload failure');
    expect(host.querySelector('[alt="Image attachment preview"]')).not.toBeNull();
    await act(async () => sendButton().click());
    await until(() => expect(host.querySelector('[alt="Image attachment preview"]')).toBeNull());
    const requests = uploads(); expect(requests).toHaveLength(2);
    expect(requests.map(([path]) => path)).toEqual(['/admin/support/tickets/test-ticket/messages', '/admin/support/tickets/test-ticket/messages']);
    const first = requests[0]![1]!.body as FormData, retry = requests[1]![1]!.body as FormData;
    expect(first.get('message')).toBe(method === 'paste' ? 'Try these settings.' : '');
    expect(retry.get('clientMessageId')).toBe(first.get('clientMessageId'));
    expect(first.getAll('image')).toHaveLength(1);
    expect(new Uint8Array(await bytes(first.get('image') as File))).toEqual(new Uint8Array(await bytes(source)));
    expect(new Uint8Array(await bytes(retry.get('image') as File))).toEqual(new Uint8Array(await bytes(source)));
    expect(host.querySelector('[alt="Image attachment"]')).not.toBeNull();
    expect(sendButton().disabled).toBe(true);
  });

  it('blocks sending while the image is being prepared', async () => {
    await render(); await caption('A screenshot is attached.');
    let finish!: (value: ImageBitmap) => void;
    vi.mocked(createImageBitmap).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    await attach(new File(['pixels'], 'screenshot.png', { type: 'image/png' }));
    expect(host.textContent).toContain('Preparing image'); expect(sendButton().disabled).toBe(true);
    await act(async () => textarea().closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(uploads()).toHaveLength(0);
    await act(async () => finish({ width: 40, height: 20, close: vi.fn() } as unknown as ImageBitmap));
    await until(() => expect(sendButton().disabled).toBe(false));
  });

  it('restores an unsent image after navigation, removes it, and keeps text-only replies working', async () => {
    await render(); await attach(new File(['pixels'], 'screenshot.png', { type: 'image/png' }));
    await until(() => expect(sendButton().disabled).toBe(false));
    await act(async () => root.render(null)); await render();
    expect(host.querySelector('[alt="Image attachment preview"]')).not.toBeNull();
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Remove image"]')!.click());
    await until(() => expect(host.querySelector('[alt="Image attachment preview"]')).toBeNull());
    expect(sendButton().disabled).toBe(true); expect(textarea().required).toBe(true);
    await caption('A text-only reply.'); await act(async () => sendButton().click());
    await until(() => expect(uploads()).toHaveLength(1));
    expect(JSON.parse(uploads()[0]![1]!.body as string).message).toBe('A text-only reply.');
  });

  it('clears administrator image drafts when logout cleanup runs', async () => {
    await render(); await attach(new File(['pixels'], 'screenshot.png', { type: 'image/png' }));
    await until(() => expect(sendButton().disabled).toBe(false));
    await act(async () => root.render(null)); await clearSupportImageDrafts('image-test-admin'); await render();
    expect(host.querySelector('[alt="Image attachment preview"]')).toBeNull(); expect(sendButton().disabled).toBe(true);
  });
});
