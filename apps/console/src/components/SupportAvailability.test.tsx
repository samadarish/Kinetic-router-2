import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SupportAvailability, SupportStatusEditor } from './SupportAvailability';

describe('support availability', () => {
  it.each(['online', 'away', 'offline'] as const)('provides the current %s state and a keyboard-accessible explanation', status => {
    const html = renderToStaticMarkup(<SupportAvailability presence={{ status }} connection="connected" />);
    expect(html).toContain(`aria-label="Support is ${status}"`);
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toMatch(/role="tooltip"[^>]*hidden=""/);
    expect(html).toContain(status === 'online' ? 'ready to help' : 'Leave a message');
  });
  it.each(['connecting', 'reconnecting', 'unavailable'] as const)('does not expose stale online presence or custom text while %s', connection => {
    const html = renderToStaticMarkup(<SupportAvailability presence={{ status: 'online', statusText: 'I am here right now' }} connection={connection} />);
    expect(html).toContain('support-availability-unavailable');
    expect(html).toContain('Support status unavailable');
    expect(html).not.toContain('Support is online');
    expect(html).not.toContain('I am here right now');
  });
  it('renders the custom status as plain text and falls back after it is cleared', () => {
    const html = renderToStaticMarkup(<SupportAvailability presence={{ status: 'away', statusText: '<img src=x onerror=alert(1)>' }} connection="connected" />);
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img');
    expect(renderToStaticMarkup(<SupportAvailability presence={{ status: 'away', statusText: ' ' }} connection="connected" />)).toContain('Leave a message');
  });
  it('opens a labeled editor with the saved text, clear guidance, and a 160-character limit', () => {
    const html = renderToStaticMarkup(<SupportStatusEditor initialValue="Back at 3 PM" onSave={vi.fn()} onClose={vi.fn()} />);
    expect(html).toContain('role="dialog" aria-modal="true"');
    expect(html).toMatch(/<textarea[^>]*aria-label="Status message"[^>]*maxLength="160"[^>]*>Back at 3 PM<\/textarea>/);
    expect(html).toContain('Leave blank to use the default message.');
    expect(html).toContain('>Cancel<');
    expect(html).toContain('>Save status<');
  });
  it.each(['away', 'offline'] as const)('places last seen below the %s status message', status => {
    const lastSeenAt = '2026-09-20T10:12:00.000Z';
    const html = renderToStaticMarkup(<SupportAvailability presence={{ status, statusText: 'Back shortly.', lastSeenAt }} connection="connected" />);
    expect(html).toContain('Back shortly.');
    expect(html).toContain(`Last seen <time dateTime="${lastSeenAt}"`);
    expect(html.indexOf('Back shortly.')).toBeLessThan(html.indexOf('support-availability-last-seen'));
  });
  it('hides last seen while online or disconnected, even when an old timestamp is supplied', () => {
    const lastSeenAt = '2026-09-20T10:12:00.000Z';
    expect(renderToStaticMarkup(<SupportAvailability presence={{ status: 'online', lastSeenAt }} connection="connected" />)).not.toContain('Last seen');
    for (const connection of ['connecting', 'reconnecting', 'unavailable'] as const) {
      expect(renderToStaticMarkup(<SupportAvailability presence={{ status: 'offline', lastSeenAt }} connection={connection} />)).not.toContain('Last seen');
    }
  });
  it('shows an honest fallback when the last activity time is unknown or invalid', () => {
    for (const lastSeenAt of [undefined, null, 'invalid']) {
      const html = renderToStaticMarkup(<SupportAvailability presence={{ status: 'offline', lastSeenAt }} connection="connected" />);
      expect(html).toContain('Last seen unavailable');
      expect(html).not.toContain('Invalid Date');
    }
  });
});
