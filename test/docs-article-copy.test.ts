// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocsArticle } from '../apps/site/components/docs-article';

vi.mock('next/navigation', () => {
  const router = { push: vi.fn() };
  return { useRouter: () => router };
});
vi.mock('../apps/site/components/use-public-session', () => ({ usePublicSession: () => ({ playgroundEnabled: false }) }));
vi.mock('@kineticrouter/analytics-client', () => ({ trackDocsCopy: vi.fn() }));

let host: HTMLDivElement;
let root: Root;
const clipboard = vi.fn(async (_value: string) => {});

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('navigator', { clipboard: { writeText: clipboard } });
  clipboard.mockReset().mockResolvedValue(undefined);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

async function copyExample(html: string) {
  await act(async () => root.render(createElement(DocsArticle, { html })));
  const button = host.querySelector<HTMLButtonElement>('button[title="Copy code"]');
  expect(button).not.toBeNull();
  await act(async () => button!.click());
}

describe('documentation example copying', () => {
  it.each([
    ['Anthropic', 'https://api.kineticrouter.com/anthropic/v1/messages'],
    ['Grok', 'https://api.kineticrouter.com/grok/v1/chat/completions'],
  ])('copies the %s example from a toolbar outside its code block', async (_provider, endpoint) => {
    const code = `curl ${endpoint}`;
    await copyExample(`<pre><code>Other example</code></pre><div role="tabpanel"><div><button title="Copy code">Copy code</button></div><pre><code>${code}</code></pre></div>`);
    expect(clipboard).toHaveBeenCalledExactlyOnceWith(code);
    expect(host.querySelector('[role="status"]')?.textContent).toBe('Code copied');
  });

  it('preserves copying when the button is inside the code block', async () => {
    const code = 'curl https://api.kineticrouter.com/v1/chat/completions';
    await copyExample(`<pre><button title="Copy code">Copy code</button><code>${code}</code></pre>`);
    expect(clipboard).toHaveBeenCalledExactlyOnceWith(code);
  });
});
