import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CodexIcon } from './CodexIcon';

describe('CodexIcon', () => {
  it('renders the captured Codex glyph as a decorative icon by default', () => {
    const markup = renderToStaticMarkup(<CodexIcon size={20} />);
    expect(markup).toContain('data-tool-icon="codex"');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('viewBox="0 0 24 24"');
  });

  it('can expose an accessible label when used without adjacent text', () => {
    const markup = renderToStaticMarkup(<CodexIcon label="Codex" />);
    expect(markup).toContain('<title');
    expect(markup).toContain('>Codex</title>');
    expect(markup).toContain('role="img"');
  });
});
