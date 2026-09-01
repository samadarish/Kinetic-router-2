import test from 'node:test';
import assert from 'node:assert/strict';
import { consolePageUrl, normalizeConsoleOrigin, resolvePublicConsoleOrigin } from '../data/public-console-origin.mjs';

test('uses the local console for a local public-site runtime', () => {
  assert.equal(resolvePublicConsoleOrigin(undefined, 'http://localhost:3000'), 'http://localhost:5174');
  assert.equal(resolvePublicConsoleOrigin(undefined, 'http://127.0.0.1:3000'), 'http://127.0.0.1:5174');
});

test('uses the configured HTTPS console origin', () => {
  assert.equal(resolvePublicConsoleOrigin('https://accounts.example.com/sign-in', 'http://localhost:3000'), 'https://accounts.example.com');
});

test('rejects insecure non-local origins', () => {
  assert.equal(normalizeConsoleOrigin('http://accounts.example.com'), undefined);
  assert.equal(resolvePublicConsoleOrigin('http://accounts.example.com', 'https://kineticrouter.com'), 'https://console.kineticrouter.com');
});

test('only accepts root-relative console destinations', () => {
  assert.equal(consolePageUrl('https://console.kineticrouter.com', '/profile'), 'https://console.kineticrouter.com/profile');
  assert.equal(consolePageUrl('https://console.kineticrouter.com', '//malicious.example'), 'https://console.kineticrouter.com/');
});
