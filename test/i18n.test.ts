import { describe, expect, it } from 'vitest';
import { createTranslator, localizeHtml, translateText } from '@kineticrouter/i18n';

describe('translation runtime', () => {
  it('preserves surrounding whitespace, substitutes dynamic values, and falls back to English', () => {
    const catalog = { Home: 'Inicio', '{0} results': '{0} resultados', 'Actions for {0}': 'Acciones para {0}' };
    expect(translateText(' Home ', catalog)).toBe(' Inicio ');
    expect(translateText('7 results', catalog)).toBe('7 resultados');
    expect(translateText('Actions for Production', catalog)).toBe('Acciones para Production');
    expect(translateText('Unknown message', catalog)).toBe('Unknown message');
  });

  it('supports shared typed keys and locale-specific plurals', () => {
    const translator = createTranslator({ 'Choose a language': 'Choisir une langue', '{count} request': '{count} requête', '{count} requests': '{count} requêtes' }, 'fr');
    expect(translator.t('chooseLanguage')).toBe('Choisir une langue');
    expect(translator.plural(1, { one: '{count} request', other: '{count} requests' })).toBe('1 requête');
    expect(translator.plural(2, { one: '{count} request', other: '{count} requests' })).toBe('2 requêtes');
  });

  it('localizes prose and accessibility labels while preserving code, links, anchors, and SVG', () => {
    const html = '<h2 id="start">Quick start</h2><p>Make a request <code>Home</code>.</p><a href="/docs/start#start" title="Home">Home</a><pre><button title="Copy code">Copy</button><code>print("Home")\n&lt;secret&gt;</code></pre><svg><title>Home</title></svg>';
    const result = localizeHtml(html, { 'Quick start': 'Inicio rápido', 'Make a request': 'Haz una solicitud', Home: 'Inicio', 'Copy code': 'Copiar código', Copy: 'Copiar' });
    expect(result).toContain('<h2 id="start">Inicio rápido</h2>');
    expect(result).toContain('<code>Home</code>');
    expect(result).toContain('href="/docs/start#start" title="Inicio"');
    expect(result).toContain('data-docs-action="copy" title="Copiar código"');
    expect(result).toContain('<code>print("Home")\n&lt;secret&gt;</code>');
    expect(result).toContain('<svg><title>Home</title></svg>');
    expect(localizeHtml('<p translate="no">Home</p>', { Home: 'Inicio' })).toBe('<p translate="no">Home</p>');
  });

  it('escapes translations as text and attributes', () => {
    const result = localizeHtml('<p title="Home">Home</p>', { Home: '<script>alert("x")</script>' });
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
    expect(result).toContain('&quot;');
  });
});
