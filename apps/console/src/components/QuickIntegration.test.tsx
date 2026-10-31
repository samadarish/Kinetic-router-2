// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { measureApiLatency } from '../lib/api-latency';
import { publicModelChoices, defaultProviderModel } from '@kineticrouter/platform-config/models';
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
async function selectModel(id: string) {
  await click('.integration-model-trigger');
  const option = Array.from(host.querySelectorAll<HTMLElement>('[role="option"]')).find((item) => item.textContent?.includes(id));
  expect(option, id).toBeTruthy();
  await act(async () => option!.click());
}
async function searchModels(value: string) {
  const input = element<HTMLInputElement>('[role="combobox"]');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
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
  it('offers all 38 models grouped by company with provider icons', async () => {
    expect(code()).toContain('openai/gpt-6-astra');
    await click('.integration-model-trigger');
    expect(host.querySelectorAll('[role="option"]')).toHaveLength(38);
    expect(host.querySelectorAll('[role="group"][aria-labelledby]')).toHaveLength(8);
    expect(host.querySelectorAll('.integration-model-group [data-provider-icon="unknown"]')).toHaveLength(0);
    await act(async () => element('[role="combobox"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    for (const model of publicModelChoices.filter((item, index, all) => all.findIndex((other) => other.provider === item.provider) === index)) {
      await selectModel(model.id);
      expect(code()).toContain(model.id);
      expect(code()).toContain('https://api.kineticrouter.com/v1');
    }
  });

  it('marks the deprecated Kimi model in its option and selected state without disabling it', async () => {
    await click('.integration-model-trigger');
    const option = Array.from(host.querySelectorAll<HTMLElement>('[role="option"]')).find((item) => item.textContent?.includes('moonshot/kimi-k2.7-code'))!;
    expect(option.querySelector('.model-deprecated')?.textContent).toBe('Deprecated');
    await act(async () => option.click());
    expect(element('.integration-model-trigger .model-deprecated').textContent).toBe('Deprecated');
    expect(element('.integration-model-trigger').textContent).not.toContain('Available');
    expect(code()).toContain('moonshot/kimi-k2.7-code');
    await selectModel('moonshot/kimi-k3.1-pro');
    expect(host.querySelector('.integration-model-trigger .model-deprecated')).toBeNull();
    expect(code()).toContain('moonshot/kimi-k3.1-pro');
    await selectModel('zhipu/glm-5.3-flash');
    expect(code()).toContain('zhipu/glm-5.3-flash');
  });

  it('updates all code formats and retains the selected route across provider changes', async () => {
    await click('[aria-label="Use Cloudflare CDN"]');
    for (const language of ['python', 'node', 'curl']) {
      await click(`#language-tab-${language}`);
      expect(code()).toContain('https://cdn-api.kineticrouter.com/v1');
      expect(code()).not.toContain('https://api.kineticrouter.com/v1');
    }
    await selectModel(defaultProviderModel('zhipu').id);
    expect(code()).toContain('zhipu/glm-5.3');
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
    await selectModel(defaultProviderModel('deepseek').id);
    await act(async () => pending.resolve());
    expect(element('[aria-label="Copy Direct API URL"]').textContent).toBe('Copy URL');
    expect(element('.copy-announcement').textContent).toBe('');
  });

  it.each(['anthropic/claude-opus-5-5', 'grok/grok-4.7'])('uses the OpenAI SDK and /v1 on both routes for %s', async (model) => {
      await selectModel(model);
      for (const [origin, label] of [['https://api.kineticrouter.com', 'Direct API'], ['https://cdn-api.kineticrouter.com', 'Cloudflare CDN']]) {
        await click('[aria-label="Use ' + label + '"]');
        await click('[aria-label="Copy ' + label + ' URL"]');
        expect(clipboard).toHaveBeenLastCalledWith(origin + '/v1');
        for (const language of ['python', 'node', 'curl']) {
          await click('#language-tab-' + language);
          expect(code()).toContain(model);
          expect(code()).toContain(origin + '/v1');
          expect(code()).not.toMatch(/anthropic.Anthropic|@anthropic-ai|x-api-key|anthropic-version|\/grok\/v1|\/v1\/v1/);
          if (language === 'python') expect(code()).toContain('from openai import OpenAI');
          if (language === 'node') expect(code()).toContain('import OpenAI from "openai"');
          if (language === 'curl') expect(code()).toContain('/v1/chat/completions');
          await click('.copy-code-button');
          expect(clipboard).toHaveBeenLastCalledWith(code());
        }
      }
  });

  it('supports search, empty results, keyboard selection, escape, and restored focus', async () => {
    await click('.integration-model-trigger');
    expect(document.activeElement).toBe(element('[role="combobox"]'));
    await searchModels('sonnet');
    expect(host.querySelectorAll('[role="option"]')).toHaveLength(1);
    await act(async () => element('[role="combobox"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(code()).toContain('anthropic/claude-sonnet-5-5');
    expect(document.activeElement).toBe(element('.integration-model-trigger'));
    await click('.integration-model-trigger');
    await searchModels('does not exist');
    expect(element('[role="status"].integration-model-empty').textContent).toContain('No models match');
    await act(async () => element('[role="combobox"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(host.querySelector('[role="combobox"]')).toBeNull();
    await click('.integration-model-trigger');
    for (const key of ['End', 'ArrowDown', 'Home', 'Enter']) await act(async () => element('[role="combobox"]').dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })));
    expect(code()).toContain('openai/gpt-6-astra');
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
    await selectModel(defaultProviderModel('moonshot').id);
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
