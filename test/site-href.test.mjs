import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeSiteHref } from '../data/safe-href.mjs';

test('accepts canonical same-origin paths and HTTPS links', () => {
  assert.equal(normalizeSiteHref('/docs/a page?tab=1#start'), '/docs/a%20page?tab=1#start');
  assert.equal(normalizeSiteHref('https://example.com/a page'), 'https://example.com/a%20page');
});

test('rejects network paths, backslashes, controls, and executable schemes', () => {
  for (const candidate of ['//attacker.example/path', '/\\attacker.example/path', '\\attacker.example', '/docs\nnext', 'javascript:alert(1)', 'data:text/html,test']) {
    assert.equal(normalizeSiteHref(candidate), undefined);
  }
});

test('encodes quote characters before a path reaches a URL or CSS sink', () => {
  const normalized = normalizeSiteHref('/logo.png");position:fixed;inset:0/*');
  assert.ok(normalized?.startsWith('/logo.png%22'));
  assert.ok(!normalized?.includes('"'));
});
