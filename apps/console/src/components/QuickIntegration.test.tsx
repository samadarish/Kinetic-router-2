// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { measureApiLatency } from '../lib/api-latency';
import { QuickIntegration } from './QuickIntegration';

vi.mock('../lib/api-latency', () => ({ measureApiLatency: vi.fn() }));

let host: HTMLDivElement;
let root: Root;
let mounted: boolean;
const clipboard = vi.fn(async (_value: string) => {});
const ping = vi.mocked(measureApiLatency);

function element<T extends Element>(selector: string): T {
  const found = host.querySelector<T>(selector);
  expect(found, selector).not.toBeNull();
  return found!;
}
async function click(selector: string) {
  await act(async () => element<HTMLElement>(selector).click());
}
function code() { return element<HTMLElement>('.integration-code').textContent!; }
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(accept => { resolve = accept; });
  return { promise, resolve };
}

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('navigator', { clipboard: { writeText: clipboard } });
  vi.stubGlobal('isSecureContext', true);
  clipboard.mockReset().mockResolvedValue(undefined);
  ping.mockReset().mockResolvedValue(42);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  mounted = true;
  await act(async () => root.render(<QuickIntegration />));
});

afterEach(async () => {
  if (mounted) await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('dashboard quick integration', () => {
  it('adds the three available providers after Grok and exposes their existing homepage models', async () => {
    expect(Array.from(host.querySelectorAll('.provider-tabs button')).map(button => button.getAttribute('data-provider')))
      .toEqual(['openai', 'anthropic', 'grok', 'deepseek', 'zhipu', 'moonshot']);
    expect(element('[aria-label="Use Direct API"]').getAttribute('aria-pressed')).toBe('true');
    expect(element('[data-cloudflare-icon]')).toBeTruthy();
    for (const [id, model] of [['deepseek', 'deepseek/deepseek-flash'], ['zhipu', 'zhipu/glm-5.3-flash'], ['moonshot', 'moonshot/kimi-k3']]) {
      await click(`#provider-tab-${id}`);
      expect(element(`#provider-tab-${id} .provider-availability`).textContent).toBe('Available');
      expect(code()).toContain(`model="${model}"`);
      expect(code()).toContain('https://api.kineticrouter.com/v1');
      expect(element<HTMLButtonElement>('.copy-code-button').disabled).toBe(false);
    }
  });

  it('updates all code formats and retains the selected route across provider changes', async () => {
    await click('[aria-label="Use Cloudflare CDN"]');
    for (const language of ['python', 'node', 'curl']) {
      await click(`#language-tab-${language}`);
      expect(code()).toContain('https://cdn-api.kineticrouter.com/v1');
      expect(code()).not.toContain('https://api.kineticrouter.com/v1');
    }
    await click('#provider-tab-zhipu');
    expect(code()).toContain('zhipu/glm-5.3-flash');
    expect(element('[aria-label="Use Cloudflare CDN"]').getAttribute('aria-pressed')).toBe('true');
    await click('.copy-code-button');
    expect(clipboard).toHaveBeenLastCalledWith(code());
    expect(element('.codex-code').textContent).toContain('https://api.kineticrouter.com/v1');
    expect(element('.codex-code').textContent).not.toContain('cdn-api');
  });

  it('copies each card URL independently from the example selection', async () => {
    await click('[aria-label="Copy Cloudflare CDN URL"]');
    expect(clipboard).toHaveBeenLastCalledWith('https://cdn-api.kineticrouter.com/v1');
    expect(element('[aria-label="Copy Cloudflare CDN URL"]').textContent).toBe('Copied');
    expect(element('[aria-label="Copy Direct API URL"]').textContent).toBe('Copy URL');
    expect(element('[aria-label="Use Direct API"]').getAttribute('aria-pressed')).toBe('true');
    await click('[aria-label="Copy Direct API URL"]');
    expect(clipboard).toHaveBeenLastCalledWith('https://api.kineticrouter.com/v1');
    expect(element('[aria-label="Copy Direct API URL"]').textContent).toBe('Copied');
    expect(element('[aria-label="Copy Cloudflare CDN URL"]').textContent).toBe('Copy URL');
  });

  it('keeps copy failures on their card and ignores stale completion after selection changes', async () => {
    clipboard.mockRejectedValueOnce(new Error('Clipboard unavailable'));
    await click('[aria-label="Copy Cloudflare CDN URL"]');
    expect(element('[aria-label="Copy Cloudflare CDN URL"]').textContent).toBe('Copy failed');
    expect(element('[aria-label="Copy Direct API URL"]').textContent).toBe('Copy URL');
    const pending = deferred<void>();
    clipboard.mockReturnValueOnce(pending.promise);
    await click('[aria-label="Copy Direct API URL"]');
    await click('#provider-tab-deepseek');
    await act(async () => pending.resolve());
    expect(element('[aria-label="Copy Direct API URL"]').textContent).toBe('Copy URL');
    expect(element('.copy-announcement').textContent).toBe('');
  });

  it('preserves planned paths, native Anthropic code, notices, and disabled copying', async () => {
    await click('[aria-label="Use Cloudflare CDN"]');
    for (const [id, path] of [['anthropic', '/anthropic'], ['grok', '/grok/v1']]) {
      await click(`#provider-tab-${id}`);
      expect(element('.integration-availability-warning').textContent).toContain('Planned integration');
      expect(code()).toContain(`https://cdn-api.kineticrouter.com${path}`);
      for (const selector of ['[aria-label="Copy Direct API URL"]', '[aria-label="Copy Cloudflare CDN URL"]', '.copy-code-button']) {
        expect(element<HTMLButtonElement>(selector).disabled).toBe(true);
        await click(selector);
      }
      expect(element<HTMLButtonElement>('[aria-label="Test Direct API ping"]').disabled).toBe(false);
      if (id === 'anthropic') expect(code()).toContain('anthropic.Anthropic');
    }
    expect(clipboard).not.toHaveBeenCalled();
  });

  it('supports keyboard traversal and wraps across all six providers', async () => {
    const cases = [['openai', 'End', 'moonshot'], ['moonshot', 'ArrowRight', 'openai'], ['openai', 'ArrowLeft', 'moonshot'], ['moonshot', 'Home', 'openai']];
    for (const [current, key, next] of cases) {
      await act(async () => element(`#provider-tab-${current}`).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })));
      expect(element(`#provider-tab-${next}`).getAttribute('aria-selected')).toBe('true');
      expect(document.activeElement).toBe(element(`#provider-tab-${next}`));
    }
  });

  it('runs both host tests independently and keeps their results when providers change', async () => {
    const direct = deferred<number>(), cloudflare = deferred<number>();
    ping.mockImplementation(id => id === 'direct' ? direct.promise : cloudflare.promise);
    await click('[aria-label="Test Direct API ping"]');
    await click('[aria-label="Test Direct API ping"]');
    expect(ping).toHaveBeenCalledTimes(1);
    expect(element<HTMLButtonElement>('[aria-label="Test Direct API ping"]').disabled).toBe(true);
    expect(element<HTMLButtonElement>('[aria-label="Test Cloudflare CDN ping"]').disabled).toBe(false);
    await click('[aria-label="Test Cloudflare CDN ping"]');
    await act(async () => cloudflare.resolve(35));
    expect(element('[aria-label="Cloudflare CDN ping result"]').textContent).toBe('35 ms');
    expect(element('[aria-label="Direct API ping result"]').textContent).toBe('Testing…');
    expect(element('[aria-label="Use Direct API"]').getAttribute('aria-pressed')).toBe('true');
    await click('#provider-tab-moonshot');
    await act(async () => direct.resolve(60));
    expect(element('[aria-label="Direct API ping result"]').textContent).toBe('60 ms');
    expect(element('[aria-label="Cloudflare CDN ping result"]').textContent).toBe('35 ms');
  });

  it('shows timeout and network errors and permits a successful retry', async () => {
    ping.mockRejectedValueOnce(new DOMException('Deadline expired', 'TimeoutError'));
    await click('[aria-label="Test Direct API ping"]');
    expect(element('[aria-label="Direct API ping result"]').textContent).toBe('Timed out');
    ping.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await click('[aria-label="Test Cloudflare CDN ping"]');
    expect(element('[aria-label="Cloudflare CDN ping result"]').textContent).toBe('Could not reach host');
    await click('[aria-label="Test Direct API ping"]');
    expect(element('[aria-label="Direct API ping result"]').textContent).toBe('42 ms');
  });

  it('aborts both in-flight tests when the dashboard is unmounted', async () => {
    const signals: AbortSignal[] = [];
    ping.mockImplementation((_id, signal) => {
      signals.push(signal);
      return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
    });
    await click('[aria-label="Test Direct API ping"]');
    await click('[aria-label="Test Cloudflare CDN ping"]');
    await act(async () => root.unmount());
    mounted = false;
    expect(signals).toHaveLength(2);
    expect(signals.every(signal => signal.aborted)).toBe(true);
  });
});
