import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SupportMessageText } from './SupportMessageText';

const render = (body: string) => renderToStaticMarkup(<SupportMessageText body={body} />);

describe('ticket message links', () => {
  it('recognizes bare domains, www, paths and explicit HTTP/HTTPS while preserving displayed addresses', () => {
    const html = render('google.com www.google.com/search?q=api https://google.com http://example.org docs.example.dev/start');
    for (const [label, href] of [
      ['google.com', 'https://google.com'],
      ['www.google.com/search?q=api', 'https://www.google.com/search?q=api'],
      ['https://google.com', 'https://google.com'],
      ['http://example.org', 'http://example.org'],
      ['docs.example.dev/start', 'https://docs.example.dev/start'],
    ]) expect(html).toContain(`<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`);
  });

  it('preserves punctuation, line breaks, query strings and balanced parentheses', () => {
    const html = render('Try (google.com), then\nhttps://en.wikipedia.org/wiki/API_(disambiguation).\nhttps://example.com/?a=1&b=2!');
    expect(html).toContain('>google.com</a>), then\n');
    expect(html).toContain('href="https://en.wikipedia.org/wiki/API_(disambiguation)"');
    expect(html).toContain('>https://en.wikipedia.org/wiki/API_(disambiguation)</a>.\n');
    expect(html).toContain('href="https://example.com/?a=1&amp;b=2"');
    expect(html).toContain('>https://example.com/?a=1&amp;b=2</a>!');
  });

  it('keeps HTML, non-web schemes, email addresses and version numbers as safe text', () => {
    const html = render('<img src=x onerror=alert(1)>\n<script>alert(1)</script> javascript:alert(1) data:text/html,test ftp://example.com mailto:user@example.com user@example.com 1.2.3 package.json');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('javascript:alert(1)');
    expect(html).not.toContain('<a ');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script');
  });

  it('keeps literal message formatting and normalizes protocol-relative links to HTTPS', () => {
    const html = render('**Please check**\n//google.com/search?q=test');
    expect(html).toContain('**Please check**\n');
    expect(html).toContain('<a href="https://google.com/search?q=test" target="_blank" rel="noopener noreferrer">//google.com/search?q=test</a>');
    expect(render('  Hello\nthere!')).toBe('<span class="support-message-text">  Hello\nthere!</span>');
  });
});
