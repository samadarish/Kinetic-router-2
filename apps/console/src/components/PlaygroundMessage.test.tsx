import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PlaygroundMessage } from './PlaygroundMessage';

describe('playground Markdown rendering', () => {
  it('collapses exact token counts into native details when requested', () => {
    const message = { id: 1, role: 'assistant' as const, content: 'Reply', usage: { inputTokens: 125, outputTokens: 34, totalTokens: 159 } };
    const html = renderToStaticMarkup(<PlaygroundMessage message={message} usageDisplay="details" />);
    const details = html.match(/<details\b[^>]*>[\s\S]*?<\/details>/)?.[0];
    expect(details).toBeDefined();
    expect(details).not.toMatch(/<details[^>]*\bopen/);
    expect(details).toContain('<summary>Details');
    expect(details).toContain('125 input'); expect(details).toContain('34 output'); expect(details).toContain('159 total tokens');
    const inspector = renderToStaticMarkup(<PlaygroundMessage message={message} userLabel="Customer" />);
    expect(inspector).not.toContain('<details'); expect(inspector).toContain('159 total tokens');
  });

  it.each([
    { state: 'stopped' as const, content: 'Partial reply', status: 'Stopped' },
    { state: 'failed' as const, content: 'Partial reply', status: 'Response interrupted' },
    { state: 'failed' as const, content: '', status: 'Request failed before a reply was received' },
  ])('keeps $status outside collapsed details', ({ state, content, status }) => {
    const html = renderToStaticMarkup(<PlaygroundMessage usageDisplay="details" message={{ id: 1, role: 'assistant', content, state, limited: true, usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } }} />);
    const visible = html.replace(/<details\b[^>]*>[\s\S]*?<\/details>/g, '');
    expect(visible).toContain(status); expect(visible).toContain('Output limit reached');
    expect(html).toContain('0 total tokens');
  });

  it('renders code and formatting without active HTML, unsafe URLs, or remote images', () => {
    const html = renderToStaticMarkup(<PlaygroundMessage message={{ id: 1, role: 'assistant', model: 'chat', state: 'complete', content: '**Answer**\n\n```js\nconst x = 1;\n```\n\n<script>alert(1)</script>\n\n[unsafe](javascript:alert(1))\n\n![tracker](https://tracking.invalid/pixel)\n\n[Docs](https://example.com)' }} />);
    expect(html).toContain('<strong>Answer</strong>'); expect(html).toContain('<pre>');
    expect(html).not.toContain('<script'); expect(html).not.toContain('javascript:'); expect(html).not.toContain('<img'); expect(html).not.toContain('tracking.invalid');
    expect(html).toContain('noopener noreferrer');
  });
  it('keeps customer-authored text literal and uses a quiet pending indicator', () => {
    const user = renderToStaticMarkup(<PlaygroundMessage message={{ id: 1, role: 'user', content: '  **literal** <b>text</b>' }} />);
    expect(user).toContain('  **literal** &lt;b&gt;text&lt;/b&gt;');
    const pending = renderToStaticMarkup(<PlaygroundMessage message={{ id: 2, role: 'assistant', content: '' }} />);
    expect(pending).toContain('playground-typing'); expect(pending).not.toContain('Waiting for a response');
  });
});
